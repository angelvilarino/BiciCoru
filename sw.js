/**
 * 📦 SERVICE WORKER - MODO OFFLINE (#5)
 * PWA con cache-first strategy
 */

const CACHE_VERSION = 'pedalia-v1.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Archivos estáticos para cachear
const STATIC_FILES = [
    './',
    './index.html',
    './style.css',
    './features-styles.css',
    './logic.js',
    './ui-integrations.js',
    './performance-utils.js',
    './dashboard.js',
    './recommender.js',
    './error-handler.js',
    './manifest.json'
];

// Recursos externos críticos
const EXTERNAL_RESOURCES = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// ====== INSTALACIÓN ======
self.addEventListener('install', event => {
    console.log('[SW] Instalando Service Worker...');
    
    event.waitUntil(
        Promise.all([
            // Cache de archivos estáticos
            caches.open(STATIC_CACHE).then(cache => {
                console.log('[SW] Cacheando archivos estáticos');
                return cache.addAll([...STATIC_FILES, ...EXTERNAL_RESOURCES].map(url => {
                    return new Request(url, { cache: 'reload' });
                })).catch(err => {
                    console.warn('[SW] Error al cachear algunos archivos:', err);
                });
            }),
            
            // Forzar activación inmediata
            self.skipWaiting()
        ])
    );
});

// ====== ACTIVACIÓN ======
self.addEventListener('activate', event => {
    console.log('[SW] Activando Service Worker...');
    
    event.waitUntil(
        Promise.all([
            // Limpiar caches antiguos
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('bicoruna-') && name !== STATIC_CACHE && name !== DATA_CACHE && name !== IMAGE_CACHE)
                        .map(name => {
                            console.log('[SW] Eliminando cache antigua:', name);
                            return caches.delete(name);
                        })
                );
            }),
            
            // Tomar control inmediato
            self.clients.claim()
        ])
    );
});

// ====== FETCH - ESTRATEGIAS DE CACHE ======
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorar extensiones de navegador
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
        return;
    }
    
    // Estrategia según tipo de recurso
    if (request.method !== 'GET') {
        // No cachear POST/PUT/DELETE
        return;
    }
    
    // API de BiciCoruña - Network First con fallback
    if (url.href.includes('apicoruna.com') || url.href.includes('citybik.es')) {
        event.respondWith(networkFirstStrategy(request, DATA_CACHE, 15 * 60 * 1000)); // 15 min
        return;
    }
    
    // API de OpenWeather - Network First con fallback
    if (url.href.includes('openweathermap.org')) {
        event.respondWith(networkFirstStrategy(request, DATA_CACHE, 30 * 60 * 1000)); // 30 min
        return;
    }
    
    // Imágenes - Cache First
    if (request.destination === 'image') {
        event.respondWith(cacheFirstStrategy(request, IMAGE_CACHE));
        return;
    }
    
    // Archivos estáticos locales - Network First con fallback a cache
    if (STATIC_FILES.some(file => url.pathname === file) || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html')) {
        event.respondWith(networkFirstStrategy(request, STATIC_CACHE, 5 * 60 * 1000));
        return;
    }
    
    if (EXTERNAL_RESOURCES.some(res => url.href === res)) {
        event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
        return;
    }
    
    // Por defecto - Network First
    event.respondWith(networkFirstStrategy(request, DATA_CACHE, 5 * 60 * 1000)); // 5 min
});

// ====== ESTRATEGIA: CACHE FIRST ======
async function cacheFirstStrategy(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
        console.log('[SW] Cache hit:', request.url);
        return cached;
    }
    
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.error('[SW] Fetch failed:', error);
        
        // Fallback a página offline si existe
        if (request.destination === 'document') {
            const offlinePage = await cache.match('/offline.html');
            if (offlinePage) return offlinePage;
        }
        
        throw error;
    }
}

// ====== ESTRATEGIA: NETWORK FIRST ======
async function networkFirstStrategy(request, cacheName, maxAge = 5 * 60 * 1000) {
    const cache = await caches.open(cacheName);
    
    try {
        const response = await fetch(request, { timeout: 5000 });
        
        if (response.ok) {
            // Cachear respuesta con timestamp
            const responseToCache = response.clone();
            const headers = new Headers(responseToCache.headers);
            headers.append('sw-cached-time', Date.now().toString());
            
            const cachedResponse = new Response(responseToCache.body, {
                status: responseToCache.status,
                statusText: responseToCache.statusText,
                headers: headers
            });
            
            cache.put(request, cachedResponse);
        }
        
        return response;
    } catch (error) {
        console.warn('[SW] Network failed, trying cache:', request.url);
        
        const cached = await cache.match(request);
        
        if (cached) {
            // Verificar edad del cache
            const cachedTime = cached.headers.get('sw-cached-time');
            if (cachedTime) {
                const age = Date.now() - parseInt(cachedTime);
                if (age > maxAge) {
                    console.warn('[SW] Cache expired:', request.url);
                }
            }
            
            return cached;
        }
        
        throw error;
    }
}

// ====== BACKGROUND SYNC ======
self.addEventListener('sync', event => {
    console.log('[SW] Background sync:', event.tag);
    
    if (event.tag === 'sync-trips') {
        event.waitUntil(syncTrips());
    }
});

async function syncTrips() {
    try {
        const trips = await getUnsyncedTrips();
        
        for (const trip of trips) {
            try {
                const response = await fetch('/api/trips', {
                    method: 'POST',
                    body: JSON.stringify(trip),
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.ok) {
                    await markTripSynced(trip.id);
                }
            } catch (error) {
                console.error('[SW] Error syncing trip:', error);
            }
        }
    } catch (error) {
        console.error('[SW] Sync failed:', error);
    }
}

async function getUnsyncedTrips() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['trips'], 'readonly');
        const store = transaction.objectStore('trips');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result.filter(t => !t.synced));
        request.onerror = () => reject(request.error);
    });
}

async function markTripSynced(tripId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['trips'], 'readwrite');
        const store = transaction.objectStore('trips');
        const request = store.get(tripId);
        
        request.onsuccess = () => {
            const trip = request.result;
            trip.synced = true;
            store.put(trip);
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('BiciCorunaDB', 1);
        
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('trips')) {
                db.createObjectStore('trips', { keyPath: 'id', autoIncrement: true });
            }
        };
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ====== MENSAJES ======
self.addEventListener('message', event => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(names => {
                return Promise.all(names.map(name => caches.delete(name)));
            })
        );
    }
});

// ====== NOTIFICACIONES PUSH ======
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    
    const options = {
        body: data.body || 'Nueva notificación de BiciCoruña',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'BiciCoruña AI', options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});

console.log('[SW] Service Worker cargado');
