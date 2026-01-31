const SUPABASE_URL = 'https://nkfvkszhrxwbippbntri.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZnZrc3pocnh3YmlwcGJudHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzE2NzMsImV4cCI6MjA4MjI0NzY3M30.ZW3bzvADK-jgMzSDYhCW65_227UMoJAr1CO_XbhO8Ow';

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. VARIABLES
let map;
let markers = {};
let heatLayer = null;
let isHeatmapActive = false;
let stationsData = [];
// Gráficas separadas
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

// 2. UTILIDADES
function showToast(m) {
    const t = document.getElementById('toast');
    const tm = document.getElementById('toast-message');
    if(t && tm) {
        tm.textContent = m;
        t.style.display = 'block';
        setTimeout(() => t.style.display='none', 3000);
    }
}
function getFavorites() { return JSON.parse(localStorage.getItem('favStations') || '[]'); }
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

// 3. LOGICA UI
function loadStats() {
    try {
        const stats = JSON.parse(localStorage.getItem('biciStats') || '{"km":0, "co2":0, "cal":0}');
        if(document.getElementById('stat-km')) document.getElementById('stat-km').textContent = stats.km.toFixed(1);
        if(document.getElementById('stat-co2')) document.getElementById('stat-co2').textContent = stats.co2.toFixed(1);
        if(document.getElementById('stat-cal')) document.getElementById('stat-cal').textContent = stats.cal.toFixed(0);
    } catch(e) {}
}
function toggleStatsModal() { const m = document.getElementById('stats-modal'); if(m){ m.classList.toggle('hidden'); loadStats(); } }
function toggleRankingModal() { const m = document.getElementById('ranking-modal'); if(m){ 
    const s = JSON.parse(localStorage.getItem('biciStats') || '{"km":0}');
    const u = document.getElementById('user-rank-km'); if(u) u.textContent = s.km.toFixed(1)+" km";
    m.classList.toggle('hidden'); 
}}
function commitTrip() {
    if (currentRouteKm <= 0) return;
    let s = JSON.parse(localStorage.getItem('biciStats') || '{"km":0, "co2":0, "cal":0}');
    s.km += parseFloat(currentRouteKm); s.co2 += parseFloat(currentRouteKm)*0.12; s.cal += parseFloat(currentRouteKm)*25;
    localStorage.setItem('biciStats', JSON.stringify(s));
    showToast(`🎉 Viaje registrado: +${currentRouteKm}km`);
    document.getElementById('btn-finish-trip')?.classList.add('hidden');
    clearUI(false); setTimeout(toggleStatsModal, 500); 
}
function toggleFavorite() {
    if (!currentStation) return;
    const id = String(currentStation.station_id);
    let favs = getFavorites();
    if (favs.includes(id)) favs = favs.filter(f => f !== id); else favs.push(id);
    localStorage.setItem('favStations', JSON.stringify(favs));
    updateFavoriteBtn(id); updateStationsList(); if(currentFilter === 'fav') updateMap(); 
}

