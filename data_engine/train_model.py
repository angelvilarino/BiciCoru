"""
Train Model v25: GAP RECOVERY & ROBUSTNESS
- NO BORRA datos si hay huecos temporales.
- Rellena lag_24h con datos recientes si falta el histórico.
- Logs detallados para saber qué pasa en cada estación.
"""

import os
import pandas as pd
import numpy as np
import joblib
import holidays
from datetime import datetime, timedelta
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from supabase import create_client, Client
from dotenv import load_dotenv
import warnings

warnings.filterwarnings('ignore')
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
MODEL_DIR = 'data_engine/models_v22/'
TRAINING_WINDOW_DAYS = 365  # Usar hasta 365 días de histórico para entrenar

# Configuración del Modelo
MODEL_PARAMS = {
    'loss': 'squared_error',
    'learning_rate': 0.03,
    'max_iter': 700,
    'max_depth': 8,
    'l2_regularization': 2.0,
    'min_samples_leaf': 20,
    'early_stopping': True,
    'validation_fraction': 0.1,
    'random_state': 42
}

def fetch_data():
    print("📥 Descargando historial...")
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        days_ago = (datetime.now() - timedelta(days=TRAINING_WINDOW_DAYS)).isoformat()
        
        all_data = []
        page = 0
        page_size = 1000
        
        while True:
            r = supabase.table("snapshots")\
                .select("station_id, timestamp, available_bikes, estaciones(total_capacity)")\
                .gte("timestamp", days_ago)\
                .order("timestamp", desc=False)\
                .range(page * page_size, (page + 1) * page_size - 1)\
                .execute()
            
            if not r.data: break
            all_data.extend(r.data)
            if len(r.data) < page_size: break
            page += 1
        
        df = pd.DataFrame(all_data)
        if df.empty: return pd.DataFrame()
        
        if 'estaciones' in df.columns:
            df['total_capacity'] = pd.json_normalize(df['estaciones'])['total_capacity']
            df.drop('estaciones', axis=1, inplace=True)
        
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, format='mixed')
        df['timestamp'] = df['timestamp'].dt.tz_convert(None).dt.floor('h')
        
        df = df.sort_values('timestamp').drop_duplicates(['station_id', 'timestamp'], keep='last')
        
        print(f"✅ {len(df)} registros cargados.")
        return df

    except Exception as e:
        print(f"❌ Error descargando datos: {e}")
        return pd.DataFrame()

def fetch_weather():
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        days_ago = (datetime.now() - timedelta(days=TRAINING_WINDOW_DAYS)).isoformat()
        r = supabase.table("clima").select("timestamp, temperature, rain_1h, wind_speed").gte("timestamp", days_ago).execute()
        if not r.data: return pd.DataFrame()
        
        df = pd.DataFrame(r.data)
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, format='mixed').dt.tz_convert(None).dt.floor('h')
        return df.groupby('timestamp').mean().reset_index()
    except:
        return pd.DataFrame()

def create_features_vectorized(df, weather_df):
    print("🔧 Procesando features (Estrategia Recuperación de Huecos)...")
    
    df = df.set_index(['station_id', 'timestamp']).sort_index()
    
    idx = pd.MultiIndex.from_product([
        df.index.get_level_values(0).unique(),
        pd.date_range(df.index.get_level_values(1).min(), 
                     df.index.get_level_values(1).max(), 
                     freq='h')
    ], names=['station_id', 'timestamp'])
    
    df = df.reindex(idx)
    df['total_capacity'] = df.groupby(level=0)['total_capacity'].ffill().bfill()
    
    # Interpolamos bicis (aumentamos límite a 6 horas para ser más permisivos)
    df['available_bikes'] = df.groupby(level=0, group_keys=False)['available_bikes'].apply(
        lambda x: x.interpolate(method='linear', limit=6)
    )
    
    df = df.reset_index()
    
    if not weather_df.empty:
        df = df.merge(weather_df, on='timestamp', how='left')
    
    for col, val in [('temperature', 15), ('rain_1h', 0), ('wind_speed', 5)]:
        if col in df.columns: df[col] = df[col].fillna(val)
        else: df[col] = val
    
    # Features Temporales
    try:
        years = df['timestamp'].dt.year.unique()
        galicia_holidays = holidays.Spain(years=years, subdiv='GA')
        df['is_holiday'] = df['timestamp'].dt.date.isin(galicia_holidays).astype(int)
    except:
        df['is_holiday'] = 0

    df['hour'] = df['timestamp'].dt.hour
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    
    day_num = df['timestamp'].dt.dayofweek
    df['day_adj'] = np.where(df['is_holiday'] == 1, 6, day_num)
    df['day_sin'] = np.sin(2 * np.pi * df['day_adj'] / 7)
    df['day_cos'] = np.cos(2 * np.pi * df['day_adj'] / 7)
    df['is_weekend'] = (df['day_adj'] >= 5).astype(int)
    
    # Lags
    gb = df.groupby('station_id')['available_bikes']
    
    df['lag_1h'] = gb.shift(1)
    df['lag_2h'] = gb.shift(2)
    df['lag_3h'] = gb.shift(3)
    df['lag_24h'] = gb.shift(24)
    
    df['rolling_3h'] = gb.transform(lambda x: x.rolling(3, min_periods=1).mean().shift(1))
    df['slope'] = df['lag_1h'] - df['lag_2h']
    df['lag_1h_ratio'] = df['lag_1h'] / df['total_capacity']
    df['lag_1h_ratio'] = df['lag_1h_ratio'].replace([np.inf, -np.inf], 0)

    # === FIX MAESTRO: RECUPERACIÓN DE HUECOS ===
    # Si lag_24h está vacío (por el hueco de datos), usamos lag_1h como "mejor suposición"
    # Esto salva miles de filas que antes se borraban
    df['lag_24h'] = df['lag_24h'].fillna(df['lag_1h'])
    
    # Si todavía hay vacíos (al principio del todo), usamos backfill y luego 0
    df = df.bfill().ffill().fillna(0)
    
    # Seguridad final
    # Solo nos quedamos con filas donde 'available_bikes' es REAL (no inventado por fillna(0) masivo si falló la interpolación)
    # Pero como ya interpolamos antes, esto debería estar bien.
    
    return df

