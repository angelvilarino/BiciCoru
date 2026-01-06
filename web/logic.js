// --- CONFIGURACIÓN ---
const SUPABASE_URL = "https://nkfvkszhrxwbippbntri.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow"; // La pública

// --- CORRECCIÓN DEL ERROR ---
// No usamos 'const supabase = ...' porque entra en conflicto con la librería.
// Usamos 'client' para referirnos a nuestra conexión.
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables para los gráficos
let historyChart = null;
let predictionChart = null;

// ==========================================
// 2. INICIALIZAR MAPA
// ==========================================
// Coordenadas del Obelisco, A Coruña
const map = L.map('map').setView([43.366, -8.410], 13);

// Capa del mapa (Estilo Voyager, muy limpio)
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO'
}).addTo(map);

// ==========================================
// 3. LÓGICA PRINCIPAL
// ==========================================
async function initApp() {
    console.log("🚀 Iniciando aplicación...");

    // Consultamos a Supabase usando nuestra variable 'client'
    const { data, error } = await client
        .from('estado_actual')
        .select('*');

    if (error) {
        console.error("❌ Error conectando a Supabase:", error);
        alert("Error de conexión. Abre la consola (F12) para ver detalles.");
        return;
    }

    if (!data || data.length === 0) {
        console.warn("⚠️ Conexión exitosa, pero la tabla 'estado_actual' está vacía.");
        return;
    }

    console.log(`✅ Cargadas ${data.length} estaciones correctamente.`);

    // Actualizar datos del clima (cogemos el de la primera estación)
    if (data[0].temperature) {
        const temp = Math.round(data[0].temperature);
        const desc = data[0].weather_description;
        document.getElementById('weather-info').innerHTML = `🌡️ ${temp}°C • ${desc}`;
    }

    // Pintar los marcadores en el mapa
    data.forEach(est => {
        // Lógica de colores (Semáforo)
        let color = '#e74c3c'; // Rojo (pocas bicis)
        if (est.available_bikes >= 5) color = '#2ecc71'; // Verde (muchas bicis)
        else if (est.available_bikes > 0) color = '#f39c12'; // Naranja (alguna bici)

        // Crear círculo
        const marker = L.circleMarker([est.latitude, est.longitude], {
            color: '#ffffff',   // Borde blanco
            weight: 2,
            fillColor: color,   // Color semáforo
            fillOpacity: 0.9,
            radius: 8
        }).addTo(map);

        // Popup simple (al pasar ratón)
        marker.bindPopup(`<b>${est.name}</b><br>🚲 ${est.available_bikes} disponibles`);

        // Evento Click: Cargar detalles en la barra lateral
        marker.on('click', () => loadStationData(est));
    });
}

// ==========================================
// 4. PINTAR DETALLES Y GRÁFICAS
// ==========================================
async function loadStationData(station) {
    // Mostrar el panel lateral
    document.getElementById('intro-msg').classList.add('hidden');
    document.getElementById('station-details').classList.remove('hidden');

    // Rellenar datos numéricos
    document.getElementById('st-name').innerText = station.name;
    document.getElementById('st-bikes').innerText = station.available_bikes;
    document.getElementById('st-slots').innerText = station.available_slots;

    // Cambiar color de la tarjeta grande
    const card = document.getElementById('card-bikes');
    // Reseteamos clases y añadimos las nuevas
    card.className = 'kpi-card'; 
    if (station.available_bikes > 2) card.classList.add('green');
    else if (station.available_bikes > 0) card.classList.add('orange');
    else card.classList.add('red');

    // 1. Cargar Gráfico Histórico
    renderHistoryChart(station.station_id);
    
    // 2. Cargar Gráfico Predicción (Simulado)
    renderPredictionMock(station.available_bikes);
}

async function renderHistoryChart(stationId) {
    const ctx = document.getElementById('historyChart').getContext('2d');
    
    // Calcular fecha de ayer para filtrar últimas 24h
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    // Consulta a la tabla 'snapshots' usando 'client'
    const { data } = await client
        .from('snapshots')
        .select('timestamp, available_bikes')
        .eq('station_id', stationId)
        .gt('timestamp', yesterday.toISOString())
        .order('timestamp', { ascending: true });

    // Preparar datos para ChartJS
    const labels = data ? data.map(d => new Date(d.timestamp).getHours() + 'h') : [];
    const values = data ? data.map(d => d.available_bikes) : [];

    // Si ya existe un gráfico, destrúyelo para pintar el nuevo
    if (historyChart) historyChart.destroy();

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Disponibilidad Real',
                data: values,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 2
            }]
        },
        options: { 
            plugins: { legend: { display: false } }, 
            scales: { y: { beginAtZero: true } },
            maintainAspectRatio: false
        }
    });
}

function renderPredictionMock(currentVal) {
    const ctx = document.getElementById('predictionChart').getContext('2d');
    
    // Datos simulados (+1h, +2h...)
    const labels = ['+1h', '+2h', '+3h', '+4h', '+5h'];
    const data = [];
    let val = currentVal;
    
    // Generar pequeña variación aleatoria
    for(let i=0; i<5; i++) {
        val = Math.max(0, val + Math.floor(Math.random() * 3) - 1);
        data.push(val);
    }

    if (predictionChart) predictionChart.destroy();

    predictionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Predicción IA',
                data: data,
                backgroundColor: data.map(v => v > 2 ? '#2ecc71' : '#e74c3c'),
                borderRadius: 4
            }]
        },
        options: { 
            plugins: { legend: { display: false } }, 
            scales: { y: { beginAtZero: true } },
            maintainAspectRatio: false
        }
    });
}

// Arrancar la app
initApp();