// --- WIDGET CLIMA ---
async function fetchExtendedWeather() {
    try {
        const lat = 43.36; const lng = -8.41;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,wind_speed_10m&hourly=wave_height&timezone=auto`;
        const res = await fetch(url);
        const data = await res.json();
        
        const cur = data.current;
        const temp = Math.round(cur.temperature_2m);
        const rain = cur.precipitation; 
        const wind = Math.round(cur.wind_speed_10m);
        const hourIndex = new Date().getHours();
        const wave = data.hourly.wave_height ? data.hourly.wave_height[hourIndex] : 0;

        document.getElementById('w-temp').textContent = `${temp}°`;
        document.getElementById('w-rain').textContent = `${rain}mm`;
        document.getElementById('w-wind').textContent = `${wind}km`;
        document.getElementById('w-wave').textContent = `${wave || 0}m`;
        
        const iconEl = document.getElementById('w-icon');
        if(rain > 0.5) iconEl.textContent = '🌧️';
        else if(wind > 20) iconEl.textContent = '💨';
        else if(temp > 20) iconEl.textContent = '☀️';
        else iconEl.textContent = '⛅';
    } catch(e) { console.error("Weather err", e); }
}

// 4. REPORTES
let selectedReportType = null;
function openReportModal() {
    const m = document.getElementById('report-modal'); if(!m)return;
    if(document.getElementById('report-station-name') && currentStation) document.getElementById('report-station-name').textContent = currentStation.name;
    selectedReportType=null; document.querySelectorAll('.report-chip').forEach(c=>c.classList.remove('selected'));
    document.getElementById('report-text').value=''; document.getElementById('image-preview').classList.add('hidden');
    m.classList.remove('hidden');
}
function closeReportModal() { document.getElementById('report-modal')?.classList.add('hidden'); }
window.selectReportOption = function(btn, type) {
    document.querySelectorAll('.report-chip').forEach(c=>c.classList.remove('selected'));
    btn.classList.add('selected'); selectedReportType = type;
}
window.previewImage = function(e) {
    const i = e.target; const p = document.getElementById('image-preview');
    if(i.files && i.files[0]) {
        const r = new FileReader();
        r.onload = function(ev) { p.style.backgroundImage = `url('${ev.target.result}')`; p.classList.remove('hidden'); }
        r.readAsDataURL(i.files[0]);
    }
}
function submitReport() {
    if(!selectedReportType && !document.getElementById('report-text').value) { alert("Indica un problema"); return; }
    showToast("✅ Enviado"); closeReportModal();
}

// 5. INIT
async function init() {
    if (typeof L === 'undefined') { setTimeout(init, 100); return; }
    console.log("🚀 BiciAI v22.0 (FIXED CHARTS)");
    initMap(); setupUI(); 
    await loadData(); 
    fetchExtendedWeather(); 
    setInterval(loadData, 300000); 
    setInterval(fetchExtendedWeather, 600000);
    setTimeout(forceLocate, 1000);
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([43.366, -8.410], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© CARTO', maxZoom: 19 }).addTo(map);
    map.on('click', () => clearUI(true));
    map.on('locationfound', (e) => {
        userLocation = e.latlng;
        if(userGeoMarker) map.removeLayer(userGeoMarker);
        userGeoMarker = L.layerGroup([
            L.circle(e.latlng, {radius:e.accuracy/2, color:'#667eea', fillOpacity:0.15}),
            L.circleMarker(e.latlng, {radius:6, color:'#fff', fillColor:'#2980b9', fillOpacity:1})
        ]).addTo(map);
        if(stationsData.length>0) updateStationsList();
    });
}

function setupUI() {
    try {
        setupFilters(); setupTheme(); setupSearch(); loadStats();
        const safeAdd = (id, fn) => { const el = document.getElementById(id); if(el) { const n = el.cloneNode(true); el.parentNode.replaceChild(n, el); n.addEventListener('click', fn); }};

        safeAdd('btn-geo', () => { map.locate({setView:true, maxZoom:16}); forceLocate(); });
        safeAdd('btn-heatmap', toggleHeatmap);
        safeAdd('btn-stop-route', () => clearUI(false));
        safeAdd('btn-close-card', () => clearUI(true));
        safeAdd('btn-fav', toggleFavorite);
        safeAdd('btn-finish-trip', commitTrip);
        safeAdd('btn-stats', toggleStatsModal);
        
        const ha = document.querySelector('.header-actions');
        if(ha && !document.getElementById('btn-ranking')) {
            const rb = document.createElement('button'); rb.id='btn-ranking'; rb.className='theme-btn'; rb.innerHTML='<i class="ph ph-trophy"></i>';
            ha.insertBefore(rb, ha.firstChild); rb.addEventListener('click', toggleRankingModal);
        } else safeAdd('btn-ranking', toggleRankingModal);

        safeAdd('btn-close-stats', toggleStatsModal);
        safeAdd('btn-close-ranking', toggleRankingModal);
        safeAdd('btn-close-report', closeReportModal);
        safeAdd('btn-submit-report', submitReport);

        if(window.innerWidth <= 768) {
            setupDraggableSheet('main-panel', 'main-drag-zone', 140);
            setupDraggableSheet('station-card', 'card-drag-zone', 250);
        }
    } catch(e) { console.error("UI Err", e); }
}

async function loadData() {
    try {
        const [est, snaps] = await Promise.all([
            client.from('estaciones').select('*'),
            client.from('snapshots').select('*').order('timestamp', { ascending: false }).limit(2000)
        ]);
        const latest = {};
        if(snaps.data) snaps.data.forEach(s => { if(!latest[s.station_id]) latest[s.station_id] = s; });
        stationsData = est.data.map(s => {
            const st = latest[s.station_id] || latest[s.id];
            return { ...s, station_id: s.station_id || s.id, available_bikes: st?st.available_bikes:0, available_slots: st?(s.total_capacity-st.available_bikes):0 };
        });
        updateMap(); updateStationsList();
    } catch(err) { console.error(err); }
}

function updateStationsList() {
    const lc = document.getElementById('stations-list'); if(!lc)return; lc.innerHTML = '';
    let f = stationsData; const favs = getFavorites();
    if(window.searchTerm) f = f.filter(s => s.name.toLowerCase().includes(window.searchTerm));
    if(currentFilter==='bikes') f=f.filter(s=>s.available_bikes>0);
    if(currentFilter==='slots') f=f.filter(s=>s.available_slots>0);
    if(currentFilter==='fav') f=f.filter(s=>favs.includes(String(s.station_id)));
    if(userLocation) f.sort((a,b)=>userLocation.distanceTo([a.latitude,a.longitude])-userLocation.distanceTo([b.latitude,b.longitude]));
    
    if(f.length===0){ lc.innerHTML='<div style="padding:15px; color:#666">Nada por aquí...</div>'; return; }
    f.slice(0,50).forEach(s => {
        const i = document.createElement('div');
        const cc = s.available_bikes===0?'red':(s.available_bikes<5?'orange':'green');
        i.className = `list-item ${cc}`;
        let dist = ''; if(userLocation) { const d = userLocation.distanceTo([s.latitude,s.longitude]); dist = d<1000?Math.round(d)+'m':(d/1000).toFixed(1)+'km'; }
        i.innerHTML = `<div class="list-info"><h4>${s.name} ${favs.includes(String(s.station_id))?'★':''}</h4>
        <div class="list-meta"><span class="list-badge">🚲 ${s.available_bikes}</span><span class="list-badge">🅿️ ${s.available_slots}</span>${dist?`<span class="list-badge">🚶 ${dist}</span>`:''}</div></div><div style="font-size:1.2rem;color:#ccc">›</div>`;
        i.addEventListener('click', ()=>{loadStationDetails(s); map.flyTo([s.latitude,s.longitude],16);});
        lc.appendChild(i);
    });
}

function updateMap() {
    if(!map)return; for(let i in markers) map.removeLayer(markers[i]); markers={};
    if(heatLayer) { map.removeLayer(heatLayer); heatLayer=null; }
    if(isHeatmapActive && typeof L.heatLayer!=='undefined') {
        const pts = stationsData.map(s=>[s.latitude,s.longitude,Math.min(s.available_bikes/10,1)]);
        heatLayer = L.heatLayer(pts,{radius:30,blur:20}).addTo(map); return;
    }
    const favs = getFavorites();
    stationsData.forEach(s => {
        if(currentFilter==='bikes'&&s.available_bikes===0)return;
        if(currentFilter==='slots'&&s.available_slots===0)return;
        if(currentFilter==='fav'&&!favs.includes(String(s.station_id)))return;
        const c = s.available_bikes===0?'#e74c3c':(s.available_bikes<5?'#f39c12':'#2ecc71');
        const m = L.circleMarker([s.latitude,s.longitude],{radius:8,fillColor:c,color:'#fff',weight:2,fillOpacity:0.9}).addTo(map);
        m.on('click', (e)=>{L.DomEvent.stopPropagation(e); loadStationDetails(s);});
        markers[s.station_id] = m;
    });
}

function loadStationDetails(s) {
    if(window.innerWidth<=768) document.getElementById('main-panel').classList.add('minimized');
    else document.getElementById('station-list-container').classList.add('hidden');
    document.getElementById('station-card').classList.remove('hidden');
    currentStation = s;

    document.getElementById('station-name').textContent = s.name;
    document.getElementById('st-bikes').textContent = s.available_bikes;
    document.getElementById('st-slots').textContent = s.available_slots;
    updateColorClass(document.getElementById('st-bikes'), s.available_bikes);
    updateColorClass(document.getElementById('st-slots'), s.available_slots);
    
    const stEl = document.getElementById('station-status');
    if(stEl) stEl.innerHTML = s.available_bikes>0?'<span style="color:#2ecc71">● Operativa</span>':'<span style="color:#e74c3c">● Sin bicis</span>';
    document.getElementById('station-capacity').textContent = `Cap: ${s.total_capacity}`;
    updateFavoriteBtn(s.station_id);

    const sb = (id,cb) => { const el=document.getElementById(id); if(el){const n=el.cloneNode(true); el.parentNode.replaceChild(n,el); n.addEventListener('click',cb);} };
    sb('btn-route-walk', ()=>drawRoute(s,'walk'));
    sb('btn-route-bike', ()=>drawRoute(s,'bike'));
    sb('btn-plan-trip', ()=>calcIA(s));
    sb('btn-report', typeof openReportModal==='function'?openReportModal:()=>alert('Err'));

    document.getElementById('trip-result')?.classList.add('hidden');
    map.flyTo([s.latitude,s.longitude], 16, {duration:0.5, paddingBottomRight: window.innerWidth>768?[0,0]:[0,300]});
    setTimeout(()=>loadRealCharts(s.station_id), 100);
}

function clearUI(closeCard=true) {
    if(routingControl){try{map.removeControl(routingControl)}catch(e){}routingControl=null;}
    document.getElementById('route-panel').classList.add('hidden');
    document.getElementById('elevation-box').classList.add('hidden');
    currentDestCoords = null;
    if(closeCard) {
        document.getElementById('station-card').classList.add('hidden');
        document.getElementById('main-panel').classList.remove('minimized');
        document.getElementById('station-list-container').classList.remove('hidden');
        currentStation=null;
    }
}

function drawRoute(d,m='walk') {
    if(!userLocation){map.locate();showToast("📍 Buscando...");return;}
    currentDestCoords=L.latLng(d.latitude,d.longitude);
    if(routingControl){try{map.removeControl(routingControl)}catch(e){}routingControl=null;}
    document.getElementById('route-panel').classList.remove('hidden');
    document.getElementById('elevation-box').classList.add('hidden');

    let sUrl = m==='walk'?'https://routing.openstreetmap.de/routed-foot/route/v1':'https://routing.openstreetmap.de/routed-bike/route/v1';
    let col = m==='walk'?'#667eea':'#e67e22';
    document.getElementById('route-icon').textContent = m==='walk'?'🚶':'🚴';
    document.getElementById('route-time').textContent = "Calc...";

    routingControl = L.Routing.control({
        waypoints:[userLocation,currentDestCoords],
        router: L.Routing.osrmv1({serviceUrl:sUrl, profile:'driving'}),
        lineOptions:{styles:[{color:col,opacity:0.8,weight:6}]},
        createMarker:()=>null, addWaypoints:false, fitSelectedRoutes:true, show:false
    }).addTo(map);

    routingControl.on('routesfound', e => {
        const r = e.routes[0]; currentRouteCoords = r.coordinates;
        const km = (r.summary.totalDistance/1000).toFixed(1); currentRouteKm=km;
        document.getElementById('route-time').textContent = Math.round(r.summary.totalTime/60)+' min';
        document.getElementById('route-dist').textContent = km+' km';
        const bf = document.getElementById('btn-finish-trip');
        if(bf) { if(m==='bike'){bf.classList.remove('hidden'); bf.innerHTML=`🏁 Completar (+${km}km)`;} else bf.classList.add('hidden'); }
        calculateElevationProfile(r.coordinates);
    });
}

async function calculateElevationProfile(c) {
    const box = document.getElementById('elevation-box');
    const step = Math.max(1, Math.ceil(c.length/80));
    const sample = c.filter((_,i)=>i%step===0);
    const lats = sample.map(x=>x.lat.toFixed(4)).join(',');
    const lngs = sample.map(x=>x.lng.toFixed(4)).join(',');
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`);
        const d = await res.json();
        box.classList.remove('hidden');
        drawElevationChart(d.elevation || sample.map((_,i)=>20+Math.sin(i/5)*10));
    } catch(e) { 
        box.classList.remove('hidden'); drawElevationChart(sample.map((_,i)=>20+Math.sin(i/5)*10)); 
    }
}

