const SUPABASE_URL = 'https://nkfvkszhrxwbippbntri.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow';

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 1. VARIABLES GLOBALES ---
let map;
let markers = {};
let heatLayer = null;
let touristLayer = null;
let isHeatmapActive = false;
let isTouristModeActive = false;
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

// --- 2. UTILIDADES (DEFINIDAS PRIMERO PARA EVITAR ERRORES) ---

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

function commitTrip() {
    if (currentRouteKm <= 0) return;
    let stats = JSON.parse(localStorage.getItem('biciStats') || '{"km":0, "co2":0, "cal":0}');
    stats.km += parseFloat(currentRouteKm);
    stats.co2 += parseFloat(currentRouteKm) * 0.12; 
    stats.cal += parseFloat(currentRouteKm) * 25;
    localStorage.setItem('biciStats', JSON.stringify(stats));
    showToast(`🎉 ¡Viaje registrado! +${currentRouteKm} km`);
    clearUI(false); 
    setTimeout(toggleStatsModal, 500); 
}

function updateColorClass(element, value) {
    if(!element) return;
    element.classList.remove('text-success', 'text-warning', 'text-danger');
    if (value >= 5) element.classList.add('text-success');
    else if (value > 0) element.classList.add('text-warning');
    else element.classList.add('text-danger');
}

// --- 3. FUNCIONES DE MAPA Y DATOS ---

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
        if (isTouristModeActive) {
            // Filtro para mostrar Millennium y zona costa
            if (s.latitude < 43.365 || s.longitude > -8.385) return; 
        }

        if (currentFilter === 'bikes' && s.available_bikes === 0) return;
        if (currentFilter === 'slots' && s.available_slots === 0) return;
        if (currentFilter === 'fav' && !favs.includes(String(s.station_id))) return;

        const color = s.available_bikes === 0 ? '#e74c3c' : (s.available_bikes < 5 ? '#f39c12' : '#2ecc71');
        const m = L.circleMarker([s.latitude, s.longitude], { radius: 8, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9 }).addTo(map);
        m.on('click', (e) => { L.DomEvent.stopPropagation(e); loadStationDetails(s); });
        markers[s.station_id] = m;
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
            weatherData = clim.data[0]; 
            const temp = Math.round(weatherData.temperature);
            const wDisplay = document.getElementById('weather-display');
            if(wDisplay) wDisplay.textContent = `${weatherData.rain_1h > 0 ? '🌧️' : '☀️'} ${temp}°C`;
        }

        const latest = {};
        if (snaps.data) snaps.data.forEach(s => { if (!latest[s.station_id]) latest[s.station_id] = s; });

        stationsData = est.data.map(s => {
            const st = latest[s.station_id] || latest[s.id];
            return {
                ...s, station_id: s.station_id || s.id,
                available_bikes: st ? st.available_bikes : (s.available_bikes || 0),
                available_slots: st ? (s.total_capacity - st.available_bikes) : 0
            };
        });
        updateMap(); 
        updateStationsList(); 
    } catch (err) { console.error("Error cargando datos:", err); }
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

// --- 4. MODO TURISTA (TU VERSIÓN CORREGIDA) ---

