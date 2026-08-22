# 🗄️ Data Model & Schema Specifications — PedalIA

**Versión:** 2.0  
**Fecha:** 22 de Agosto de 2026  
**Sistema:** PedalIA — Predictive & Operations Platform  
**Motor:** PostgreSQL (Supabase Cloud) & Web LocalStorage  

---

## 1. Esquema Relacional en PostgreSQL (Supabase)

### 1.1. Tabla: `estaciones`
Almacena la definición fija y metadatos geográficos de cada estación física en la ciudad.

```sql
CREATE TABLE estaciones (
    station_id INT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255),
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    total_capacity INT NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_estaciones_coords ON estaciones(latitude, longitude);
```

---

### 1.2. Tabla: `snapshots` (Series Temporales de Ocupación)
Registros periódicos de telemetría capturados en tiempo real para cada estación.

```sql
CREATE TABLE snapshots (
    id BIGSERIAL PRIMARY KEY,
    station_id INT REFERENCES estaciones(station_id),
    available_bikes INT NOT NULL,
    available_slots INT NOT NULL,
    total_capacity INT NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_station_time ON snapshots(station_id, recorded_at DESC);
```

---

### 1.3. Tabla: `predicciones` (Inferencia de Machine Learning)
Pronósticos generados por los modelos XGBoost para las siguientes 1 a 12 horas.

```sql
CREATE TABLE predicciones (
    id BIGSERIAL PRIMARY KEY,
    station_id INT REFERENCES estaciones(station_id),
    forecast_horizon_hours INT NOT NULL, -- 1 a 12
    predicted_available_bikes INT NOT NULL,
    predicted_available_slots INT NOT NULL,
    confidence_interval_low INT,
    confidence_interval_high INT,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    valid_for_time TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_predicciones_lookup ON predicciones(station_id, valid_for_time);
```

---

### 1.4. Tabla: `clima` (Telemetría Meteorológica & Marítima)
Condiciones meteorológicas capturadas periódicamente para alimentar el feature store del modelo ML.

```sql
CREATE TABLE clima (
    id BIGSERIAL PRIMARY KEY,
    temperature_celsius NUMERIC(4, 2) NOT NULL,
    precipitation_mm NUMERIC(5, 2) NOT NULL,
    wind_speed_kmh NUMERIC(5, 2) NOT NULL,
    wave_height_meters NUMERIC(4, 2),
    weather_condition VARCHAR(80),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clima_recorded ON clima(recorded_at DESC);
```

---

### 1.5. Tabla: `incidencias` (Reportes Ciudadanos)
Registro de averías reportadas por los usuarios desde la aplicación.

```sql
CREATE TABLE incidencias (
    id BIGSERIAL PRIMARY KEY,
    station_id INT REFERENCES estaciones(station_id),
    issue_type VARCHAR(50) NOT NULL, -- 'bike_damaged', 'slot_blocked', 'totem', 'cleanliness'
    description TEXT,
    photo_url VARCHAR(500),
    status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'in_review', 'resolved'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 2. Esquema de Datos en Cliente (`localStorage`)

### 2.1. Objeto: `historicalData` (Log de Viajes del Usuario)
Persiste las rutas realizadas por el usuario y los datos de contraste con las predicciones IA:

```json
{
  "trips": [
    {
      "id": "TRIP-COR-01",
      "date": "2026-08-22T10:45:00.000Z",
      "startTime": "2026-08-22T10:45:00.000Z",
      "endTime": "2026-08-22T10:57:30.000Z",
      "originStationId": 1,
      "originName": "01 - Obelisco",
      "destStationId": 4,
      "destName": "04 - Riazor (Estadio)",
      "distance": 2.7,
      "durationSeconds": 750,
      "avgSpeed": 13.0,
      "co2SavedKg": 0.38,
      "arrivalRealSlots": 6,
      "arrivalPredictedSlots": 6,
      "predictionDelta": 0,
      "predictionAccuracyPct": 100,
      "hour": 10,
      "dayOfWeek": 6
    }
  ],
  "monthly": {
    "2026-08": {
      "km": 24.8,
      "trips": 7,
      "co2": 3.5,
      "avgDistance": 3.54
    }
  }
}
```

### 2.2. Claves Auxiliares
- `fav_stations`: Array de identificadores numéricos de estaciones favoritas (ej. `[1, 3, 4]`).
- `theme`: Cadena con el tema activo (`"dark"` o `"light"`).

---

## 3. Matriz de Variables de Machine Learning (Feature Store)

| Variable | Tipo de Dato | Origen | Descripción |
| :--- | :--- | :--- | :--- |
| `station_id` | Categórica (One-Hot / Embed) | `estaciones` | Identificador único de la estación física. |
| `hour_sin`, `hour_cos` | Numérica continua $[-1, 1]$ | `snapshots.recorded_at` | Codificación trigonométrica del ciclo diario (0-23h). |
| `day_of_week` | Entero $[0, 6]$ | `snapshots.recorded_at` | Día de la semana (0=Domingo, 6=Sábado). |
| `is_weekend` | Booleano $\{0, 1\}$ | Calendario | Indicador de fin de semana o festivo local en A Coruña. |
| `lag_available_bikes_15m` | Entero $\ge 0$ | `snapshots` | Disponibilidad observada hace 15 minutos. |
| `lag_available_bikes_60m` | Entero $\ge 0$ | `snapshots` | Disponibilidad observada hace 60 minutos. |
| `temp_celsius` | Numérica continua | `clima` | Temperatura ambiente actual/prevista. |
| `rain_mm` | Numérica continua $\ge 0$ | `clima` | Precipitación acumulada/prevista. |
| `wind_speed_kmh` | Numérica continua $\ge 0$ | `clima` | Velocidad del viento en la bahía de A Coruña. |
| `target_bikes_in_H_hours` | Entero $\ge 0$ | **Target (Y)** | Número real de bicis disponibles en el horizonte $H \in [1, 12]$. |
