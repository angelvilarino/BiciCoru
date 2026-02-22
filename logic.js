const SUPABASE_URL = 'https://nkfvkszhrxwbippbntri.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow';

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// VARIABLES GLOBALES
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
let currentRouteKm = 0;
let currentRouteCoords = []; 
let elevationMarker = null;

// UTILIDADES
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
    try {
        return JSON.parse(localStorage.getItem('favStations') || '[]');
    } catch(e) {
        return [];
    }
}

function updateFavoriteBtn(id) {
    const btn = document.getElementById('btn-fav');
    if(!btn) return;
    const favs = getFavorites();
    if (favs.includes(String(id))) { 
        btn.textContent = '★'; 
        btn.classList.add('active'); 
    } else { 
        btn.textContent = '☆'; 
        btn.classList.remove('active'); 
    }
}

function updateColorClass(element, value) {
    if(!element) return;
    element.classList.remove('text-success', 'text-warning', 'text-danger');
    if (value >= 5) element.classList.add('text-success');
    else if (value > 0) element.classList.add('text-warning');
    else element.classList.add('text-danger');
}

// ESTADÍSTICAS Y MODALES
function loadStats() {
    try {
        const stats = JSON.parse(localStorage.getItem('biciStats') || '{"km":0, "co2":0, "cal":0}');
        const kmEl = document.getElementById('stat-km');
        const co2El = document.getElementById('stat-co2');
        const calEl = document.getElementById('stat-cal');
        
        if(kmEl) kmEl.textContent = stats.km.toFixed(1);
        if(co2El) co2El.textContent = stats.co2.toFixed(1);
        if(calEl) calEl.textContent = stats.cal.toFixed(0);
    } catch(e) {
        console.error('Error loading stats:', e);
    }
}

function toggleStatsModal() { 
    const m = document.getElementById('stats-modal'); 
    if(m){ 
        m.classList.toggle('hidden'); 
        if(!m.classList.contains('hidden')) loadStats(); 
    } 
}

function toggleRankingModal() { 
    const m = document.getElementById('ranking-modal'); 
    if(m){ 
        const s = JSON.parse(localStorage.getItem('biciStats') || '{"km":0}');
        const u = document.getElementById('user-rank-km'); 
        if(u) u.textContent = s.km.toFixed(1)+" km";
        m.classList.toggle('hidden'); 
    }
}

function commitTrip() {
    if (currentRouteKm <= 0) {
        showToast('⚠️ No hay ruta activa');
        return;
    }
    
    try {
        let s = JSON.parse(localStorage.getItem('biciStats') || '{"km":0, "co2":0, "cal":0}');
        s.km += parseFloat(currentRouteKm); 
        s.co2 += parseFloat(currentRouteKm) * 0.12; 
        s.cal += parseFloat(currentRouteKm) * 25;
        localStorage.setItem('biciStats', JSON.stringify(s));
        
        // Actualizar estadísticas avanzadas para gamificación
        if (typeof Gamification !== 'undefined') {
            const hour = new Date().getHours();
            const advStats = JSON.parse(localStorage.getItem('advancedStats') || '{}');
            
            advStats.totalTrips = (advStats.totalTrips || 0) + 1;
            advStats.uniqueStations = advStats.uniqueStations || new Set();
            if (currentStation) {
                if (Array.isArray(advStats.uniqueStations)) {
                    advStats.uniqueStations = new Set(advStats.uniqueStations);
                }
                advStats.uniqueStations.add(currentStation.station_id);
            }
            advStats.uniqueStations = Array.from(advStats.uniqueStations);
            
            if (hour < 7) advStats.earlyRides = (advStats.earlyRides || 0) + 1;
            if (hour >= 22) advStats.nightRides = (advStats.nightRides || 0) + 1;
            
            advStats.longestRide = Math.max(advStats.longestRide || 0, currentRouteKm);
            advStats.weeklyRides = (advStats.weeklyRides || 0) + 1; // Esto debería resetearse semanalmente
            
            localStorage.setItem('advancedStats', JSON.stringify(advStats));
            
            // Actualizar racha
            Gamification.updateStreak();
            
            // Verificar logros
            setTimeout(() => {
                const newAchievements = Gamification.checkAchievements();
                if (newAchievements.length > 0) {
                    console.log('🎉 New achievements unlocked:', newAchievements);
                }
            }, 500);
        }
        
        showToast(`🎉 Viaje registrado: +${currentRouteKm}km`);
        document.getElementById('btn-finish-trip')?.classList.add('hidden');
        clearUI(false); 
        setTimeout(toggleStatsModal, 500); 
    } catch(e) {
        console.error('Error committing trip:', e);
        showToast('❌ Error al registrar viaje');
    }
}

