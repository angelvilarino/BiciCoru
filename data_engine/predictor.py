"""
Predictor v5: Compatible con Training v5
"""
import os
import joblib
import pandas as pd
import numpy as np
import requests
import logging
from datetime import datetime, timedelta
from supabase import create_client
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s')
logger = logging.getLogger(__name__)

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
MODEL_PATH = 'data_engine/models_advanced.pkl'
CORUNA_LAT, CORUNA_LON = 43.3623, -8.4115

def get_supabase(): return create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_current_status():
    try:
        sb = get_supabase()
        resp = sb.table('estado_actual').select('station_id, available_bikes').execute()
        return {i['station_id']: i['available_bikes'] for i in resp.data}
    except: return {}

def fetch_weather_forecast():
    if not OPENWEATHER_API_KEY: return None
    try:
        url = "https://api.openweathermap.org/data/2.5/forecast"
        resp = requests.get(url, params={"lat": CORUNA_LAT, "lon": CORUNA_LON, "appid": OPENWEATHER_API_KEY, "units": "metric", "cnt": 16})
        resp.raise_for_status()
        
        data = []
        for i in resp.json()['list']:
            data.append({
                'timestamp': pd.to_datetime(i['dt'], unit='s'),
                'temperature': i['main']['temp'],
                'wind_speed': i['wind']['speed'],
                'rain_1h': i.get('rain', {}).get('3h', 0) / 3
            })
        return pd.DataFrame(data)
    except: return None

def generate_future_features(hours=24, holidays=None):
    start = datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    timestamps = [start + timedelta(hours=i) for i in range(hours)]
    df = pd.DataFrame({'timestamp': timestamps})
    
    df['hour'] = df['timestamp'].dt.hour
    df['day_of_week'] = df['timestamp'].dt.dayofweek
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    
    # Feature de Interacción (Debe coincidir con train_model.py)
    df['is_working_hour'] = df['hour'].apply(lambda x: 1 if 7 <= x <= 20 else 0) * (1 - df['is_weekend'])
    
    two_pi = 2 * np.pi
    df['hour_sin'] = np.sin(two_pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(two_pi * df['hour'] / 24)
    
    df['is_holiday'] = 0 # Simplificado
    return df

def add_weather(df, weather_df):
    if weather_df is None or weather_df.empty:
        df['temperature'] = 15; df['wind_speed'] = 5; df['is_raining'] = 0
        return df
    
    weather_df = weather_df.set_index('timestamp').resample('h').interpolate().reset_index()
    df = pd.merge_asof(df, weather_df, on='timestamp', direction='nearest')
    df = df.ffill().bfill()
    df['is_raining'] = (df['rain_1h'] > 0.1).astype(int)
    return df

def main():
    print("🔮 PREDICCIONES v5")
    if not os.path.exists(MODEL_PATH): return

    artifact = joblib.load(MODEL_PATH)
    models = artifact['models']
    info = artifact['station_info']
    features = artifact['feature_cols'] # Lee las columnas del entrenamiento
    
    current_status = fetch_current_status()
    base_df = generate_future_features(hours=24)
    weather = fetch_weather_forecast()
    base_df = add_weather(base_df, weather)
    
    predictions = []
    
    for sid, model in models.items():
        try:
            sdf = base_df.copy()
            # Lags estáticos (Mejorable en v6 con predicción recursiva)
            val = current_status.get(sid, 0)
            sdf['bikes_lag_1h'] = val
            sdf['bikes_lag_3h'] = val
            
            preds = model.predict(sdf[features])
            cap = info[sid]['capacity']
            preds = np.clip(preds, 0, cap).round().astype(int)
            
            for i, p in enumerate(preds):
                predictions.append({
                    'station_id': int(sid),
                    'prediction_date': sdf.iloc[i]['timestamp'].isoformat(),
                    'predicted_bikes': int(p)
                })
        except Exception as e:
            logger.error(f"Error {sid}: {e}")

    if predictions:
        sb = get_supabase()
        # Borrar predicciones viejas (opcional pero limpio)
        # sb.table('predicciones').delete().lt('prediction_date', datetime.now().isoformat()).execute()
        
        # Subir en lotes
        batch = 1000
        for i in range(0, len(predictions), batch):
            sb.table("predicciones").upsert(
                predictions[i:i+batch], on_conflict='station_id,prediction_date'
            ).execute()
        print(f"✅ {len(predictions)} predicciones subidas.")

if __name__ == "__main__":
    main()