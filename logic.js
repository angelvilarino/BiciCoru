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
    console.log("🚀 Iniciando BiciAI v3.0 (Mobile Physics)...");
    initMap();
    setupFilters();
    setupTheme();
    setupSearch();
    await loadData();
    setInterval(loadData, 300000); 

    const btnGeo = document.getElementById('btn-geo');
    if (btnGeo) btnGeo.addEventListener('click', () => {
        map.locate({setView: true, maxZoom: 16});
        forceLocate(); // Forzar petición extra por si acaso
    });

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

    // INICIAR LÓGICA MÓVIL
    // SOLO activar físicas si es móvil
    if (window.innerWidth <= 768) {
        setupDraggableSheet('main-panel', 'main-drag-zone', 140);
        setupDraggableSheet('station-card', 'card-drag-zone', 250);
    }
    
    // Pedir GPS al arrancar
    setTimeout(forceLocate, 1000);
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([43.366, -8.410], 13);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
        attribution: '© CARTO', maxZoom: 19 
    }).addTo(map);

    map.on('click', () => clearUI(true));
}

function updateCharts(history, predictions) {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#fff' : '#333';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

    // --- GRÁFICA 1: HISTORIAL ---
    const ctxH = document.getElementById('historyChart').getContext('2d');
    if (historyChart) historyChart.destroy();
    
    // Preparar datos (Labels son timestamps completos)
    const hLabels = history.map(d => new Date(d.timestamp));
    const hData = history.map(d => d.available_bikes);
    const hasData = hData.length > 0;

    historyChart = new Chart(ctxH, {
        type: 'line',
        data: { 
            labels: hLabels, 
            datasets: [{ 
                label: 'Nº Bicicletas',
                data: hData, 
                borderColor: '#667eea', 
                backgroundColor: 'rgba(102,126,234,0.1)', 
                fill: true, 
                tension: 0.3,
                pointRadius: 0, // Quitamos puntos para que se vea más limpio con tantas horas
                pointHoverRadius: 4
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                title: { 
                    display: true, 
                    text: hasData ? 'Historial (24h)' : 'Sin datos recientes', 
                    color: textColor
                },
                tooltip: { 
                    mode: 'index', intersect: false,
                    callbacks: {
                        title: (ctx) => {
                            // Formato tooltip: 14:30
                            const date = new Date(ctx[0].label);
                            return date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                        }
                    }
                } 
            },
            scales: { 
                x: { 
                    type: 'category', // Importante
                    ticks: { 
                        color: textColor, 
                        maxRotation: 0,
                        maxTicksLimit: 24, // Intentar mostrar hasta 24 marcas
                        callback: function(val, index) {
                            // TRUCO: Solo mostrar la etiqueta si es una hora en punto (aprox)
                            // "this.getLabelForValue(val)" nos da la fecha original del array hLabels
                            const date = new Date(this.getLabelForValue(val));
                            const minutes = date.getMinutes();
                            
                            // Mostramos si los minutos son 0, o cercanos a 0 (ej. 0-10) si los datos no son exactos
                            // Y evitamos mostrar demasiadas pegadas.
                            if (index % 4 === 0) { // Ajuste para que no se amontonen (muestra 1 de cada 4 datos aprox)
                                return date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                            }
                            return null; // Ocultar resto
                        }
                    },
                    grid: { display: false }
                }, 
                y: { 
                    ticks: { color: textColor, stepSize: 1 }, 
                    grid: { color: gridColor }, 
                    beginAtZero: true 
                } 
            }
        }
    });

    // --- GRÁFICA 2: PREDICCIÓN (Sin cambios o ajustes similares si quieres) ---
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
                borderRadius: 4 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                title: { display: true, text: 'Predicción Futura', color: textColor }
            },
            scales: { 
                x: { ticks: { color: textColor, maxRotation: 0, autoSkip: true }, grid: { display: false } }, 
                y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true } 
            }
        }
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
    
    // Mostrar contenedor y spinner, limpiar contenido anterior
    res.classList.remove('hidden'); 
    load.classList.remove('hidden'); 
    cont.innerHTML = '';

    if (!userLocation) { 
        map.locate(); 
        load.classList.add('hidden'); // Ocultar spinner si falla
        cont.innerHTML = `<div style="color:var(--text-sub)"><i class="ph ph-warning"></i> Falta ubicación</div>`; 
        return; 
    }
    
    try {
        // 1. Calcular tiempo de llegada estimado
        const straightDistKm = userLocation.distanceTo(L.latLng(dest.latitude, dest.longitude)) / 1000;
        const realDistKm = straightDistKm * 1.4; // Factor de corrección callejeo
        const speedKmH = 4.8; // Velocidad promedio caminando
        const mins = Math.round((realDistKm / speedKmH) * 60);
        
        const arrival = new Date(); 
        arrival.setMinutes(arrival.getMinutes() + mins);
        
        // 2. Consultar Supabase
        const { data, error } = await client.from('predicciones').select('predicted_bikes')
            .eq('station_id', dest.station_id)
            .gte('prediction_date', arrival.toISOString())
            .limit(1);
        
        // --- FIX: OCULTAR SPINNER SIEMPRE AQUÍ ---
        load.classList.add('hidden');

        if (error) throw error;
        
        // 3. Interpretar datos
        let slots = dest.available_slots; // Por defecto usamos datos actuales si no hay predicción
        let predictedBikes = dest.available_bikes;

        if (data && data.length > 0) {
            predictedBikes = data[0].predicted_bikes;
            slots = dest.total_capacity - predictedBikes;
        }
        
        // 4. Generar UI
        const color = slots > 2 ? 'green' : (slots > 0 ? 'orange' : 'red');
        const txt = slots > 2 ? 'Alta Probabilidad' : (slots > 0 ? 'Riesgo Moderado' : 'Muy difícil');
        const icon = slots > 2 ? 'check-circle' : (slots > 0 ? 'warning' : 'x-circle');

        cont.innerHTML = `
            <div class="status-pill status-${color}">
                <i class="ph ph-${icon}"></i> ${txt}
            </div> 
            <div style="font-size:0.9rem; margin-top:8px;">
                Llegada: <b>${arrival.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</b> (~${mins} min)
            </div>
            <div style="font-size:0.85rem; color:var(--text-sub); margin-top:4px;">
                Se esperan <b>~${Math.max(0, slots)} huecos</b> libres
            </div>
        `;

    } catch(e) { 
        console.error(e);
        // --- FIX: OCULTAR SPINNER EN CASO DE ERROR ---
        load.classList.add('hidden');
        cont.innerHTML = `<div style="color:#e74c3c; font-size:0.9rem;">
            <i class="ph ph-warning-circle"></i> No se pudo calcular la predicción
        </div>`; 
    }
}