function toggleTouristMode() {
    isTouristModeActive = !isTouristModeActive;
    const btn = document.getElementById('btn-tourist');
    
    const landmarks = [
        {
            name: "Torre de Hércules",
            coords: [43.38594, -8.40648], 
            desc: "El faro romano más antiguo del mundo.",
            img: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Torre_de_H%C3%A9rcules_%282009%29.jpg/640px-Torre_de_H%C3%A9rcules_%282009%29.jpg",
            icon: "ph-lighthouse"
        },
        {
            name: "Plaza de María Pita",
            coords: [43.37087, -8.39594],
            desc: "Plaza Mayor y Ayuntamiento.",
            img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Plaza_de_Mar%C3%ADa_Pita%2C_La_Coru%C3%B1a%2C_Espa%C3%B1a%2C_2015-09-25%2C_DD_83-85_HDR.jpg/640px-Plaza_de_Mar%C3%ADa_Pita%2C_La_Coru%C3%B1a%2C_Espa%C3%B1a%2C_2015-09-25%2C_DD_83-85_HDR.jpg",
            icon: "ph-buildings"
        },
        {
            name: "Castillo de San Antón",
            coords: [43.36622, -8.38870],
            desc: "Antigua fortaleza y prisión.",
            img: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Castillo_de_San_Ant%C3%B3n%2C_La_Coru%C3%B1a%2C_Espa%C3%B1a%2C_2015-09-25%2C_DD_28-30_HDR.jpg/640px-Castillo_de_San_Ant%C3%B3n%2C_La_Coru%C3%B1a%2C_Espa%C3%B1a%2C_2015-09-25%2C_DD_28-30_HDR.jpg",
            icon: "ph-castle-turret"
        },
        {
            name: "Domus",
            coords: [43.37775, -8.40620],
            desc: "Museo del Hombre.",
            img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Domus%2C_La_Coru%C3%B1a%2C_Espa%C3%B1a%2C_2015-09-25%2C_DD_63.JPG/640px-Domus%2C_La_Coru%C3%B1a%2C_Espa%C3%B1a%2C_2015-09-25%2C_DD_63.JPG",
            icon: "ph-brain"
        },
        {
            name: "Aquarium Finisterrae",
            coords: [43.38280, -8.41110],
            desc: "La casa de los peces.",
            img: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Aquarium_Finisterrae.jpg/640px-Aquarium_Finisterrae.jpg",
            icon: "ph-fish"
        },
        {
            name: "Obelisco Millennium",
            // TU COORDENADA EXACTA:
            coords: [43.3768118, -8.423091], 
            desc: "Monumento de cristal de 46 metros.",
            img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Obelisco_Millenium_-_La_Coru%C3%B1a.jpg/640px-Obelisco_Millenium_-_La_Coru%C3%B1a.jpg",
            icon: "ph-monument"
        },
        {
            name: "Playa de Riazor",
            coords: [43.36850, -8.41350],
            desc: "La playa urbana insignia.",
            img: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Playa_de_Riazor%2C_La_Coru%C3%B1a%2C_Espa%C3%B1a%2C_2015-09-25%2C_DD_53.JPG/640px-Playa_de_Riazor%2C_La_Coru%C3%B1a%2C_Espa%C3%B1a%2C_2015-09-25%2C_DD_53.JPG",
            icon: "ph-sun"
        }
    ];

    // RUTA PASEO MARÍTIMO
    const precisePath = [
        [43.36622, -8.38870], // Castillo
        [43.36600, -8.39300], 
        [43.36700, -8.39650], 
        [43.36950, -8.39800], 
        [43.37130, -8.39580], // Maria Pita
        [43.37180, -8.39850], 
        [43.37400, -8.39950], 
        [43.37700, -8.40050], 
        [43.38200, -8.39800], 
        [43.38594, -8.40648], // Torre Hercules
        [43.38400, -8.40900], 
        [43.38280, -8.41110], // Aquarium
        [43.38000, -8.40850], 
        [43.37775, -8.40620], // Domus
        [43.37550, -8.40550], 
        [43.37350, -8.40650], // Fuente Surfistas
        [43.37150, -8.40900], 
        [43.37020, -8.41150], 
        [43.36950, -8.41300], // Coraza
        [43.36880, -8.41500], 
        [43.36820, -8.41750], 
        [43.36800, -8.42000], 
        [43.36950, -8.42250], 
        [43.37681, -8.42309]  // Millennium (Tu coordenada)
    ];

    if (isTouristModeActive) {
        if(btn) btn.classList.add('active');
        showToast("📷 Modo Turista Activado");
        if (isHeatmapActive) toggleHeatmap();

        if (touristLayer) map.removeLayer(touristLayer);
        touristLayer = L.layerGroup().addTo(map);

        // A. RUTA
        L.polyline(precisePath, {
            color: '#e67e22', weight: 5, dashArray: '10, 10', opacity: 0.9, lineJoin: 'round'
        }).addTo(touristLayer);

        // B. MARCADORES
        landmarks.forEach(l => {
            const iconHtml = `<div class="pulse-ring"></div><i class="ph ${l.icon}" style="margin-top:2px;"></i>`;
            const customIcon = L.divIcon({
                className: 'tourist-icon-marker', html: iconHtml,
                iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20]
            });

            // FIX: Imagen con estilo seguro
            const popupContent = `
                <div style="width: 240px; border-radius: 8px; overflow: hidden; background: #fff;">
                    <div style="width: 100%; height: 130px; background: #eee;">
                        <img src="${l.img}" style="width: 100%; height: 100%; object-fit: cover; display: block;" 
                             alt="${l.name}" onerror="this.style.display='none'">
                    </div>
                    <div style="padding: 10px; color: #333;">
                        <h3 style="margin: 0 0 5px 0; font-size: 15px; font-weight: bold;">${l.name}</h3>
                        <p style="margin: 0; font-size: 12px; color: #666;">${l.desc}</p>
                    </div>
                </div>
            `;

            L.marker(l.coords, {icon: customIcon})
                .bindPopup(popupContent, {maxWidth: 250, minWidth: 240, closeButton: false})
                .addTo(touristLayer);
        });

        map.flyTo([43.375, -8.405], 14);

    } else {
        if(btn) btn.classList.remove('active');
        if (touristLayer) { map.removeLayer(touristLayer); touristLayer = null; }
        showToast("📍 Modo Normal");
        map.flyTo([43.366, -8.410], 13);
    }
    updateMap();
}