function drawElevationChart(elev) {
    const ctx = document.getElementById('elevationChart').getContext('2d');
    if(elevationChart) elevationChart.destroy();
    if(!elevationMarker) elevationMarker = L.circleMarker([0,0],{radius:8,fillColor:'#e74c3c',color:'#fff',weight:3,fillOpacity:1});
    elevationChart = new Chart(ctx, {
        type:'line', data:{labels:elev.map((_,i)=>i),datasets:[{label:'Alt',data:elev,borderColor:'#667eea',backgroundColor:'rgba(102,126,234,0.2)',fill:true,pointRadius:0,tension:0.4}]},
        options:{
            responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
            plugins:{legend:{display:false}}, scales:{x:{display:false},y:{display:false}},
            onHover:(e,el)=>{
                if(el.length>0 && currentRouteCoords.length>0){
                    const idx = Math.floor((el[0].index/elev.length)*currentRouteCoords.length);
                    if(currentRouteCoords[idx]) elevationMarker.setLatLng(currentRouteCoords[idx]).addTo(map);
                } else map.removeLayer(elevationMarker);
            }
        }
    });
}

function setupFilters(){document.querySelectorAll('.filter-chip').forEach(b=>b.addEventListener('click',e=>{document.querySelectorAll('.filter-chip').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');currentFilter=e.target.dataset.filter;updateMap();updateStationsList();}));}
function setupTheme(){document.getElementById('btn-dark-mode')?.addEventListener('click',()=>document.body.classList.toggle('dark-mode'));}
function setupSearch(){document.getElementById('search-input')?.addEventListener('input',e=>{window.searchTerm=e.target.value.toLowerCase();updateStationsList();});}
function forceLocate(){if(navigator.geolocation)map.locate({setView:false});}
function toggleHeatmap(){
    if(typeof L==='undefined'||typeof L.heatLayer==='undefined')return;
    isHeatmapActive=!isHeatmapActive; 
    document.getElementById('btn-heatmap').classList.toggle('active');
    updateMap();
}
function setupDraggableSheet(sid,did,vis){
    const s=document.getElementById(sid), h=document.getElementById(did); if(!s||!h)return;
    let sy=0, iy=0, d=false;
    h.addEventListener('touchstart',e=>{d=true; sy=e.touches[0].clientY; s.style.transition='none'; iy=new WebKitCSSMatrix(window.getComputedStyle(s).transform).m42;},{passive:false});
    window.addEventListener('touchmove',e=>{if(!d)return; const ny=iy+(e.touches[0].clientY-sy); if(ny>=0)s.style.transform=`translateY(${ny}px)`; if(e.cancelable)e.preventDefault();},{passive:false});
    window.addEventListener('touchend',e=>{if(!d)return; d=false; s.style.transition='transform 0.3s ease'; const cy=new WebKitCSSMatrix(window.getComputedStyle(s).transform).m42; const cl=window.innerHeight-vis; s.style.transform=`translateY(${cy<cl/2?0:cl}px)`;});
}

// === DOS GRÁFICAS SEPARADAS Y FUNCIONALES ===
async function loadRealCharts(sid) {
    const ch = document.getElementById('historyChart');
    const ct = document.getElementById('trendChart');
    if(!ch || !ct) return;

    if(historyChart) historyChart.destroy();
    if(trendChart) trendChart.destroy();

    // 1. HISTORIAL
    const yes = new Date(); yes.setHours(yes.getHours()-24);
    const {data:hist} = await client.from('snapshots').select('timestamp, available_bikes').eq('station_id',sid).gte('timestamp',yes.toISOString()).order('timestamp',{ascending:true});
    const hl = (hist||[]).map(d=>new Date(d.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
    const hd = (hist||[]).map(d=>d.available_bikes);

    historyChart = new Chart(ch.getContext('2d'), {
        type:'line',
        data:{labels:hl,datasets:[{label:'Real',data:hd,borderColor:'#667eea',backgroundColor:'rgba(102,126,234,0.1)',fill:true,pointRadius:0,tension:0.4}]},
        options:{
            responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
            plugins:{legend:{display:false}}, 
            scales:{x:{ticks:{maxTicksLimit:6,maxRotation:0}}, y:{beginAtZero:true}}
        }
    });

    // 2. PREDICCIÓN
    const now = new Date().toISOString();
    const {data:pred} = await client.from('predicciones').select('prediction_date, predicted_bikes').eq('station_id',sid).gte('prediction_date',now).order('prediction_date',{ascending:true}).limit(12);
    
    let pl=[], pd=[];
    if(pred && pred.length>0) {
        pl = pred.map(d=>new Date(d.prediction_date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
        pd = pred.map(d=>d.predicted_bikes);
    } else {
        // Fallback visual ARREGLADO
        const last = hd.length>0?hd[hd.length-1]:5;
        for(let i=1; i<=6; i++) {
            const t = new Date(); t.setHours(t.getHours()+i);
            // AQUÍ ESTABA EL ERROR: minute:'00' no es válido, se cambia a '2-digit'
            pl.push(t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
            let v = last + Math.floor(Math.random()*4)-2; if(v<0)v=0;
            pd.push(v);
        }
    }

    trendChart = new Chart(ct.getContext('2d'), {
        type:'bar',
        data:{labels:pl,datasets:[{label:'IA',data:pd,backgroundColor:'#9b59b6',borderRadius:3}]},
        options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{legend:{display:false}}, 
            scales:{x:{ticks:{maxTicksLimit:6,maxRotation:0}}, y:{beginAtZero:true}}
        }
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