// 1. CARGA DE DATOS REALES (Últimas 24h)
async function loadRealCharts(stationId) {
    console.log(`📊 Cargando historial 24h para estación ${stationId}...`);
    
    // Calcular fecha de ayer
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    
    // Pedir datos DESDE ayer (gte)
    const { data: rawHistory, error: hError } = await client.from('snapshots')
        .select('timestamp, available_bikes')
        .eq('station_id', stationId)
        .gte('timestamp', yesterday.toISOString()) 
        .order('timestamp', { ascending: true }); // Ordenados por tiempo

    if (hError) console.error("❌ Error Historial:", hError);
    
    const historyData = rawHistory || [];
    console.log(`✅ Puntos encontrados: ${historyData.length}`);

    // Cargar predicciones
    const { data: predData } = await client.from('predicciones')
        .select('prediction_date, predicted_bikes')
        .eq('station_id', stationId)
        .gte('prediction_date', new Date().toISOString())
        .limit(24);

    updateCharts(historyData, predData || []);
    calculatePopularTime(historyData);
}

// 2. MOSTRAR TARJETA (Ocultando la lista de abajo)
function loadStationDetails(s) {
    // TRUCO VISUAL: Ocultamos la lista para que la tarjeta ocupe su lugar perfecto
    document.getElementById('station-list-container').classList.add('hidden'); 
    
    const card = document.getElementById('station-card');
    card.classList.remove('hidden');
    
    currentStation = s;
    
    // Rellenar textos...
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

    // Botones (clonar para limpiar eventos)
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

    // MÓVIL
    if (window.innerWidth <= 768) {
        const visibleHeight = 350; 
        const targetY = card.offsetHeight - visibleHeight;
        card.style.transform = `translateY(${targetY}px)`;
        // Colapsar panel principal
        const mainPanel = document.getElementById('main-panel');
        mainPanel.style.transform = `translateY(${mainPanel.offsetHeight - 140}px)`;
    }

    map.flyTo([s.latitude, s.longitude], 16, { duration: 0.5, paddingBottomRight: [0, 200] });
    setTimeout(() => loadRealCharts(s.station_id), 100);
}

