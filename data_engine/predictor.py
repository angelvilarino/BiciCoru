"""
Predictor v3 (Advanced): Genera predicciones usando modelos complejos (Lags + Ciclos)
"""

import os
import joblib
import pandas as pd
import numpy as np
import requests
import logging
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

# Configuración Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

# --- CONFIGURACIÓN ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") # Recuerda: ¡Usa la SERVICE_ROLE key para escribir!
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
MODEL_PATH = 'data_engine/models_advanced.pkl' # OJO: Nombre del archivo nuevo

CORUNA_LAT = 43.3623
CORUNA_LON = -8.4115

def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_current_status():
    """Descarga el estado ACTUAL de las bicis para calcular los 'Lags'."""
    # Necesitamos saber cuántas bicis hay AHORA para decirle al modelo
    # cuántas había "hace 1 hora" (aprox).
    supabase = get_supabase()
    try:
        # Usamos la vista estado_actual que ya tiene todo resumido
        response = supabase.table('estado_actual').select('station_id, available_bikes').execute()
        # Convertimos a diccionario para búsqueda rápida: {station_id: bicis}
        return {item['station_id']: item['available_bikes'] for item in response.data}
    except Exception as e:
        logger.error(f"❌ Error descargando estado actual: {e}")
        return {}

def fetch_weather_forecast():
    """Descarga forecast de OpenWeather."""
    if not OPENWEATHER_API_KEY:
        return None

    url = "https://api.openweathermap.org/data/2.5/forecast"
    params = {
        "lat": CORUNA_LAT, "lon": CORUNA_LON,
        "appid": OPENWEATHER_API_KEY, "units": "metric", "cnt": 16
    }

    try:
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        
        forecast_list = []
        for item in data['list']:
            forecast_list.append({
                'timestamp': pd.to_datetime(item['dt'], unit='s'),
                'temperature': item['main']['temp'],
                'wind_speed': item['wind']['speed'],
                'humidity': item['main']['humidity'],
                'rain_1h': item.get('rain', {}).get('3h', 0) / 3 # Aprox de 3h a 1h
            })
            
        return pd.DataFrame(forecast_list)
    except Exception as e:
        logger.error(f"❌ Error forecast: {e}")
        return None

def generate_features_for_prediction(hours=24, current_status=None):
    """
    Genera el DataFrame futuro con TODAS las columnas que exige el modelo v3.
    (Seno/Coseno, Bad Weather, Lags...)
    """
    # 1. Base temporal
    start_time = datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    timestamps = [start_time + timedelta(hours=i) for i in range(hours)]
    df = pd.DataFrame({'timestamp': timestamps})
    
    # 2. Features Temporales
    df['hour'] = df['timestamp'].dt.hour
    df['day_of_week'] = df['timestamp'].dt.dayofweek
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    
    # Horas punta
    df['is_morning_rush'] = df['hour'].between(7, 9).astype(int)
    df['is_evening_rush'] = df['hour'].between(18, 20).astype(int)
    # df['is_midday'] = df['hour'].between(12, 14).astype(int) # Si el modelo lo pide, descomentar
    
    # 3. Features Cíclicas (NUEVO v3)
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    
    # 4. Festivos (Placeholder)
    df['is_holiday'] = 0 
    
    return df

def enrich_weather_v3(df, weather_df):
    """Añade clima y calcula 'bad_weather'."""
    if weather_df is None or weather_df.empty:
        df['temperature'] = 15
        df['wind_speed'] = 5
        df['is_raining'] = 0
        df['bad_weather'] = 0
        return df

    # Interpolación
    weather_df = weather_df.set_index('timestamp').resample('h').interpolate(method='linear').reset_index()
    df = pd.merge_asof(df, weather_df, on='timestamp', direction='nearest')
    df = df.ffill().bfill()
    
    # Feature Engineering de Clima (NUEVO v3)
    # Debe coincidir exactamente con lo que hiciste en el train
    df['is_raining'] = (df['rain_1h'] > 0.1).astype(int)
    df['bad_weather'] = ((df['temperature'] < 10) | (df['rain_1h'] > 1) | (df['wind_speed'] > 20)).astype(int)
    
    return df

