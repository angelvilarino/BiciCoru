# 🚲 BiciCoruña AI - Sistema Inteligente de Bicicletas Públicas

Plataforma inteligente y en tiempo real para la monitorización, análisis predictivo y optimización del servicio de bicicletas públicas **BiciCoruña** (A Coruña, España). Integra modelos de Machine Learning para predecir la disponibilidad futura de bicicletas y huecos, cálculo de rutas multimodales con perfil altimétrico y un completo panel de control de la red.

---

## 🌐 Cómo Acceder a la Web

### 🔗 Enlace Web Público
La aplicación está desplegada públicamente y es accesible desde cualquier dispositivo en:
👉 **[https://angelvilarino.github.io/BiciCoru/](https://angelvilarino.github.io/BiciCoru/)**

---

### 💻 Ejecución en Local
Si deseas ejecutar la aplicación en tu máquina:

#### Opción 1: Servidor local (Recomendado)
```bash
# 1. Abre la terminal en la carpeta del proyecto
cd /Users/mangelvilarino/Desktop/Proyectos/ProyectoBicis

# 2. Inicia un servidor local ligero con Python
python3 -m http.server 8000

# 3. Abre en tu navegador:
http://localhost:8000
```

#### Opción 2: Apertura directa
Puedes abrir directamente el archivo `index.html` haciendo doble clic sobre él en tu navegador web (Google Chrome, Safari, Firefox, Edge).

---

## 🚀 Funcionalidades de la Aplicación

### 🗺️ 1. Mapa Interactivo en Tiempo Real
- **Visualización en directo**: Todas las estaciones de BiciCoruña geolocalizadas con marcadores dinámicos codificados por color según su nivel de servicio:
  - 🟢 **Alta disponibilidad** (5 o más bicis)
  - 🟠 **Media disponibilidad** (1 a 4 bicis)
  - 🔴 **Sin bicis** (0 bicis disponibles)
- **Geolocalización del usuario**: Botón de centrado rápido para ubicar la posición GPS actual del usuario y encontrar las estaciones más cercanas.
- **Filtros rápidos**: Filtrado instantáneo por *Todas*, *★ Favoritas*, *Con Bicis* o *Con Huecos Libres*.
- **Buscador predictivo**: Búsqueda en tiempo real por nombre de estación o calle.

### 🚲 2. Ficha Detallada de Estación
Al pulsar sobre cualquier estación en el mapa o en la lista lateral:
- Indicador en vivo de **bicicletas disponibles**, **huecos libres** y **capacidad total**.
- Marcado rápido de estaciones **Favoritas** (persistidas en `localStorage`).
- **Sistema de Reporte de Incidencias**: Los usuarios pueden reportar averías (bici dañada, anclaje bloqueado, tótem/pantalla, limpieza) adjuntando comentarios y fotografías.

### 🔮 3. Inteligencia Artificial & Gráficas Interactivas
- **Pronóstico Predictivo IA**: Gráfica de barras que muestra la disponibilidad esperada de bicicletas para las próximas horas.
  - Al pasar el cursor (*hover*), muestra con precisión la `Hora: HH:MM` y el número exacto de `Bicis disponibles: N`.
- **Historial de Ocupación (24h)**: Gráfica de línea con la evolución real de la disponibilidad de bicicletas en las últimas 24 horas.

### 🚶🚴 4. Planificador de Rutas y Perfil Altimétrico
- Cálculo interactivo de rutas a pie y en bicicleta hacia cualquier estación seleccionada.
- Estimación del tiempo de trayecto y distancia en kilómetros.
- **Perfil Altimétrico Detallado**: Gráfica de elevación de la ruta generada con datos topográficos reales. Al hacer *hover*, indica la `Distancia: X.XX km` acumulada y la `Altitud: Y metros`.
- Marcador interactivo en el mapa sincronizado con el cursor en la gráfica altimétrica para visualizar desniveles y pendientes del recorrido.

### 📊 5. Dashboard de Red y Analítica Avanzada
Accesible desde el botón destacado **[ 📊 Dashboard ]** en la cabecera:
- **Resumen Global de la Red**:
  - Total de bicicletas en la calle vs. Capacidad total y porcentaje de ocupación global.
  - Total de huecos/anclajes disponibles en la ciudad.
  - Número de estaciones activas y promedio de bicis por estación.
  - Diagnóstico de **Salud del Sistema** (Óptima, Moderada o Desbalanceada).
- **Distribución de la Flota**: Barra segmentada con los porcentajes de estaciones en alta disponibilidad, media, vacías o llenas.
- **Rankings**: Top estaciones con más bicicletas vs. estaciones con menor disponibilidad.
- **Ocupación Detallada de Estaciones**: Listado completo e interactivo con buscador en vivo, filtros por estado y selector de ordenación (% de ocupación, mayor/menor número de bicis, orden alfabético), con botón *"Ver en mapa"* para localizar e interactuar con cada estación.
- **Alertas y Rebalanceo**: Detección de estaciones críticas (vacías que necesitan reposición y saturadas sin huecos para aparcar).
- **Log de Viajes Analítico y Evaluación de IA**: Registro detallado de rutas con estación de origen, destino, duración exacta, timestamp, métricas superiores de distancia (30d), total de viajes y ahorro de emisiones de CO₂ institucionales, junto con la comparativa en tiempo real de **Disponibilidad Real vs Predicción del Modelo de IA** ($\Delta$ de error y porcentaje de precisión).

### ⛅ 6. Clima y Estado del Mar en Vivo
- Tarjeta meteorológica integrada con temperatura actual, precipitación (lluvia en mm), velocidad del viento y altura del oleaje costero en A Coruña.

### 🌓 7. Modo Oscuro / Claro
- Selector de tema visual con persistencia automática en el navegador.

---

## 📡 Origen de los Datos, Ingesta y Modelos de IA

```
[ BiciCoruña GBFS API ] ────┐
                            ├─► [ GitHub Actions ] ──► [ Supabase DB ] ──► [ Modelos ML / API ] ──► [ Web Frontend ]
[ OpenWeather / Open-Meteo ]─┘    (Collector Cron)       (PostgreSQL)         (Predictor)
```

### 1. Fuentes de Datos
- **Red de Estaciones y Disponibilidad**: 
  - API oficial en tiempo real del servicio BiciCoruña basada en estándar GBFS / CityBikes (`http://api.citybik.es/v2/networks/bicicorunha`).
  - Proporciona identificador de estación, nombre, coordenadas GPS, capacidad, bicis disponibles y huecos libres.
- **Datos Meteorológicos**:
  - API de OpenWeatherMap y Open-Meteo (temperatura, precipitación, viento, nubosidad y datos marítimos).
- **Datos Topográficos / Elevación**:
  - Open-Meteo Elevation API para el trazado de perfiles altimétricos de rutas.

---

### 2. Recolección de Datos (Data Collector)
La recolección es automatizada mediante un flujo de **GitHub Actions** ([`collect_data.yml`](.github/workflows/collect_data.yml)) que ejecuta `data_engine/collector.py`:

- **Frecuencia de Ingesta**:
  - **Cada 10 minutos** durante el horario de mayor uso diurno (`07:00` a `01:00` hora local).
  - **Cada 60 minutos** durante la madrugada (`01:00` a `07:00` hora local).
- **Almacenamiento**:
  - Los datos se normalizan y almacenan como *snapshots* temporales en la base de datos PostgreSQL alojada en **Supabase** (tablas `estaciones`, `snapshots` y `clima`).

---

### 3. Entrenamiento del Modelo de Machine Learning
El pipeline de aprendizaje automático se ejecuta en `data_engine/train_model.py` mediante **GitHub Actions** ([`train_model.yml`](.github/workflows/train_model.yml)):

- **Frecuencia de Reentrenamiento**:
  - **Semanal** (todos los domingos a las 03:00 UTC) o bajo demanda mediante ejecución manual (`workflow_dispatch`).
- **A partir de qué datos se entrena**:
  - **Histórico de Snapshots**: Registros históricos de ocupación de las estaciones.
  - **Variables Temporales**: Hora del día (0-23), día de la semana (0-6), indicador de fin de semana / festivo.
  - **Retardos y Medias Móviles (*Lags*)**: Disponibilidad en la hora previa (t-1, t-2, t-24h) y tendencias recientes.
  - **Variables Meteorológicas**: Temperatura (°C), volumen de lluvia (mm), velocidad del viento y estado meteorológico.
- **Modelado**:
  - Modelos de regresión de ensamble (*Random Forest*, *Gradient Boosting* / *LightGBM*) ajustados por estación, serializados y almacenados en `data_engine/models_advanced.pkl`.

---

### 4. Generación de Predicciones
La inferencia de disponibilidad se ejecuta en `data_engine/predictor.py` mediante **GitHub Actions** ([`predict.yml`](.github/workflows/predict.yml)):

- **Frecuencia**: **Cada 6 horas** (`0 */6 * * *`).
- **Funcionamiento**: Genera predicciones horarias para las siguientes 12 horas para cada estación de la red y las guarda en la tabla `predicciones` de Supabase para su consulta inmediata desde la interfaz web.

---

## 🛠️ Tecnologías y Arquitectura

- **Frontend**: HTML5 Semántico, CSS3 moderno (Variables CSS, Flexbox, Grid, Glassmorphism), Vanilla JavaScript (ES6+ modular).
- **Mapas y Rutas**: [Leaflet.js](https://leafletjs.com/), [Leaflet Routing Machine](https://www.liedman.net/leaflet-routing-machine/).
- **Visualización de Datos**: [Chart.js 4.4](https://www.chartjs.org/).
- **Iconografía y Tipografía**: [Phosphor Icons](https://phosphoricons.com/), Fuente *Inter* (Google Fonts).
- **Base de Datos & Backend**: [Supabase](https://supabase.com/) (PostgreSQL & Realtime Client).
- **Motor de Datos / ML**: Python 3.11, `scikit-learn`, `pandas`, `numpy`, `requests`.
- **Automatización CI/CD**: GitHub Actions Workflows.

---

## 📚 Documentación Técnica y de Producto

Para consultar las especificaciones detalladas de ingeniería, arquitectura y producto:
- 📋 [**Product Requirements Document (PRD.md)**](PRD.md): Objetivos, casos de uso, requisitos funcionales y métricas de éxito.
- 🏛️ [**Technical Architecture (Architecture.md)**](Architecture.md): Diagrama del sistema, flujo de datos, pipelines ML e infraestructura.
- 🗄️ [**Data Model & Schema (Data_model.md)**](Data_model.md): Esquemas de tablas en Supabase PostgreSQL, localStorage y Feature Store de Machine Learning.

---

## 📄 Licencia y Créditos
Proyecto desarrollado para la optimización y uso ciudadano de la movilidad sostenible en A Coruña.
Datos públicos proporcionados por el servicio BiciCoruña y APIs meteorológicas abiertas.
