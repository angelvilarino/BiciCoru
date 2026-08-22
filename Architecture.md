# 🏛️ Technical Architecture Document — PedalIA

**Versión:** 2.0  
**Fecha:** 22 de Agosto de 2026  
**Sistema:** PedalIA — Predictive & Operations Platform (BiciCoruña)  
**URL de Producción:** [https://angelvilarino.github.io/BiciCoru/](https://angelvilarino.github.io/BiciCoru/)

---

## 1. Visión General de la Arquitectura

La plataforma sigue una arquitectura desacoplada, modular y serverless de alto rendimiento, optimizada para responder con latencias mínimas tanto en navegadores de escritorio como en dispositivos móviles (PWA):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FUENTES EXTERNAS DE DATOS                        │
│   • CityBikes API (GBFS BiciCoruña)                                         │
│   • OpenWeatherMap & Open-Meteo (Clima & Altimetría)                        │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
                        ▼ (Cron cada 10-15 min)
┌─────────────────────────────────────────────────────────────────────────────┐
│                   INGESTA & PIPELINE DE DATOS (GitHub Actions)              │
│   • collect_data.yml (Python): Ingesta de snapshots y clima                 │
│   • train.yml (Semanal): Reentrenamiento continuo de modelos XGBoost        │
│   • predict.yml (Horario): Inferencia de disponibilidad a 12h vista         │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
                        ▼ (PostgreSQL / REST)
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CAPA DE PERSISTENCIA (Supabase Cloud)                  │
│   • Tablas: estaciones, snapshots, predicciones, clima, feedback            │
│   • Vistas & Funciones RPC de agregación temporal                           │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
                        ▼ (Fetch / REST API)
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND CLIENT (Vanilla JS / HTML / CSS)               │
│                                                                             │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌───────────────┐  │
│  │   Mapa Interactivo     │  │  Dashboard de Red      │  │  Planificador │  │
│  │   (Leaflet.js)         │  │  (Ocupación & Alertas) │  │  & Altimetría │  │
│  └────────────────────────┘  └────────────────────────┘  └───────────────┘  │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌───────────────┐  │
│  │  Log de Viajes         │  │  Predicciones IA       │  │  PWA / Cache  │  │
│  │  ("Mi Actividad")      │  │  (Chart.js / SVG)      │  │  (Service W.) │  │
│  └────────────────────────┘  └────────────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Componentes Principales del Sistema

### 2.1. Frontend Client (Single Page Application)
- **Tecnología**: Vanilla JavaScript (ES6+), HTML5 Semántico y CSS Moderno (Vanilla CSS con Custom Properties).
- **Módulos Core**:
  - `logic.js`: Lógica de geolocalización, sincronización de estado, filtros, renderizado de popups y carga de datos.
  - `dashboard.js`: Motor del panel de control (`AdvancedDashboard`), métricas de flota, índice de salud de red, log de viajes minimalista y telemetría predictiva.
  - `ui-integrations.js`: Orquestador de eventos UI, modales, modo turístico, tarjeta meteorológica y control de incidencias.
  - `sw.js` & `manifest.json`: Capa PWA para instalación local, precacheo de recursos estáticos y soporte offline.
- **Librerías de Terceros (CDN)**:
  - `Leaflet.js` (1.9.4): Renderizado de mapas cartográficos interactivos.
  - `Phosphor Icons`: Iconografía vectorial ligera y estandarizada.
  - `Chart.js`: Renderizado de gráficas analíticas de ocupación e inferencia.

### 2.2. Pipeline de Machine Learning (Predictor)
- **Modelo**: Regresión basada en **XGBoost** entrenado sobre series temporales de ocupación histórica.
- **Features (Variables de Entrada)**:
  - Temporales: Hora del día (seno/coseno), día de la semana, día festivo/laborable.
  - Meteorológicas: Temperatura actual/prevista, precipitación (lluvia en mm), velocidad del viento.
  - De Red: Ocupación previa de la estación ($t-15\text{m}$, $t-30\text{m}$, $t-1\text{h}$) y tendencia de estaciones adyacentes.
- **Inferencia**: Generación periódica de pronósticos para cada estación en horizontes de $+1\text{h}$, $+2\text{h}$, ..., $+12\text{h}$.

### 2.3. Base de Datos & Backend (Supabase)
- PostgreSQL gestionado en la nube con API REST automática (`PostgREST`).
- Row Level Security (RLS) habilitado para lectura pública segura y escritura controlada desde los pipelines de GitHub Actions mediante Service Role Tokens.

---

## 3. Flujo de Datos & Ciclo de Vida

1. **Ingesta Periódica**:
   - Cada 10 minutos, un workflow de GitHub Actions (`collect_data.yml`) consulta la API de BiciCoruña y Open-Meteo, guardando un registro en la tabla `snapshots`.
2. **Inferencia Predictiva**:
   - Cada hora, el pipeline `predict.yml` ejecuta los modelos serializados y almacena las predicciones futuras en la tabla `predicciones`.
3. **Consumo en Cliente**:
   - El frontend descarga en paralelo:
     - El snapshot más reciente para actualizar marcadores de estaciones en tiempo real.
     - Las curvas de predicción de la estación seleccionada.
     - El pronóstico meteorológico y estado del mar.
4. **Persistencia Local**:
   - Las estaciones favoritas, tema (Modo Oscuro/Claro) y el historial de trayectos del usuario se gestionan en `localStorage` con migración automática de esquemas.

---

## 4. Estrategia de Despliegue y Hosting

- **Hosting Web**: GitHub Pages sobre la rama principal `main` con despliegue automático ante cada *commit*.
- **CI/CD**: GitHub Actions para ingesta programada, validación de código y reentrenamiento ML.
- **Certificados & CDN**: HTTPS y compresión Brotli/Gzip gestionados automáticamente por GitHub Pages Edge CDN.
