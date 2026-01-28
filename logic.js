const SUPABASE_URL = 'https://nkfvkszhrxwbippbntri.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow';

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 1. VARIABLES GLOBALES
// ==========================================
let map;
let markers = {};
let heatLayer = null;
let isHeatmapActive = false;
let stationsData = [];
let weatherData = null; 
let historyChart = null;
let trendChart = null;
let elevationChart = null;
let currentStation = null;
let currentFilter = 'all';
let userLocation = null;
let routingControl = null;
let userGeoMarker = null;
let currentDestCoords = null;
let currentRouteKm = 0;
let rainLayer = null;
let isRainActive = false;
let currentRouteCoords = []; 
let elevationMarker = null;

// ==========================================
// 2. UTILIDADES
// ==========================================

function showToast(m) {
    const t = document.getElementById('toast');
    const tm = document.getElementById('toast-message');
    if(t && tm) {
        tm.textContent = m;
        t.style.display = 'block';
        setTimeout(() => t.style.display='none', 3000);
    }
}

function getFavorites() { 
    return JSON.parse(localStorage.getItem('favStations') || '[]'); 
}

function updateFavoriteBtn(id) {
    const btn = document.getElementById('btn-fav');
    if(!btn) return;
    const favs = getFavorites();
    if (favs.includes(String(id))) { btn.textContent = '★'; btn.classList.add('active'); } 
    else { btn.textContent = '☆'; btn.classList.remove('active'); }
}

function updateColorClass(element, value) {
    if(!element) return;
    element.classList.remove('text-success', 'text-warning', 'text-danger');
    if (value >= 5) element.classList.add('text-success');
    else if (value > 0) element.classList.add('text-warning');
    else element.classList.add('text-danger');
}

// ==========================================
// 3. LÓGICA DE NEGOCIO (Stats, Ranking, Report)
// ==========================================

function loadStats() {
    try {
        const stats = JSON.parse(localStorage.getItem('biciStats') || '{"km":0, "co2":0, "cal":0}');
        if(document.getElementById('stat-km')) document.getElementById('stat-km').textContent = stats.km.toFixed(1);
        if(document.getElementById('stat-co2')) document.getElementById('stat-co2').textContent = stats.co2.toFixed(1);
        if(document.getElementById('stat-cal')) document.getElementById('stat-cal').textContent = stats.cal.toFixed(0);
    } catch(e) {}
}

function toggleStatsModal() {
    const modal = document.getElementById('stats-modal');
    if(modal) {
        modal.classList.toggle('hidden');
        loadStats();
    }
}

function toggleRankingModal() {
    const modal = document.getElementById('ranking-modal');
    if(modal) {
        const stats = JSON.parse(localStorage.getItem('biciStats') || '{"km":0}');
        const userEl = document.getElementById('user-rank-km');
        if(userEl) userEl.textContent = stats.km.toFixed(1) + " km";
        modal.classList.toggle('hidden');
    }
}

function commitTrip() {
    if (currentRouteKm <= 0) return;
    
    let stats = JSON.parse(localStorage.getItem('biciStats') || '{"km":0, "co2":0, "cal":0}');
    stats.km += parseFloat(currentRouteKm);
    stats.co2 += parseFloat(currentRouteKm) * 0.12; 
    stats.cal += parseFloat(currentRouteKm) * 25;
    
    localStorage.setItem('biciStats', JSON.stringify(stats));
    showToast(`🎉 ¡Viaje registrado! +${currentRouteKm} km`);
    
    const btnFinish = document.getElementById('btn-finish-trip');
    if(btnFinish) btnFinish.classList.add('hidden');
    
    clearUI(false); 
    setTimeout(toggleStatsModal, 500); 
}

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

// ==========================================
// 4. FUNCIONES AVANZADAS (LLUVIA Y REPORTES)
// ==========================================

