// ==========================================
// CONFIGURACIÓN
// ==========================================
const SUPABASE_URL = 'https://nkfvkszhrxwbippbntri.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow';

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let map;
let markers = {};
let stationsData = [];
let historyChart = null;
let trendChart = null;
let currentStation = null;

// ==========================================
// UTILIDADES
// ==========================================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    
    toast.className = `toast ${type}`;
    toastMsg.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function getWeatherIcon(condition) {
    const icons = {
        'Clear': '☀️',
        'Clouds': '☁️',
        'Rain': '🌧️',
        'Drizzle': '🌦️',
        'Thunderstorm': '⛈️',
        'Snow': '❄️',
        'Mist': '🌫️',
        'Fog': '🌫️'
    };
    return icons[condition] || '🌤️';
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { 
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
async function init() {
    initMap();
    await loadStations();
    setupSearch();
    
    // Auto-refresh cada 5 minutos
    setInterval(loadStations, 300000);
}

function initMap() {
    map = L.map('map').setView([43.366, -8.410], 13);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CARTO',
        maxZoom: 19
    }).addTo(map);
}

// ==========================================
// CARGAR ESTACIONES
// ==========================================
async function loadStations() {
    try {
        const { data, error } = await client
            .from('estado_actual')
            .select('*');

        if (error) throw error;

        if (!data || data.length === 0) {
            showToast('No hay datos disponibles', 'error');
            return;
        }

        stationsData = data;
        updateMap(data);
        updateWeather(data[0]);
        updateTime(data[0].timestamp);
        
    } catch (error) {
        console.error('Error cargando estaciones:', error);
        showToast('Error al cargar datos', 'error');
    }
}

function updateMap(stations) {
    // Limpiar markers antiguos
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    stations.forEach(station => {
        const availability = station.available_bikes / station.total_capacity;
        let color;
        
        if (station.available_bikes >= 5) color = '#2ecc71';
        else if (station.available_bikes > 0) color = '#f39c12';
        else color = '#e74c3c';

        const marker = L.circleMarker([station.latitude, station.longitude], {
            color: '#ffffff',
            weight: 2,
            fillColor: color,
            fillOpacity: 0.9,
            radius: 10
        }).addTo(map);

        marker.bindPopup(`
            <strong>${station.name}</strong><br>
            🚲 ${station.available_bikes} bicis<br>
            🅿️ ${station.available_slots} huecos
        `);

        marker.on('click', () => loadStationDetails(station));
        markers[station.station_id] = marker;
    });
}

function updateWeather(station) {
    if (station.temperature) {
        document.getElementById('temperature').textContent = 
            `${Math.round(station.temperature)}°C`;
        document.getElementById('weather-desc').textContent = 
            station.weather_description || 'Sin datos';
        
        const icon = getWeatherIcon(station.weather_condition || 'Clear');
        document.getElementById('weather-icon').textContent = icon;
    }
}

function updateTime(timestamp) {
    if (timestamp) {
        document.getElementById('update-time').textContent = 
            `Última actualización: ${formatDate(timestamp)}`;
    }
}

// ==========================================
// DETALLES DE ESTACIÓN
// ==========================================
async function loadStationDetails(station) {
    currentStation = station;
    
    // Mostrar panel
    document.getElementById('intro-msg').classList.add('hidden');
    document.getElementById('station-details').classList.remove('hidden');

    // Actualizar información
    document.getElementById('station-name').textContent = station.name;
    document.getElementById('station-capacity').textContent = 
        `Capacidad: ${station.total_capacity}`;
    
    const status = station.available_bikes > 0 ? 'Operativa' : 'Sin bicis';
    document.getElementById('station-status').textContent = `Estado: ${status}`;
    
    document.getElementById('st-bikes').textContent = station.available_bikes;
    document.getElementById('st-slots').textContent = station.available_slots;

    // Actualizar color del card
    const card = document.getElementById('card-bikes');
    card.className = 'kpi-card';
    
    if (station.available_bikes >= 5) card.classList.add('green');
    else if (station.available_bikes > 0) card.classList.add('orange');
    else card.classList.add('red');

    // Cargar gráficas
    await loadHistoryChart(station.station_id);
    await loadTrendChart(station.station_id);

    // Centrar mapa en la estación
    map.setView([station.latitude, station.longitude], 16);
}

async function loadHistoryChart(stationId) {
    try {
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        const { data, error } = await client
            .from('snapshots')
            .select('timestamp, available_bikes')
            .eq('station_id', stationId)
            .gte('timestamp', yesterday.toISOString())
            .order('timestamp', { ascending: true });

        if (error) throw error;

        const labels = data.map(d => formatTime(d.timestamp));
        const values = data.map(d => d.available_bikes);

        if (historyChart) historyChart.destroy();

        const ctx = document.getElementById('historyChart').getContext('2d');
        historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Bicis disponibles',
                    data: values,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        max: currentStation.total_capacity
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error cargando histórico:', error);
    }
}

async function loadTrendChart(stationId) {
    try {
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const { data, error } = await client
            .from('snapshots')
            .select('timestamp, available_bikes')
            .eq('station_id', stationId)
            .gte('timestamp', twoDaysAgo.toISOString())
            .order('timestamp', { ascending: true });

        if (error) throw error;

        // Agrupar por hora
        const hourlyData = {};
        data.forEach(item => {
            const hour = new Date(item.timestamp).getHours();
            if (!hourlyData[hour]) hourlyData[hour] = [];
            hourlyData[hour].push(item.available_bikes);
        });

        const labels = Object.keys(hourlyData).sort((a, b) => a - b)
            .map(h => `${h}:00`);
        const values = Object.keys(hourlyData).sort((a, b) => a - b)
            .map(h => {
                const bikes = hourlyData[h];
                return Math.round(bikes.reduce((a, b) => a + b, 0) / bikes.length);
            });

        if (trendChart) trendChart.destroy();

        const ctx = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Promedio por hora',
                    data: values,
                    backgroundColor: values.map(v => 
                        v >= 5 ? '#2ecc71' : 
                        v > 0 ? '#f39c12' : '#e74c3c'
                    ),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        max: currentStation.total_capacity
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error cargando tendencia:', error);
    }
}

// ==========================================
// BÚSQUEDA
// ==========================================
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        
        if (query.length < 2) return;

        const results = stationsData.filter(s => 
            s.name.toLowerCase().includes(query)
        );

        if (results.length > 0) {
            loadStationDetails(results[0]);
        }
    });
}

// ==========================================
// ARRANCAR
// ==========================================
window.addEventListener('load', init);