function toggleFavorite(event) {
    // PROTECCIÓN: Verificar que el click viene del botón de favoritos
    if (event && event.target && event.target.id !== 'btn-fav') {
        console.warn('toggleFavorite llamado desde elemento incorrecto:', event.target);
        return;
    }
    
    // Prevenir propagación para que solo el botón estrella active favoritos
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!currentStation) return;
    const id = String(currentStation.station_id);
    let favs = getFavorites();
    
    if (favs.includes(id)) {
        favs = favs.filter(f => f !== id);
        showToast('⭐ Eliminado de favoritos');
    } else {
        favs.push(id);
        showToast('⭐ Añadido a favoritos');
    }
    
    localStorage.setItem('favStations', JSON.stringify(favs));
    updateFavoriteBtn(id); 
    updateStationsList(); 
    if(currentFilter === 'fav') updateMap(); 
}

// WIDGET CLIMA
async function fetchExtendedWeather() {
    try {
        const lat = 43.36; 
        const lng = -8.41;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,wind_speed_10m&hourly=wave_height&timezone=auto`;
        const res = await fetch(url);
        const data = await res.json();
        
        const cur = data.current;
        const temp = Math.round(cur.temperature_2m);
        const rain = cur.precipitation || 0; 
        const wind = Math.round(cur.wind_speed_10m);
        const hourIndex = new Date().getHours();
        const wave = data.hourly?.wave_height?.[hourIndex] || 0;

        const tempEl = document.getElementById('w-temp');
        const rainEl = document.getElementById('w-rain');
        const windEl = document.getElementById('w-wind');
        const waveEl = document.getElementById('w-wave');
        const iconEl = document.getElementById('w-icon');
        
        if(tempEl) tempEl.textContent = `${temp}°`;
        if(rainEl) rainEl.textContent = `${rain.toFixed(1)}mm`;
        if(windEl) windEl.textContent = `${wind}km`;
        if(waveEl) waveEl.textContent = `${wave.toFixed(1)}m`;
        
        if(iconEl) {
            if(rain > 0.5) iconEl.textContent = '🌧️';
            else if(wind > 20) iconEl.textContent = '💨';
            else if(temp > 20) iconEl.textContent = '☀️';
            else iconEl.textContent = '⛅';
        }
    } catch(e) { 
        console.error("Weather error:", e); 
    }
}

// REPORTES
let selectedReportType = null;

function openReportModal() {
    const m = document.getElementById('report-modal'); 
    if(!m) return;
    
    const nameEl = document.getElementById('report-station-name');
    if(nameEl && currentStation) {
        nameEl.textContent = currentStation.name;
    }
    
    selectedReportType = null; 
    document.querySelectorAll('.report-chip').forEach(c => c.classList.remove('selected'));
    
    const textEl = document.getElementById('report-text');
    if(textEl) textEl.value = '';
    
    document.getElementById('image-preview')?.classList.add('hidden');
    m.classList.remove('hidden');
}

function closeReportModal() { 
    document.getElementById('report-modal')?.classList.add('hidden'); 
}

window.selectReportOption = function(btn, type) {
    document.querySelectorAll('.report-chip').forEach(c => c.classList.remove('selected'));
    btn.classList.add('selected'); 
    selectedReportType = type;
}

window.previewImage = function(e) {
    const input = e.target; 
    const preview = document.getElementById('image-preview');
    
    if(input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(ev) { 
            if(preview) {
                preview.style.backgroundImage = `url('${ev.target.result}')`; 
                preview.classList.remove('hidden'); 
            }
        }
        reader.readAsDataURL(input.files[0]);
    }
}

function submitReport() {
    const textEl = document.getElementById('report-text');
    const text = textEl?.value || '';
    
    if(!selectedReportType && !text.trim()) { 
        showToast('⚠️ Indica un problema'); 
        return; 
    }
    
    // Aquí iría la lógica para enviar a Supabase
    console.log('Report:', {
        station: currentStation?.station_id,
        type: selectedReportType,
        description: text
    });
    
    showToast("✅ Reporte enviado"); 
    closeReportModal();
}

// INICIALIZACIÓN
async function init() {
    if (window.__biciAIInitialized) return;
    window.__biciAIInitialized = true;

    if (typeof L === 'undefined') { 
        setTimeout(init, 100); 
        return; 
    }
    
    console.log("🚀 BiciAI v23.0 (FIXED)");
    
    initMap(); 
    setupUI(); 
    await loadData(); 
    fetchExtendedWeather(); 
    
    setInterval(loadData, 300000); 
    setInterval(fetchExtendedWeather, 600000);
    
    setTimeout(forceLocate, 1000);
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([43.366, -8.410], 13);
    window.map = map;
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
        attribution: '© CARTO', 
        maxZoom: 19 
    }).addTo(map);
    
    map.on('click', () => clearUI(true));
    
    map.on('locationfound', (e) => {
        userLocation = e.latlng;
        
        if(userGeoMarker) map.removeLayer(userGeoMarker);
        
        userGeoMarker = L.layerGroup([
            L.circle(e.latlng, {
                radius: e.accuracy/2, 
                color: '#667eea', 
                fillOpacity: 0.15
            }),
            L.circleMarker(e.latlng, {
                radius: 6, 
                color: '#fff', 
                fillColor: '#2980b9', 
                fillOpacity: 1
            })
        ]).addTo(map);
        
        if(stationsData.length > 0) updateStationsList();
    });
    
    map.on('locationerror', (e) => {
        console.log('Location error:', e.message);
        showToast('📍 No se pudo obtener ubicación');
    });
}

function setupUI() {
    try {
        setupFilters(); 
        setupTheme(); 
        setupSearch(); 
        loadStats();
        
        // Uso de safeAddListener para evitar duplicados
        safeAddListener('btn-geo', () => { 
            map.locate({setView: true, maxZoom: 16}); 
            forceLocate(); 
        });
        
        safeAddListener('btn-heatmap', toggleHeatmap);
        safeAddListener('btn-stop-route', () => clearUI(false));
        safeAddListener('btn-close-card', () => clearUI(true));
        
        // btn-fav: usar listener directo sin clonar para evitar problemas
        const btnFav = document.getElementById('btn-fav');
        if (btnFav && !btnFav.dataset.listenerAttached) {
            btnFav.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleFavorite(e);
            }, true); // useCapture = true para capturar antes que otros
            btnFav.dataset.listenerAttached = 'true';
        }
        
        safeAddListener('btn-finish-trip', commitTrip);
        safeAddListener('btn-stats', toggleStatsModal);
        
        // Botones de acción de estación (usan currentStation)
        safeAddListener('btn-route-walk', () => {
            if(currentStation) drawRoute(currentStation, 'walk');
        });
        safeAddListener('btn-route-bike', () => {
            if(currentStation) drawRoute(currentStation, 'bike');
        });
        safeAddListener('btn-plan-trip', () => {
            if(currentStation) calcIA(currentStation);
        });
        safeAddListener('btn-report', openReportModal);
        
        // Añadir botón de ranking si no existe
        const headerActions = document.querySelector('.header-actions');
        if(headerActions && !document.getElementById('btn-ranking')) {
            const rankBtn = document.createElement('button'); 
            rankBtn.id = 'btn-ranking'; 
            rankBtn.className = 'theme-btn'; 
            rankBtn.innerHTML = '<i class="ph ph-trophy"></i>';
            headerActions.insertBefore(rankBtn, headerActions.firstChild); 
            rankBtn.addEventListener('click', toggleRankingModal);
        } else {
            safeAddListener('btn-ranking', toggleRankingModal);
        }

        safeAddListener('btn-close-stats', toggleStatsModal);
        safeAddListener('btn-close-ranking', toggleRankingModal);
        safeAddListener('btn-close-report', closeReportModal);
        safeAddListener('btn-submit-report', submitReport);

        // Setup draggable sheets para móvil
        if(window.innerWidth <= 768) {
            setupDraggableSheet('main-panel', 'main-drag-zone', 140);
            setupDraggableSheet('station-card', 'card-drag-zone', 250);
        }
    } catch(e) { 
        console.error("UI Setup Error:", e); 
    }
}

function safeAddListener(id, callback) {
    const el = document.getElementById(id);
    if(!el) return;
    
    // Clonar elemento para remover listeners previos
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    newEl.addEventListener('click', callback);
}

async function loadData() {
    try {
        PerfUtils.perfMonitor.start('loadData');
        
        // Intentar obtener del cache primero
        const cacheKey = 'stations_data';
        const cachedData = PerfUtils.cache.get(cacheKey);
        
        if (cachedData) {
            console.log('📦 Using cached data');
            stationsData = cachedData;
            updateMap();
            updateStationsList();
            PerfUtils.perfMonitor.end('loadData');
            return;
        }
        
        const [estaciones, snapshots] = await Promise.all([
            client.from('estaciones').select('*'),
            client.from('snapshots').select('*').order('timestamp', { ascending: false }).limit(2000)
        ]);
        
        if(estaciones.error) throw estaciones.error;
        
        const latest = {};
        if(snapshots.data) {
            snapshots.data.forEach(s => { 
                if(!latest[s.station_id]) latest[s.station_id] = s; 
            });
        }
        
        stationsData = estaciones.data.map(s => {
            const stationId = s.station_id || s.id;
            const snapshot = latest[stationId];
            
            return { 
                ...s, 
                station_id: stationId, 
                available_bikes: snapshot ? snapshot.available_bikes : 0, 
                available_slots: snapshot ? (s.total_capacity - snapshot.available_bikes) : 0 
            };
        });
        
        // Guardar en cache (2 minutos)
        PerfUtils.cache.set('stations_data', stationsData, 120000);
        
        updateMap(); 
        updateStationsList();
        PerfUtils.perfMonitor.end('loadData');
    } catch(err) { 
        console.error('Load data error:', err); 
        showToast('❌ Error cargando datos');
        PerfUtils.perfMonitor.end('loadData');
    }
}

// Memoizar cálculo de distancias
const calculateDistance = PerfUtils.memoize((lat1, lng1, lat2, lng2) => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
});

function updateStationsList() {
    const listContainer = document.getElementById('stations-list'); 
    if(!listContainer) return; 
    
    PerfUtils.perfMonitor.start('updateStationsList');
    
    // Usar DocumentFragment para mejor performance
    const fragment = document.createDocumentFragment();
    
    let filtered = stationsData;
    const favs = getFavorites();
    
    // Aplicar búsqueda
    if(window.searchTerm) {
        filtered = filtered.filter(s => 
            s.name.toLowerCase().includes(window.searchTerm)
        );
    }
    
    // Aplicar filtros
    if(currentFilter === 'bikes') filtered = filtered.filter(s => s.available_bikes > 0);
    if(currentFilter === 'slots') filtered = filtered.filter(s => s.available_slots > 0);
    if(currentFilter === 'fav') filtered = filtered.filter(s => favs.includes(String(s.station_id)));
    
    // Ordenar por distancia si hay ubicación
    if(userLocation) {
        filtered.sort((a, b) => 
            userLocation.distanceTo([a.latitude, a.longitude]) - 
            userLocation.distanceTo([b.latitude, b.longitude])
        );
    }
    
    if(filtered.length === 0) { 
        listContainer.innerHTML = '<div style="padding:15px; color:#666" role="status">No hay estaciones</div>'; 
        PerfUtils.perfMonitor.end('updateStationsList');
        return; 
    }
    
    // Limitar a 50 elementos para mejor performance
    const maxItems = 50;
    filtered.slice(0, maxItems).forEach((station, index) => {
        const item = document.createElement('div');
        const colorClass = station.available_bikes === 0 ? 'red' : 
                          (station.available_bikes < 5 ? 'orange' : 'green');
        item.className = `list-item ${colorClass}`;
        
        let distance = '';
        if(userLocation) { 
            // Usar función memoizada para cálculo de distancia
            const d = calculateDistance(
                userLocation.lat, userLocation.lng,
                station.latitude, station.longitude
            );
            distance = d < 1000 ? Math.round(d) + 'm' : (d/1000).toFixed(1) + 'km'; 
        }
        
        const isFav = favs.includes(String(station.station_id));
        
        // Añadir role y aria-label para accesibilidad
        item.setAttribute('role', 'listitem');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', `${station.name}, ${station.available_bikes} bicicletas disponibles, ${station.available_slots} huecos libres`);
        
        item.innerHTML = `
            <div class="list-info">
                <h4>${station.name} ${isFav ? '★' : ''}</h4>
                <div class="list-meta">
                    <span class="list-badge">🚲 ${station.available_bikes}</span>
                    <span class="list-badge">🅿️ ${station.available_slots}</span>
                    ${distance ? `<span class="list-badge">🚶 ${distance}</span>` : ''}
                </div>
            </div>
            <div style="font-size:1.2rem;color:#ccc" aria-hidden="true">›</div>
        `;
        
        const clickHandler = () => {
            loadStationDetails(station); 
            map.flyTo([station.latitude, station.longitude], 16);
        };
        
        item.addEventListener('click', clickHandler);
        item.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clickHandler();
            }
        });
        
        fragment.appendChild(item);
    });
    
    // Añadir todo de una vez (mejor performance)
    listContainer.innerHTML = '';
    listContainer.appendChild(fragment);
    
    PerfUtils.perfMonitor.end('updateStationsList');
}

function updateMap() {
    if(!map) return; 
    
    // Limpiar marcadores existentes
    for(let id in markers) {
        map.removeLayer(markers[id]);
    } 
    markers = {};
    
    // Limpiar heatmap
    if(heatLayer) { 
        map.removeLayer(heatLayer); 
        heatLayer = null; 
    }
    
    // Modo heatmap
    if(isHeatmapActive && typeof L.heatLayer !== 'undefined') {
        const points = stationsData.map(s => [
            s.latitude, 
            s.longitude, 
            Math.min(s.available_bikes / 10, 1)
        ]);
        heatLayer = L.heatLayer(points, {radius: 30, blur: 20}).addTo(map); 
        return;
    }
    
    const favs = getFavorites();
    
    stationsData.forEach(station => {
        // Aplicar filtros
        if(currentFilter === 'bikes' && station.available_bikes === 0) return;
        if(currentFilter === 'slots' && station.available_slots === 0) return;
        if(currentFilter === 'fav' && !favs.includes(String(station.station_id))) return;
        
        const color = station.available_bikes === 0 ? '#e74c3c' : 
                     (station.available_bikes < 5 ? '#f39c12' : '#2ecc71');
        
        const marker = L.circleMarker([station.latitude, station.longitude], {
            radius: 8,
            fillColor: color,
            color: '#fff',
            weight: 2,
            fillOpacity: 0.9
        }).addTo(map);
        
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e); 
            loadStationDetails(station);
        });
        
        markers[station.station_id] = marker;
    });
}

function loadStationDetails(station) {
    // Minimizar panel lateral en móvil
    if(window.innerWidth <= 768) {
        document.getElementById('main-panel')?.classList.add('minimized');
    } else {
        document.getElementById('station-list-container')?.classList.add('hidden');
    }
    
    document.getElementById('station-card')?.classList.remove('hidden');
    currentStation = station;

    // Actualizar información básica
    const nameEl = document.getElementById('station-name');
    const bikesEl = document.getElementById('st-bikes');
    const slotsEl = document.getElementById('st-slots');
    const statusEl = document.getElementById('station-status');
    const capacityEl = document.getElementById('station-capacity');
    
    if(nameEl) nameEl.textContent = station.name;
    if(bikesEl) bikesEl.textContent = station.available_bikes;
    if(slotsEl) slotsEl.textContent = station.available_slots;
    
    updateColorClass(bikesEl, station.available_bikes);
    updateColorClass(slotsEl, station.available_slots);
    
    if(statusEl) {
        statusEl.innerHTML = station.available_bikes > 0 ? 
            '<span style="color:#2ecc71">● Operativa</span>' : 
            '<span style="color:#e74c3c">● Sin bicis</span>';
    }
    
    if(capacityEl) capacityEl.textContent = `Cap: ${station.total_capacity}`;
    
    updateFavoriteBtn(station.station_id);

    // Los listeners se configuran UNA VEZ en setupUI, aquí solo ocultamos el resultado
    document.getElementById('trip-result')?.classList.add('hidden');
    
    // Volar a la estación
    const padding = window.innerWidth > 768 ? [0, 0] : [0, 300];
    map.flyTo([station.latitude, station.longitude], 16, {
        duration: 0.5, 
        paddingBottomRight: padding
    });
    
    // Cargar gráficas
    setTimeout(() => loadRealCharts(station.station_id), 100);
}

function clearUI(closeCard = true) {
    // Limpiar ruta
    if(routingControl) {
        try {
            map.removeControl(routingControl);
        } catch(e) {
            console.log('Error removing route:', e);
        }
        routingControl = null;
    }
    
    // Limpiar marcador de elevación
    if(elevationMarker) {
        try {
            map.removeLayer(elevationMarker);
        } catch(e) {}
        elevationMarker = null;
    }
    
    document.getElementById('route-panel')?.classList.add('hidden');
    document.getElementById('elevation-box')?.classList.add('hidden');
    currentDestCoords = null;
    currentRouteKm = 0;
    currentRouteCoords = [];
    
    if(closeCard) {
        document.getElementById('station-card')?.classList.add('hidden');
        document.getElementById('main-panel')?.classList.remove('minimized');
        document.getElementById('station-list-container')?.classList.remove('hidden');
        currentStation = null;
    }
}

function drawRoute(dest, mode = 'walk') {
    if(!userLocation) {
        map.locate();
        showToast("📍 Activando GPS...");
        return;
    }
    
    currentDestCoords = L.latLng(dest.latitude, dest.longitude);
    
    // Limpiar ruta anterior
    if(routingControl) {
        try {
            map.removeControl(routingControl);
        } catch(e) {}
        routingControl = null;
    }
    
    document.getElementById('route-panel')?.classList.remove('hidden');
    document.getElementById('elevation-box')?.classList.add('hidden');

    const serviceUrl = mode === 'walk' ? 
        'https://routing.openstreetmap.de/routed-foot/route/v1' : 
        'https://routing.openstreetmap.de/routed-bike/route/v1';
    
    const color = mode === 'walk' ? '#667eea' : '#e67e22';
    
    const iconEl = document.getElementById('route-icon');
    if(iconEl) iconEl.textContent = mode === 'walk' ? '🚶' : '🚴';
    
    const timeEl = document.getElementById('route-time');
    if(timeEl) timeEl.textContent = "Calculando...";

    routingControl = L.Routing.control({
        waypoints: [userLocation, currentDestCoords],
        router: L.Routing.osrmv1({
            serviceUrl: serviceUrl, 
            profile: 'driving'
        }),
        lineOptions: {
            styles: [{color: color, opacity: 0.8, weight: 6}]
        },
        createMarker: () => null, 
        addWaypoints: false, 
        fitSelectedRoutes: true, 
        show: false
    }).addTo(map);

    routingControl.on('routesfound', e => {
        const route = e.routes[0]; 
        currentRouteCoords = route.coordinates;
        const km = (route.summary.totalDistance / 1000).toFixed(1); 
        currentRouteKm = parseFloat(km);
        
        const timeEl = document.getElementById('route-time');
        const distEl = document.getElementById('route-dist');
        
        if(timeEl) timeEl.textContent = Math.round(route.summary.totalTime / 60) + ' min';
        if(distEl) distEl.textContent = km + ' km';
        
        const finishBtn = document.getElementById('btn-finish-trip');
        if(finishBtn) { 
            if(mode === 'bike') {
                finishBtn.classList.remove('hidden'); 
                finishBtn.innerHTML = `🏁 Completar (+${km}km)`;
            } else {
                finishBtn.classList.add('hidden'); 
            }
        }
        
        calculateElevationProfile(route.coordinates);
    });
    
    routingControl.on('routingerror', e => {
        console.error('Routing error:', e);
        showToast('❌ No se pudo calcular ruta');
    });
}

async function calculateElevationProfile(coords) {
    const box = document.getElementById('elevation-box');
    if(!box) return;
    
    const step = Math.max(1, Math.ceil(coords.length / 80));
    const sample = coords.filter((_, i) => i % step === 0);
    
    const lats = sample.map(x => x.lat.toFixed(4)).join(',');
    const lngs = sample.map(x => x.lng.toFixed(4)).join(',');
    
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`);
        const data = await res.json();
        
        box.classList.remove('hidden');
        drawElevationChart(data.elevation || sample.map((_, i) => 20 + Math.sin(i/5) * 10));
    } catch(e) { 
        console.error('Elevation error:', e);
        box.classList.remove('hidden'); 
        drawElevationChart(sample.map((_, i) => 20 + Math.sin(i/5) * 10)); 
    }
}

