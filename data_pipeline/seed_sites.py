import os
import requests
from supabase import create_client
import time

# export SUPABASE_URL="https://nkfvkszhrxwbippbntri.supabase.co"
# export SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Owy"

# Conexión a Supabase
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

BBOX = "43.33,-8.45,43.39,-8.36"

CATEGORIAS = [
    {"tag": "shop=supermarket", "cat": "supermercado"},
    {"tag": "shop=mall", "cat": "centro_comercial"},
    {"tag": "shop=department_store", "cat": "grandes_almacenes"},
    {"tag": "leisure=fitness_centre", "cat": "gimnasio"},
    {"tag": "leisure=sports_centre", "cat": "polideportivo"},
    {"tag": "amenity=cafe", "cat": "cafeteria"},
    {"tag": "amenity=restaurant", "cat": "restaurante"},
    {"tag": "amenity=fast_food", "cat": "comida_rapida"},
    {"tag": "amenity=library", "cat": "biblioteca"},
    {"tag": "amenity=post_office", "cat": "oficina_correos"},
    {"tag": "amenity=bank", "cat": "banco"},
    {"tag": "amenity=pharmacy", "cat": "farmacia"},
    {"tag": "amenity=hospital", "cat": "hospital"},
    {"tag": "shop=bakery", "cat": "panaderia"},
    {"tag": "amenity=fuel", "cat": "gasolinera"},
]

SERVERS = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

def obtener_ids_existentes():
    """Descarga los osm_id que ya están en la base de datos para saltarlos"""
    try:
        res = supabase.table("sitios").select("osm_id").execute()
        return {str(item['osm_id']) for item in res.data}
    except Exception as e:
        print(f"⚠️ Error cargando IDs: {e}")
        return set()

def limpiar_nombre_comercial(nombre):
    for sufijo in [" S.L.", " S.A.", " S.L.U.", " S.A.U.", " - A Coruña", " (A Coruña)"]:
        nombre = nombre.replace(sufijo, "")
    return nombre.strip()

def estimar_capacidad(metadata, cat_base):
    for key in ["capacity", "occupancy", "seats"]:
        if key in metadata:
            try: return int(metadata[key])
            except: pass
    caps = {
        "supermercado": 150, "centro_comercial": 2500, "grandes_almacenes": 1000,
        "gimnasio": 120, "polideportivo": 400, "cafeteria": 40, "restaurante": 80,
        "comida_rapida": 60, "biblioteca": 120, "oficina_correos": 40, "hospital": 600,
        "gasolinera": 30, "farmacia": 20
    }
    return caps.get(cat_base, 50)

def obtener_lugares(tag_query, ids_conocidos):
    query = f"""
    [out:json][timeout:90];
    (
      node[{tag_query}]({BBOX});
      way[{tag_query}]({BBOX});
      relation[{tag_query}]({BBOX});
    );
    out center tags;
    """
    for servidor in SERVERS:
        try:
            r = requests.post(servidor, data={"data": query}, headers={"User-Agent": "FlowState/1.0"}, timeout=100)
            r.raise_for_status()
            data = r.json()
            
            lugares = []
            vistos_locales = {} # Duplicados espaciales en la misma descarga

            for el in data.get("elements", []):
                osm_id = str(el["id"])
                
                # --- FILTRO 1: Ya existe en la base de datos ---
                if osm_id in ids_conocidos:
                    continue
                
                tags = el.get("tags", {})
                nombre_raw = tags.get("name")
                if not nombre_raw: continue
                
                lat = el.get("lat") or el.get("center", {}).get("lat")
                lon = el.get("lon") or el.get("center", {}).get("lon")
                if not lat or not lon: continue

                nombre_limpio = limpiar_nombre_comercial(nombre_raw)
                nombre_norm = nombre_limpio.lower()

                # --- FILTRO 2: Duplicado espacial en esta misma búsqueda ---
                es_duplicado = False
                if nombre_norm in vistos_locales:
                    for lat_p, lon_p in vistos_locales[nombre_norm]:
                        dist = ((lat - lat_p)**2 + (lon - lon_p)**2)**0.5 * 111000
                        if dist < 100:
                            es_duplicado = True; break
                if es_duplicado: continue
                
                if nombre_norm not in vistos_locales: vistos_locales[nombre_norm] = []
                vistos_locales[nombre_norm].append((lat, lon))

                # --- SCORING ---
                score = 0
                tier1 = ["mercadona", "carrefour", "alcampo", "lidl", "eroski", "corte inglés", "marineda", "día", "gadis", "froiz"]
                if any(m in nombre_norm for m in tier1): score += 250
                tier2 = ["basic fit", "altafit", "mcfit", "starbucks", "mcdonald", "burger king", "kfc", "telepizza"]
                if any(m in nombre_norm for m in tier2): score += 150

                if tags.get("brand"): score += 60
                if tags.get("opening_hours"): score += 40
                if tags.get("building:levels"): score += 20

                # Dirección amigable
                calle = tags.get('addr:street', '')
                numero = tags.get('addr:housenumber', '')
                dir_simple = f"{calle} {numero}, A Coruña".strip(", ")

                lugares.append({
                    "nombre": nombre_limpio,
                    "direccion": dir_simple,
                    "osm_id": int(osm_id),
                    "osm_type": el["type"],
                    "latitud": float(lat),
                    "longitud": float(lon),
                    "score": score,
                    "metadata": tags
                })
            
            lugares.sort(key=lambda x: x["score"], reverse=True)
            return lugares
        except Exception as e:
            print(f"    ⚠️ Error {servidor.split('/')[2]}: {str(e)[:40]}")
            time.sleep(2)
    return []

print("\n🚀 CARGA MASIVA INTELIGENTE - A CORUÑA")
ids_bd = obtener_ids_existentes()
print(f"ℹ️ Sitios detectados en DB: {len(ids_bd)}")

total_ok = 0
for i, cat in enumerate(CATEGORIAS, 1):
    print(f"[{i}/{len(CATEGORIAS)}] 📂 {cat['cat'].upper()}")
    lugares_nuevos = obtener_lugares(cat["tag"], ids_bd)
    
    if not lugares_nuevos:
        print("    ⏭️ Sin sitios nuevos.")
        continue

    for l in lugares_nuevos:
        cap = estimar_capacidad(l["metadata"], cat["cat"])
        try:
            supabase.table("sitios").insert({
                "nombre": l["nombre"],
                "categoria": cat["cat"],
                "direccion": l["direccion"],
                "osm_id": l["osm_id"],
                "osm_type": l["osm_type"],
                "latitud": l["latitud"],
                "longitud": l["longitud"],
                "capacidad_estimada": cap,
                "score": l["score"], # Guardamos el score para el buscador
                "metadata": l["metadata"]
            }).execute()
            total_ok += 1
        except: continue
    
    print(f"    ✅ +{len(lugares_nuevos)} nuevos sincronizados.")
    time.sleep(1)

print(f"\n✨ FINALIZADO. Nuevos sitios añadidos: {total_ok}")