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
let currentFilter = 'all';

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
// FILTROS
// ==========================================
function setupFilters() {
    const buttons = document.querySelectorAll('.filter-btn');
    
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 1. Actualizar estilos visuales (clase active)
            buttons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // 2. Actualizar la variable lógica
            currentFilter = e.target.dataset.filter;
            
            // 3. Repintar el mapa con el nuevo filtro
            // Usamos la variable global stationsData que ya tiene los datos cargados
            if (stationsData.length > 0) {
                updateMap(stationsData);
            }
        });
    });
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
async function init() {
    initMap();
    setupFilters();
    await loadStations();
    setupSearch();
    
    // Auto-refresh cada 5 minutos
    setInterval(loadStations, 300000);

    document.getElementById('btn-geo').addEventListener('click', () => {
        map.locate({setView: true, maxZoom: 16});
    });

    map.on('locationfound', (e) => {
        L.circle(e.latlng, {radius: e.accuracy/2, color: '#667eea'}).addTo(map);
        showToast("📍 Ubicación encontrada");
    });
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
    try {
        // 1. Limpiar marcadores
        Object.values(markers).forEach(m => map.removeLayer(m));
        markers = {}; 

        // 2. Contador para depuración (Míralo en la consola F12)
        let visibleCount = 0;

        stations.forEach(station => {
            // --- FILTRADO ---
            
            // Filtro "Necesito Bici": Ocultar si hay 0 bicis
            if (currentFilter === 'bikes' && station.available_bikes === 0) return;
            
            // Filtro "Necesito Aparcar": Ocultar si hay 0 huecos
            // NOTA: Si casi todas tienen hueco, parecerá que no hace nada.
            // Si quieres ser más estricto, cambia 0 por 2 (que haya al menos 2 huecos)
            if (currentFilter === 'slots' && station.available_slots === 0) return;
            
            // ----------------
            
            visibleCount++;

            // 3. Colores
            let color = '#e74c3c'; // Rojo (Malo/Vacío)
            
            // Lógica de color según el filtro activo para ayudar visualmente
            if (currentFilter === 'slots') {
                // Si busco hueco, me interesa que esté VERDE si hay muchos huecos
                if (station.available_slots >= 5) color = '#2ecc71';
                else if (station.available_slots > 0) color = '#f39c12';
            } else {
                // Comportamiento normal (busco bicis)
                if (station.available_bikes >= 5) color = '#2ecc71';
                else if (station.available_bikes > 0) color = '#f39c12';
            }

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

        console.log(`Filtro "${currentFilter}" aplicado. Estaciones visibles: ${visibleCount}`);

    } catch (error) {
        console.error("Error al actualizar mapa:", error);
    }
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
        // 1. Calcular fecha de ayer para filtrar
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        // 2. Pedir datos a Supabase
        const { data, error } = await client
            .from('snapshots')
            .select('timestamp, available_bikes')
            .eq('station_id', stationId)
            .gte('timestamp', yesterday.toISOString())
            .order('timestamp', { ascending: true });

        if (error) throw error;

        // 3. Preparar etiquetas y valores
        const labels = data.map(d => formatTime(d.timestamp));
        const values = data.map(d => d.available_bikes);

        // 4. Limpiar gráfica anterior si existe
        if (historyChart) historyChart.destroy();

        // 5. Preparar el Contexto (Lienzo)
        const ctx = document.getElementById('historyChart').getContext('2d');

        // === AQUÍ EMPIEZA LA MAGIA DEL DEGRADADO ===
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        // Color de arriba: Azul (#667eea) al 50% de opacidad
        gradient.addColorStop(0, 'rgba(102, 126, 234, 0.5)');
        // Color de abajo: Azul al 0% de opacidad (transparente)
        gradient.addColorStop(1, 'rgba(102, 126, 234, 0.0)');
        // ===========================================

        // 6. Crear la Gráfica Nueva
        historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Bicis disponibles',
                    data: values,
                    borderColor: '#667eea', // Color de la línea sólida
                    
                    // Estilos del Área (Degradado)
                    backgroundColor: gradient, 
                    fill: true,                // Rellenar área bajo la línea
                    
                    // Estilos de los Puntos (Estética App Móvil)
                    pointBackgroundColor: '#ffffff', // Centro blanco
                    pointBorderColor: '#667eea',     // Borde azul
                    pointBorderWidth: 2,
                    pointRadius: 4,            // Tamaño normal
                    pointHoverRadius: 7,       // Tamaño al pasar el ratón
                    
                    borderWidth: 3,            // Grosor de la línea
                    tension: 0.4               // Suavizado de curvas (0 = rectas, 0.4 = curvas suaves)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }, // Ocultar leyenda (ya sabemos que son bicis)
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#333',
                        bodyColor: '#667eea',
                        borderColor: '#ddd',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { display: false } // Ocultar rejilla vertical (más limpio)
                    },
                    y: { 
                        beginAtZero: true,
                        max: currentStation.total_capacity,
                        grid: {
                            color: '#f0f0f0' // Rejilla horizontal muy suave
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    } catch (error) {
        console.error('Error cargando histórico:', error);
    }
}

async function loadTrendChart(stationId) {
    try {
        // 1. Obtenemos la hora actual en formato ISO
        const now = new Date().toISOString();

        // 2. Consultamos la tabla 'predicciones' (FUTURO)
        const { data, error } = await client
            .from('predicciones')
            .select('prediction_date, predicted_bikes')
            .eq('station_id', stationId)
            .gte('prediction_date', now) // Solo datos futuros
            .order('prediction_date', { ascending: true })
            .limit(24); // Próximas 24 horas

        if (error) throw error;

        // Si no hay predicciones (por si acaso), salimos
        if (!data || data.length === 0) {
            console.log("No hay predicciones para esta estación");
            if (trendChart) trendChart.destroy();
            return;
        }

        // 3. Formatear datos para la gráfica
        const labels = data.map(d => {
            const date = new Date(d.prediction_date);
            // Formato de hora simple: "18:00"
            return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        });
        
        const values = data.map(d => d.predicted_bikes);

        // 4. Pintar Gráfica
        if (trendChart) trendChart.destroy();

        const ctx = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(ctx, {
            type: 'bar', // Barras para diferenciarlo del histórico
            data: {
                labels,
                datasets: [{
                    label: 'Predicción IA (Futuro)',
                    data: values,
                    // Usamos un color Morado/Violeta para indicar "IA/Futuro"
                    backgroundColor: values.map(v => 
                        v >= 5 ? '#9b59b6' :      // Morado fuerte (Alta)
                        v > 0 ? '#af7ac5' :       // Morado claro (Media)
                        '#e8daef'                 // Casi blanco (Baja)
                    ),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `🤖 Predicción: ${context.raw} bicis`
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        // Usamos la capacidad real de la estación para el tope
                        max: currentStation.total_capacity 
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error cargando predicciones:', error);
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