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
let currentRouteMode = 'walk'; // NUEVO: Para recordar el modo activo

async function init() {
    console.log("🚀 Iniciando BiciAI v3.2 (Fix Routing)...");
    initMap();
    setupFilters();
    setupTheme();
    setupSearch();
    await loadData();
    setInterval(loadData, 300000); 

    const btnGeo = document.getElementById('btn-geo');
    if (btnGeo) btnGeo.addEventListener('click', () => map.locate({setView: true, maxZoom: 16}));

    // Cerrar Ruta
    document.getElementById('btn-stop-route').addEventListener('click', () => clearUI(false));
    
    // Cerrar Tarjeta (Botón X)
    document.getElementById('btn-close-card').addEventListener('click', () => clearUI(true));

    // Botón Favorito
    document.getElementById('btn-fav').addEventListener('click', toggleFavorite);

    // Geolocalización
    map.on('locationfound', (e) => {
        userLocation = e.latlng;
        if (userGeoMarker) map.removeLayer(userGeoMarker);
        userGeoMarker = L.layerGroup([
            L.circle(e.latlng, { radius: e.accuracy/2, color: '#667eea', fillOpacity: 0.15 }),
            L.circleMarker(e.latlng, { radius: 6, color: '#fff', fillColor: '#2980b9', fillOpacity: 1 })
        ]).addTo(map);

        // Actualizar lista
        updateStationsList(); 

        // Recalcular ruta si nos movemos
        if (routingControl && currentDestCoords) {
            const waypoints = routingControl.getWaypoints();
            if (waypoints && waypoints[0].latLng && e.latlng.distanceTo(waypoints[0].latLng) > 20) {
                // Usamos la variable global para saber qué modo recalcular
                drawRoute(currentStation, currentRouteMode);
            }
        }
    });
    map.locate({setView: false, watch: true, enableHighAccuracy: true}); 
    // AÑADE ESTAS DOS LÍNEAS AL FINAL DE INIT:
    initMobileGestures(); // Activar deslizamiento
    setTimeout(forceLocate, 1000); // Pedir GPS 1seg después de cargar
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([43.366, -8.410], 13);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
        attribution: '© CARTO', maxZoom: 19 
    }).addTo(map);

    map.on('click', () => clearUI(true));
}

function clearUI(closeCard = true) {
    if (routingControl) { 
        try { map.removeControl(routingControl); } catch(e){}
        routingControl = null; 
    }
    document.getElementById('route-panel').classList.add('hidden');
    currentDestCoords = null;
    
    if (closeCard) {
        document.getElementById('station-card').classList.add('hidden');
        document.getElementById('station-list-container').classList.remove('hidden'); 
        currentStation = null;
    }
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
        updateStationsList(); 
    } catch (err) { console.error(err); }
}

function updateStationsList() {
    const listContainer = document.getElementById('stations-list');
    const headerText = document.getElementById('list-header-text');
    listContainer.innerHTML = ''; 

    let filtered = stationsData;
    const favs = getFavorites();

    if (currentFilter === 'bikes') filtered = filtered.filter(s => s.available_bikes > 0);
    if (currentFilter === 'slots') filtered = filtered.filter(s => s.available_slots > 0);
    if (currentFilter === 'fav') {
        filtered = filtered.filter(s => favs.includes(String(s.station_id)));
        headerText.textContent = `⭐ Tus Favoritas (${filtered.length})`;
    } else {
        headerText.textContent = `📍 Más cercanas (${filtered.length})`;
    }

    if (userLocation) {
        filtered.sort((a, b) => {
            const distA = userLocation.distanceTo([a.latitude, a.longitude]);
            const distB = userLocation.distanceTo([b.latitude, b.longitude]);
            return distA - distB;
        });
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = '<div style="padding:15px; color:#666;">No se encontraron estaciones.</div>';
        return;
    }

    filtered.slice(0, 50).forEach(s => {
        const item = document.createElement('div');
        const colorClass = s.available_bikes === 0 ? 'red' : (s.available_bikes < 5 ? 'orange' : 'green');
        item.className = `list-item ${colorClass}`;
        
        let distText = '';
        if (userLocation) {
            const d = userLocation.distanceTo([s.latitude, s.longitude]);
            distText = d < 1000 ? `${Math.round(d)}m` : `${(d/1000).toFixed(1)}km`;
        }

        item.innerHTML = `
            <div class="list-info">
                <h4>${s.name} ${favs.includes(String(s.station_id)) ? '★' : ''}</h4>
                <div class="list-meta">
                    <span class="list-badge">🚲 ${s.available_bikes}</span>
                    <span class="list-badge">🅿️ ${s.available_slots}</span>
                    ${distText ? `<span class="list-badge">🚶 ${distText}</span>` : ''}
                </div>
            </div>
            <div style="font-size:1.2rem; color:#ccc;">›</div>
        `;
        
        item.addEventListener('click', () => {
            loadStationDetails(s);
            map.flyTo([s.latitude, s.longitude], 16);
        });
        
        listContainer.appendChild(item);
    });
}

