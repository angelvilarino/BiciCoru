import os
import time
import random
import requests
from datetime import datetime
from supabase import create_client

# Usar variables de entorno o valores por defecto
# URL = os.getenv("SUPABASE_URL", "https://nkfvkszhrxwbippbntri.supabase.co")
# KEY = os.getenv("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY3MTY3MywiZXhwIjoyMDgyMjQ3NjczfQ.GCZ63RK-eQSJdUaoFCD26pCO7qTqzl54A1iYsTvUOuw")
# OPENWEATHER_KEY = os.getenv("OPENWEATHER_API_KEY", "0a82c0700f0b3696713e8ef1c5a8a415")

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_KEY")
WEATHER_KEY = os.getenv("OPENWEATHER_API_KEY")

supabase = create_client(URL, KEY)

# ==========================================
# FUNCIONES DE APOYO
# ==========================================

def obtener_datos_ambientales():
    """Obtiene clima y calidad del aire de A Coruña."""
    try:
        # 1. Clima y Temperatura
        res = requests.get(f"https://api.openweathermap.org/data/2.5/weather?q=A+Coruna,ES&appid={WEATHER_KEY}&units=metric").json()
        clima = res['weather'][0]['main']
        temp = res['main']['temp']
        
        # 2. Calidad del Aire (AQI: 1=Excelente, 5=Muy Mala)
        res_aq = requests.get(f"http://api.openweathermap.org/data/2.5/air_pollution?lat=43.36&lon=-8.41&appid={WEATHER_KEY}").json()
        aqi = res_aq['list'][0]['main']['aqi']
        return clima, temp, aqi
    except Exception as e:
        print(f"⚠️ Error ambiental: {e}")
        return "Clear", 15.0, 1

def actualizar_precios_gasolina():
    """Obtiene precios de MITYC con cabeceras de navegador para evitar bloqueos."""
    print("⛽ Actualizando precios de combustible...")
    
    # Cabeceras para parecer un navegador real
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    
    try:
        url = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/"
        # Añadimos las headers y un timeout más largo (20 segundos)
        res = requests.get(url, headers=headers, timeout=20)
        
        if res.status_code == 200:
            data = res.json()
            # Filtramos solo estaciones en Coruña (Municipio o Provincia)
            gasolineras = [g for g in data["ListaEESSPrecio"] if "CORUÑA" in g["Municipio"].upper()]
            
            print(f"    🔍 Encontradas {len(gasolineras)} gasolineras en Coruña.")
            
            for g in gasolineras:
                # El Rótulo suele venir en MAYÚSCULAS, lo ponemos bonito
                nombre = g["Rótulo"].title()
                
                # Limpieza de precios (vienen con comas y como strings)
                try:
                    p95 = float(g["Precio Gasolina 95 E5"].replace(",", ".")) if g["Precio Gasolina 95 E5"] else None
                    pdiesel = float(g["Precio Gasoleo A"].replace(",", ".")) if g["Precio Gasoleo A"] else None
                    
                    # Actualizamos en la tabla sitios usando el nombre (Ilike es insensible a mayúsculas)
                    supabase.table("sitios").update({
                        "precio_95": p95,
                        "precio_diesel": pdiesel
                    }).ilike("nombre", f"%{nombre}%").execute()
                except:
                    continue
            print("    ✅ Precios inyectados en la tabla sitios.")
        else:
            print(f"    ⚠️ El servidor respondió con código {res.status_code}")
            
    except Exception as e:
        print(f"    ⚠️ No se pudo conectar con el servidor de gasolineras: {str(e)[:50]}")
        print("    ⏭️ Saltando actualización de gasolina para continuar con ocupación...")

def calcular_ocupacion(cat, hora, dia, clima, festivo):
    """Lógica de simulación inteligente basada en patrones de Coruña."""
    # Base por categoría
    bases = {
        "supermercado": 30, "centro_comercial": 40, "restaurante": 20, 
        "gimnasio": 25, "hospital": 60, "cafeteria": 35
    }
    ocupacion = bases.get(cat, 30)

    # Picos horarios
    if 9 <= hora <= 12: ocupacion += 30
    if 18 <= hora <= 21: ocupacion += 40
    if hora > 22 or hora < 7: ocupacion = 5

    # Modificadores
    if dia >= 5: ocupacion += 15 # Fin de semana
    if festivo: ocupacion += 20
    if clima in ["Rain", "Snow"]: ocupacion += 10 # Más gente en interiores

    return max(0, min(100, ocupacion + random.randint(-5, 5)))