function drawElevationChart(elevation) {
    const ctx = document.getElementById('elevationChart');
    if(!ctx) return;
    
    const context = ctx.getContext('2d');
    
    if(elevationChart) {
        elevationChart.destroy();
        elevationChart = null;
    }
    
    if(!elevationMarker) {
        elevationMarker = L.circleMarker([0, 0], {
            radius: 8,
            fillColor: '#e74c3c',
            color: '#fff',
            weight: 3,
            fillOpacity: 1
        });
    }
    
    elevationChart = new Chart(context, {
        type: 'line', 
        data: {
            labels: elevation.map((_, i) => i),
            datasets: [{
                label: 'Altitud',
                data: elevation,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102,126,234,0.2)',
                fill: true,
                pointRadius: 0,
                tension: 0.4
            }]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false, 
            interaction: {mode: 'index', intersect: false},
            plugins: {legend: {display: false}}, 
            scales: {
                x: {display: false},
                y: {display: false}
            },
            onHover: (event, elements) => {
                if(elements.length > 0 && currentRouteCoords.length > 0) {
                    const idx = Math.floor((elements[0].index / elevation.length) * currentRouteCoords.length);
                    if(currentRouteCoords[idx]) {
                        elevationMarker.setLatLng(currentRouteCoords[idx]).addTo(map);
                    }
                } else {
                    if(elevationMarker && map.hasLayer(elevationMarker)) {
                        map.removeLayer(elevationMarker);
                    }
                }
            }
        }
    });
}

