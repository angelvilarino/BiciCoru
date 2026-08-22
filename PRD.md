# 🚲 Product Requirements Document (PRD) — PedalIA

**Producto:** PedalIA — Sistema Inteligente de Bicicletas Públicas de A Coruña  
**Versión:** 2.0  
**Fecha:** 22 de Agosto de 2026  
**Estado:** Aprobado / En Producción  
**Autor:** Lead Product Designer & Data Architect  
**URL de Producción:** [https://angelvilarino.github.io/BiciCoru/](https://angelvilarino.github.io/BiciCoru/)

---

## 1. Visión y Propósito del Producto

**PedalIA** es una plataforma de inteligencia operativa, movilidad urbana sostenible y predicción de disponibilidad en tiempo real para el sistema público de bicicletas de la ciudad de A Coruña (**BiciCoruña**).

La plataforma evoluciona los tradicionales mapas estáticos de bicicletas convirtiéndose en una herramienta operativa integral capaz de:
1. Predecir la disponibilidad de bicicletas y anclajes con **hasta 12 horas de antelación** mediante Machine Learning (XGBoost).
2. Ofrecer un **Dashboard Operativo** de alta densidad para monitorización de flota, rebalanceo y detección de puntos críticos.
3. Proporcionar un **Log Analítico de Viajes** minimalista con evaluación en tiempo real de la precisión del modelo predictivo y métricas de sostenibilidad.
4. Facilitar la planificación de rutas interactivas con cálculo de desniveles y perfiles altimétricos.

---

## 2. Usuarios Objetivo & Casos de Uso (Personas)

| Perfil de Usuario | Necesidad Principal | Caso de Uso Clave |
| :--- | :--- | :--- |
| **Usuario Diario / Commuter** | Saber si encontrará bicicleta o anclaje libre a la hora exacta de su desplazamiento. | Consulta la predicción horaria IA de su estación habitual antes de salir de casa o del trabajo. |
| **Turista / Usuario Ocasional** | Descubrir rutas accesibles y amigables por la ciudad costera. | Utiliza el modo turístico, explorador de rutas y consulta del estado marítimo/meteorológico. |
| **Gestor / Operador de Flota** | Detectar estaciones vacías o saturadas que requieran rebalanceo logístico. | Emplea la pestaña "Ocupación Estaciones" y "Rebalanceo & Alertas" del Dashboard de Red. |

---

## 3. Especificaciones de Producto & Requisitos Funcionales

### 3.1. Mapa Interactivo & Disponibilidad en Tiempo Real
- **Marcadores Dinámicos**: Codificación por color según disponibilidad (🟢 Alta $\ge 5$, 🟠 Media $1-4$, 🔴 Vacía $0$).
- **Filtros Inmediatos**: Todas, Favoritas (almacenadas localmente), Con Bicis, Con Huecos.
- **Buscador Predictivo**: Búsqueda instantánea por nombre de estación o identificador.
- **Geolocalización**: Ubicación del usuario con cálculo de distancia a las estaciones más cercanas.

### 3.2. Módulo de Pronóstico Predictivo con Inteligencia Artificial (ML)
- **Ventana de Predicción**: 12 horas consecutivas por estación.
- **Gráfica Interactiva**: Tooltips con hora y número previsto de bicicletas disponibles.
- **Histórico (24h)**: Comparativa con la curva de ocupación real de las últimas 24 horas.

### 3.3. Planificador de Rutas & Perfil Altimétrico
- Cálculo de rutas multimodales (a pie y en bicicleta) conectando el origen con la estación elegida.
- Gráfica interactiva de altimetría con sincronización de posición GPS sobre el mapa.

### 3.4. Dashboard de Operaciones & Red
- **KPIs Globales**: Flota activa, anclajes libres, ocupación porcentual de la red e Índice de Salud del Sistema.
- **Ocupación Estaciones (Alta Densidad)**:
  - Diseño condensado con eliminación de redundancias léxicas.
  - Cabeceras estandarizadas con iconografía (`ph-bicycle`, `ph-lock-key-open`, `ph-stack`).
  - Resaltado perimetral inequívoco de estados críticos (0% vacías con alerta roja, 100% saturadas con alerta azul).
- **Rebalanceo & Alertas**: Clasificación inmediata de estaciones que requieren redistribución logística.

### 3.5. Log de Viajes Personal ("Mi Actividad")
- **Cabecera Fija de KPIs**:
  - Distancia Total en los últimos 30 días (`X.X km`).
  - Total de Viajes con promedio de km por trayecto (`X viajes • X.X km/viaje`).
- **Data Table Minimalista (4 Columnas)**:
  1. *Fecha & Hora*: Formato contextual (`Hoy, 10:57`, `Ayer, 18:30`, `22 Ago, 09:14`).
  2. *Ruta*: Origen y Destino limpios unidos por flecha discreta (`➔`).
  3. *Duración / Distancia*: Píldora consolidada (`13 min • 2.7 km`).
  4. *Precisión Predicción IA*: Indicador visual con porcentaje de acierto (`● 100%`, `● 95%`, `● 92%`).
- **Filtrado Rápido**: Búsqueda por texto y chips de precisión (`Todos`, `Exacta`, `Desv. Mínima`).

### 3.6. Clima y Estado Marítimo
- Datos meteorológicos en vivo (temperatura, lluvia en mm, viento en km/h y altura del oleaje costero).

### 3.7. Modo Offline & PWA (Progressive Web App)
- Soporte para instalación nativa en la pantalla de inicio móvil (iOS y Android).
- Service Worker con caché de activos estáticos y soporte offline.

---

## 4. Requisitos No Funcionales (NFR)

- **Rendimiento**: Carga inicial First Contentful Paint (FCP) $< 1.2\text{ s}$; tiempo de respuesta ante filtros y búsquedas $< 50\text{ ms}$.
- **Diseño & UI**: Interfaz de grado empresarial sin plantillas genéricas, tipografía Inter/system-ui, soporte nativo de Modo Oscuro / Claro.
- **Accesibilidad**: Etiquetas `aria-label`, contraste WCAG AA en estados críticos, soporte táctil fluido (`-webkit-overflow-scrolling: touch`).
- **Escalabilidad**: Ingesta serverless con Supabase PostgreSQL y ejecución de ML desacoplada vía GitHub Actions Crons.

---

## 5. Métricas de Éxito & KPIs

1. **Mean Absolute Error (MAE) del Modelo ML**: $\le 1.2$ bicicletas de desviación a 6 horas vista.
2. **Tasa de Conversión a PWA**: Usuarios recurrentes que instalan la app en su dispositivo móvil.
3. **Engagement en Rutas & Dashboard**: Número de consultas diarias de pronóstico y rutas planificadas.
