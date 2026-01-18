const SUPABASE_URL = 'https://nkfvkszhrxwbippbntri.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow';

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let map;
let markers = {};
let heatLayer = null;
let isHeatmapActive = false;
let stationsData = [];
let historyChart = null;
let trendChart = null;
let elevationChart = null;
let currentStation = null;
let currentFilter = 'all';
let userLocation = null;
let routingControl = null;
let userGeoMarker = null;
let currentDestCoords = null;

async function init() {
    console.log("🚀 Iniciando BiciAI v5.0...");
    initMap();
    setupFilters();
    setupTheme();
    setupSearch();
    await loadData();
    setInterval(loadData, 300000); 

    const btnGeo = document.getElementById('btn-geo');
    if (btnGeo) btnGeo.addEventListener('click', () => {
        map.locate({setView: true, maxZoom: 16});
        forceLocate(); 
    });

    document.getElementById('btn-heatmap').addEventListener('click', toggleHeatmap);
    document.getElementById('btn-stop-route').addEventListener('click', () => clearUI(false));
    document.getElementById('btn-close-card').addEventListener('click', () => clearUI(true));
    document.getElementById('btn-fav').addEventListener('click', toggleFavorite);

    map.on('locationfound', (e) => {
        userLocation = e.latlng;
        if (userGeoMarker) map.removeLayer(userGeoMarker);
        userGeoMarker = L.layerGroup([
            L.circle(e.latlng, { radius: e.accuracy/2, color: '#667eea', fillOpacity: 0.15 }),
            L.circleMarker(e.latlng, { radius: 6, color: '#fff', fillColor: '#2980b9', fillOpacity: 1 })
        ]).addTo(map);
        updateStationsList(); 
    });

    if (window.innerWidth <= 768) {
        setupDraggableSheet('main-panel', 'main-drag-zone', 140);
        setupDraggableSheet('station-card', 'card-drag-zone', 250);
    }
    
    setTimeout(forceLocate, 1000);
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([43.366, -8.410], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
        attribution: '© CARTO', maxZoom: 19 
    }).addTo(map);
    map.on('click', () => clearUI(true));
}

// === MAPA DE CALOR & LEYENDA ===
function toggleHeatmap() {
    if (typeof L.heatLayer === 'undefined') {
        console.error("❌ Falta librería Heatmap");
        return;
    }

    isHeatmapActive = !isHeatmapActive;
    const btn = document.getElementById('btn-heatmap');
    const markerLeg = document.getElementById('marker-legend');
    const heatLeg = document.getElementById('heatmap-legend');

    if (isHeatmapActive) {
        btn.classList.add('active');
        markerLeg.classList.add('hidden'); // Ocultar leyenda normal
        heatLeg.classList.remove('hidden'); // Mostrar leyenda calor
        showToast("🔥 Mapa de calor activado");
    } else {
        btn.classList.remove('active');
        markerLeg.classList.remove('hidden'); // Mostrar leyenda normal
        heatLeg.classList.add('hidden'); // Ocultar leyenda calor
        showToast("📍 Modo normal");
    }
    
    updateMap();
}

function updateMap() {
    for (let id in markers) map.removeLayer(markers[id]);
    markers = {};
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }

    if (isHeatmapActive) {
        if (typeof L.heatLayer === 'undefined') return;

        const heatPoints = stationsData.map(s => {
            const intensity = Math.min(s.available_bikes / 10, 1.0);
            return [s.latitude, s.longitude, intensity];
        });

        heatLayer = L.heatLayer(heatPoints, {
            radius: 30, blur: 20, maxZoom: 16,
            gradient: {0.3: 'blue', 0.6: 'lime', 1: 'red'}
        }).addTo(map);
        return;
    }

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