function setupFilters() {
    document.querySelectorAll('.filter-chip').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('.filter-chip').forEach(x => x.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            updateMap();
            updateStationsList();
        });
    });
}

function setupTheme() {
    document.getElementById('btn-dark-mode')?.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    });
    
    // Restaurar tema guardado
    if(localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if(!searchInput) return;
    
    // Usar debounce para optimizar búsqueda
    const debouncedSearch = PerfUtils.debounce((value) => {
        window.searchTerm = value.toLowerCase();
        updateStationsList();
    }, 300);
    
    searchInput.addEventListener('input', e => {
        debouncedSearch(e.target.value);
    });
}

function forceLocate() {
    if(navigator.geolocation) {
        map.locate({setView: false});
    }
}

function toggleHeatmap() {
    if(typeof L === 'undefined' || typeof L.heatLayer === 'undefined') {
        showToast('❌ Heatmap no disponible');
        return;
    }
    
    isHeatmapActive = !isHeatmapActive; 
    document.getElementById('btn-heatmap')?.classList.toggle('active');
    updateMap();
}

function setupDraggableSheet(sheetId, dragZoneId, visibleHeight) {
    const sheet = document.getElementById(sheetId);
    const handle = document.getElementById(dragZoneId);
    
    if(!sheet || !handle) return;
    
    let startY = 0;
    let initialY = 0;
    let isDragging = false;
    
    handle.addEventListener('touchstart', e => {
        isDragging = true;
        startY = e.touches[0].clientY;
        sheet.style.transition = 'none';
        
        const transform = new WebKitCSSMatrix(window.getComputedStyle(sheet).transform);
        initialY = transform.m42;
    }, {passive: false});
    
    window.addEventListener('touchmove', e => {
        if(!isDragging) return;
        
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        const newY = initialY + deltaY;
        
        if(newY >= 0) {
            sheet.style.transform = `translateY(${newY}px)`;
        }
        
        if(e.cancelable) e.preventDefault();
    }, {passive: false});
    
    window.addEventListener('touchend', e => {
        if(!isDragging) return;
        
        isDragging = false;
        sheet.style.transition = 'transform 0.3s ease';
        
        const transform = new WebKetCSSMatrix(window.getComputedStyle(sheet).transform);
        const currentY = transform.m42;
        const closeThreshold = window.innerHeight - visibleHeight;
        
        sheet.style.transform = `translateY(${currentY < closeThreshold / 2 ? 0 : closeThreshold}px)`;
    });
}

