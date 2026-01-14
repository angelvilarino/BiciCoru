"""
Train Model v11: Optimized for Short History (~8 days)
- Elimina lag_1w para no perder el 90% de los datos
- Mantiene lag_24h para capturar el ciclo diario
- Recupera MAE < 0.5
"""

import os
import pandas as pd
import numpy as np
from datetime import datetime
import joblib
from joblib import Parallel, delayed

from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

from supabase import create_client, Client
from dotenv import load_dotenv
import warnings

warnings.filterwarnings('ignore')
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
MODEL_FILE = 'data_engine/models_advanced.pkl'

# Configuración del Modelo
MODEL_PARAMS = {
    'loss': 'absolute_error',
    'learning_rate': 0.05,
    'max_iter': 1000,
    'max_depth': 15,
    'l2_regularization': 0.5,
    'early_stopping': True,
    'categorical_features': [0], # station_id es categórico
    'random_state': 42
}

def fetch_all_data():
    """Descarga todo el historial corregido."""
    print("📥 Descargando HISTORIAL COMPLETO...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    all_data = []
    page = 0
    page_size = 1000 
    
    while True:
        start = page * page_size
        end = start + page_size - 1
        
        response = supabase.table("snapshots")\
            .select("station_id, timestamp, available_bikes, estaciones(total_capacity)")\
            .order("timestamp", desc=True)\
            .range(start, end)\
            .execute()
        
        if not response.data: break
        all_data.extend(response.data)
        
        if len(all_data) % 5000 == 0:
            print(f"   ...lote {page+1} ({len(all_data)} raw)")
            
        if len(response.data) < page_size: break
        page += 1
    
    df = pd.DataFrame(all_data)
    if df.empty: return df
    
    if 'estaciones' in df.columns:
        df['total_capacity'] = pd.json_normalize(df['estaciones'])['total_capacity']
        df.drop('estaciones', axis=1, inplace=True)
    
    # Limpieza fechas y duplicados
    df['timestamp'] = pd.to_datetime(df['timestamp'], format='mixed', utc=True).dt.tz_convert(None).dt.floor('h')
    df = df.groupby(['station_id', 'timestamp']).last().reset_index()
    
    print(f"✅ Datos Únicos: {len(df)} (aprox {len(df)/df['station_id'].nunique():.0f} horas/estación)")
    return df

def fetch_weather():
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        all_weather = []
        page = 0
        while True:
            r = supabase.table("clima").select("*").range(page*1000, (page+1)*1000-1).execute()
            if not r.data: break
            all_weather.extend(r.data)
            if len(r.data) < 1000: break
            page += 1
            
        df = pd.DataFrame(all_weather)
        if df.empty: return pd.DataFrame()
        
        df['timestamp'] = pd.to_datetime(df['timestamp'], format='mixed', utc=True).dt.tz_convert(None).dt.floor('h')
        numeric_cols = ['temperature', 'rain_1h', 'wind_speed']
        cols = [c for c in numeric_cols if c in df.columns]
        return df.groupby('timestamp')[cols].mean().reset_index()
    except:
        return pd.DataFrame()

def prepare_data_short_history(df, weather_df):
    """Features optimizadas para historial corto (< 2 semanas)."""
    print("🔧 Ingeniería de Features (Modo Short History)...")
    
    full_dfs = []
    for sid, group in df.groupby('station_id'):
        group = group.set_index('timestamp').sort_index()
        if group.empty: continue
        
        min_date, max_date = group.index.min(), group.index.max()
        full_idx = pd.date_range(min_date, max_date, freq='1h')
        
        group_full = group.reindex(full_idx)
        group_full['station_id'] = sid
        group_full['total_capacity'] = group['total_capacity'].iloc[0]
        group_full['available_bikes'] = group_full['available_bikes'].interpolate(method='linear', limit=3)
        full_dfs.append(group_full)
    
    df_clean = pd.concat(full_dfs).reset_index().rename(columns={'index': 'timestamp'})
    
    if not weather_df.empty:
        df_clean = df_clean.merge(weather_df, on='timestamp', how='left')
        df_clean[['temperature', 'rain_1h', 'wind_speed']] = df_clean[['temperature', 'rain_1h', 'wind_speed']].fillna(method='ffill')
    
    df_clean.fillna({'temperature': 15, 'rain_1h': 0, 'wind_speed': 5}, inplace=True)

    df_clean['hour'] = df_clean['timestamp'].dt.hour
    df_clean['day_of_week'] = df_clean['timestamp'].dt.dayofweek
    df_clean['is_weekend'] = df_clean['day_of_week'].isin([5, 6]).astype(int)
    
    # --- CAMBIO CLAVE V11 ---
    # Quitamos lag_1w porque consume 7 días de datos y tenemos pocos.
    df_clean['lag_1h'] = df_clean.groupby('station_id')['available_bikes'].shift(1)
    df_clean['lag_2h'] = df_clean.groupby('station_id')['available_bikes'].shift(2)
    df_clean['lag_3h'] = df_clean.groupby('station_id')['available_bikes'].shift(3)
    df_clean['lag_24h'] = df_clean.groupby('station_id')['available_bikes'].shift(24)
    
    # Solo perdemos las primeras 24h, no la primera semana
    df_final = df_clean.dropna(subset=['available_bikes', 'lag_24h']).reset_index(drop=True)
    
    return df_final

def train_global_model(df):
    print(f"\n🤖 Entrenando con {len(df)} muestras efectivas...")
    
    # Quitamos lag_1w de las features
    features = ['station_id', 'hour', 'day_of_week', 'is_weekend', 
                'temperature', 'rain_1h', 'wind_speed', 
                'lag_1h', 'lag_2h', 'lag_3h', 'lag_24h']
    target = 'available_bikes'
    
    limit_idx = int(len(df) * 0.90) # Usamos 90% para train porque tenemos pocos datos
    df = df.sort_values('timestamp')
    
    X_train = df[features].iloc[:limit_idx]
    y_train = df[target].iloc[:limit_idx]
    X_test = df[features].iloc[limit_idx:]
    y_test = df[target].iloc[limit_idx:]
    
    model = HistGradientBoostingRegressor(**MODEL_PARAMS)
    model.fit(X_train, y_train)
    
    preds = model.predict(X_test)
    mae_val = mean_absolute_error(y_test, preds)
    r2_val = r2_score(y_test, preds)
    
    print("\n" + "="*50)
    print(f"🏆 RESULTADOS V11:")
    print(f"   MAE: {mae_val:.4f} bicis")
    print(f"   R²:  {r2_val:.4f}")
    print("="*50)
    
    return model, mae_val

def main():
    print("\n" + "="*70)
    print("🚀 TRAINING V11 (SHORT HISTORY OPTIMIZED)")
    print("="*70)
    
    df = fetch_all_data()
    if df.empty: return
    
    weather = fetch_weather()
    df_clean = prepare_data_short_history(df, weather)
    
    model, mae_val = train_global_model(df_clean)
    
    station_caps = df.groupby('station_id')['total_capacity'].max().to_dict()
    
    artifact = {
        'model': model,
        'station_info': station_caps,
        'feature_cols': ['station_id', 'hour', 'day_of_week', 'is_weekend', 
                         'temperature', 'rain_1h', 'wind_speed', 
                         'lag_1h', 'lag_2h', 'lag_3h', 'lag_24h'], # Sin lag_1w
        'version': '11.0-short-hist'
    }
    
    joblib.dump(artifact, MODEL_FILE, compress=3)
    
    os.system('git config --global user.email "bot@bicicoruna.ai"')
    os.system('git config --global user.name "Training Bot"')
    os.system(f'git add -f {MODEL_FILE}')
    os.system(f'git commit -m "model: V11 ShortHistory MAE={mae_val:.3f}"')
    os.system('git push')

if __name__ == "__main__":
    main()