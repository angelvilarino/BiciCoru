"""
Predictor v25: GAP RECOVERY SUPPORT
- Usa holidays automáticos.
- Estrategia de relleno para lag_24h (si falta, usa lag_1h).
"""
import os
import joblib
import pandas as pd
import numpy as np
import requests
import holidays
from datetime import datetime, timedelta, timezone
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
MODEL_DIR = 'data_engine/models_v22/'

# Configurar festivos Galicia auto
try:
    current_year = datetime.now(timezone.utc).year
    es_holidays = holidays.Spain(years=[current_year, current_year+1], subdiv='GA')
except:
    es_holidays = {}

def get_supabase(): return create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_recent_history():
    sb = get_supabase()
    start_date = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
    r = sb.table('snapshots').select('station_id, timestamp, available_bikes').gte('timestamp', start_date).execute()
    df = pd.DataFrame(r.data)
    if df.empty: return df
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, format='mixed').dt.tz_convert(None).dt.floor('h')
    return df.sort_values('timestamp').drop_duplicates(subset=['station_id', 'timestamp'], keep='last')

def fetch_weather_forecast():
    if not OPENWEATHER_API_KEY: return None
    try:
        url = "https://api.openweathermap.org/data/2.5/forecast"
        resp = requests.get(url, params={"lat": 43.3623, "lon": -8.4115, "appid": OPENWEATHER_API_KEY, "units": "metric", "cnt": 16})
        data = []
        for i in resp.json()['list']:
            data.append({
                'timestamp': pd.to_datetime(i['dt'], unit='s'),
                'temp': i['main']['temp'],
                'wind': i['wind']['speed'],
                'rain': i.get('rain', {}).get('3h', 0) / 3
            })
        return pd.DataFrame(data)
    except: return None

def main():
    print("🔮 PREDICCIONES v25 (Gap Recovery)")
    model_path = os.path.join(MODEL_DIR, 'models.pkl')
    if not os.path.exists(model_path): return print("❌ Sin modelo")
    
    artifact = joblib.load(model_path)
    models = artifact['models']
    station_info = artifact['station_info']
    model_features = artifact['features']
    
    history = fetch_recent_history()
    if history.empty: return print("❌ Sin historia")
    
    weather = fetch_weather_forecast()
    future_dates = [datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=i) for i in range(1, 25)]
    all_preds = []
    
    stations = history['station_id'].unique()
    print(f"   Generando para {len(stations)} estaciones...")

    for sid in stations:
        if sid not in models: continue
        
        sdf = history[history['station_id'] == sid].set_index('timestamp').sort_index()
        if len(sdf) < 1: continue
        
        model = models[sid]
        cap = station_info[sid]['capacity']
        last_val = sdf['available_bikes'].iloc[-1]
        
        recent_vals = sdf['available_bikes'].tail(3).tolist()
        while len(recent_vals) < 3: recent_vals.insert(0, last_val)
        
        for date in future_dates:
            lag_1h = recent_vals[-1]
            lag_2h = recent_vals[-2]
            lag_3h = recent_vals[-3]
            slope = lag_1h - lag_2h 
            rolling_3h = sum(recent_vals[-3:]) / 3
            
            # --- GAP RECOVERY ---
            target_24h = date - timedelta(hours=24)
            if target_24h in sdf.index:
                lag_24h = sdf.loc[target_24h, 'available_bikes']
            else:
                # Si falta el dato de hace 24h, usamos el último conocido o lag_1h
                lag_24h = lag_1h 
            
            t, r, w = 15, 0, 5
            if weather is not None:
                w_row = weather.iloc[(weather['timestamp'] - date).abs().argsort()[:1]]
                if not w_row.empty: t, r, w = w_row['temp'].values[0], w_row['rain'].values[0], w_row['wind'].values[0]

            h = date.hour
            is_holiday = 1 if date in es_holidays else 0
            day_num = date.weekday()
            eff_d = 6 if is_holiday else day_num
            is_weekend = 1 if eff_d >= 5 else 0

            row_dict = {
                'total_capacity': cap,
                'hour_sin': np.sin(2 * np.pi * h / 24),
                'hour_cos': np.cos(2 * np.pi * h / 24),
                'day_sin': np.sin(2 * np.pi * eff_d / 7),
                'day_cos': np.cos(2 * np.pi * eff_d / 7),
                'is_weekend': is_weekend, 'is_holiday': is_holiday,
                'temperature': t, 'rain_1h': r, 'wind_speed': w,
                'lag_1h': lag_1h, 'lag_2h': lag_2h, 'lag_3h': lag_3h, 
                'lag_24h': lag_24h, 'rolling_3h': rolling_3h,
                'slope': slope,
                'lag_1h_ratio': lag_1h / cap if cap > 0 else 0
            }
            
            X = pd.DataFrame([row_dict])
            for f in model_features: 
                if f not in X.columns: X[f] = 0
            X = X[model_features]
            
            pred = model.predict(X)[0]
            pred = max(0, min(cap, round(pred)))
            
            recent_vals.append(pred)
            all_preds.append({
                'station_id': int(sid),
                'prediction_date': date.isoformat(),
                'predicted_bikes': int(pred)
            })

    if all_preds:
        sb = get_supabase()
        batch = 1000
        for i in range(0, len(all_preds), batch):
            sb.table("predicciones").upsert(all_preds[i:i+batch], on_conflict='station_id,prediction_date').execute()
        print(f"✅ {len(all_preds)} predicciones guardadas.")

if __name__ == "__main__":
    main()