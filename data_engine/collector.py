"""
Collector Mejorado: Descarga datos de Bicicoruña + Clima
y los guarda de forma normalizada en Supabase.
"""

import os
import requests
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

# SUPABASE_URL = "https://nkfvkszhrxwbippbntri.supabase.co"
# SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow"
# OPENWEATHER_API_KEY = "0a82c0700f0b3696713e8ef1c5a8a415"

# Cargar variables de entorno
load_dotenv()

# Configuración
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")  # Necesitarás registrarte

# APIs
BICI_API_URL = "http://api.citybik.es/v2/networks/bicicorunha"
WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather"

# Coordenadas de A Coruña (centro)
CORUNA_LAT = 43.3623
CORUNA_LON = -8.4115


def fetch_station_data():
    """Descarga datos actuales de las estaciones."""
    try:
        response = requests.get(BICI_API_URL, timeout=10)
        response.raise_for_status()
        data = response.json()
        stations = data.get("network", {}).get("stations", [])
        print(f"✅ Descargadas {len(stations)} estaciones")
        return stations
    except requests.exceptions.RequestException as e:
        print(f"❌ Error al descargar datos de bicis: {e}")
        return []


def fetch_weather_data():
    """Descarga datos meteorológicos de OpenWeatherMap."""
    if not OPENWEATHER_API_KEY:
        print("⚠️ No se configuró OPENWEATHER_API_KEY, omitiendo datos de clima")
        return None
    
    try:
        params = {
            "lat": CORUNA_LAT,
            "lon": CORUNA_LON,
            "appid": OPENWEATHER_API_KEY,
            "units": "metric",  # Celsius
            "lang": "es"
        }
        response = requests.get(WEATHER_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        print(f"✅ Datos de clima descargados: {data['weather'][0]['description']}")
        return data
    except requests.exceptions.RequestException as e:
        print(f"⚠️ Error al descargar clima: {e}")
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
        # Upsert: actualiza si existe, inserta si no
        result = supabase.table("estaciones").upsert(station_records).execute()
        print(f"✅ Actualizadas {len(station_records)} estaciones")
        return station_records
    except Exception as e:
        print(f"❌ Error al guardar estaciones: {e}")
        return []


def insert_snapshots(supabase: Client, stations, timestamp):
    """Inserta snapshots (datos que cambian)."""
    snapshot_records = []
    
    for station in stations:
        extra = station.get("extra", {})
        station_uid = extra.get("uid", station.get("id", "unknown"))
        station_id = int(station_uid) if station_uid.isdigit() else hash(station.get("id")) % 1000000
        
        record = {
            "station_id": station_id,
            "available_bikes": station.get("free_bikes", 0),
            "available_slots": station.get("empty_slots", 0),
            "timestamp": timestamp
        }
        snapshot_records.append(record)
    
    try:
        result = supabase.table("snapshots").insert(snapshot_records).execute()
        print(f"✅ Guardados {len(snapshot_records)} snapshots")
        return result
    except Exception as e:
        print(f"❌ Error al guardar snapshots: {e}")
        return None


def insert_weather(supabase: Client, weather_data, timestamp):
    """Inserta datos de clima."""
    if not weather_data:
        return None
    
    try:
        weather_record = {
            "timestamp": timestamp,
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
        
        result = supabase.table("clima").upsert(weather_record).execute()
        print(f"✅ Clima guardado: {weather_record['temperature']}°C, {weather_record['weather_description']}")
        return result
    except Exception as e:
        print(f"❌ Error al guardar clima: {e}")
        return None


def main():
    """Función principal."""
    print(f"\n🚴 Iniciando recolección - {datetime.now()}")
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Error: Credenciales de Supabase no configuradas")
        return
    
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    timestamp = datetime.now().isoformat()
    
    # 1. Descargar datos de bicis
    stations = fetch_station_data()
    if not stations:
        print("⚠️ No se obtuvieron datos de bicis")
        return
    
    # 2. Descargar datos de clima
    weather_data = fetch_weather_data()
    
    # 3. Guardar estaciones (upsert)
    upsert_stations(supabase, stations)
    
    # 4. Guardar snapshots
    insert_snapshots(supabase, stations, timestamp)
    
    # 5. Guardar clima
    insert_weather(supabase, weather_data, timestamp)
    
    print("✅ Proceso completado\n")


if __name__ == "__main__":
    main()