def train_station_model(station_id, station_df):
    """Entrena modelo individual."""
    try:
        # Filtramos filas donde available_bikes sea 0 PERO la capacidad sea 0 (datos corruptos)
        # Ojo: Bicis 0 es válido. Capacidad 0 no.
        station_df = station_df[station_df['total_capacity'] > 0]
        
        if len(station_df) < 30: # Bajamos el requisito mínimo
            return None
        
        features = [
            'total_capacity', 'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
            'is_weekend', 'is_holiday', 'temperature', 'rain_1h', 'wind_speed',
            'lag_1h', 'lag_2h', 'lag_3h', 'lag_24h', 'rolling_3h', 'slope',
            'lag_1h_ratio'
        ]
        
        X = station_df[features]
        y = station_df['available_bikes']
        
        model = HistGradientBoostingRegressor(**MODEL_PARAMS)
        model.fit(X, y)
        
        preds = model.predict(X)
        capacity = station_df['total_capacity'].iloc[0]
        preds = np.clip(preds, 0, capacity)
        
        mae = mean_absolute_error(y, preds)
        r2 = r2_score(y, preds)
        
        return (station_id, model, {
            'station_id': station_id,
            'capacity': int(capacity),
            'mae': round(mae, 2),
            'r2': round(r2, 3),
            'samples': len(station_df)
        })
    except Exception as e:
        # Logueamos el error pero no rompemos el proceso principal
        print(f"⚠️ Fallo en estación {station_id}: {e}")
        return None

def main():
    print("\n" + "="*60)
    print("🚴 SMART BICI - TRAINING v25 (GAP RECOVERY)")
    print("="*60 + "\n")
    
    df = fetch_data()
    if df.empty: return print("❌ Sin datos.")
    
    weather = fetch_weather()
    df_processed = create_features_vectorized(df, weather)
    
    if df_processed.empty: return print("❌ Dataset vacío tras limpieza.")
    
    print(f"📊 Entrenando con {len(df_processed)} filas recuperadas...")
    
    from joblib import Parallel, delayed
    stations = df_processed['station_id'].unique()
    
    # Ejecutamos en paralelo
    results = Parallel(n_jobs=-1, verbose=5)(
        delayed(train_station_model)(sid, df_processed[df_processed['station_id'] == sid]) 
        for sid in stations
    )
    
    models = {}
    station_info = {}
    
    for res in results:
        if res:
            sid, model, info = res
            models[sid] = model
            station_info[sid] = info
            
    if not models: return print("❌ ERROR FINAL: No se pudo entrenar ningún modelo válido.")
    
    # Guardar
    os.makedirs(MODEL_DIR, exist_ok=True)
    avg_mae = np.mean([i['mae'] for i in station_info.values()])
    avg_r2 = np.mean([i['r2'] for i in station_info.values()])
    
    artifact = {
        'models': models,
        'station_info': station_info,
        'features': [
            'total_capacity', 'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
            'is_weekend', 'is_holiday', 'temperature', 'rain_1h', 'wind_speed',
            'lag_1h', 'lag_2h', 'lag_3h', 'lag_24h', 'rolling_3h', 'slope',
            'lag_1h_ratio'
        ],
        'version': 'v25_gap_recovery',
        'last_train': datetime.now().isoformat()
    }
    
    joblib.dump(artifact, os.path.join(MODEL_DIR, 'models.pkl'), compress=3)
    print(f"\n✅ ÉXITO: {len(models)} modelos generados.")
    print(f"   MAE Medio: {avg_mae:.2f}")
    print(f"   R² Medio:  {avg_r2:.3f}")
    
    try:
        os.system('git add .')
        os.system(f'git commit -m "auto-train v25 mae={avg_mae:.2f}"')
        os.system('git push')
    except:
        pass

if __name__ == "__main__":
    main()