// === RUTA Y ELEVACIÓN MEJORADA ===
function drawRoute(dest, mode = 'walk') {
    if (!userLocation) { map.locate(); showToast("📍 Buscando ubicación..."); return; }
    
    currentDestCoords = L.latLng(dest.latitude, dest.longitude);

    if (routingControl) { try { map.removeControl(routingControl); } catch(e){} routingControl = null; }
    
    document.getElementById('elevation-box').classList.add('hidden');
    
    let serviceUrl = mode === 'walk' 
        ? 'https://routing.openstreetmap.de/routed-foot/route/v1' 
        : 'https://routing.openstreetmap.de/routed-bike/route/v1';
    let color = mode === 'walk' ? '#667eea' : '#e67e22';
    let icon = mode === 'walk' ? '🚶' : '🚴';

    routingControl = L.Routing.control({
        waypoints: [userLocation, currentDestCoords],
        router: L.Routing.osrmv1({ serviceUrl: serviceUrl, profile: 'driving' }),
        lineOptions: { styles: [{ color: color, opacity: 0.8, weight: 6 }] },
        createMarker: () => null, addWaypoints: false, fitSelectedRoutes: true, show: false
    }).addTo(map);
    
    const panel = document.getElementById('route-panel');
    panel.classList.remove('hidden');
    document.getElementById('route-icon').textContent = icon;
    document.getElementById('route-time').textContent = "Calc...";
    document.getElementById('route-dist').textContent = "";

    routingControl.on('routesfound', e => {
        const r = e.routes[0];
        const mins = Math.round(r.summary.totalTime / 60);
        const km = (r.summary.totalDistance / 1000).toFixed(1);
        
        document.getElementById('route-time').textContent = `${mins} min`;
        document.getElementById('route-dist').textContent = `(${km} km)`;

        calculateElevationProfile(r.coordinates);
    });
}

