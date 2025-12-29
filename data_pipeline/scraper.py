import os
import time
import random
import requests
from datetime import datetime
from supabase import create_client
import livepopulartimes

# export OPENWEATHER_API_KEY="0a82c0700f0b3696713e8ef1c5a8a415"

# Conexión
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

def obtener_clima():
    """Obtiene clima actual de OpenWeather para A Coruña"""
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key: 
        return None, None
    try:
        url = "https://api.openweathermap.org/data/2.5/weather"
        # Usamos el ID de ciudad de A Coruña o coordenadas para más precisión
        params = {"q": "A Coruna,ES", "appid": api_key, "units": "metric", "lang": "es"}
        r = requests.get(url, params=params, timeout=10)
        if r.status_code == 200:
            data = r.json()
            estado_clima = data["weather"][0]["main"]
            temp = data["main"]["temp"]
            return estado_clima, temp
    except Exception as e:
        print(f"⚠️ Error Clima: {e}")
    return None, None

def obtener_simulacion_emergencia(hora):
    """Nivel 3: Curva de ocupación estándar si todo lo demás falla"""
    if 9 <= hora <= 13 or 18 <= hora <= 21:
        return random.randint(60, 85)
    if 14 <= hora <= 17:
        return random.randint(30, 50)
    return random.randint(5, 20)

def scraper():
    print(f"🚀 Iniciando captura total: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    # Traemos los datos necesarios de la tabla sitios
    res = supabase.table("sitios").select("id, nombre, direccion").eq("activo", True).execute()
    sitios = res.data

    clima_act, temp_act = obtener_clima()
    print(f"🌤️  Clima actual: {clima_act} | Temp: {temp_act}°C")

    # Configuración de fechas
    ahora = datetime.now()
    # lunes=0 en Python. Si quieres lunes=1 usa: ahora.weekday() + 1
    dia_semana = ahora.weekday() 
    hora_actual = ahora.hour
    hoy_festivo = ahora.strftime("%Y-%m-%d") in ["2025-01-01", "2025-01-06", "2025-12-25"]

    for s in sitios:
        pop_final = None
        fuente = "ninguna"
        
        try:
            # Intentamos obtener datos de Google
            query = f"{s['nombre']}, {s['direccion']}"
            data = livepopulartimes.get_populartimes_by_address(query)

            # ESTRATEGIA NIVEL 1: Live Data
            if isinstance(data, dict) and data.get("current_popularity") is not None:
                pop_final = data["current_popularity"]
                fuente = "live"
            
            # ESTRATEGIA NIVEL 2: Histórico de Google (Histograma)
            elif isinstance(data, dict) and data.get("populartimes") is not None:
                try:
                    # Accedemos al día y hora actual en el histograma de Google
                    pop_final = data["populartimes"][dia_semana]["data"][hora_actual]
                    fuente = "google_historia"
                except:
                    pass

            # ESTRATEGIA NIVEL 3: Simulación (Para que no haya huecos)
            if pop_final is None:
                pop_final = obtener_simulacion_emergencia(hora_actual)
                fuente = "simulacion_ia"

            # GUARDADO EN SUPABASE
            supabase.table("ocupacion_historial").insert({
                "sitio_id": s["id"],
                "ocupacion_porcentaje": int(pop_final),
                "dia_semana": int(dia_semana),
                "hora": int(hora_actual),
                "clima": clima_act,
                "temperatura": float(temp_act) if temp_act is not None else None,
                "es_festivo": hoy_festivo,
                "fuente": fuente
            }).execute()
            
            icon = "🔥" if fuente == "live" else "📊" if fuente == "google_historia" else "🤖"
            print(f"{icon} {s['nombre'][:20]} -> {pop_final}% ({fuente})")

        except Exception as e:
            print(f"❌ Error en {s['nombre'][:20]}: {str(e)[:50]}")
        
        # Delay para evitar baneos (Google es estricto)
        time.sleep(random.uniform(7.0, 12.0))

if __name__ == "__main__":
    scraper()