// GRÁFICAS REALES (con lazy loading)
async function loadRealCharts(stationId) {
    const historyCanvas = document.getElementById('historyChart');
    const trendCanvas = document.getElementById('trendChart');
    
    if(!historyCanvas || !trendCanvas) return;
    
    PerfUtils.perfMonitor.start('loadCharts');

    // Destruir gráficas anteriores
    if(historyChart) {
        historyChart.destroy();
        historyChart = null;
    }
    
    if(trendChart) {
        trendChart.destroy();
        trendChart = null;
    }
    
    // Mostrar skeleton mientras carga
    historyCanvas.parentElement.classList.add('loading');
    trendCanvas.parentElement.classList.add('loading');

    // 1. HISTORIAL (24h)
    try {
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        
        const {data: history} = await client
            .from('snapshots')
            .select('timestamp, available_bikes')
            .eq('station_id', stationId)
            .gte('timestamp', yesterday.toISOString())
            .order('timestamp', {ascending: true});
        
        const histLabels = (history || []).map(d => 
            new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
        );
        const histData = (history || []).map(d => d.available_bikes);

        historyChart = new Chart(historyCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: histLabels,
                datasets: [{
                    label: 'Bicis disponibles',
                    data: histData,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102,126,234,0.1)',
                    fill: true,
                    pointRadius: 0,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {mode: 'index', intersect: false},
                plugins: {legend: {display: false}},
                scales: {
                    x: {ticks: {maxTicksLimit: 6, maxRotation: 0}},
                    y: {beginAtZero: true}
                }
            }
        });
        
        historyCanvas.parentElement.classList.remove('loading');
    } catch(e) {
        console.error('History chart error:', e);
        historyCanvas.parentElement.classList.remove('loading');
    }

    // 2. PREDICCIÓN IA
    try {
        const now = new Date().toISOString();
        
        const {data: predictions} = await client
            .from('predicciones')
            .select('prediction_date, predicted_bikes')
            .eq('station_id', stationId)
            .gte('prediction_date', now)
            .order('prediction_date', {ascending: true})
            .limit(12);
        
        let predLabels = [];
        let predData = [];
        
        if(predictions && predictions.length > 0) {
            predLabels = predictions.map(d => 
                new Date(d.prediction_date).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
            );
            predData = predictions.map(d => d.predicted_bikes);
        } else {
            // Fallback: generar datos simulados
            const lastValue = currentStation?.available_bikes || 5;
            
            for(let i = 1; i <= 6; i++) {
                const futureTime = new Date();
                futureTime.setHours(futureTime.getHours() + i);
                predLabels.push(futureTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}));
                
                let value = lastValue + Math.floor(Math.random() * 4) - 2;
                if(value < 0) value = 0;
                predData.push(value);
            }
        }

        trendChart = new Chart(trendCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: predLabels,
                datasets: [{
                    label: 'Predicción IA',
                    data: predData,
                    backgroundColor: '#9b59b6',
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {legend: {display: false}},
                scales: {
                    x: {ticks: {maxTicksLimit: 6, maxRotation: 0}},
                    y: {beginAtZero: true}
                }
            }
        });
        
        trendCanvas.parentElement.classList.remove('loading');
    } catch(e) {
        console.error('Prediction chart error:', e);
        trendCanvas.parentElement.classList.remove('loading');
    }
    
    PerfUtils.perfMonitor.end('loadCharts');
}

