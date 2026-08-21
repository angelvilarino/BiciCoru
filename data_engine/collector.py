"""
Collector Mejorado v2: Datos + Clima + Limpieza Automática
"""

import os
import requests
import logging
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

# SUPABASE_URL = "https://nkfvkszhrxwbippbntri.supabase.co"
# SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow"
# OPENWEATHER_API_KEY = "0a82c0700f0b3696713e8ef1c5a8a415"

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Cargar variables de entorno
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Configuración
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")

# APIs
BICI_API_URL = "http://api.citybik.es/v2/networks/bicicorunha"
WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather"

# Coordenadas de A Coruña
CORUNA_LAT = 43.3623
CORUNA_LON = -8.4115

# Configuración de retención de datos
SNAPSHOT_RETENTION_DAYS = 365  # Mantener 365 días (1 año) de snapshots
CLIMA_RETENTION_DAYS = 365     # Mantener 365 días de clima


def fetch_station_data():
    """Descarga datos actuales de las estaciones."""
    try:
        response = requests.get(BICI_API_URL, timeout=10)
        response.raise_for_status()
        data = response.json()
        stations = data.get("network", {}).get("stations", [])
        logger.info(f"✅ Descargadas {len(stations)} estaciones")
        return stations
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Error al descargar datos de bicis: {e}")
        return []