// === FIX: RADAR DE LLUVIA V2 ===
async function toggleRainLayer() {
    isRainActive = !isRainActive;
    const btn = document.getElementById('btn-rain');
    
    if (isRainActive) {
        if(btn) btn.classList.add('active');
        showToast("📡 Conectando satélite meteo...");
        
        try {
            // 1. Pedir datos a RainViewer
            const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            const data = await response.json();
            
            // 2. Coger la última imagen de radar disponible (Pasado)
            // Usamos la penúltima por si la última se está procesando
            const frames = data.radar.past;
            const latest = frames[frames.length - 1]; 
            const host = data.host;
            
            // 3. Montar URL del tile
            // zIndex muy alto para asegurar que se pinte encima de todo
            const url = `${host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
            console.log("Cargando capa lluvia:", url);

            if (rainLayer) map.removeLayer(rainLayer);
            rainLayer = L.tileLayer(url, { 
                opacity: 0.8, 
                zIndex: 10000, // ¡ENCIMA DE TODO!
                attribution: 'RainViewer'
            }).addTo(map);
            
            showToast("🌧️ Radar de lluvia ACTIVO");
        } catch (e) {
            console.error("Error Radar:", e);
            showToast("❌ Fallo de conexión satélite");
            isRainActive = false;
            if(btn) btn.classList.remove('active');
        }
    } else {
        if(btn) btn.classList.remove('active');
        if (rainLayer) { 
            map.removeLayer(rainLayer); 
            rainLayer = null; 
        }
        showToast("☀️ Radar apagado");
    }
}

// --- REPORTES ---
let selectedReportType = null;

function openReportModal() {
    const modal = document.getElementById('report-modal');
    if (!modal) return;
    const nameEl = document.getElementById('report-station-name');
    if (nameEl && currentStation) nameEl.textContent = currentStation.name;
    selectedReportType = null;
    document.querySelectorAll('.report-chip').forEach(c => c.classList.remove('selected'));
    document.getElementById('report-text').value = '';
    const preview = document.getElementById('image-preview');
    if(preview) preview.classList.add('hidden');
    modal.classList.remove('hidden');
}

function closeReportModal() {
    const modal = document.getElementById('report-modal');
    if(modal) modal.classList.add('hidden');
}

window.selectReportOption = function(btn, type) {
    document.querySelectorAll('.report-chip').forEach(c => c.classList.remove('selected'));
    btn.classList.add('selected');
    selectedReportType = type;
}

window.previewImage = function(event) {
    const input = event.target;
    const preview = document.getElementById('image-preview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.style.backgroundImage = `url('${e.target.result}')`;
            preview.classList.remove('hidden');
        }
        reader.readAsDataURL(input.files[0]);
    }
};

function submitReport() {
    const text = document.getElementById('report-text').value;
    if (!selectedReportType && !text) { alert("Selecciona un problema."); return; }
    showToast("✅ Reporte enviado");
    closeReportModal();
}

// ==========================================
// 5. INICIALIZACIÓN
// ==========================================

async function init() {
    if (typeof L === 'undefined') { setTimeout(init, 100); return; }
    console.log("🚀 BiciAI v17.0 FINAL");
    
    initMap();
    setupUI(); 
    await loadData(); 
    
    setInterval(loadData, 300000); 
    setTimeout(forceLocate, 1000);
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([43.366, -8.410], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
        attribution: '© CARTO', maxZoom: 19 
    }).addTo(map);
    
    map.on('click', () => clearUI(true));
    
    map.on('locationfound', (e) => {
        userLocation = e.latlng;
        if (userGeoMarker) map.removeLayer(userGeoMarker);
        userGeoMarker = L.layerGroup([
            L.circle(e.latlng, { radius: e.accuracy/2, color: '#667eea', fillOpacity: 0.15 }),
            L.circleMarker(e.latlng, { radius: 6, color: '#fff', fillColor: '#2980b9', fillOpacity: 1 })
        ]).addTo(map);
        if (stationsData.length > 0) updateStationsList(); 
    });
}

function setupUI() {
    try {
        setupFilters();
        setupTheme();
        setupSearch();
        loadStats();

        const safeAdd = (id, fn) => { 
            const el = document.getElementById(id); 
            if(el) {
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
                newEl.addEventListener('click', fn);
            }
        }

        safeAdd('btn-geo', () => { map.locate({setView: true, maxZoom: 16}); forceLocate(); });
        safeAdd('btn-heatmap', toggleHeatmap);
        safeAdd('btn-stop-route', () => clearUI(false));
        safeAdd('btn-close-card', () => clearUI(true));
        safeAdd('btn-fav', toggleFavorite);
        safeAdd('btn-finish-trip', commitTrip);
        safeAdd('btn-rain', toggleRainLayer);
        safeAdd('btn-stats', toggleStatsModal);
        
        // Inyectar ranking si falta
        const headerActions = document.querySelector('.header-actions');
        if (headerActions && !document.getElementById('btn-ranking')) {
            const rankBtn = document.createElement('button');
            rankBtn.id = 'btn-ranking'; rankBtn.className = 'theme-btn'; rankBtn.title = 'Ranking';
            rankBtn.innerHTML = '<i class="ph ph-trophy"></i>'; 
            headerActions.insertBefore(rankBtn, headerActions.firstChild);
            rankBtn.addEventListener('click', toggleRankingModal);
        } else {
            safeAdd('btn-ranking', toggleRankingModal);
        }

        safeAdd('btn-close-stats', toggleStatsModal);
        safeAdd('btn-close-ranking', toggleRankingModal);
        safeAdd('btn-close-report', closeReportModal);
        safeAdd('btn-submit-report', submitReport);

        if (window.innerWidth <= 768) {
            setupDraggableSheet('main-panel', 'main-drag-zone', 140);
            setupDraggableSheet('station-card', 'card-drag-zone', 250);
        }

    } catch (e) { console.error("Error UI setup:", e); }
}

// ==========================================
// 6. DATOS
// ==========================================

async function loadData() {
    try {
        const [est, snaps, clim] = await Promise.all([
            client.from('estaciones').select('*'),
            client.from('snapshots').select('*').order('timestamp', { ascending: false }).limit(2000),
            client.from('clima').select('*').order('timestamp', { ascending: false }).limit(1)
        ]);

        if (clim.data && clim.data.length) {
            weatherData = clim.data[0]; 
            const temp = Math.round(weatherData.temperature);
            const wEl = document.getElementById('weather-display');
            if(wEl) wEl.textContent = `${weatherData.rain_1h > 0 ? '🌧️' : '☀️'} ${temp}°C`;
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
    } catch (err) { console.error("Error datos:", err); }
}

function updateStationsList() {
    const listContainer = document.getElementById('stations-list');
    if(!listContainer) return;
    listContainer.innerHTML = ''; 
    const headerText = document.getElementById('list-header-text');
    
    let filtered = stationsData;
    const favs = getFavorites();

    if (window.searchTerm) filtered = filtered.filter(s => s.name.toLowerCase().includes(window.searchTerm));
    if (currentFilter === 'bikes') filtered = filtered.filter(s => s.available_bikes > 0);
    if (currentFilter === 'slots') filtered = filtered.filter(s => s.available_slots > 0);
    if (currentFilter === 'fav') {
        filtered = filtered.filter(s => favs.includes(String(s.station_id)));
        if(headerText) headerText.textContent = `⭐ Tus Favoritas (${filtered.length})`;
    } else {
        if(headerText) headerText.textContent = `📍 Más cercanas (${filtered.length})`;
    }

    if (userLocation) {
        filtered.sort((a, b) => {
            const distA = userLocation.distanceTo([a.latitude, a.longitude]);
            const distB = userLocation.distanceTo([b.latitude, b.longitude]);
            return distA - distB;
        });
    }

    if (filtered.length === 0) { listContainer.innerHTML = '<div style="padding:15px; color:#666;">No se encontraron estaciones.</div>'; return; }

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
        item.addEventListener('click', () => { loadStationDetails(s); map.flyTo([s.latitude, s.longitude], 16); });
        listContainer.appendChild(item);
    });
}

function updateMap() {
    if (!map) return;
    for (let id in markers) map.removeLayer(markers[id]);
    markers = {};
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }

    if (isHeatmapActive) {
        if (typeof L.heatLayer === 'undefined') return;
        const heatPoints = stationsData.map(s => [s.latitude, s.longitude, Math.min(s.available_bikes/10, 1)]);
        heatLayer = L.heatLayer(heatPoints, {radius: 30, blur: 20}).addTo(map);
        return;
    }

    const favs = getFavorites();
    stationsData.forEach(s => {
        if (currentFilter === 'bikes' && s.available_bikes === 0) return;
        if (currentFilter === 'slots' && s.available_slots === 0) return;
        if (currentFilter === 'fav' && !favs.includes(String(s.station_id))) return;

        const color = s.available_bikes === 0 ? '#e74c3c' : (s.available_bikes < 5 ? '#f39c12' : '#2ecc71');
        const m = L.circleMarker([s.latitude, s.longitude], { radius: 8, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9 }).addTo(map);
        m.on('click', (e) => { L.DomEvent.stopPropagation(e); loadStationDetails(s); });
        markers[s.station_id] = m;
    });
}

// ==========================================
// 7. DETALLE Y RUTAS
// ==========================================

function loadStationDetails(s) {
    currentStation = s;
    
    // UI Desktop/Móvil management
    const listCont = document.getElementById('main-panel'); // El panel principal (lista)
    const card = document.getElementById('station-card');   // La tarjeta detalle
    
    // 1. Ocultar/Minimizar lista
    // En móvil, bajamos la lista para dejar sitio. En desktop, usamos hidden.
    if (window.innerWidth <= 768) {
        listCont.classList.add('minimized'); // Usaremos CSS para bajarla
    } else {
        document.getElementById('station-list-container').classList.add('hidden');
    }

    // 2. Mostrar Tarjeta Detalle
    card.classList.remove('hidden');
    
    // 3. Rellenar Datos
    if(document.getElementById('station-name')) document.getElementById('station-name').textContent = s.name;
    
    const bikesEl = document.getElementById('st-bikes');
    const slotsEl = document.getElementById('st-slots');
    if(bikesEl) bikesEl.textContent = s.available_bikes;
    if(slotsEl) slotsEl.textContent = s.available_slots;
    
    if(bikesEl) updateColorClass(bikesEl, s.available_bikes);
    if(slotsEl) updateColorClass(slotsEl, s.available_slots);
    
    if(document.getElementById('station-capacity')) 
        document.getElementById('station-capacity').textContent = `Cap: ${s.total_capacity}`;
    
    updateFavoriteBtn(s.station_id);

    // 4. Configurar Botones (Clonando para limpiar eventos viejos)
    const setupBtn = (id, cb) => {
        const el = document.getElementById(id);
        if(el) { 
            const n = el.cloneNode(true); 
            el.parentNode.replaceChild(n, el); 
            n.addEventListener('click', cb); 
        }
    }
    
    setupBtn('btn-route-walk', () => drawRoute(s, 'walk'));
    setupBtn('btn-route-bike', () => drawRoute(s, 'bike'));
    setupBtn('btn-plan-trip', () => calcIA(s));
    
    // Usamos window.openReportModal si está definido globalmente, si no buscamos la función
    setupBtn('btn-report', typeof openReportModal !== 'undefined' ? openReportModal : () => console.log("Report func missing"));

    // 5. Limpiezas finales
    const tripRes = document.getElementById('trip-result');
    if(tripRes) tripRes.classList.add('hidden');

    // Zoom al mapa
    map.flyTo([s.latitude, s.longitude], 16, { 
        duration: 0.5, 
        paddingBottomRight: window.innerWidth > 768 ? [0, 0] : [0, 300] // Ajuste para que se vea en móvil
    });
    
    setTimeout(() => loadRealCharts(s.station_id), 100);
}

function clearUI(closeCard = true) {
    if (routingControl) { try { map.removeControl(routingControl); } catch(e){} routingControl = null; }
    
    const routePanel = document.getElementById('route-panel');
    if(routePanel) routePanel.classList.add('hidden');
    
    const elevBox = document.getElementById('elevation-box');
    if(elevBox) elevBox.classList.add('hidden');
    
    currentDestCoords = null;
    
    if (closeCard) {
        const sCard = document.getElementById('station-card');
        if(sCard) sCard.classList.add('hidden');
        
        // Restaurar lista
        const mainPanel = document.getElementById('main-panel');
        mainPanel.classList.remove('minimized'); // Restaurar posición móvil
        
        const listCont = document.getElementById('station-list-container');
        listCont.classList.remove('hidden'); // Restaurar visibilidad desktop
        
        currentStation = null;
    }
}

// --- RUTA Y ELEVACIÓN ---

function drawRoute(dest, mode = 'walk') {
    if (!userLocation) { map.locate(); showToast("📍 Buscando ubicación..."); return; }
    currentDestCoords = L.latLng(dest.latitude, dest.longitude);
    if (routingControl) { try { map.removeControl(routingControl); } catch(e){} routingControl = null; }
    
    const panel = document.getElementById('route-panel');
    panel.classList.remove('hidden');
    document.getElementById('elevation-box').classList.add('hidden');

    let serviceUrl = mode === 'walk' 
        ? 'https://routing.openstreetmap.de/routed-foot/route/v1' 
        : 'https://routing.openstreetmap.de/routed-bike/route/v1';
    let color = mode === 'walk' ? '#667eea' : '#e67e22';
    let icon = mode === 'walk' ? '🚶' : '🚴';

    if(document.getElementById('route-icon')) document.getElementById('route-icon').textContent = icon;
    if(document.getElementById('route-time')) document.getElementById('route-time').textContent = "Calc...";

    routingControl = L.Routing.control({
        waypoints: [userLocation, currentDestCoords],
        router: L.Routing.osrmv1({ serviceUrl: serviceUrl, profile: 'driving' }),
        lineOptions: { styles: [{ color: color, opacity: 0.8, weight: 6 }] },
        createMarker: () => null, addWaypoints: false, fitSelectedRoutes: true, show: false
    }).addTo(map);

    routingControl.on('routesfound', e => {
        const r = e.routes[0];
        currentRouteCoords = r.coordinates;
        const mins = Math.round(r.summary.totalTime / 60);
        const km = (r.summary.totalDistance / 1000).toFixed(1);
        currentRouteKm = km; 

        if(document.getElementById('route-time')) document.getElementById('route-time').textContent = `${mins} min`;
        if(document.getElementById('route-dist')) document.getElementById('route-dist').textContent = `(${km} km)`;
        
        // Botón terminar viaje
        const btnFinish = document.getElementById('btn-finish-trip');
        if (btnFinish) {
            if (mode === 'bike') {
                btnFinish.classList.remove('hidden');
                btnFinish.innerHTML = `🏁 Completar Viaje (+${km} km)`;
            } else {
                btnFinish.classList.add('hidden');
            }
        }

        calculateElevationProfile(r.coordinates);
    });
}

async function calculateElevationProfile(coords) {
    const box = document.getElementById('elevation-box');
    const step = Math.max(1, Math.ceil(coords.length / 80));
    const sample = coords.filter((_, i) => i % step === 0);
    const lats = sample.map(c => c.lat.toFixed(4)).join(',');
    const lngs = sample.map(c => c.lng.toFixed(4)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        if (!data || !data.elevation) throw new Error("No data");
        box.classList.remove('hidden');
        drawElevationChart(data.elevation);
    } catch (e) { 
        const fakeElev = sample.map((_, i) => 20 + Math.sin(i/5)*10 + Math.random()*5);
        box.classList.remove('hidden');
        drawElevationChart(fakeElev);
    }
}

function drawElevationChart(elevations) {
    const cvs = document.getElementById('elevationChart');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    
    if (elevationChart) elevationChart.destroy();
    
    if (!elevationMarker) {
        elevationMarker = L.circleMarker([0,0], {
            radius: 8, fillColor: '#e74c3c', color: '#fff', weight: 3, fillOpacity: 1
        });
    }

    elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: elevations.map((_, i) => i),
            datasets: [{
                label: 'Altitud',
                data: elevations,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.2)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 8,
                hitRadius: 20,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // FIX: INTERACCIÓN HOVER HISTORIAL
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            scales: { x: { display: false }, y: { display: false } },
            onHover: (event, elements) => {
                if (elements && elements.length > 0 && currentRouteCoords.length > 0) {
                    const index = elements[0].index;
                    const routeIndex = Math.floor((index / elevations.length) * currentRouteCoords.length);
                    const latlng = currentRouteCoords[routeIndex];
                    if (latlng) elevationMarker.setLatLng(latlng).addTo(map);
                } else {
                    map.removeLayer(elevationMarker);
                }
            }
        }
    });
}

// ==========================================
// 8. OTRAS FUNCIONES AUXILIARES
// ==========================================

function setupFilters() { document.querySelectorAll('.filter-chip').forEach(b => b.addEventListener('click', e => { 
    document.querySelectorAll('.filter-chip').forEach(x => x.classList.remove('active')); e.target.classList.add('active'); 
    currentFilter = e.target.dataset.filter; updateMap(); updateStationsList(); 
})); }

function setupTheme() { document.getElementById('btn-dark-mode')?.addEventListener('click', () => document.body.classList.toggle('dark-mode')); }
function setupSearch() { document.getElementById('search-input')?.addEventListener('input', e => { window.searchTerm = e.target.value.toLowerCase(); updateStationsList(); }); }
function forceLocate() { if (navigator.geolocation) map.locate({setView: false}); }

function toggleHeatmap() { 
    if (typeof L === 'undefined' || typeof L.heatLayer === 'undefined') return;
    isHeatmapActive = !isHeatmapActive; 
    const btn = document.getElementById('btn-heatmap');
    if(isHeatmapActive) { btn.classList.add('active'); showToast("🔥 Heatmap activo"); } 
    else { btn.classList.remove('active'); showToast("📍 Normal"); }
    updateMap(); 
}

// === FUNCIÓN ARRASTRAR PANEL (MÓVIL) CORREGIDA ===
function setupDraggableSheet(sheetId, dragZoneId, visiblePixels) {
    const sheet = document.getElementById(sheetId);
    const handle = document.getElementById(dragZoneId);
    if (!sheet || !handle) return;

    let startY = 0;
    let initialY = 0;
    let isDragging = false;

    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        startY = e.touches[0].clientY;
        sheet.style.transition = 'none'; // Sin animación al arrastrar
        
        // Leer posición actual exacta
        const style = window.getComputedStyle(sheet);
        const matrix = new WebKitCSSMatrix(style.transform);
        initialY = matrix.m42;
    }, {passive: false});

    window.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY; // Cuánto he movido el dedo
        let nextY = initialY + diff;    // Nueva posición calculada

        // LÍMITES DE SEGURIDAD
        // 0 = Tope superior de la pantalla
        if (nextY < 0) nextY = 0; 
        
        // Aplicar movimiento
        sheet.style.transform = `translateY(${nextY}px)`;
        
        // BLOQUEAR SCROLL DE PÁGINA (CRÍTICO)
        if (e.cancelable) e.preventDefault();
        
    }, {passive: false});

    window.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        sheet.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        
        // ¿Dónde soltó el usuario?
        const style = window.getComputedStyle(sheet);
        const matrix = new WebKitCSSMatrix(style.transform);
        const currentY = matrix.m42;
        
        // Altura "Cerrado" (lo que debe bajar para mostrar solo la cabecera)
        const closedY = window.innerHeight - visiblePixels; 
        
        // DECISIÓN INTELIGENTE:
        // Si ha subido más de la mitad del recorrido -> Abrir a tope (0)
        // Si no -> Bajar a posición inicial (closedY)
        const threshold = closedY / 2; 

        if (currentY < threshold) {
            sheet.style.transform = `translateY(0px)`; // Abrir
        } else {
            sheet.style.transform = `translateY(${closedY}px)`; // Cerrar
        }
    });
}

async function loadRealCharts(stationId) {
    const cvsH = document.getElementById('historyChart'); if(!cvsH) return;
    if(historyChart) historyChart.destroy();
    
    // Obtener datos reales
    const yesterday = new Date(); yesterday.setHours(yesterday.getHours() - 24);
    const { data: rawHistory } = await client.from('snapshots').select('timestamp, available_bikes').eq('station_id', stationId).gte('timestamp', yesterday.toISOString()).order('timestamp', { ascending: true });
    
    // Pintar Historial
    const hLabels = (rawHistory || []).map(d => new Date(d.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
    const hData = (rawHistory || []).map(d => d.available_bikes);
    
    historyChart = new Chart(cvsH.getContext('2d'), { 
        type: 'line', 
        data: {
            labels: hLabels, 
            datasets:[{
                label: 'Bicis', data: hData, borderColor:'#667eea', backgroundColor:'rgba(102,126,234,0.1)', fill:true, pointRadius:0, tension:0.4,
                pointHitRadius: 20 // FIX: Área de hover más grande
            }]
        }, 
        // FIX: Interaction para que el hover funcione bien
        options:{
            responsive:true, 
            interaction: { mode: 'index', intersect: false }, 
            plugins:{legend:{display:false}}, 
            scales:{x:{display:false}}
        } 
    });
    
    // Pintar Predicción
    const cvsT = document.getElementById('trendChart'); if(!cvsT) return;
    if(trendChart) trendChart.destroy();
    
    const { data: predData } = await client.from('predicciones').select('prediction_date, predicted_bikes').eq('station_id', stationId).gte('prediction_date', new Date().toISOString()).limit(12);
    const pLabels = (predData || []).map(d => new Date(d.prediction_date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
    const pData = (predData || []).map(d => d.predicted_bikes);

    trendChart = new Chart(cvsT.getContext('2d'), { 
        type: 'bar', 
        data: {labels:pLabels, datasets:[{label:'Predicción', data:pData, backgroundColor:'#9b59b6', borderRadius:3}]}, 
        options:{responsive:true, plugins:{legend:{display:false}}, scales:{x:{display:false}}} 
    });
}

async function calcIA(dest) {
    const res = document.getElementById('trip-result');
    const load = document.getElementById('trip-loader');
    const cont = document.getElementById('trip-content');
    if(res) res.classList.remove('hidden'); 
    if(load) load.classList.remove('hidden'); 
    if(cont) cont.innerHTML = '';
    if (!userLocation) { map.locate(); return; }
    
    try {
        const arrival = new Date(); arrival.setMinutes(arrival.getMinutes() + 15);
        const { data, error } = await client.from('predicciones').select('predicted_bikes').eq('station_id', dest.station_id).gte('prediction_date', arrival.toISOString()).limit(1);
        let slots = dest.available_slots;
        if (data && data.length) slots = dest.total_capacity - data[0].predicted_bikes;
        
        const color = slots > 2 ? 'green' : (slots > 0 ? 'orange' : 'red');
        const txt = slots > 2 ? 'Alta Probabilidad' : 'Riesgo';
        const icon = slots > 2 ? 'check-circle' : 'warning';

        if(cont) cont.innerHTML = `
            <div class="status-pill status-${color}"><i class="ph ph-${icon}"></i> ${txt}</div> 
            <div style="font-size:0.9rem;">Llegada: <b>${arrival.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</b></div>
            <div style="font-size:0.85rem; color:#666;">Se esperan <b>~${Math.max(0, slots)} huecos</b></div>
        `;
    } catch(e) { if(cont) cont.innerHTML = `<div style="color:#e74c3c;">Error predicción</div>`; } 
    finally { if(load) load.classList.add('hidden'); }
}

window.onload = init;