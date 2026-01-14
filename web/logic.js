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
let userLocation = null;
let routingControl = null;
let userGeoMarker = null;
let currentDestCoords = null; 

async function init() {
    console.log("🚀 Iniciando BiciAI...");
    initMap();
    setupFilters();
    setupTheme();
    setupSearch();
    await loadData();
    setInterval(loadData, 300000); 

    const btnGeo = document.getElementById('btn-geo');
    if (btnGeo) btnGeo.addEventListener('click', () => map.locate({setView: true, maxZoom: 16}));

    // CERRAR RUTA
    document.getElementById('btn-stop-route').addEventListener('click', () => {
        if (routingControl) map.removeControl(routingControl);
        document.getElementById('route-panel').classList.add('hidden');
        currentDestCoords = null;
        routingControl = null;
    });

    // GEOLOCALIZACIÓN
    map.on('locationfound', (e) => {
        userLocation = e.latlng;
        if (userGeoMarker) map.removeLayer(userGeoMarker);
        userGeoMarker = L.layerGroup([
            L.circle(e.latlng, { radius: e.accuracy/2, color: '#667eea', fillOpacity: 0.15 }),
            L.circleMarker(e.latlng, { radius: 6, color: '#fff', fillColor: '#2980b9', fillOpacity: 1 })
        ]).addTo(map);

        // Actualizar ruta si me muevo
        if (routingControl && currentDestCoords) {
            const waypoints = routingControl.getWaypoints();
            if (waypoints && waypoints[0].latLng && e.latlng.distanceTo(waypoints[0].latLng) > 20) {
                routingControl.setWaypoints([e.latlng, currentDestCoords]);
            }
        }
    });
    map.locate({setView: false, watch: true, enableHighAccuracy: true}); 
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([43.366, -8.410], 13);
    
    // CAPA VOYAGER (Clara)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
        attribution: '© CARTO', 
        maxZoom: 19 
    }).addTo(map);

    map.on('click', () => {
        const card = document.getElementById('station-card');
        card.classList.add('hidden');
    });
}

async function loadData() {
    try {
        const [est, snaps, clim] = await Promise.all([
            client.from('estaciones').select('*'),
            client.from('snapshots').select('*').order('timestamp', { ascending: false }).limit(2000),
            client.from('clima').select('*').order('timestamp', { ascending: false }).limit(1)
        ]);

        if (clim.data && clim.data.length) {
            const temp = Math.round(clim.data[0].temperature);
            document.getElementById('weather-display').textContent = `${clim.data[0].rain_1h > 0 ? '🌧️' : '☀️'} ${temp}°C`;
        }

        const latest = {};
        if (snaps.data) snaps.data.forEach(s => { if (!latest[s.station_id]) latest[s.station_id] = s; });

        stationsData = est.data.map(s => {
            const st = latest[s.station_id] || latest[s.id];
            return {
                ...s,
                station_id: s.station_id || s.id,
                available_bikes: st ? st.available_bikes : (s.available_bikes || 0),
                available_slots: st ? (s.total_capacity - st.available_bikes) : 0
            };
        });

        updateMap();
    } catch (err) { console.error(err); }
}

function updateMap() {
    for (let id in markers) map.removeLayer(markers[id]);
    markers = {};

    stationsData.forEach(s => {
        if (currentFilter === 'bikes' && s.available_bikes === 0) return;
        if (currentFilter === 'slots' && s.available_slots === 0) return;

        const color = s.available_bikes === 0 ? '#e74c3c' : (s.available_bikes < 5 ? '#f39c12' : '#2ecc71');
        
        const m = L.circleMarker([s.latitude, s.longitude], {
            radius: 8, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9
        }).addTo(map);

        m.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            loadStationDetails(s);
        });
        
        markers[s.station_id] = m;
    });
}