async function calculateElevationProfile(coords) {
    const box = document.getElementById('elevation-box');
    
    // Muestreo optimizado
    const step = Math.max(1, Math.ceil(coords.length / 80));
    const sample = coords.filter((_, i) => i % step === 0);
    
    const lats = sample.map(c => c.lat.toFixed(4)).join(',');
    const lngs = sample.map(c => c.lng.toFixed(4)).join(',');
    
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API Status: ${response.status}`);
        const data = await response.json();
        
        if (!data || !data.elevation || data.elevation.length === 0) throw new Error("Datos vacíos");

        const elevations = data.elevation;
        box.classList.remove('hidden');
        drawElevationChart(elevations);
        
    } catch (e) {
        console.warn("⚠️ Elevación no disponible:", e);
        box.classList.add('hidden');
    }
}

function drawElevationChart(elevations) {
    const ctx = document.getElementById('elevationChart').getContext('2d');
    if (elevationChart) elevationChart.destroy();
    
    const labels = elevations.map(() => '');

    elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: elevations,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.2)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: true, mode: 'index', intersect: false } },
            scales: {
                x: { display: false },
                y: { 
                    display: true, 
                    // AQUÍ ESTÁ EL FORMATO "m" y el TÍTULO
                    title: { display: true, text: 'Altitud', color: '#666', font: {size: 9} },
                    ticks: { color: '#888', font: {size: 9}, callback: (val) => val + 'm' }, 
                    grid: {display: false} 
                }
            },
            animation: { duration: 800 }
        }
    });
}

// === LÓGICA GENERAL ===
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

    if (window.searchTerm) filtered = filtered.filter(s => s.name.toLowerCase().includes(window.searchTerm));

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

async function calcIA(dest) {
    const res = document.getElementById('trip-result');
    const load = document.getElementById('trip-loader');
    const cont = document.getElementById('trip-content');
    res.classList.remove('hidden'); load.classList.remove('hidden'); cont.innerHTML = '';

    if (!userLocation) { map.locate(); load.classList.add('hidden'); cont.innerHTML = `<div style="color:var(--text-sub)">Falta ubicación</div>`; return; }
    
    try {
        const straightDistKm = userLocation.distanceTo(L.latLng(dest.latitude, dest.longitude)) / 1000;
        const realDistKm = straightDistKm * 1.4;
        const speedKmH = 4.8; 
        const mins = Math.round((realDistKm / speedKmH) * 60);
        
        const arrival = new Date(); 
        arrival.setMinutes(arrival.getMinutes() + mins);
        
        const { data, error } = await client.from('predicciones').select('predicted_bikes')
            .eq('station_id', dest.station_id).gte('prediction_date', arrival.toISOString()).limit(1);
        
        load.classList.add('hidden');
        if (error) throw error;
        
        let slots = dest.available_slots;
        if (data && data.length > 0) slots = dest.total_capacity - data[0].predicted_bikes;
        
        const color = slots > 2 ? 'green' : (slots > 0 ? 'orange' : 'red');
        const txt = slots > 2 ? 'Alta Probabilidad' : (slots > 0 ? 'Riesgo' : 'Muy difícil');
        const icon = slots > 2 ? 'check-circle' : (slots > 0 ? 'warning' : 'x-circle');

        cont.innerHTML = `
            <div class="status-pill status-${color}"><i class="ph ph-${icon}"></i> ${txt}</div> 
            <div style="font-size:0.9rem; margin-top:8px;">Llegada: <b>${arrival.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</b> (~${mins} min)</div>
            <div style="font-size:0.85rem; color:var(--text-sub); margin-top:4px;">Se esperan <b>~${Math.max(0, slots)} huecos</b></div>
        `;
    } catch(e) { 
        load.classList.add('hidden');
        cont.innerHTML = `<div style="color:#e74c3c;">Error predicción</div>`; 
    }
}

async function loadRealCharts(stationId) {
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    
    const { data: rawHistory } = await client.from('snapshots')
        .select('timestamp, available_bikes').eq('station_id', stationId).gte('timestamp', yesterday.toISOString()).order('timestamp', { ascending: true });

    const { data: predData } = await client.from('predicciones')
        .select('prediction_date, predicted_bikes').eq('station_id', stationId).gte('prediction_date', new Date().toISOString()).limit(24);

    updateCharts(rawHistory || [], predData || []);
    calculatePopularTime(rawHistory || []);
}

function loadStationDetails(s) {
    document.getElementById('station-list-container').classList.add('hidden'); 
    const card = document.getElementById('station-card');
    card.classList.remove('hidden');
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

    if (window.innerWidth <= 768) {
        const targetY = card.offsetHeight - 350;
        card.style.transform = `translateY(${targetY}px)`;
        const mainPanel = document.getElementById('main-panel');
        mainPanel.style.transform = `translateY(${mainPanel.offsetHeight - 140}px)`;
    }

    map.flyTo([s.latitude, s.longitude], 16, { duration: 0.5, paddingBottomRight: [0, 200] });
    setTimeout(() => loadRealCharts(s.station_id), 100);
}

function clearUI(closeCard = true) {
    if (routingControl) { try { map.removeControl(routingControl); } catch(e){} routingControl = null; }
    document.getElementById('route-panel').classList.add('hidden');
    document.getElementById('elevation-box').classList.add('hidden');
    currentDestCoords = null;
    
    if (closeCard) {
        document.getElementById('station-card').classList.add('hidden');
        document.getElementById('station-list-container').classList.remove('hidden'); 
        currentStation = null;
    }
}

function calculatePopularTime(history) {
    const box = document.getElementById('popular-time-box');
    if (!history || history.length < 5) { box.classList.add('hidden'); return; }
    let minBikes = 999; let worstTime = null;
    history.forEach(h => { if (h.available_bikes < minBikes) { minBikes = h.available_bikes; worstTime = new Date(h.timestamp); } });

    if (worstTime) {
        box.classList.remove('hidden');
        box.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><i class="ph ph-clock" style="font-size:1.2rem;"></i><span>Hora crítica: <strong>${worstTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong></span></div>`;
    } else { box.classList.add('hidden'); }
}

