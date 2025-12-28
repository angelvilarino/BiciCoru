import os
import requests
from supabase import create_client
import time

# export SUPABASE_URL="https://nkfvkszhrxwbippbntri.supabase.co"
# export SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow"

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

BBOX = "43.33,-8.45,43.39,-8.36"

CATEGORIAS = [
    {"tag": "shop=supermarket", "cat": "supermercado", "max": 10},
    {"tag": "shop=mall", "cat": "centro_comercial", "max": 5},
    {"tag": "leisure=fitness_centre", "cat": "gimnasio", "max": 5},
    {"tag": "amenity=cafe", "cat": "cafeteria", "max": 10},
    {"tag": "amenity=library", "cat": "biblioteca", "max": 3},
    {"tag": "amenity=post_office", "cat": "oficina_publica", "max": 3},
]

SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
]

def obtener_lugares(tag_query):
    query = f"""
    [out:json][timeout:25];
    (
      node[{tag_query}]({BBOX});
      way[{tag_query}]({BBOX});
      relation[{tag_query}]({BBOX});
    );
    out center tags;
    """
    
    for server in SERVERS:
        for intento in range(2):
            try:
                r = requests.post(server, data={"data": query}, 
                                headers={"User-Agent": "FlowState/1.0"}, timeout=30)
                r.raise_for_status()
                data = r.json()
                
                lugares = []
                for el in data.get("elements", []):
                    tags = el.get("tags", {})
                    nombre = tags.get("name")
                    if not nombre: 
                        continue
                    
                    lat = el.get("lat") or el.get("center", {}).get("lat")
                    lon = el.get("lon") or el.get("center", {}).get("lon")
                    if not lat or not lon: 
                        continue

                    score = 0
                    n_lower = nombre.lower()
                    
                    tier1 = ["mercadona", "carrefour", "alcampo", "lidl", "eroski", "corte inglés", "marineda"]
                    if any(m in n_lower for m in tier1): 
                        score += 200
                    
                    tier2 = ["basic fit", "altafit", "mcfit", "starbucks", "mcdonald", "burger king", "dia"]
                    if any(m in n_lower for m in tier2): 
                        score += 100

                    if tags.get("brand"): 
                        score += 50
                    if tags.get("building:levels"):
                        try:
                            score += int(tags["building:levels"]) * 15
                        except:
                            pass
                    if tags.get("opening_hours"): 
                        score += 30
                    
                    calle = tags.get('addr:street', '')
                    numero = tags.get('addr:housenumber', '')
                    direccion = f"{calle} {numero}, A Coruña".strip(", A Coruña").strip()
                    if not direccion:
                        direccion = "A Coruña"

                    lugares.append({
                        "nombre": nombre,
                        "direccion": direccion,
                        "osm_id": el["id"],
                        "osm_type": el["type"],
                        "latitud": float(lat),
                        "longitud": float(lon),
                        "score": score,
                        "metadata": tags  # Todos los tags de OSM
                    })
                
                lugares.sort(key=lambda x: x["score"], reverse=True)
                
                vistos = set()
                unicos = []
                for l in lugares:
                    nombre_norm = l["nombre"].lower().strip()
                    if nombre_norm not in vistos:
                        vistos.add(nombre_norm)
                        unicos.append(l)
                
                return unicos
                
            except requests.exceptions.Timeout:
                print(f"  ⏱️  Timeout en {server.split('/')[2]}, reintentando...")
                time.sleep(3)
            except Exception as e:
                print(f"  ⚠️  Error en {server.split('/')[2]}: {str(e)[:50]}")
                time.sleep(2)
    
    print(f"  ❌ Todos los servidores fallaron")
    return []

def estimar_capacidad(cat_base, score):
    caps = {"supermercado": 120, "centro_comercial": 1500, "gimnasio": 80, 
            "cafeteria": 40, "biblioteca": 100, "oficina_publica": 30}
    base = caps.get(cat_base, 50)
    
    if score > 150: 
        return int(base * 2)
    if score > 50: 
        return int(base * 1.2)
    return base

print("\n🚀 Poblando base de datos...")

total = 0
for categoria in CATEGORIAS:
    print(f"\n📂 {categoria['cat'].upper()}")
    lugares = obtener_lugares(categoria["tag"])
    
    ok = 0
    for l in lugares[:categoria["max"]]:
        cap = estimar_capacidad(categoria["cat"], l["score"])
        
        try:
            supabase.table("sitios").upsert({
                "nombre": l["nombre"],
                "categoria": categoria["cat"],
                "direccion": l["direccion"],
                "osm_id": l["osm_id"],
                "osm_type": l["osm_type"],
                "latitud": l["latitud"],
                "longitud": l["longitud"],
                "capacidad_estimada": cap,
                "activo": True,
                "metadata": l["metadata"]  # Dict directo, no JSON string
            }, on_conflict="osm_id,osm_type").execute()
            
            print(f"  ✅ {l['nombre'][:45]} (score: {l['score']})")
            ok += 1
            total += 1
        except Exception as e:
            print(f"  ❌ {l['nombre'][:30]}: {str(e)[:40]}")
    
    print(f"  → {ok}/{len(lugares)} insertados")
    time.sleep(3)

print(f"\n✨ {total} lugares guardados")