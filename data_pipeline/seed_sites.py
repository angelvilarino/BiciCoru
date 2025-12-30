import os
import requests
from supabase import create_client
import time
import livepopulartimes

# export SUPABASE_URL="https://nkfvkszhrxwbippbntri.supabase.co"
# export SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Owy"

URL = "https://nkfvkszhrxwbippbntri.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY3MTY3MywiZXhwIjoyMDgyMjQ3NjczfQ.GCZ63RK-eQSJdUaoFCD26pCO7qTqzl54A1iYsTvUOuw"

# Conexión
supabase = create_client(URL, KEY)

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
    "https://overpass.kumi.systems/api/interpreter"
]

def obtener_lugares(tag_query):
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
            r = requests.post(servidor, data={"data": query}, 
                            headers={"User-Agent": "FlowState/1.0"}, timeout=100)
            r.raise_for_status()
            data = r.json()
            
            lugares = []
            vistos = {}

            for el in data.get("elements", []):
                tags = el.get("tags", {})
                nombre = tags.get("name")
                if not nombre: 
                    continue
                
                lat = el.get("lat") or el.get("center", {}).get("lat")
                lon = el.get("lon") or el.get("center", {}).get("lon")
                if not lat or not lon: 
                    continue

                # Detectar duplicados
                nombre_norm = nombre.lower().strip()
                es_duplicado = False
                
                if nombre_norm in vistos:
                    for lat_prev, lon_prev in vistos[nombre_norm]:
                        dist = ((lat - lat_prev)**2 + (lon - lon_prev)**2)**0.5 * 111000
                        if dist < 100:
                            es_duplicado = True
                            break
                
                if es_duplicado:
                    continue
                
                if nombre_norm not in vistos:
                    vistos[nombre_norm] = []
                vistos[nombre_norm].append((lat, lon))

                # Score
                score = 0
                n_lower = nombre.lower()
                
                tier1 = ["mercadona", "carrefour", "alcampo", "lidl", "eroski", "corte inglés", "marineda", "día"]
                if any(m in n_lower for m in tier1): 
                    score += 200
                
                tier2 = ["basic fit", "altafit", "starbucks", "mcdonald", "burger king", "kfc"]
                if any(m in n_lower for m in tier2): 
                    score += 100

                if tags.get("brand"): score += 50
                if tags.get("wikidata"): score += 40
                if tags.get("opening_hours"): score += 30
                if tags.get("wheelchair"): score += 20
                if tags.get("website") or tags.get("phone"): score += 15

                # Dirección completa
                partes = []
                if tags.get('addr:street'): 
                    partes.append(tags['addr:street'])
                if tags.get('addr:housenumber'): 
                    partes.append(tags['addr:housenumber'])
                if tags.get('addr:postcode'): 
                    partes.append(tags['addr:postcode'])
                direccion = ", ".join(partes) + ", A Coruña" if partes else "A Coruña"

                # Parsear horario de apertura
                horario_json = None
                if tags.get("opening_hours"):
                    try:
                        # Simplificar formato de opening_hours
                        horario_json = {"raw": tags["opening_hours"]}
                    except:
                        pass

                lugares.append({
                    "nombre": nombre,
                    "direccion": direccion,
                    "osm_id": el["id"],
                    "osm_type": el["type"],
                    "latitud": float(lat),
                    "longitud": float(lon),
                    "score": score,
                    "metadata": tags,
                    "telefono": tags.get("phone") or tags.get("contact:phone"),
                    "website": tags.get("website") or tags.get("contact:website"),
                    "horario_apertura": horario_json
                })
            
            lugares.sort(key=lambda x: x["score"], reverse=True)
            return lugares
                
        except Exception as e:
            print(f"    ⚠️  {servidor.split('/')[2]}: {str(e)[:40]}")
            time.sleep(2)
    
    return []

def estimar_capacidad(metadata, cat_base):
    if "capacity" in metadata:
        try:
            return int(metadata["capacity"])
        except:
            pass
    
    caps = {
        "supermercado": 150, "centro_comercial": 2000, "grandes_almacenes": 800,
        "gimnasio": 100, "polideportivo": 300, "cafeteria": 50, "restaurante": 80,
        "comida_rapida": 40, "biblioteca": 120, "oficina_correos": 30, "banco": 40,
        "farmacia": 20, "hospital": 500, "panaderia": 25, "gasolinera": 20
    }
    
    return caps.get(cat_base, 50)

print("\n🚀 CAPTURA COMPLETA - A Coruña\n")

total = 0
errores = 0

for i, cat in enumerate(CATEGORIAS, 1):
    print(f"[{i}/{len(CATEGORIAS)}] 📂 {cat['cat'].upper()}")
    lugares = obtener_lugares(cat["tag"])
    
    if not lugares:
        print(f"    ⚠️  0 lugares\n")
        continue
    
    ok = 0
    actualizados = 0
    nuevos = 0
    for l in lugares:
        cap = estimar_capacidad(l["metadata"], cat["cat"])
        
        try:
            # Primero verificar si existe
            existe = supabase.table("sitios") \
                .select("id") \
                .eq("osm_id", l["osm_id"]) \
                .eq("osm_type", l["osm_type"]) \
                .execute()
            
            datos = {
                "nombre": l["nombre"],
                "categoria": cat["cat"],
                "direccion": l["direccion"],
                "osm_id": l["osm_id"],
                "osm_type": l["osm_type"],
                "latitud": l["latitud"],
                "longitud": l["longitud"],
                "capacidad_estimada": cap,
                "score": l["score"],
                "activo": True,
                "metadata": l["metadata"],
                "telefono": l.get("telefono"),
                "website": l.get("website"),
                "horario_apertura": l.get("horario_apertura")
            }
            
            if existe.data:
                # Actualizar existente
                supabase.table("sitios") \
                    .update(datos) \
                    .eq("osm_id", l["osm_id"]) \
                    .eq("osm_type", l["osm_type"]) \
                    .execute()
                actualizados += 1
            else:
                # Insertar nuevo
                supabase.table("sitios").insert(datos).execute()
                nuevos += 1
            
            ok += 1
            total += 1
        except Exception as e:
            errores += 1
            if errores < 3:
                print(f"      ❌ {l['nombre'][:30]}: {str(e)[:40]}")
    
    print(f"    ✅ {ok}/{len(lugares)} (nuevos: {nuevos}, actualizados: {actualizados})\n")
    time.sleep(2)

print(f"{'='*50}")
print(f"✅ Total: {total}")
print(f"❌ Errores: {errores}")
print(f"{'='*50}")