def actualizar_parkings():
    """Intenta obtener datos reales; si falla, aplica simulación lógica."""
    print("🅿️  Actualizando parkings municipales...")
    
    url = "https://coruna.iplace.es/api/v1/parkings"
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    
    try:
        # Intentamos la conexión con un timeout corto para no frenar el scraper
        res = requests.get(url, headers=headers, timeout=5)
        if res.status_code == 200:
            data = res.json()
            for p in data:
                nombre = p.get("name")
                libres = p.get("free_places")
                totales = p.get("total_places", 100)
                
                supabase.table("parkings").upsert({
                    "nombre": nombre,
                    "plazas_libres": int(libres),
                    "plazas_totales": int(totales),
                    "updated_at": datetime.now().isoformat()
                }, on_conflict="nombre").execute()
            print("    ✅ Parkings actualizados con DATOS REALES.")
            return
    except Exception:
        print("    ⚠️ API iPlace no disponible. Iniciando Simulación de Respaldo...")

    # --- LÓGICA DE SIMULACIÓN (Si la API falla) ---
    # Obtenemos los parkings que ya tenemos en la tabla para simular sobre ellos
    parkings_db = supabase.table("parkings").select("nombre, plazas_totales").execute().data
    
    hora = datetime.now().hour
    dia = datetime.now().weekday()
    
    for p in parkings_db:
        totales = p['plazas_totales'] or 100
        # Simulación: Lleno en horas punta (11-13h y 19-21h)
        if 10 <= hora <= 14 or 18 <= hora <= 21:
            # Entre 5% y 15% de plazas libres (Muy lleno)
            libres = random.randint(int(totales*0.05), int(totales*0.15))
        elif 0 <= hora <= 7:
            # Noche: 80% a 95% libre
            libres = random.randint(int(totales*0.80), int(totales*0.95))
        else:
            # Resto del día: 40% a 60% libre
            libres = random.randint(int(totales*0.40), int(totales*0.60))

        supabase.table("parkings").update({
            "plazas_libres": libres,
            "updated_at": datetime.now().isoformat()
        }).eq("nombre", p['nombre']).execute()
    
    print("    🤖 Parkings actualizados con SIMULACIÓN COHERENTE.")

# ==========================================
# PROCESO PRINCIPAL
# ==========================================

def ejecutar_scraper():
    ahora = datetime.now()
    print(f"\n🚀 SCRAPER UNIFICADO - {ahora.strftime('%H:%M')}")
    
    # 1. Datos Ambientales
    clima, temp, aqi = obtener_datos_ambientales()
    print(f"🌤️  {clima} | {temp}°C | AQI: {aqi}")

    # 2. Gasolineras (se actualizan en la tabla sitios)
    actualizar_precios_gasolina()

    actualizar_parkings()

    # 3. Procesar Ocupación de Sitios
    sitios = supabase.table("sitios").select("id, nombre, categoria").eq("activo", True).execute().data
    print(f"📍 Calculando ocupación para {len(sitios)} sitios...")

    festivos = ["2025-01-01", "2025-01-06", "2025-12-25"]
    es_festivo = ahora.strftime("%Y-%m-%d") in festivos

    registros_historial = []
    
    for s in sitios:
        ocupacion = calcular_ocupacion(s["categoria"], ahora.hour, ahora.weekday(), clima, es_festivo)
        
        registros_historial.append({
            "sitio_id": s["id"],
            "ocupacion_porcentaje": ocupacion,
            "clima": clima,
            "temperatura": temp,
            "hora": ahora.hour,
            "dia_semana": ahora.weekday()
        })

    # Inserción masiva para ahorrar tiempo y recursos
    # Inserción masiva con UPSERT para evitar duplicados
    if registros_historial:
        try:
            # Usamos upsert indicando que el conflicto se resuelve por sitio, hora y fecha
            supabase.table("ocupacion_historial").upsert(
                registros_historial, 
                on_conflict="sitio_id, hora, timestamp"
            ).execute()
            print(f"✅ Historial sincronizado: {len(registros_historial)} filas (sin duplicados).")
        except Exception as e:
            print(f"❌ Error al guardar historial: {e}")

if __name__ == "__main__":
    ejecutar_scraper()