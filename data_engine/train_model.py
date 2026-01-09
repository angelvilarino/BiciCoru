"""
Train Model v3 (FAST): Optimizado con Vectorización y Paralelización
"""

import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import TimeSeriesSplit, RandomizedSearchCV
from sklearn.metrics import mean_absolute_error, r2_score, mean_squared_error
import joblib
from joblib import Parallel, delayed
from supabase import create_client, Client
from dotenv import load_dotenv
import warnings

# Ignorar warnings para mantener la consola limpia
warnings.filterwarnings('ignore')
load_dotenv()

# --- CONFIGURACIÓN ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
N_JOBS_STATIONS = -1  # Usar todos los núcleos para entrenar estaciones en paralelo
N_ITER_SEARCH = 10    # Número de combinaciones aleatorias a probar (más bajo = más rápido)

# Detección de librerías rápidas
try:
    from xgboost import XGBRegressor
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    print("⚠️ XGBoost no instalado.")

try:
    from lightgbm import LGBMRegressor
    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False
    print("⚠️ LightGBM no instalado (Recomendado para velocidad).")


def fetch_training_data():
    """Descarga optimizada seleccionando solo columnas necesarias."""
    print("📥 Descargando datos...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    seven_days_ago = (datetime.now() - timedelta(days=7)).isoformat()
    
    # Optimizamos la query trayendo solo lo necesario
    # Nota: Supabase tiene límite de filas por request, mantenemos paginación
    all_data = []
    page = 0
    page_size = 1000
    
    while True:
        offset = page * page_size
        response = supabase.table("snapshots")\
            .select("station_id, timestamp, available_bikes, estaciones(name, total_capacity)")\
            .gte("timestamp", seven_days_ago)\
            .range(offset, offset + page_size - 1)\
            .execute()
            
        if not response.data: break
        all_data.extend(response.data)
        if len(response.data) < page_size: break
        page += 1
    
    df = pd.DataFrame(all_data)
    
    # Aplanar JSON de estaciones de forma vectorizada
    if 'estaciones' in df.columns:
        estaciones = pd.json_normalize(df['estaciones'])
        df['station_name'] = estaciones['name']
        df['total_capacity'] = estaciones['total_capacity']
        df.drop('estaciones', axis=1, inplace=True)
        
    print(f"✅ Descargados {len(df)} registros.")
    return df

def fetch_weather_and_holidays():
    """Descarga clima y festivos en paralelo (simulado secuencial rápido)."""
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    seven_days_ago = (datetime.now() - timedelta(days=7)).isoformat()
    
    # Hacemos las dos peticiones seguidas
    clima = supabase.table("clima").select("*").gte("timestamp", seven_days_ago).execute()
    festivos = supabase.table("festivos").select("*").execute()
    
    df_clima = pd.DataFrame(clima.data) if clima.data else pd.DataFrame()
    df_festivos = pd.DataFrame(festivos.data) if festivos.data else pd.DataFrame()
    
    return df_clima, df_festivos

def merge_and_engineer_features(snapshots_df, weather_df, holidays_df):
    """
    Ingeniería de características VECTORIZADA (Sin bucles lentos).
    """
    print("🔧 Procesando features (Vectorizado)...")
    df = snapshots_df.copy()
    
    # --- CORRECCIÓN: Añadimos format='mixed' ---
    df['timestamp'] = pd.to_datetime(df['timestamp'], format='mixed', utc=True)
    
    # 1. Merge Clima (Optimizado)
    if not weather_df.empty:
        # --- CORRECCIÓN: Añadimos format='mixed' aquí también ---
        weather_df['timestamp'] = pd.to_datetime(weather_df['timestamp'], format='mixed', utc=True)
        
        # Resample para asegurar unicidad
        weather_df = weather_df.set_index('timestamp').resample('h').first() 
        
        # Round a hora para el merge
        df['hour_key'] = df['timestamp'].dt.floor('h')
        
        # Merge
        df = df.merge(weather_df[['temperature', 'wind_speed', 'humidity', 'rain_1h']], 
                     left_on='hour_key', right_index=True, how='left')
        df.drop('hour_key', axis=1, inplace=True)

    # 2. Merge Festivos
    if not holidays_df.empty:
        holidays_df['date'] = pd.to_datetime(holidays_df['date']).dt.date
        df['date_only'] = df['timestamp'].dt.date
        df = df.merge(holidays_df[['date', 'name']], left_on='date_only', right_on='date', how='left')
        df['is_holiday'] = df['name'].notna().astype(int)
        df.drop(['date_only', 'date', 'name'], axis=1, inplace=True)
    else:
        df['is_holiday'] = 0

    # 3. Features Temporales (Vectorizado)
    dt_props = df['timestamp'].dt
    df['hour'] = dt_props.hour
    df['day_of_week'] = dt_props.dayofweek
    
    # Mappings booleanos directos
    hour = df['hour']
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    df['is_morning_rush'] = ((hour >= 7) & (hour <= 9)).astype(int)
    df['is_evening_rush'] = ((hour >= 18) & (hour <= 20)).astype(int)
    df['is_midday'] = ((hour >= 12) & (hour <= 14)).astype(int)
    
    # Cíclicas
    two_pi = 2 * np.pi
    df['hour_sin'] = np.sin(two_pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(two_pi * df['hour'] / 24)
    
    # 4. Limpieza de Nulos (In-place)
    df.fillna({
        'temperature': 15, 
        'wind_speed': 3, 
        'humidity': 75, 
        'rain_1h': 0
    }, inplace=True)
    
    df['is_raining'] = (df['rain_1h'] > 0.1).astype(int)
    df['bad_weather'] = ((df['temperature'] < 10) | (df['rain_1h'] > 1) | (df['wind_speed'] > 20)).astype(int)

    # 5. Features de LAG
    print("   ⚡ Calculando lags vectorizados...")
    grouped = df.sort_values('timestamp').groupby('station_id')['available_bikes']
    df['bikes_lag_1h'] = grouped.shift(4)  # 4 * 15min = 1h
    df['bikes_lag_3h'] = grouped.shift(12) # 12 * 15min = 3h
    
    # Rellenar lags
    df['bikes_lag_1h'].fillna(df['available_bikes'], inplace=True)
    df['bikes_lag_3h'].fillna(df['available_bikes'], inplace=True)

    return df

def get_optimized_models():
    """Devuelve modelos configurados para velocidad con MÁS opciones."""
    models = {}
    
    # LightGBM (El más rápido y potente)
    if LIGHTGBM_AVAILABLE:
        models['LightGBM'] = {
            'model': LGBMRegressor(random_state=42, n_jobs=1, verbose=-1),
            'params': {
                'n_estimators': [100, 150, 200],      # Antes solo 2 opciones
                'learning_rate': [0.01, 0.05, 0.1],   # Más variedad
                'num_leaves': [20, 31, 50],           # Más complejidad
                'max_depth': [-1, 10, 20]             # Profundidad
            }
        }
    
    # XGBoost
    elif XGBOOST_AVAILABLE:
        models['XGBoost'] = {
            'model': XGBRegressor(random_state=42, n_jobs=1),
            'params': {
                'n_estimators': [100, 200, 300],
                'max_depth': [3, 5, 7],
                'learning_rate': [0.01, 0.05, 0.1],
                'subsample': [0.8, 1.0]
            }
        }
    
    # RandomForest (El plan C)
    else:
        models['RandomForest'] = {
            'model': RandomForestRegressor(random_state=42, n_jobs=1),
            'params': {
                'n_estimators': [50, 100, 150],
                'max_depth': [10, 15, 20],
                'min_samples_split': [2, 5, 10],
                'min_samples_leaf': [1, 2, 4]
            }
        }
    
    return models

def process_single_station(station_id, df_full, models_dict):
    """
    Función aislada para procesar UNA estación.
    Esta función será llamada en paralelo.
    """
    # Filtrado rápido con mascara booleana
    station_df = df_full[df_full['station_id'] == station_id].copy()
    
    # Mínimo de datos requeridos
    if len(station_df) < 50: 
        return None

    feature_cols = [
        'hour', 'day_of_week', 'is_weekend', 'is_morning_rush', 'is_evening_rush',
        'hour_sin', 'hour_cos', 'temperature', 'wind_speed', 'is_raining', 
        'bad_weather', 'is_holiday', 'bikes_lag_1h', 'bikes_lag_3h'
    ]
    
    X = station_df[feature_cols]
    y = station_df['available_bikes']
    
    # Train/Test Split (sin shuffle para series temporales)
    split = int(len(X) * 0.8)
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]
    
    best_model = None
    best_score = float('inf')
    best_info = {}
    
    tscv = TimeSeriesSplit(n_splits=3)
    
    for name, config in models_dict.items():
        # RandomizedSearchCV es MUCHO más rápido que GridSearchCV
        search = RandomizedSearchCV(
            config['model'],
            config['params'],
            n_iter=N_ITER_SEARCH, # Número limitado de pruebas
            cv=tscv,
            scoring='neg_mean_absolute_error',
            n_jobs=1, # No paralelizar dentro, ya paralelizamos fuera
            random_state=42
        )
        
        search.fit(X_train, y_train)
        
        y_pred = search.best_estimator_.predict(X_test)
        y_pred = np.clip(y_pred, 0, station_df['total_capacity'].iloc[0])
        
        mae = mean_absolute_error(y_test, y_pred)
        
        if mae < best_score:
            best_score = mae
            best_model = search.best_estimator_
            best_info = {
                'station_id': station_id,
                'name': station_df['station_name'].iloc[0],
                'capacity': int(station_df['total_capacity'].iloc[0]),
                'best_algorithm': name,
                'mae': mae,
                'r2': r2_score(y_test, y_pred),
                'params': search.best_params_,
                'samples': len(station_df)
            }

    return (station_id, best_model, best_info)

def main():
    print("="*60)
    print("🚀 ENTRENAMIENTO ULTRARRÁPIDO (Multicore)")
    print("="*60)
    
    # 1. Carga de Datos
    df = fetch_training_data()
    weather, holidays = fetch_weather_and_holidays()
    
    if len(df) < 100:
        print("❌ Datos insuficientes.")
        return

    # 2. Ingeniería de Features
    df_processed = merge_and_engineer_features(df, weather, holidays)
    
    # 3. Preparación de Modelos
    models_config = get_optimized_models()
    unique_stations = df_processed['station_id'].unique()
    
    print(f"\n🤖 Entrenando {len(unique_stations)} estaciones en paralelo...")
    print(f"   (Usando {os.cpu_count()} núcleos de CPU)")
    
    # 4. ENTRENAMIENTO PARALELO (Aquí ocurre la magia de velocidad)
    # joblib.Parallel distribuye las estaciones entre los núcleos del procesador
    results = Parallel(n_jobs=N_JOBS_STATIONS, verbose=5)(
        delayed(process_single_station)(sid, df_processed, models_config) 
        for sid in unique_stations
    )
    
    # 5. Recopilación de Resultados
    final_models = {}
    final_info = {}
    
    for res in results:
        if res is not None:
            s_id, model, info = res
            final_models[s_id] = model
            final_info[s_id] = info

    # 6. Guardado y Reporte
    if final_models:
        avg_mae = np.mean([i['mae'] for i in final_info.values()])
        print(f"\n✅ Entrenamiento finalizado.")
        print(f"   Modelos generados: {len(final_models)}")
        print(f"   MAE Promedio Global: {avg_mae:.3f} bicis")
        
        cols_to_save = [
            'hour', 'day_of_week', 'is_weekend', 'is_morning_rush', 'is_evening_rush',
            'hour_sin', 'hour_cos', 'temperature', 'wind_speed', 'is_raining', 
            'bad_weather', 'is_holiday', 'bikes_lag_1h', 'bikes_lag_3h'
        ]
        
        save_data = {
            'models': final_models,
            'station_info': final_info,
            'feature_cols': cols_to_save,
            'version': '3.0-fast'
        }
        
        joblib.dump(save_data, 'data_engine/models_advanced.pkl', compress=3)
        print("💾 Guardado en models_advanced.pkl")
    else:
        print("❌ No se generaron modelos válidos.")

if __name__ == "__main__":
    main()