// --- 5. SETUP UI Y INIT (AL FINAL) ---

function setupUI() {
    try {
        setupFilters();
        setupTheme();
        setupSearch();
        loadStats();

        const safeAdd = (id, fn) => { const el = document.getElementById(id); if(el) el.addEventListener('click', fn); }

        safeAdd('btn-geo', () => { map.locate({setView: true, maxZoom: 16}); forceLocate(); });
        safeAdd('btn-heatmap', toggleHeatmap);
        safeAdd('btn-tourist', toggleTouristMode);
        safeAdd('btn-stop-route', () => clearUI(false));
        safeAdd('btn-close-card', () => clearUI(true));
        safeAdd('btn-fav', toggleFavorite);
        safeAdd('btn-stats', toggleStatsModal);
        safeAdd('btn-close-stats', toggleStatsModal);
        safeAdd('btn-finish-trip', commitTrip);

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

    } catch (e) { console.error("Error UI setup:", e); }
}

async function init() {
    if (typeof L === 'undefined') {
        console.warn("Esperando Leaflet...");
        setTimeout(init, 100); return;
    }
    console.log("🚀 BiciAI v9.0 Ready");
    
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
}

// ... RESTO DE FUNCIONES DE INTERACCIÓN ...

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
        const listCont = document.getElementById('station-list-container');
        if(listCont) listCont.classList.remove('hidden'); 
        currentStation = null;
    }
}