function updateMap() {
    for (let id in markers) map.removeLayer(markers[id]);
    markers = {};
    const favs = getFavorites();

    stationsData.forEach(s => {
        if (currentFilter === 'bikes' && s.available_bikes === 0) return;
        if (currentFilter === 'slots' && s.available_slots === 0) return;
        if (currentFilter === 'fav' && !favs.includes(String(s.station_id))) return;

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
    document.getElementById('station-list-container').classList.add('hidden');
    document.getElementById('station-card').classList.remove('hidden');
    
    currentStation = s;

    document.getElementById('station-name').textContent = s.name;
    document.getElementById('station-status').textContent = s.available_bikes > 0 ? '🟢 Operativa' : '🔴 Sin bicis';
    document.getElementById('station-capacity').textContent = `Cap: ${s.total_capacity}`;
    
    updateFavoriteBtn(s.station_id);

    const bikesEl = document.getElementById('st-bikes');
    const slotsEl = document.getElementById('st-slots');
    bikesEl.textContent = s.available_bikes;
    slotsEl.textContent = s.available_slots;
    updateColorClass(bikesEl, s.available_bikes);
    updateColorClass(slotsEl, s.available_slots);

    const btnWalk = document.getElementById('btn-route-walk');
    const newWalk = btnWalk.cloneNode(true);
    btnWalk.parentNode.replaceChild(newWalk, btnWalk);
    newWalk.addEventListener('click', () => drawRoute(s, 'walk'));

    const btnBike = document.getElementById('btn-route-bike');
    const newBike = btnBike.cloneNode(true);
    btnBike.parentNode.replaceChild(newBike, btnBike);
    newBike.addEventListener('click', () => drawRoute(s, 'bike'));

    const btnIA = document.getElementById('btn-plan-trip');
    const newIA = btnIA.cloneNode(true);
    btnIA.parentNode.replaceChild(newIA, btnIA);
    newIA.addEventListener('click', () => calcIA(s));
    document.getElementById('trip-result').classList.add('hidden');

    map.flyTo([s.latitude, s.longitude], 16, { duration: 0.5, paddingBottomRight: [0, 200] });
    setTimeout(() => loadRealCharts(s.station_id), 100);
}

function getFavorites() { return JSON.parse(localStorage.getItem('favStations') || '[]'); }
function toggleFavorite() {
    if (!currentStation) return;
    const id = String(currentStation.station_id);
    let favs = getFavorites();
    if (favs.includes(id)) favs = favs.filter(f => f !== id);
    else favs.push(id);
    localStorage.setItem('favStations', JSON.stringify(favs));
    updateFavoriteBtn(id);
    updateStationsList(); 
    if (currentFilter === 'fav') updateMap(); 
}
function updateFavoriteBtn(id) {
    const btn = document.getElementById('btn-fav');
    const favs = getFavorites();
    if (favs.includes(String(id))) {
        btn.textContent = '★'; btn.classList.add('active');
    } else {
        btn.textContent = '☆'; btn.classList.remove('active');
    }
}

function updateColorClass(element, value) {
    element.classList.remove('text-success', 'text-warning', 'text-danger');
    if (value >= 5) element.classList.add('text-success');
    else if (value > 0) element.classList.add('text-warning');
    else element.classList.add('text-danger');
}

// === CÁLCULO DE RUTA (SOLUCIÓN DEFINITIVA) ===
function drawRoute(dest, mode = 'walk') {
    if (!userLocation) { map.locate(); showToast("📍 Buscando ubicación..."); return; }
    
    // Guardar modo actual para recálculos
    currentRouteMode = mode;
    currentDestCoords = L.latLng(dest.latitude, dest.longitude);

    // Limpieza
    if (routingControl) {
        try { map.removeControl(routingControl); } catch(e){}
        routingControl = null;
    }
    
    // === CONFIGURACIÓN DE SERVIDORES ESPECIALIZADOS ===
    let serviceUrl, color, icon;
    
    if (mode === 'walk') {
        // Servidor dedicado a Peatones
        serviceUrl = 'https://routing.openstreetmap.de/routed-foot/route/v1';
        color = '#667eea'; // Azul
        icon = '🚶';
    } else {
        // Servidor dedicado a Bicis
        serviceUrl = 'https://routing.openstreetmap.de/routed-bike/route/v1';
        color = '#e67e22'; // Naranja
        icon = '🚴';
    }

    routingControl = L.Routing.control({
        waypoints: [userLocation, currentDestCoords],
        router: L.Routing.osrmv1({ 
            serviceUrl: serviceUrl,
            // TRUCO: Estos servidores dedicados esperan 'driving' en la URL aunque sean de bici/pie
            profile: 'driving' 
        }),
        lineOptions: { 
            styles: [{ color: color, opacity: 0.8, weight: 6 }],
            extendToWaypoints: false,
            missingRouteTolerance: 10
        },
        createMarker: () => null, 
        addWaypoints: false, 
        fitSelectedRoutes: true, 
        show: false
    }).addTo(map);
    
    const panel = document.getElementById('route-panel');
    panel.classList.remove('hidden');
    document.getElementById('route-icon').textContent = icon;
    document.getElementById('route-time').textContent = "Calc...";
    document.getElementById('route-dist').textContent = "";

    routingControl.on('routesfound', e => {
        const s = e.routes[0].summary;
        const mins = Math.round(s.totalTime / 60);
        const km = (s.totalDistance / 1000).toFixed(1);
        
        document.getElementById('route-time').textContent = `${mins} min`;
        document.getElementById('route-dist').textContent = `(${km} km)`;
    });
    
    routingControl.on('routingerror', function(e) {
        console.error("Routing error:", e);
        document.getElementById('route-time').textContent = "Error";
        showToast("Error de conexión con el servidor de rutas.");
    });
}

async function calcIA(dest) {
    const res = document.getElementById('trip-result');
    const load = document.getElementById('trip-loader');
    const cont = document.getElementById('trip-content');
    res.classList.remove('hidden'); load.classList.remove('hidden'); cont.innerHTML = '';

    if (!userLocation) { map.locate(); cont.innerHTML = "⚠️ Falta ubicación"; return; }
    
    try {
        const straightDistKm = userLocation.distanceTo(L.latLng(dest.latitude, dest.longitude)) / 1000;
        const realDistKm = straightDistKm * 1.4; 
        const speedKmH = 4.8; 
        const mins = Math.round((realDistKm / speedKmH) * 60);
        
        const arrival = new Date(); arrival.setMinutes(arrival.getMinutes() + mins);
        
        const { data } = await client.from('predicciones').select('predicted_bikes')
            .eq('station_id', dest.station_id).gte('prediction_date', arrival.toISOString()).limit(1);
        
        let slots = dest.available_slots;
        if (data && data.length) slots = dest.total_capacity - data[0].predicted_bikes;
        
        load.classList.add('hidden');
        const color = slots > 2 ? 'green' : (slots > 0 ? 'orange' : 'red');
        const txt = slots > 2 ? 'Probable' : 'Riesgo';
        cont.innerHTML = `
            <div class="status-pill status-${color}">${txt}</div> 
            <div style="font-size:0.9rem; margin-top:5px;">Llegada: <b>${arrival.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</b> (~${mins} min)</div>
            <div style="font-size:0.8rem; color:#888;">Habrá <b>~${Math.max(0, slots)} huecos</b></div>
        `;
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
    calculatePopularTime(historyData || []);
}

function calculatePopularTime(history) {
    const box = document.getElementById('popular-time-box');
    if (!history || history.length < 10) { box.classList.add('hidden'); return; }
    
    let minBikes = 999;
    let worstTime = null;
    
    history.forEach(h => {
        if (h.available_bikes < minBikes) {
            minBikes = h.available_bikes;
            worstTime = new Date(h.timestamp);
        }
    });

    if (worstTime) {
        box.classList.remove('hidden');
        box.innerHTML = `🕒 Suele llenarse a las <strong>${worstTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong>`;
    } else {
        box.classList.add('hidden');
    }
}

function updateCharts(history, predictions) {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#fff' : '#666';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    const ctxH = document.getElementById('historyChart').getContext('2d');
    if (historyChart) historyChart.destroy();
    
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
                pointRadius: 4,         
                pointHoverRadius: 6,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#667eea'
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            interaction: {
                mode: 'index',      
                intersect: false,   
            },
            scales: { 
                x: { 
                    display: true, 
                    ticks: { color: textColor, maxTicksLimit: 6 },
                    grid: { display: false }
                }, 
                y: { 
                    ticks: { color: textColor, stepSize: 1 }, 
                    grid: { color: gridColor },
                    beginAtZero: true,
                    suggestedMax: currentStation.total_capacity 
                } 
            }, 
            plugins: { 
                legend: { display: false },
                tooltip: { 
                    animation: false, 
                    backgroundColor: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
                    titleColor: isDark ? '#000' : '#fff',
                    bodyColor: isDark ? '#000' : '#fff'
                } 
            } 
        }
    });

    const ctxT = document.getElementById('trendChart').getContext('2d');
    if (trendChart) trendChart.destroy();
    
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
                mode: 'index',      
                intersect: false,
            },
            scales: { 
                x: { 
                    display: true, 
                    ticks: { 
                        color: textColor, 
                        autoSkip: false,   
                        maxRotation: 90,   
                        font: { size: 10 } 
                    },
                    grid: { display: false }
                }, 
                y: { 
                    display: true, 
                    ticks: { color: textColor, stepSize: 2 },
                    grid: { color: gridColor },
                    beginAtZero: true,
                    max: currentStation.total_capacity 
                } 
            }, 
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `🔮 Previsión: ${ctx.raw} bicis` 
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
        
        clearUI(true); 
        updateMap();
        updateStationsList(); 
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

