"""
Predictor v11.1: Fix AttributeError dayofweek -> weekday()
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
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
MODEL_PATH = 'data_engine/models_advanced.pkl'
CORUNA_LAT, CORUNA_LON = 43.3623, -8.4115

def get_supabase(): return create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_history_context():
    """Descarga las últimas 48h para calcular lags recientes."""
    sb = get_supabase()
    days_ago = (datetime.now() - timedelta(hours=48)).isoformat()
    
    all_rows = []
    page = 0
    while True:
        r = sb.table('snapshots')\
            .select('station_id, timestamp, available_bikes')\
            .gte('timestamp', days_ago)\
            .range(page*2000, (page+1)*2000-1).execute()
        if not r.data: break
        all_rows.extend(r.data)
        if len(r.data) < 2000: break
        page += 1
        
    df = pd.DataFrame(all_rows)
    if df.empty: return df
    
    df['timestamp'] = pd.to_datetime(df['timestamp'], format='mixed', utc=True).dt.tz_convert(None).dt.floor('h')
    return df.sort_values('timestamp')

def fetch_weather():
    if not OPENWEATHER_API_KEY: return None
    try:
        url = "https://api.openweathermap.org/data/2.5/forecast"
        resp = requests.get(url, params={"lat": CORUNA_LAT, "lon": CORUNA_LON, "appid": OPENWEATHER_API_KEY, "units": "metric", "cnt": 16})
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

def main():
    print("🔮 PREDICCIONES v11.1 (Short History Fix)")
    if not os.path.exists(MODEL_PATH): 
        print("❌ No se encontró el modelo .pkl")
        return

    artifact = joblib.load(MODEL_PATH)
    model = artifact['model']
    station_caps = artifact['station_info']
    
    model_version = artifact.get('version', 'unknown')
    print(f"   Usando modelo versión: {model_version}")

    # 1. Datos Contexto
    history = fetch_history_context()
    if history.empty: 
        print("❌ No hay historia reciente en Supabase")
        return
    
    weather_df = fetch_weather()
    
    # 2. Generar predicciones futuras
    future_dates = [datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(hours=i) for i in range(1, 25)]
    all_preds = []
    
    for sid in history['station_id'].unique():
        sdf = history[history['station_id'] == sid].set_index('timestamp').sort_index()
        if len(sdf) < 1: continue
        
        last_val = sdf['available_bikes'].iloc[-1]
        
        for date in future_dates:
            # --- Lags ---
            lag_1h = last_val
            
            target_24h = date - timedelta(hours=24)
            try:
                idx_24 = sdf.index.get_indexer([target_24h], method='nearest')[0]
                found_date = sdf.index[idx_24]
                if abs((found_date - target_24h).total_seconds()) < 7200:
                    lag_24h = sdf['available_bikes'].iloc[idx_24]
                else:
                    lag_24h = last_val
            except:
                lag_24h = last_val
            
            # --- Clima ---
            temp, rain, wind = 15, 0, 5
            if weather_df is not None:
                time_diffs = (weather_df['timestamp'] - date).abs()
                w_idx = time_diffs.idxmin()
                if time_diffs[w_idx] < timedelta(hours=3):
                    w_row = weather_df.loc[w_idx]
                    temp = w_row['temperature']
                    rain = w_row['rain_1h']
                    wind = w_row['wind_speed']
            
            # --- CORRECCIÓN AQUÍ ---
            # Usamos date.weekday() en lugar de date.dayofweek
            row = pd.DataFrame([{
                'station_id': sid,
                'hour': date.hour,
                'day_of_week': date.weekday(),             # <--- CORREGIDO
                'is_weekend': 1 if date.weekday() >= 5 else 0, # <--- CORREGIDO
                'temperature': temp,
                'rain_1h': rain,
                'wind_speed': wind,
                'lag_1h': lag_1h,
                'lag_2h': lag_1h,
                'lag_3h': lag_1h,
                'lag_24h': lag_24h
            }])
            
            pred = model.predict(row)[0]
            cap = station_caps.get(sid, 30)
            pred = max(0, min(cap, round(pred)))
            
            all_preds.append({
                'station_id': int(sid),
                'prediction_date': date.isoformat(),
                'predicted_bikes': int(pred)
            })
            
    # 3. Subir
    if all_preds:
        sb = get_supabase()
        batch = 1000
        print(f"📤 Subiendo {len(all_preds)} predicciones...")
        for i in range(0, len(all_preds), batch):
            sb.table("predicciones").upsert(
                all_preds[i:i+batch], 
                on_conflict='station_id,prediction_date'
            ).execute()
        print("✅ Proceso terminado.")

if __name__ == "__main__":
    main()