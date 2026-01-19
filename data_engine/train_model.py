"""
Train Model v21: LINEAR + SMART FEATURES
- Eliminada transformación Log (recupera R²).
- Mantiene detección de festivos y velocidad (slope).
- Optimizado para datasets de < 1 mes.
"""

import os
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from supabase import create_client, Client
from dotenv import load_dotenv
import warnings

warnings.filterwarnings('ignore')
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
MODEL_FILE = 'data_engine/models_advanced.pkl'

# Festivos Manuales (Galicia 2025-2026)
HOLIDAYS = [
    '2026-01-01', '2026-01-06', 
    '2025-12-25', '2026-03-19', '2026-04-02', '2026-04-03'
]

# Configuración equilibrada para dataset pequeño/mediano
MODEL_PARAMS = {
    'loss': 'absolute_error', # Volvemos a error absoluto directo
    'learning_rate': 0.05,
    'max_iter': 1000,
    'max_depth': 8,           # Menos profundidad para evitar overfitting en picos
    'l2_regularization': 2.5, # Más regularización para suavizar
    'early_stopping': True,
    'categorical_features': [0], 
    'random_state': 42
}

def fetch_all_data():
    print("📥 Descargando historial...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    all_data = []
    page = 0
    page_size = 1000
    
    while True:
        r = supabase.table("snapshots")\
            .select("station_id, timestamp, available_bikes, estaciones(total_capacity)")\
            .order("timestamp", desc=True)\
            .range(page*page_size, (page+1)*page_size-1).execute()
        
        if not r.data: break
        all_data.extend(r.data)
        if len(r.data) < page_size: break
        page += 1

    df = pd.DataFrame(all_data)
    if df.empty: return df
    
    if 'estaciones' in df.columns:
        df['total_capacity'] = pd.json_normalize(df['estaciones'])['total_capacity']
        df.drop('estaciones', axis=1, inplace=True)
    
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, format='mixed').dt.tz_convert(None).dt.floor('h')
    # Promedio por hora para reducir ruido
    return df.groupby(['station_id', 'timestamp']).last().reset_index()

def fetch_weather():
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        r = supabase.table("clima").select("*").execute()
        df = pd.DataFrame(r.data)
        if df.empty: return pd.DataFrame()
        
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, format='mixed').dt.tz_convert(None).dt.floor('h')
        cols = ['temperature', 'rain_1h', 'wind_speed']
        for c in cols: 
            if c not in df.columns: df[c] = 0
        return df.groupby('timestamp')[cols].mean().reset_index()
    except:
        return pd.DataFrame()

def engineer_features(df, weather_df):
    print("🔧 Ingeniería de Features (Slope + Holiday)...")
    
    full_dfs = []
    for sid, group in df.groupby('station_id'):
        group = group.set_index('timestamp').sort_index()
        idx = pd.date_range(group.index.min(), group.index.max(), freq='1h')
        group = group.reindex(idx)
        
        group['station_id'] = sid
        group['total_capacity'] = group['total_capacity'].ffill().bfill()
        group['available_bikes'] = group['available_bikes'].interpolate(method='linear', limit=4)
        full_dfs.append(group)
    
    if not full_dfs: return pd.DataFrame()
    df_clean = pd.concat(full_dfs).reset_index().rename(columns={'index': 'timestamp'})
    
    if not weather_df.empty:
        df_clean = df_clean.merge(weather_df, on='timestamp', how='left')
        df_clean[['temperature', 'rain_1h', 'wind_speed']] = df_clean[['temperature', 'rain_1h', 'wind_speed']].ffill()
    
    defaults = {'temperature': 15, 'rain_1h': 0, 'wind_speed': 5}
    for col, val in defaults.items():
        if col not in df_clean.columns: df_clean[col] = val
        else: df_clean[col] = df_clean[col].fillna(val)

    # 1. Calendario
    df_clean['date_str'] = df_clean['timestamp'].dt.strftime('%Y-%m-%d')
    df_clean['is_holiday'] = df_clean['date_str'].isin(HOLIDAYS).astype(int)
    
    df_clean['hour_sin'] = np.sin(2 * np.pi * df_clean['timestamp'].dt.hour / 24)
    df_clean['hour_cos'] = np.cos(2 * np.pi * df_clean['timestamp'].dt.hour / 24)
    
    # Días: Si es festivo, se comporta como domingo (6)
    df_clean['day_num'] = df_clean['timestamp'].dt.dayofweek
    df_clean.loc[df_clean['is_holiday'] == 1, 'day_num'] = 6 
    
    df_clean['day_sin'] = np.sin(2 * np.pi * df_clean['day_num'] / 7)
    df_clean['day_cos'] = np.cos(2 * np.pi * df_clean['day_num'] / 7)
    df_clean['is_weekend'] = df_clean['day_num'].isin([5, 6]).astype(int)

    # 2. Historia
    grp = df_clean.groupby('station_id')['available_bikes']
    df_clean['lag_1h'] = grp.shift(1)
    df_clean['lag_2h'] = grp.shift(2)
    df_clean['lag_3h'] = grp.shift(3)
    df_clean['lag_24h'] = grp.shift(24)
    df_clean['rolling_3h'] = grp.rolling(window=3).mean().reset_index(0, drop=True).shift(1)
    
    # 3. Velocidad (Tendencia inmediata)
    df_clean['slope'] = df_clean['lag_1h'] - df_clean['lag_2h']

    return df_clean.dropna().reset_index(drop=True)

def main():
    print("\n🚀 ENTRENAMIENTO v21 (OPTIMIZED)")
    df = fetch_all_data()
    if df.empty: return print("❌ Error datos.")
    
    weather = fetch_weather()
    df_final = engineer_features(df, weather)
    
    if df_final.empty: return print("❌ Datos insuficientes.")

    features = [
        'station_id', 'total_capacity',
        'hour_sin', 'hour_cos', 'day_sin', 'day_cos', 'is_weekend', 'is_holiday',
        'temperature', 'rain_1h', 'wind_speed',
        'lag_1h', 'lag_2h', 'lag_3h', 'lag_24h', 
        'rolling_3h', 'slope'
    ]
    target = 'available_bikes'
    
    split_idx = int(len(df_final) * 0.95)
    train = df_final.iloc[:split_idx]
    test = df_final.iloc[split_idx:]
    
    print(f"🤖 Entrenando con {len(train)} muestras...")
    model = HistGradientBoostingRegressor(**MODEL_PARAMS)
    model.fit(train[features], train[target])
    
    if len(test) > 0:
        preds = model.predict(test[features])
        # Asegurar límites físicos
        preds = np.maximum(0, preds)
        
        mae = mean_absolute_error(test[target], preds)
        r2 = r2_score(test[target], preds)
        print(f"\n🏆 RESULTADOS v21:\n   MAE: {mae:.4f}\n   R²: {r2:.4f}")
    
    caps = df.groupby('station_id')['total_capacity'].max().to_dict()
    artifact = {
        'model': model, 'station_info': caps, 'features': features, 
        'version': 'v21_linear', 'is_log_model': False
    }
    joblib.dump(artifact, MODEL_FILE, compress=3)
    
    os.system('git config --global user.email "bot@bicicoruna.ai"')
    os.system('git config --global user.name "Training Bot"')
    os.system(f'git add {MODEL_FILE}')
    os.system(f'git commit -m "model v21 (linear optimized) mae={mae:.3f}"')
    os.system('git push')

if __name__ == "__main__":
    main()