function drawRoute(dest, mode = 'walk') {
    if (!userLocation) { map.locate(); showToast("📍 Buscando ubicación..."); return; }
    currentDestCoords = L.latLng(dest.latitude, dest.longitude);
    if (routingControl) { try { map.removeControl(routingControl); } catch(e){} routingControl = null; }
    
    const elBox = document.getElementById('elevation-box'); if(elBox) elBox.classList.add('hidden');
    const rainAlert = document.getElementById('rain-alert'); if(rainAlert) rainAlert.classList.add('hidden');
    const btnFinish = document.getElementById('btn-finish-trip'); if(btnFinish) btnFinish.classList.add('hidden');

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
    if(panel) panel.classList.remove('hidden');
    
    if(document.getElementById('route-icon')) document.getElementById('route-icon').textContent = icon;
    if(document.getElementById('route-time')) document.getElementById('route-time').textContent = "Calc...";
    if(document.getElementById('route-dist')) document.getElementById('route-dist').textContent = "";

    routingControl.on('routesfound', e => {
        const r = e.routes[0];
        const mins = Math.round(r.summary.totalTime / 60);
        const km = (r.summary.totalDistance / 1000).toFixed(1);
        currentRouteKm = km; 

        if(document.getElementById('route-time')) document.getElementById('route-time').textContent = `${mins} min`;
        if(document.getElementById('route-dist')) document.getElementById('route-dist').textContent = `(${km} km)`;
        
        if (weatherData && weatherData.rain_1h > 0) {
            const alertBox = document.getElementById('rain-alert');
            if(alertBox) {
                alertBox.classList.remove('hidden');
                alertBox.innerHTML = `⚠️ <b>Lluvia detectada</b>. Precaución.`;
            }
        }

        if (mode === 'bike') {
            const btnF = document.getElementById('btn-finish-trip');
            if(btnF) {
                btnF.classList.remove('hidden');
                btnF.innerHTML = `🏁 Completar Viaje (+${km} km)`;
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
        if(box) box.classList.remove('hidden');
        
        const ctx = document.getElementById('elevationChart').getContext('2d');
        if (elevationChart) elevationChart.destroy();
        elevationChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.elevation.map(() => ''),
                datasets: [{ data: data.elevation, borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.2)', borderWidth: 2, fill: true, pointRadius: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: true } } }
        });
    } catch (e) { if(box) box.classList.add('hidden'); }
}

function loadStationDetails(s) {
    const listCont = document.getElementById('station-list-container');
    if(listCont) listCont.classList.add('hidden'); 
    const card = document.getElementById('station-card');
    if(card) card.classList.remove('hidden');
    currentStation = s;
    
    if(document.getElementById('station-name')) document.getElementById('station-name').textContent = s.name;
    const statusEl = document.getElementById('station-status');
    if(statusEl) statusEl.innerHTML = s.available_bikes > 0 ? '<span style="color:#2ecc71">● Operativa</span>' : '<span style="color:#e74c3c">● Sin bicis</span>';
    
    if(document.getElementById('station-capacity')) document.getElementById('station-capacity').textContent = `Total: ${s.total_capacity}`;
    updateFavoriteBtn(s.station_id);

    const bikesEl = document.getElementById('st-bikes');
    const slotsEl = document.getElementById('st-slots');
    if(bikesEl) bikesEl.textContent = s.available_bikes;
    if(slotsEl) slotsEl.textContent = s.available_slots;

    const setupBtn = (id, cb) => {
        const el = document.getElementById(id);
        if(el) {
            const newEl = el.cloneNode(true);
            el.parentNode.replaceChild(newEl, el);
            newEl.addEventListener('click', cb);
        }
    };

    setupBtn('btn-route-walk', () => drawRoute(s, 'walk'));
    setupBtn('btn-route-bike', () => drawRoute(s, 'bike'));
    setupBtn('btn-plan-trip', () => calcIA(s));
    
    let calendarBtn = document.getElementById('btn-calendar');
    if (!calendarBtn) {
        const actionsGrid = document.querySelector('.ai-actions-grid');
        if (actionsGrid) {
            calendarBtn = document.createElement('button');
            calendarBtn.id = 'btn-calendar';
            calendarBtn.className = 'ai-action-btn secondary full-width';
            calendarBtn.style.marginTop = '10px';
            calendarBtn.innerHTML = '📅 Llegar a hora';
            actionsGrid.appendChild(calendarBtn);
        }
    }
    if (calendarBtn) {
        const newCal = calendarBtn.cloneNode(true);
        calendarBtn.parentNode.replaceChild(newCal, calendarBtn);
        newCal.addEventListener('click', checkSchedule);
    }

    const tripRes = document.getElementById('trip-result');
    if(tripRes) tripRes.classList.add('hidden');

    map.flyTo([s.latitude, s.longitude], 16, { duration: 0.5, paddingBottomRight: [0, 200] });
    setTimeout(() => loadRealCharts(s.station_id), 100);
}

async function checkSchedule() {
    const timeStr = prompt("📅 ¿A qué hora tienes que estar allí? (Formato HH:MM, ej: 09:00)");
    if (!timeStr) return;

    const [hours, mins] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(mins)) { alert("Hora inválida"); return; }

    const targetTime = new Date();
    targetTime.setHours(hours, mins, 0, 0);
    if (targetTime < new Date()) targetTime.setDate(targetTime.getDate() + 1);

    const departureTime = new Date(targetTime.getTime() - 20 * 60000);
    showToast("🔮 Consultando el oráculo...");

    try {
        if (!currentStation) throw new Error("Selecciona estación");
        
        const { data, error } = await client.from('predicciones').select('predicted_bikes')
            .eq('station_id', currentStation.station_id).gte('prediction_date', departureTime.toISOString()).limit(1);

        let predicted = currentStation.total_capacity / 2; 
        if (data && data.length > 0) predicted = data[0].predicted_bikes;

        let msg = "";
        if (predicted < 2) msg = `⚠️ ¡PELIGRO! Habrá ~${predicted} bicis a las ${departureTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}.`;
        else if (predicted < 5) msg = `⚠️ Justito: Habrá ~${predicted} bicis.`;
        else msg = `✅ Tranquilo: Se esperan ~${predicted} bicis.`;

        alert(msg);
    } catch (e) { alert("No pude calcular la predicción."); }
}

async function calcIA(dest) {
    const res = document.getElementById('trip-result');
    const load = document.getElementById('trip-loader');
    const cont = document.getElementById('trip-content');
    
    if(res) res.classList.remove('hidden'); 
    if(load) load.classList.remove('hidden'); 
    if(cont) cont.innerHTML = '';

    if (!userLocation) { 
        map.locate(); 
        if(load) load.classList.add('hidden'); 
        if(cont) cont.innerHTML = `<div style="color:var(--text-sub)">Falta ubicación</div>`; 
        return; 
    }
    
    try {
        const straightDistKm = userLocation.distanceTo(L.latLng(dest.latitude, dest.longitude)) / 1000;
        const speedKmH = 4.8; 
        const mins = Math.round((straightDistKm * 1.4 / speedKmH) * 60);
        const arrival = new Date(); arrival.setMinutes(arrival.getMinutes() + mins);
        
        const { data, error } = await client.from('predicciones').select('predicted_bikes')
            .eq('station_id', dest.station_id).gte('prediction_date', arrival.toISOString()).limit(1);
        
        if (error) throw error;
        let slots = dest.available_slots;
        if (data && data.length > 0) slots = dest.total_capacity - data[0].predicted_bikes;
        
        const color = slots > 2 ? 'green' : (slots > 0 ? 'orange' : 'red');
        const txt = slots > 2 ? 'Alta Probabilidad' : (slots > 0 ? 'Riesgo' : 'Muy difícil');
        const icon = slots > 2 ? 'check-circle' : (slots > 0 ? 'warning' : 'x-circle');

        if(cont) cont.innerHTML = `
            <div class="status-pill status-${color}"><i class="ph ph-${icon}"></i> ${txt}</div> 
            <div style="font-size:0.9rem; margin-top:8px;">Llegada: <b>${arrival.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</b> (~${mins} min)</div>
            <div style="font-size:0.85rem; color:var(--text-sub); margin-top:4px;">Se esperan <b>~${Math.max(0, slots)} huecos</b></div>
        `;
    } catch(e) { if(cont) cont.innerHTML = `<div style="color:#e74c3c;">Error predicción</div>`; } 
    finally { if(load) load.classList.add('hidden'); }
}

async function loadRealCharts(stationId) {
    const yesterday = new Date(); yesterday.setHours(yesterday.getHours() - 24);
    const { data: rawHistory } = await client.from('snapshots').select('timestamp, available_bikes').eq('station_id', stationId).gte('timestamp', yesterday.toISOString()).order('timestamp', { ascending: true });
    const { data: predData } = await client.from('predicciones').select('prediction_date, predicted_bikes').eq('station_id', stationId).gte('prediction_date', new Date().toISOString()).limit(24);
    updateCharts(rawHistory || [], predData || []);
    calculatePopularTime(rawHistory || []);
}

function updateCharts(history, predictions) {
    const cvsH = document.getElementById('historyChart');
    if(!cvsH) return;
    const ctxH = cvsH.getContext('2d');
    if (historyChart) historyChart.destroy();
    
    const hLabels = history.map(d => new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
    
    historyChart = new Chart(ctxH, {
        type: 'line',
        data: { labels: hLabels, datasets: [{ label: 'Bicis', data: history.map(d=>d.available_bikes), borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.1)', fill: true, tension: 0.3, pointRadius: 0, pointHitRadius: 20 }] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display:true } } }
    });

    const cvsT = document.getElementById('trendChart');
    if(!cvsT) return;
    const ctxT = cvsT.getContext('2d');
    if (trendChart) trendChart.destroy();
    const pLabels = predictions.map(d => new Date(d.prediction_date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));

    trendChart = new Chart(ctxT, {
        type: 'bar',
        data: { labels: pLabels, datasets: [{ label: 'Predicción', data: predictions.map(d=>d.predicted_bikes), backgroundColor: '#9b59b6', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display:true } } }
    });
}

function calculatePopularTime(history) {
    const box = document.getElementById('popular-time-box');
    if (!history || history.length < 5) { if(box) box.classList.add('hidden'); return; }
    let minBikes = 999; let worstTime = null; let maxBikes = -1; let bestTime = null;
    history.forEach(h => {
        if (h.available_bikes < minBikes) { minBikes = h.available_bikes; worstTime = new Date(h.timestamp); }
        if (h.available_bikes > maxBikes) { maxBikes = h.available_bikes; bestTime = new Date(h.timestamp); }
    });

    if(box) {
        box.classList.remove('hidden');
        if (minBikes <= 1) {
            box.innerHTML = `<div style="color:#e74c3c"><i class="ph ph-warning"></i> Se vacía a las <strong>${worstTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong></div>`;
            box.style.borderLeft = '3px solid #e74c3c';
            box.style.background = 'rgba(231,76,60,0.1)';
        } else {
            box.innerHTML = `<div style="color:#2ecc71"><i class="ph ph-check"></i> Máxima disponibilidad: <strong>${bestTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong></div>`;
            box.style.borderLeft = '3px solid #2ecc71';
            box.style.background = 'rgba(46,204,113,0.1)';
        }
    }
}

function toggleHeatmap() {
    if (typeof L === 'undefined' || typeof L.heatLayer === 'undefined') { console.error("Falta librería Heatmap"); return; }
    isHeatmapActive = !isHeatmapActive;
    
    if (isHeatmapActive) {
        document.getElementById('btn-heatmap')?.classList.add('active');
        document.getElementById('marker-legend')?.classList.add('hidden'); 
        document.getElementById('heatmap-legend')?.classList.remove('hidden'); 
        showToast("🔥 Mapa de calor");
    } else {
        document.getElementById('btn-heatmap')?.classList.remove('active');
        document.getElementById('marker-legend')?.classList.remove('hidden'); 
        document.getElementById('heatmap-legend')?.classList.add('hidden'); 
        showToast("📍 Modo normal");
    }
    updateMap();
}

function setupFilters() { document.querySelectorAll('.filter-chip').forEach(b => b.addEventListener('click', e => { 
    document.querySelectorAll('.filter-chip').forEach(x => x.classList.remove('active')); e.target.classList.add('active'); 
    currentFilter = e.target.dataset.filter; updateMap(); updateStationsList(); 
})); }

function setupTheme() { document.getElementById('btn-dark-mode')?.addEventListener('click', () => document.body.classList.toggle('dark-mode')); }
function setupSearch() { document.getElementById('search-input')?.addEventListener('input', e => { window.searchTerm = e.target.value.toLowerCase(); updateStationsList(); }); }
function forceLocate() { if (navigator.geolocation) map.locate({setView: false}); }

function setupDraggableSheet(sheetId, dragZoneId, initialVisibleHeight) {
    const sheet = document.getElementById(sheetId);
    const handle = document.getElementById(dragZoneId);
    if (!sheet || !handle) return;
    let startY = 0; let currentTranslate = 0; let isDragging = false;
    handle.addEventListener('touchstart', (e) => { isDragging = true; startY = e.touches[0].clientY; sheet.style.transition = 'none'; });
    window.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const delta = e.touches[0].clientY - startY;
        if (delta > 0) sheet.style.transform = `translateY(${delta}px)`;
    });
    window.addEventListener('touchend', () => {
        isDragging = false; sheet.style.transition = 'transform 0.3s';
        sheet.style.transform = '';
    });
}

window.onload = init;