function loadStationDetails(s) {
    const card = document.getElementById('station-card');
    card.classList.remove('hidden'); 
    currentStation = s;

    document.getElementById('station-name').textContent = s.name;
    document.getElementById('station-status').textContent = s.available_bikes > 0 ? '🟢 Operativa' : '🔴 Sin bicis';
    document.getElementById('station-capacity').textContent = `Cap: ${s.total_capacity}`;
    
    // KPIs coloreados
    const bikesEl = document.getElementById('st-bikes');
    const slotsEl = document.getElementById('st-slots');
    bikesEl.textContent = s.available_bikes;
    slotsEl.textContent = s.available_slots;
    updateColorClass(bikesEl, s.available_bikes);
    updateColorClass(slotsEl, s.available_slots);

    // Botones
    const btnR = document.getElementById('btn-draw-route');
    const newR = btnR.cloneNode(true);
    btnR.parentNode.replaceChild(newR, btnR);
    newR.addEventListener('click', () => drawRoute(s));

    const btnIA = document.getElementById('btn-plan-trip');
    const newIA = btnIA.cloneNode(true);
    btnIA.parentNode.replaceChild(newIA, btnIA);
    newIA.addEventListener('click', () => calcIA(s));
    document.getElementById('trip-result').classList.add('hidden');

    map.flyTo([s.latitude, s.longitude], 16, { duration: 0.5, paddingBottomRight: [0, 200] });
    setTimeout(() => loadRealCharts(s.station_id), 100);
}

function updateColorClass(element, value) {
    element.classList.remove('text-success', 'text-warning', 'text-danger');
    if (value >= 5) element.classList.add('text-success');
    else if (value > 0) element.classList.add('text-warning');
    else element.classList.add('text-danger');
}

function drawRoute(dest) {
    if (!userLocation) { map.locate(); showToast("📍 Buscando ubicación..."); return; }
    
    if (routingControl) map.removeControl(routingControl);
    currentDestCoords = L.latLng(dest.latitude, dest.longitude);
    
    routingControl = L.Routing.control({
        waypoints: [userLocation, currentDestCoords],
        router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'foot' }),
        lineOptions: { styles: [{ color: '#667eea', opacity: 0.8, weight: 6 }] },
        createMarker: () => null, addWaypoints: false, fitSelectedRoutes: true, show: false
    }).addTo(map);
    
    // MOSTRAR PANEL
    const panel = document.getElementById('route-panel');
    panel.classList.remove('hidden');
    document.getElementById('route-time').textContent = "Calc...";
    document.getElementById('route-dist').textContent = "";

    routingControl.on('routesfound', e => {
        const s = e.routes[0].summary;
        document.getElementById('route-time').textContent = `${Math.round(s.totalTime/60)} min`;
        document.getElementById('route-dist').textContent = `(${ (s.totalDistance/1000).toFixed(1) } km)`;
    });
}

async function calcIA(dest) {
    const res = document.getElementById('trip-result');
    const load = document.getElementById('trip-loader');
    const cont = document.getElementById('trip-content');
    res.classList.remove('hidden'); load.classList.remove('hidden'); cont.innerHTML = '';

    if (!userLocation) { map.locate(); cont.innerHTML = "⚠️ Falta ubicación"; return; }
    
    try {
        const dist = userLocation.distanceTo(L.latLng(dest.latitude, dest.longitude)) / 1000;
        const mins = Math.round((dist/12)*60);
        const arrival = new Date(); arrival.setMinutes(arrival.getMinutes() + mins);
        
        const { data } = await client.from('predicciones').select('predicted_bikes')
            .eq('station_id', dest.station_id).gte('prediction_date', arrival.toISOString()).limit(1);
        
        let slots = dest.available_slots;
        if (data && data.length) slots = dest.total_capacity - data[0].predicted_bikes;
        
        load.classList.add('hidden');
        const color = slots > 2 ? 'green' : (slots > 0 ? 'orange' : 'red');
        const txt = slots > 2 ? 'Probable' : 'Riesgo';
        cont.innerHTML = `<div class="status-pill status-${color}">${txt}</div> <div>Habrá <b>~${slots} huecos</b> a las ${arrival.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>`;
    } catch(e) { cont.innerHTML = "Error IA"; }
}

async function loadRealCharts(stationId) {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const { data: historyData } = await client.from('snapshots')
        .select('timestamp, available_bikes')
        .eq('station_id', stationId)
        .gte('timestamp', yesterday.toISOString())
        .order('timestamp', { ascending: true });

    const { data: predData } = await client.from('predicciones')
        .select('prediction_date, predicted_bikes')
        .eq('station_id', stationId)
        .gte('prediction_date', new Date().toISOString())
        .order('prediction_date', { ascending: true })
        .limit(24);

    updateCharts(historyData || [], predData || []);
}