// 3. CERRAR UI (Mostrar lista de nuevo)
function clearUI(closeCard = true) {
    if (routingControl) { 
        try { map.removeControl(routingControl); } catch(e){}
        routingControl = null; 
    }
    document.getElementById('route-panel').classList.add('hidden');
    currentDestCoords = null;
    
    if (closeCard) {
        document.getElementById('station-card').classList.add('hidden');
        // IMPORTANTE: Volver a mostrar la lista al cerrar la tarjeta
        document.getElementById('station-list-container').classList.remove('hidden'); 
        currentStation = null;
    }
}

function calculatePopularTime(history) {
    const box = document.getElementById('popular-time-box');
    
    // Si no hay suficientes datos, ocultamos y salimos
    if (!history || history.length < 5) { 
        box.classList.add('hidden'); 
        return; 
    }
    
    let minBikes = 999;
    let worstTime = null;
    
    // Buscamos el momento con menos bicis
    history.forEach(h => {
        if (h.available_bikes < minBikes) {
            minBikes = h.available_bikes;
            worstTime = new Date(h.timestamp);
        }
    });

    // Solo mostramos si realmente baja mucho (ej: menos de 2 bicis)
    // O si quieres mostrar siempre el mínimo, quita la condición "minBikes < 3"
    if (worstTime) {
        box.classList.remove('hidden');
        // Texto profesional con icono Phosphor
        box.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <i class="ph ph-clock" style="font-size:1.2rem;"></i>
                <span>Hora crítica estimada: <strong>${worstTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong> <span style="opacity:0.8; font-size:0.85em">(Suele vaciarse)</span></span>
            </div>
        `;
    } else {
        box.classList.add('hidden');
    }
}

function updateCharts(history, predictions) {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#fff' : '#333';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

    // --- GRÁFICA 1: HISTORIAL ---
    const ctxH = document.getElementById('historyChart').getContext('2d');
    if (historyChart) historyChart.destroy();
    
    // Preparar datos
    const hLabels = history.map(d => new Date(d.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
    const hData = history.map(d => d.available_bikes);
    
    // Si no hay datos, ponemos un array vacío para que no falle, pero el título avisará
    const hasData = hData.length > 0;

    historyChart = new Chart(ctxH, {
        type: 'line',
        data: { 
            labels: hLabels, 
            datasets: [{ 
                label: 'Nº Bicicletas Disponibles', // ETIQUETA CLARA
                data: hData, 
                borderColor: '#667eea', 
                backgroundColor: 'rgba(102,126,234,0.1)', 
                fill: true, 
                tension: 0.3,
                pointRadius: hasData ? 3 : 0
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                title: { 
                    display: true, 
                    // TÍTULO EXPLÍCITO
                    text: hasData ? 'Historial: Bicicletas (últimas 24h)' : 'Sin datos de historial recientes', 
                    color: textColor,
                    font: { size: 14 }
                },
                tooltip: { 
                    mode: 'index', intersect: false,
                    callbacks: {
                        label: (ctx) => `🚲 ${ctx.raw} bicis disponibles`
                    }
                } 
            },
            scales: { 
                x: { ticks: { color: textColor, maxTicksLimit: 6 }, grid: { display: false } }, 
                y: { 
                    ticks: { color: textColor, stepSize: 1 }, 
                    grid: { color: gridColor }, 
                    beginAtZero: true,
                    title: { display: true, text: 'Cantidad Bicis', color: textColor } // Eje Y explicado
                } 
            }
        }
    });

    // --- GRÁFICA 2: PREDICCIÓN ---
    const ctxT = document.getElementById('trendChart').getContext('2d');
    if (trendChart) trendChart.destroy();
    
    const pLabels = predictions.map(d => new Date(d.prediction_date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
    const pData = predictions.map(d => d.predicted_bikes);

    trendChart = new Chart(ctxT, {
        type: 'bar',
        data: { 
            labels: pLabels, 
            datasets: [{ 
                label: 'Predicción Bicis', // ETIQUETA CLARA
                data: pData, 
                backgroundColor: '#667eea', 
                borderRadius: 4 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                title: { 
                    display: true, 
                    text: predictions.length ? 'Futuro: Bicis estimadas' : 'Calculando predicciones...', 
                    color: textColor 
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `🔮 Esperamos ${ctx.raw} bicis` 
                    }
                }
            },
            scales: { 
                x: { ticks: { color: textColor, maxRotation: 0, autoSkip: true }, grid: { display: false } }, 
                y: { 
                    ticks: { color: textColor }, 
                    grid: { color: gridColor }, 
                    beginAtZero: true,
                    title: { display: true, text: 'Bicis estimadas', color: textColor }
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

// === SISTEMA DE ARRASTRE AVANZADO (BOTTOM SHEET) ===
function setupDraggableSheet(sheetId, dragZoneId, initialVisibleHeight) {
    const sheet = document.getElementById(sheetId);
    const handle = document.getElementById(dragZoneId);
    
    if (!sheet || !handle) return;

    // Puntos de anclaje (Snap Points)
    // TOP: Abierto del todo (0px)
    // MIDDLE: Mitad de pantalla
    // BOTTOM: Colapsado (solo asoma un poco)
    const getSnapPoints = () => {
        const h = sheet.offsetHeight;
        return {
            top: 0,
            middle: h * 0.5, // 50% de la altura
            bottom: h - initialVisibleHeight
        };
    };

    let startY = 0;
    let currentTranslate = getSnapPoints().bottom;
    let isDragging = false;
    let startTime = 0;

    // Inicializar posición
    updatePosition(currentTranslate);

    // INICIO ARRASTRE
    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        startY = e.touches[0].clientY;
        
        // Leer posición actual real
        const style = window.getComputedStyle(sheet);
        const matrix = new WebKitCSSMatrix(style.transform);
        currentTranslate = matrix.m42; 
        
        sheet.classList.add('is-dragging'); // Desactivar transición para fluidez
        startTime = new Date().getTime();
    }, {passive: true});

    // DURANTE ARRASTRE
    handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const deltaY = e.touches[0].clientY - startY;
        let newY = currentTranslate + deltaY;

        // Límites elásticos
        if (newY < 0) newY = newY * 0.2; // Resistencia al tirar hacia arriba del todo
        
        sheet.style.transform = `translateY(${newY}px)`;
    }, {passive: true});

    // FIN ARRASTRE (SNAP)
    handle.addEventListener('touchend', (e) => {
        isDragging = false;
        sheet.classList.remove('is-dragging');
        
        const endY = e.changedTouches[0].clientY;
        const totalDelta = endY - startY;
        const time = new Date().getTime() - startTime;
        
        // Leer dónde quedó
        const style = window.getComputedStyle(sheet);
        const matrix = new WebKitCSSMatrix(style.transform);
        const finalTranslate = matrix.m42;
        
        const snaps = getSnapPoints();
        const velocity = Math.abs(totalDelta) / time;
        let target = finalTranslate;

        // Lógica de decisión: ¿A dónde va la tarjeta?
        if (velocity > 0.5) {
            // Flick rápido
            if (totalDelta > 0) target = snaps.bottom; // Hacia abajo -> Cerrar
            else target = snaps.top; // Hacia arriba -> Abrir
        } else {
            // Movimiento lento -> Ir al punto más cercano
            const distTop = Math.abs(finalTranslate - snaps.top);
            const distMid = Math.abs(finalTranslate - snaps.middle);
            const distBot = Math.abs(finalTranslate - snaps.bottom);
            
            const min = Math.min(distTop, distMid, distBot);
            if (min === distTop) target = snaps.top;
            else if (min === distMid) target = snaps.middle;
            else target = snaps.bottom;
        }

        updatePosition(target);
        currentTranslate = target;
    });

    function updatePosition(y) {
        sheet.style.transform = `translateY(${y}px)`;
    }
}

// === HELPER PARA GPS ===
function forceLocate() {
    if (!navigator.geolocation) return;
    map.locate({setView: false, enableHighAccuracy: true});
}

window.onload = init;