async function calcIA(dest) {
    const result = document.getElementById('trip-result');
    const loader = document.getElementById('trip-loader');
    const content = document.getElementById('trip-content');
    
    if(result) result.classList.remove('hidden');
    if(loader) loader.classList.remove('hidden');
    if(content) content.innerHTML = '';
    
    if (!userLocation) {
        map.locate();
        showToast('📍 Obteniendo ubicación...');
        return;
    }
    
    try {
        const arrival = new Date();
        arrival.setMinutes(arrival.getMinutes() + 15);
        
        const {data, error} = await client
            .from('predicciones')
            .select('predicted_bikes')
            .eq('station_id', dest.station_id)
            .gte('prediction_date', arrival.toISOString())
            .limit(1);
        
        let availableSlots = dest.available_slots;
        
        if (data && data.length > 0) {
            availableSlots = dest.total_capacity - data[0].predicted_bikes;
        }
        
        const color = availableSlots > 2 ? 'green' : (availableSlots > 0 ? 'orange' : 'red');
        const statusText = availableSlots > 2 ? 'Alta Probabilidad' : 'Riesgo';
        const icon = availableSlots > 2 ? 'check-circle' : 'warning';
        
        if(content) {
            content.innerHTML = `
                <div class="status-pill status-${color}">
                    <i class="ph ph-${icon}"></i> ${statusText}
                </div>
                <div style="font-size:0.9rem; margin-top:8px;">
                    Llegada: <b>${arrival.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</b>
                </div>
                <div style="font-size:0.85rem; color:#666; margin-top:4px;">
                    Se esperan <b>~${Math.max(0, availableSlots)} huecos</b>
                </div>
            `;
        }
    } catch(e) {
        console.error('IA calc error:', e);
        if(content) {
            content.innerHTML = `<div style="color:#e74c3c;">Error en predicción</div>`;
        }
    } finally {
        if(loader) loader.classList.add('hidden');
    }
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}