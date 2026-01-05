"""
Collector: Descarga datos actuales de las estaciones de Bicicoruña
y los guarda en la tabla 'historico' de Supabase.
"""

import os
import requests
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

# SUPABASE_URL = "https://nkfvkszhrxwbippbntri.supabase.co"
# SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow"

# Cargar variables de entorno
load_dotenv()

# Configuración de Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# URL de la API de Bicicoruña (CityBikes API)
API_URL = "http://api.citybik.es/v2/networks/bicicorunha"

def fetch_station_data():
    """
    Descarga el estado actual de todas las estaciones de Bicicoruña.
    Retorna una lista de diccionarios con la info de cada estación.
    """
    try:
        response = requests.get(API_URL, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # La API devuelve: data['network']['stations']
        network = data.get("network", {})
        stations = network.get("stations", [])
        
        print(f"✅ Descargadas {len(stations)} estaciones de Bicicoruña")
        return stations
    
    except requests.exceptions.RequestException as e:
        print(f"❌ Error al descargar datos: {e}")
        return []

def save_to_supabase(stations):
    """
    Guarda los datos de las estaciones en la tabla 'historico' de Supabase.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Error: No se encontraron las credenciales de Supabase")
        print("   Configura las variables SUPABASE_URL y SUPABASE_KEY en .env")
        return
    
    # Crear cliente de Supabase
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Preparar datos para insertar
    records = []
    timestamp = datetime.now().isoformat()
    
    for station in stations:
        # Extraer campos de la API de CityBikes
        free_bikes = station.get("free_bikes", 0)
        empty_slots = station.get("empty_slots", 0)
        total_capacity = free_bikes + empty_slots
        
        # Extraer UID del campo 'extra' si existe
        extra = station.get("extra", {})
        station_uid = extra.get("uid", station.get("id", "unknown"))
        
        record = {
            "station_id": int(station_uid) if station_uid.isdigit() else hash(station.get("id")) % 1000000,
            "station_name": station.get("name", "Desconocida"),
            "available_bikes": free_bikes,
            "available_slots": empty_slots,
            "total_capacity": total_capacity,
            "latitude": station.get("latitude", 0.0),
            "longitude": station.get("longitude", 0.0),
            "timestamp": timestamp
        }
        records.append(record)
    
    # Insertar en Supabase (batch insert)
    try:
        result = supabase.table("historico").insert(records).execute()
        print(f"✅ Guardados {len(records)} registros en Supabase")
        
        # Mostrar ejemplo de datos guardados
        if records:
            sample = records[0]
            print(f"   📍 Ejemplo: {sample['station_name']} - {sample['available_bikes']} bicis, {sample['available_slots']} slots libres")
        
        return result
    
    except Exception as e:
        print(f"❌ Error al guardar en Supabase: {e}")
        return None

def main():
    """
    Función principal: Descarga datos y los guarda en Supabase.
    """
    print(f"🚴 Iniciando recolección de datos - {datetime.now()}")
    
    # Paso 1: Descargar datos
    stations = fetch_station_data()
    
    if not stations:
        print("⚠️ No se obtuvieron datos. Finalizando.")
        return
    
    # Paso 2: Guardar en Supabase
    save_to_supabase(stations)
    
    print("✅ Proceso completado\n")

if __name__ == "__main__":
    main()