// === 1. GESTOS MÓVILES (SWIPE) ===
function initMobileGestures() {
    const sidebar = document.getElementById('mobile-sidebar');
    if (!sidebar) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    const threshold = 100; // Mínimo movimiento para abrir/cerrar

    // Escuchar toques en la cabecera (header y controles)
    const header = document.querySelector('.top-controls');
    
    header.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
    }, {passive: true});

    header.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        // Si arrastramos hacia arriba mucho, abrimos
        if (diff < -50) sidebar.classList.add('open');
        // Si arrastramos hacia abajo mucho, cerramos
        if (diff > 50) sidebar.classList.remove('open');
    }, {passive: true});

    header.addEventListener('touchend', () => {
        isDragging = false;
    });

    // Cerrar sidebar si hacemos click en el mapa
    map.on('click', () => {
        sidebar.classList.remove('open');
        clearUI(true);
    });
}

// === 2. GEOLOCALIZACIÓN ROBUSTA ===
function forceLocate() {
    if (!navigator.geolocation) {
        showToast("❌ Tu móvil no tiene GPS");
        return;
    }

    showToast("📍 Obteniendo ubicación...");

    map.locate({
        setView: true, 
        maxZoom: 15,
        enableHighAccuracy: true,
        timeout: 10000 
    });

    // Manejo manual de errores por si Leaflet falla silenciosamente
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            console.log("GPS OK:", pos.coords);
            // El evento 'locationfound' de Leaflet se encargará del resto
        },
        (err) => {
            console.warn("Error GPS:", err);
            let msg = "⚠️ Error GPS desconocido";
            if(err.code === 1) msg = "⚠️ Activa la ubicación en tu navegador";
            if(err.code === 2) msg = "⚠️ Señal GPS débil";
            if(err.code === 3) msg = "⚠️ Tiempo de espera agotado";
            showToast(msg);
        },
        { enableHighAccuracy: true, timeout: 5000 }
    );
}

window.onload = init;