def fetch_weather_data():
    """Descarga datos meteorológicos de OpenWeatherMap."""
    if not OPENWEATHER_API_KEY:
        logger.warning("⚠️ No se configuró OPENWEATHER_API_KEY, omitiendo datos de clima")
        return None
    
    try:
        params = {
            "lat": CORUNA_LAT,
            "lon": CORUNA_LON,
            "appid": OPENWEATHER_API_KEY,
            "units": "metric",
            "lang": "es"
        }
        response = requests.get(WEATHER_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        logger.info(f"✅ Clima: {data['weather'][0]['description']}, {data['main']['temp']}°C")
        return data
    except requests.exceptions.RequestException as e:
        logger.warning(f"⚠️ Error al descargar clima: {e}")
        return None


def upsert_stations(supabase: Client, stations):
    """Actualiza o inserta estaciones (datos estáticos)."""
    station_records = []
    
    for station in stations:
        extra = station.get("extra", {})
        station_uid = extra.get("uid", station.get("id", "unknown"))
        station_id = int(station_uid) if station_uid.isdigit() else hash(station.get("id")) % 1000000
        
        free_bikes = station.get("free_bikes", 0)
        empty_slots = station.get("empty_slots", 0)
        
        record = {
            "id": station_id,
            "name": station.get("name", "Desconocida"),
            "latitude": station.get("latitude", 0.0),
            "longitude": station.get("longitude", 0.0),
            "total_capacity": free_bikes + empty_slots,
            "updated_at": datetime.now().isoformat()
        }
        station_records.append(record)
    
    try:
        result = supabase.table("estaciones").upsert(station_records).execute()
        logger.info(f"✅ Actualizadas {len(station_records)} estaciones")
        return station_records
    except Exception as e:
        logger.error(f"❌ Error al guardar estaciones: {e}")
        return []


def insert_snapshots(supabase: Client, stations, timestamp):
    """Inserta snapshots (datos que cambian) con protección contra duplicados."""
    snapshot_records = []
    
    # Redondear timestamp al intervalo de 10 minutos más cercano
    # Esto evita duplicados si el script corre 2 veces muy seguido
    dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    minute = (dt.minute // 10) * 10
    normalized_timestamp = dt.replace(minute=minute, second=0, microsecond=0).isoformat()
    
    for station in stations:
        extra = station.get("extra", {})
        station_uid = extra.get("uid", station.get("id", "unknown"))
        station_id = int(station_uid) if station_uid.isdigit() else hash(station.get("id")) % 1000000
        
        record = {
            "station_id": station_id,
            "available_bikes": station.get("free_bikes", 0),
            "available_slots": station.get("empty_slots", 0),
            "timestamp": normalized_timestamp
        }
        snapshot_records.append(record)
    
    try:
        # Verificar si ya existen snapshots para este timestamp
        existing = supabase.table("snapshots")\
            .select("station_id")\
            .eq("timestamp", normalized_timestamp)\
            .limit(1)\
            .execute()
        
        if existing.data:
            logger.warning(f"⚠️ Ya existen snapshots para {normalized_timestamp}, omitiendo inserción")
            return None
        
        result = supabase.table("snapshots").insert(snapshot_records).execute()
        logger.info(f"✅ Guardados {len(snapshot_records)} snapshots")
        return result
    except Exception as e:
        logger.error(f"❌ Error al guardar snapshots: {e}")
        return None


def insert_weather(supabase: Client, weather_data, timestamp):
    """Inserta datos de clima (solo 1 por hora para evitar duplicados)."""
    if not weather_data:
        return None
    
    try:
        # Redondear al inicio de la hora actual
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        hour_timestamp = dt.replace(minute=0, second=0, microsecond=0).isoformat()
        
        weather_record = {
            "timestamp": hour_timestamp,  # Una entrada por hora
            "temperature": weather_data["main"]["temp"],
            "feels_like": weather_data["main"]["feels_like"],
            "weather_condition": weather_data["weather"][0]["main"],
            "weather_description": weather_data["weather"][0]["description"],
            "wind_speed": weather_data["wind"]["speed"],
            "humidity": weather_data["main"]["humidity"],
            "pressure": weather_data["main"]["pressure"],
            "visibility": weather_data.get("visibility", 10000),
            "rain_1h": weather_data.get("rain", {}).get("1h", 0.0)
        }
        
        # Upsert: actualiza si ya existe para esta hora
        result = supabase.table("clima").upsert(weather_record, on_conflict="timestamp").execute()
        logger.info(f"✅ Clima guardado: {weather_record['temperature']}°C")
        return result
    except Exception as e:
        logger.error(f"❌ Error al guardar clima: {e}")
        return None


def cleanup_old_data(supabase: Client):
    """
    Limpia datos antiguos para evitar crecimiento infinito de la BD.
    - Snapshots: elimina registros > SNAPSHOT_RETENTION_DAYS (365 días)
    - Clima: elimina registros > CLIMA_RETENTION_DAYS (365 días)
    - Predicciones: elimina predicciones con fecha pasada
    """
    try:
        cutoff_date = (datetime.now() - timedelta(days=SNAPSHOT_RETENTION_DAYS)).isoformat()
        now_iso = datetime.now().isoformat()
        
        # Contar registros antes de borrar
        count_snapshots = supabase.table("snapshots")\
            .select("id", count="exact")\
            .lt("timestamp", cutoff_date)\
            .execute()
        
        count_clima = supabase.table("clima")\
            .select("id", count="exact")\
            .lt("timestamp", cutoff_date)\
            .execute()

        count_predicciones = supabase.table("predicciones")\
            .select("id", count="exact")\
            .lt("prediction_date", now_iso)\
            .execute()
        
        total_snapshots = count_snapshots.count if hasattr(count_snapshots, 'count') else 0
        total_clima = count_clima.count if hasattr(count_clima, 'count') else 0
        total_predicciones = count_predicciones.count if hasattr(count_predicciones, 'count') else 0
        
        if total_snapshots > 0:
            supabase.table("snapshots").delete().lt("timestamp", cutoff_date).execute()
            logger.info(f"🗑️ Eliminados {total_snapshots} snapshots antiguos")
        
        if total_clima > 0:
            supabase.table("clima").delete().lt("timestamp", cutoff_date).execute()
            logger.info(f"🗑️ Eliminados {total_clima} registros de clima antiguos")

        if total_predicciones > 0:
            supabase.table("predicciones").delete().lt("prediction_date", now_iso).execute()
            logger.info(f"🗑️ Eliminadas {total_predicciones} predicciones caducadas")
        
        if total_snapshots == 0 and total_clima == 0 and total_predicciones == 0:
            logger.info("✅ No hay datos antiguos para limpiar")
            
    except Exception as e:
        logger.error(f"❌ Error al limpiar datos antiguos: {e}")


def get_db_stats(supabase: Client):
    """Obtiene estadísticas de la base de datos."""
    try:
        # Contar registros en cada tabla
        snapshots_count = supabase.table("snapshots")\
            .select("id", count="exact")\
            .execute()
        
        clima_count = supabase.table("clima")\
            .select("id", count="exact")\
            .execute()
        
        estaciones_count = supabase.table("estaciones")\
            .select("id", count="exact")\
            .execute()
        
        logger.info(f"📊 Estadísticas BD:")
        logger.info(f"   - Estaciones: {estaciones_count.count if hasattr(estaciones_count, 'count') else 'N/A'}")
        logger.info(f"   - Snapshots: {snapshots_count.count if hasattr(snapshots_count, 'count') else 'N/A'}")
        logger.info(f"   - Clima: {clima_count.count if hasattr(clima_count, 'count') else 'N/A'}")
        
    except Exception as e:
        logger.warning(f"⚠️ No se pudieron obtener estadísticas: {e}")


def main():
    """Función principal."""
    logger.info(f"\n{'='*60}")
    logger.info(f"🚴 Iniciando recolección - {datetime.now()}")
    logger.info(f"{'='*60}")
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("❌ Error: Credenciales de Supabase no configuradas")
        return
    
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    timestamp = datetime.now().isoformat()
    
    # 1. Descargar datos de bicis
    stations = fetch_station_data()
    if not stations:
        logger.error("⚠️ No se obtuvieron datos de bicis, abortando")
        return
    
    # 2. Descargar datos de clima
    weather_data = fetch_weather_data()
    
    # 3. Guardar estaciones (upsert)
    upsert_stations(supabase, stations)
    
    # 4. Guardar snapshots
    insert_snapshots(supabase, stations, timestamp)
    
    # 5. Guardar clima
    insert_weather(supabase, weather_data, timestamp)
    
    # 6. Limpieza de datos antiguos (solo 1 vez al día a las 3 AM)
    current_hour = datetime.now().hour
    if current_hour == 3:
        logger.info("🧹 Ejecutando limpieza programada de datos antiguos...")
        cleanup_old_data(supabase)
    
    # 7. Mostrar estadísticas
    get_db_stats(supabase)
    
    logger.info(f"{'='*60}")
    logger.info("✅ Proceso completado")
    logger.info(f"{'='*60}\n")


if __name__ == "__main__":
    main()