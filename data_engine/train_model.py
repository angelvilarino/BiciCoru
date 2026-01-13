"""
Train Model v5: Optimizado con 28 días de historia + Git Force Fix
"""

import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import joblib
from joblib import Parallel, delayed
from supabase import create_client, Client
from dotenv import load_dotenv
import warnings

warnings.filterwarnings('ignore')
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# ✅ Hiperparámetros afinados para series temporales pequeñas
# Learning rate más bajo + más estimadores = mejor generalización
BEST_PARAMS = {
    'n_estimators': 500,        # Aumentado de 200
    'learning_rate': 0.02,      # Reducido de 0.05 (aprende más lento pero mejor)
    'num_leaves': 20,           # Reducido para evitar overfitting en estaciones pequeñas
    'max_depth': 10,
    'min_child_samples': 15,    # Permite aprender patrones en estaciones con poco movimiento
    'subsample': 0.7,
    'colsample_bytree': 0.8,
    'random_state': 42,
    'n_jobs': 1,
    'verbose': -1
}

def fetch_data():
    """Descarga datos de últimos 28 días (4 semanas completas)."""
    print("📥 Descargando datos (últimos 28 días)...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    days_ago = (datetime.now() - timedelta(days=28)).isoformat()
    
    all_data = []
    page = 0
    page_size = 1000 # CORRECCIÓN: Ajustado al límite real de Supabase
    
    while True:
        offset = page * page_size
        print(f"   ...página {page} (offset {offset})") # Log para ver progreso
        
        response = supabase.table("snapshots")\
            .select("station_id, timestamp, available_bikes, estaciones(name, total_capacity)")\
            .gte("timestamp", days_ago)\
            .range(offset, offset + page_size - 1)\
            .execute()
            
        if not response.data:
            break
            
        all_data.extend(response.data)
        
        # Si recibimos menos del límite, es la última página
        if len(response.data) < page_size:
            break
            
        page += 1
    
    df = pd.DataFrame(all_data)
    
    if not df.empty and 'estaciones' in df.columns:
        estaciones = pd.json_normalize(df['estaciones'])
        df['station_name'] = estaciones['name']
        df['total_capacity'] = estaciones['total_capacity']
        df.drop('estaciones', axis=1, inplace=True)
        
    print(f"✅ {len(df)} registros descargados | {df['station_id'].nunique() if not df.empty else 0} estaciones")
    return df

def fetch_weather_and_holidays():
    """Descarga clima y festivos."""
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    days_ago = (datetime.now() - timedelta(days=28)).isoformat()
    
    clima = supabase.table("clima").select("*").gte("timestamp", days_ago).execute()
    festivos = supabase.table("festivos").select("*").execute()
    
    df_clima = pd.DataFrame(clima.data) if clima.data else pd.DataFrame()
    df_festivos = pd.DataFrame(festivos.data) if festivos.data else pd.DataFrame()
    
    return df_clima, df_festivos

def prepare_features(snapshots_df, weather_df, holidays_df):
    """Ingeniería de features."""
    print("🔧 Preparando features...")
    df = snapshots_df.copy()
    
    df['timestamp'] = pd.to_datetime(df['timestamp'], format='mixed', utc=True)
    
    # Clima
    if not weather_df.empty:
        weather_df['timestamp'] = pd.to_datetime(weather_df['timestamp'], format='mixed', utc=True)
        weather_df = weather_df.set_index('timestamp').resample('h').first()
        df['hour_key'] = df['timestamp'].dt.floor('h')
        df = df.merge(weather_df[['temperature', 'wind_speed', 'humidity', 'rain_1h']], 
                     left_on='hour_key', right_index=True, how='left')
        df.drop('hour_key', axis=1, inplace=True)

    # Festivos
    if not holidays_df.empty:
        holidays_df['date'] = pd.to_datetime(holidays_df['date']).dt.date
        df['date_only'] = df['timestamp'].dt.date
        df = df.merge(holidays_df[['date', 'name']], left_on='date_only', right_on='date', how='left')
        df['is_holiday'] = df['name'].notna().astype(int)
        df.drop(['date_only', 'date', 'name'], axis=1, inplace=True)
    else:
        df['is_holiday'] = 0

    # Features temporales
    dt = df['timestamp'].dt
    df['hour'] = dt.hour
    df['day_of_week'] = dt.dayofweek
    df['month'] = dt.month
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    
    # Feature de Interacción: Hora * Laborable (Crucial para patrones de tráfico)
    df['is_working_hour'] = df['hour'].apply(lambda x: 1 if 7 <= x <= 20 else 0) * (1 - df['is_weekend'])

    # Cíclicas
    two_pi = 2 * np.pi
    df['hour_sin'] = np.sin(two_pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(two_pi * df['hour'] / 24)
    
    # Limpieza
    df.fillna({'temperature': 15, 'wind_speed': 3, 'humidity': 75, 'rain_1h': 0}, inplace=True)
    df['is_raining'] = (df['rain_1h'] > 0.1).astype(int)
    
    # Lags (Vectorizado)
    print("   ⚡ Calculando lags...")
    grouped = df.sort_values('timestamp').groupby('station_id')['available_bikes']
    df['bikes_lag_1h'] = grouped.shift(4)
    # Quitamos lag de 3h para simplificar el predictor, usamos rolling mean si fuera posible
    # pero mantenemos 3h si te funcionaba bien.
    df['bikes_lag_3h'] = grouped.shift(12) 
    
    # Eliminar filas con NaNs generados por los lags (importante para entrenamiento limpio)
    df.dropna(subset=['bikes_lag_3h'], inplace=True)

    return df

def train_station(station_id, df_full):
    """Entrena modelo para una estación."""
    station_df = df_full[df_full['station_id'] == station_id].copy()
    
    # CORRECCIÓN: Bajamos el requisito mínimo temporalmente
    if len(station_df) < 50: 
        return None

    feature_cols = [
        'hour', 'day_of_week', 'is_weekend', 'is_working_hour', 
        'hour_sin', 'hour_cos',
        'temperature', 'wind_speed', 'is_raining',
        'is_holiday', 'bikes_lag_1h', 'bikes_lag_3h'
    ]
    
    X = station_df[feature_cols]
    y = station_df['available_bikes']
    
    # Si hay muy pocos datos, reducimos el split de test para tener algo con lo que entrenar
    if len(X) < 100:
        split = int(len(X) * 0.9) # 90% para entrenar si hay pocos datos
    else:
        split = int(len(X) * 0.8)

    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]
    
    model = LGBMRegressor(**BEST_PARAMS)
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    y_pred = np.clip(y_pred, 0, station_df['total_capacity'].iloc[0])
    
    mae = mean_absolute_error(y_test, y_pred)
    # R2 puede fallar con muy pocos datos, protegemos el cálculo
    try:
        r2 = r2_score(y_test, y_pred)
    except:
        r2 = 0
    
    info = {
        'station_id': station_id,
        'capacity': int(station_df['total_capacity'].iloc[0]),
        'mae': round(mae, 2),
        'r2': round(r2, 3)
    }
    
    return (station_id, model, info)

def main():
    print("\n" + "="*70)
    print("🚴 SMART BICI CORUÑA - ENTRENAMIENTO v5 (Git Fix)")
    print("="*70 + "\n")
    
    df = fetch_data()
    if len(df) < 1000: return
    
    weather, holidays = fetch_weather_and_holidays()
    df_processed = prepare_features(df, weather, holidays)
    
    stations = df_processed['station_id'].unique()
    print(f"🤖 Entrenando {len(stations)} estaciones...\n")
    
    results = Parallel(n_jobs=-1, verbose=0)(
        delayed(train_station)(sid, df_processed) for sid in stations
    )
    
    models = {}
    station_info = {}
    
    for res in results:
        if res is not None:
            sid, model, info = res
            models[sid] = model
            station_info[sid] = info
    
    if models:
        avg_mae = np.mean([i['mae'] for i in station_info.values()])
        avg_r2 = np.mean([i['r2'] for i in station_info.values()])
        
        print(f"\n✅ Entrenamiento completado")
        print(f"   Modelos válidos: {len(models)}")
        print(f"   MAE promedio: {avg_mae:.2f}")
        print(f"   R² promedio: {avg_r2:.3f}")
        
        # Guardar artefacto
        artifact = {
            'models': models,
            'station_info': station_info,
            'feature_cols': [
                'hour', 'day_of_week', 'is_weekend', 'is_working_hour',
                'hour_sin', 'hour_cos', 'temperature', 'wind_speed', 
                'is_raining', 'is_holiday', 'bikes_lag_1h', 'bikes_lag_3h'
            ],
            'version': '5.0-gitfix'
        }
        
        joblib.dump(artifact, 'data_engine/models_advanced.pkl', compress=3)
        print("\n💾 Modelos guardados.")
        
        # --- GIT FIX ---
        print("\n📤 Subiendo a GitHub (Forzado)...")
        # Configuramos usuario por si acaso
        os.system('git config --global user.email "bot@bicicoruna.ai"')
        os.system('git config --global user.name "Training Bot"')
        # Usamos -f para ignorar el .gitignore
        os.system('git add -f data_engine/models_advanced.pkl')
        os.system(f'git commit -m "model: Update v5 {datetime.now().strftime("%Y-%m-%d")}"')
        os.system('git push')
        
    else:
        print("\n❌ Error crítico: No hay modelos.")

if __name__ == "__main__":
    main()