function updateCharts(history, predictions) {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#fff' : '#333';
    
    const ctxH = document.getElementById('historyChart').getContext('2d');
    if (historyChart) historyChart.destroy();
    const hLabels = history.map(d => new Date(d.timestamp));
    const hData = history.map(d => d.available_bikes);
    
    historyChart = new Chart(ctxH, {
        type: 'line',
        data: { labels: hLabels, datasets: [{ label: 'Bicis', data: hData, borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.1)', fill: true, tension: 0.3, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { ticks: { color: textColor } } } }
    });

    const ctxT = document.getElementById('trendChart').getContext('2d');
    if (trendChart) trendChart.destroy();
    const pLabels = predictions.map(d => new Date(d.prediction_date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
    const pData = predictions.map(d => d.predicted_bikes);

    trendChart = new Chart(ctxT, {
        type: 'bar',
        data: { labels: pLabels, datasets: [{ label: 'Predicción', data: pData, backgroundColor: '#667eea', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { ticks: { color: textColor } } } }
    });
}

function setupFilters() {
    document.querySelectorAll('.filter-chip').forEach(b => b.addEventListener('click', e => {
        document.querySelectorAll('.filter-chip').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        clearUI(true); updateMap(); updateStationsList(); 
    }));
}

function setupSearch() {
    document.getElementById('search-input').addEventListener('input', e => {
        window.searchTerm = e.target.value.toLowerCase();
        updateStationsList();
        const f = stationsData.find(s => s.name.toLowerCase().includes(window.searchTerm));
        if (f && window.searchTerm.length > 3) { map.flyTo([f.latitude, f.longitude], 16); }
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

function setupDraggableSheet(sheetId, dragZoneId, initialVisibleHeight) {
    const sheet = document.getElementById(sheetId);
    const handle = document.getElementById(dragZoneId);
    const extraHandle = sheet.querySelector('.top-controls') || sheet.querySelector('.station-header-row');
    
    if (!sheet || !handle) return;
    const getSnapPoints = () => ({ top: 0, middle: window.innerHeight * 0.4, bottom: sheet.offsetHeight - initialVisibleHeight });

    let startY = 0; let currentTranslate = getSnapPoints().bottom; let isDragging = false; let startTime = 0;

    const addListeners = (element) => {
        if(!element) return;
        element.addEventListener('touchstart', (e) => {
            if (['INPUT', 'BUTTON', 'I'].includes(e.target.tagName)) return;
            isDragging = true; startY = e.touches[0].clientY;
            const style = window.getComputedStyle(sheet);
            const matrix = new WebKitCSSMatrix(style.transform);
            currentTranslate = matrix.m42; 
            sheet.classList.add('is-dragging'); startTime = new Date().getTime();
        }, {passive: false});
    };
    addListeners(handle); addListeners(extraHandle);

    window.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const deltaY = e.touches[0].clientY - startY;
        let newY = currentTranslate + deltaY;
        if (newY < 0) newY = newY * 0.3;
        sheet.style.transform = `translateY(${newY}px)`;
    }, {passive: true});

    window.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false; sheet.classList.remove('is-dragging');
        const endY = e.changedTouches[0].clientY;
        const totalDelta = endY - startY;
        const time = new Date().getTime() - startTime;
        const style = window.getComputedStyle(sheet);
        const matrix = new WebKitCSSMatrix(style.transform);
        const finalTranslate = matrix.m42;
        const snaps = getSnapPoints();
        const velocity = Math.abs(totalDelta) / time;
        let target = finalTranslate;

        if (velocity > 0.5 && time < 300) { target = totalDelta > 0 ? snaps.bottom : snaps.top; } 
        else {
            const distTop = Math.abs(finalTranslate - snaps.top);
            const distMid = Math.abs(finalTranslate - snaps.middle);
            const distBot = Math.abs(finalTranslate - snaps.bottom);
            const min = Math.min(distTop, distMid, distBot);
            if (min === distTop) target = snaps.top;
            else if (min === distMid) target = snaps.middle;
            else target = snaps.bottom;
        }
        sheet.style.transform = `translateY(${target}px)`;
        currentTranslate = target;
    });
}

function forceLocate() { if (navigator.geolocation) map.locate({setView: false, enableHighAccuracy: true}); }

window.onload = init;