// === CONFIGURACIÓN DE GRÁFICAS MEJORADA ===
// === SUSTITUYE ESTA FUNCIÓN ENTERA EN logic.js ===

function updateCharts(history, predictions) {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#fff' : '#666';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    // 1. GRÁFICA HISTORIAL (LÍNEA)
    const ctxH = document.getElementById('historyChart').getContext('2d');
    if (historyChart) historyChart.destroy();
    
    // Procesar datos historial
    const hLabels = history.map(d => new Date(d.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
    const hData = history.map(d => d.available_bikes);

    historyChart = new Chart(ctxH, {
        type: 'line',
        data: { 
            labels: hLabels, 
            datasets: [{ 
                label: 'Ocupación', 
                data: hData, 
                borderColor: '#667eea', 
                backgroundColor: 'rgba(102,126,234,0.1)', 
                fill: true, 
                tension: 0.3,
                pointRadius: 4,         // Puntos más grandes para verlos bien
                pointHoverRadius: 6,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#667eea'
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            interaction: {
                mode: 'index',      // MEJORA CLAVE: Detecta el eje X entero, no solo el punto
                intersect: false,   // MEJORA CLAVE: No hace falta tocar el punto exacto
            },
            scales: { 
                x: { 
                    display: true, 
                    ticks: { color: textColor, maxTicksLimit: 6 },
                    grid: { display: false }
                }, 
                y: { 
                    ticks: { color: textColor, stepSize: 1 }, // Números enteros
                    grid: { color: gridColor },
                    beginAtZero: true,
                    suggestedMax: currentStation.total_capacity // Escala proporcional a la estación
                } 
            }, 
            plugins: { 
                legend: { display: false },
                tooltip: { 
                    animation: false, // Quita el lag del tooltip
                    backgroundColor: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
                    titleColor: isDark ? '#000' : '#fff',
                    bodyColor: isDark ? '#000' : '#fff'
                } 
            } 
        }
    });

    // 2. GRÁFICA PREDICCIÓN (BARRAS)
    const ctxT = document.getElementById('trendChart').getContext('2d');
    if (trendChart) trendChart.destroy();
    
    // Procesar datos predicción
    const pLabels = predictions.map(d => new Date(d.prediction_date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
    const pData = predictions.map(d => d.predicted_bikes);

    trendChart = new Chart(ctxT, {
        type: 'bar',
        data: { 
            labels: pLabels, 
            datasets: [{ 
                label: 'Predicción', 
                data: pData, 
                backgroundColor: '#667eea', 
                borderRadius: 4,
                hoverBackgroundColor: '#556cd6' 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            interaction: {
                mode: 'index',      // Hover estable en toda la columna
                intersect: false,
            },
            scales: { 
                x: { 
                    display: true, 
                    ticks: { 
                        color: textColor, 
                        autoSkip: false,   // OBLIGA A MOSTRAR TODAS LAS HORAS
                        maxRotation: 90,   // Rota las etiquetas si no caben
                        font: { size: 10 } // Letra un pelín más pequeña para que quepan
                    },
                    grid: { display: false }
                }, 
                y: { 
                    display: true, // AHORA SÍ SE VE EL EJE Y
                    ticks: { color: textColor, stepSize: 2 },
                    grid: { color: gridColor },
                    beginAtZero: true,
                    max: currentStation.total_capacity // TOPE REAL: La capacidad de la estación
                } 
            }, 
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `🔮 Previsión: ${ctx.raw} bicis` // Texto claro
                    }
                }
            } 
        }
    });
}

function setupFilters() {
    document.querySelectorAll('.filter-chip').forEach(b => b.addEventListener('click', e => {
        document.querySelectorAll('.filter-chip').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        updateMap();
    }));
}

function setupSearch() {
    document.getElementById('search-input').addEventListener('input', e => {
        const term = e.target.value.toLowerCase();
        const f = stationsData.find(s => s.name.toLowerCase().includes(term));
        if (f) { map.flyTo([f.latitude, f.longitude], 16); loadStationDetails(f); }
    });
}

function setupTheme() {
    document.getElementById('btn-dark-mode').addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        if (currentStation) loadRealCharts(currentStation.station_id);
    });
}

function showToast(m) {
    const t = document.getElementById('toast');
    document.getElementById('toast-message').textContent = m;
    t.style.display = 'block';
    setTimeout(() => t.style.display='none', 3000);
}

window.onload = init;