def main():
    print("\n" + "="*60)
    print("🔮 PREDICCIONES AVANZADAS v3 (Smart Lags)")
    print("="*60)

    # 1. Cargar Modelos Avanzados
    if not os.path.exists(MODEL_PATH):
        logger.error(f"❌ No existe {MODEL_PATH}. Ejecuta train_model_v3_fast.py")
        return

    logger.info("📂 Cargando Cerebro IA (v3)...")
    artifact = joblib.load(MODEL_PATH)
    models = artifact['models']
    station_info = artifact['station_info']
    feature_cols = artifact['feature_cols'] # Lista exacta de columnas que quiere el modelo
    logger.info(f"✅ Cargados {len(models)} modelos.")

    # 2. Obtener estado actual (Para los LAGS)
    logger.info("📡 Obteniendo estado actual de las estaciones...")
    current_bikes_map = fetch_current_status()

    # 3. Preparar Datos Base (Tiempo + Clima)
    base_df = generate_features_for_prediction(hours=24)
    weather_df = fetch_weather_forecast()
    base_df = enrich_weather_v3(base_df, weather_df)
    
    logger.info("⚙️ Ejecutando predicciones...")
    
    all_predictions = []
    
    # 4. Bucle de Predicción por Estación
    for station_id, model in models.items():
        # Crear copia del DF base para esta estación
        station_df = base_df.copy()
        
        # --- GESTIÓN DE LAGS (El truco v3) ---
        # El modelo necesita saber cuántas bicis había antes.
        # Para predicción futura, usamos el valor actual como mejor estimación inicial.
        # (En un sistema v4 haríamos predicción recursiva, pero esto es suficiente por ahora)
        current_val = current_bikes_map.get(station_id, 0) # Si no hay datos, asumimos 0
        
        station_df['bikes_lag_1h'] = current_val
        station_df['bikes_lag_3h'] = current_val
        
        # --- FILTRAR COLUMNAS ---
        # Aseguramos que pasamos EXACTAMENTE las columnas que el modelo aprendió
        try:
            X_pred = station_df[feature_cols]
        except KeyError as e:
            logger.error(f"❌ Falta columna en features: {e}")
            return

        # --- PREDECIR ---
        preds = model.predict(X_pred)
        
        # Post-procesado
        capacity = station_info[station_id]['capacity']
        preds = np.clip(preds, 0, capacity)
        preds = np.round(preds)
        
        # Empaquetar
        for i, pred in enumerate(preds):
            all_predictions.append({
                'station_id': int(station_id),
                'prediction_date': station_df.iloc[i]['timestamp'].isoformat(),
                'predicted_bikes': int(pred)
            })

    # 5. Subir a Supabase
    if all_predictions:
        supabase = get_supabase()
        logger.info(f"📤 Subiendo {len(all_predictions)} predicciones...")
        
        batch_size = 1000
        total = len(all_predictions)
        
        try:
            # Borrar predicciones viejas para mantener limpieza
            # supabase.table('predicciones').delete().lt('prediction_date', datetime.now().isoformat()).execute()
            
            for i in range(0, total, batch_size):
                batch = all_predictions[i:i+batch_size]
                supabase.table("predicciones").upsert(batch, on_conflict='station_id,prediction_date').execute()
                print(f"   Batch {i//batch_size + 1}: OK")
                
            logger.info("✅ ¡Éxito! Base de datos actualizada con IA Avanzada.")
            
        except Exception as e:
            logger.error(f"❌ Error Supabase: {e}")
            if '42501' in str(e):
                logger.error("💡 PISTA: Usa la SERVICE_ROLE key en tu .env, no la pública.")
    else:
        logger.warning("⚠️ No se generaron predicciones.")

if __name__ == "__main__":
    main()