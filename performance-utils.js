/**
 * ⚡ PERFORMANCE UTILITIES (#9)
 * Utilidades para optimización de rendimiento
 */

// ====== DEBOUNCE ======
/**
 * Retrasa la ejecución de una función hasta que pasen X ms sin llamarla
 * Útil para: búsqueda, resize, scroll
 */
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ====== THROTTLE ======
/**
 * Limita la ejecución de una función a una vez cada X ms
 * Útil para: scroll events, mouse move
 */
function throttle(func, limit = 100) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ====== CACHE CON TTL ======
/**
 * Sistema de caché con tiempo de vida (Time To Live)
 */
class CacheManager {
    constructor() {
        this.cache = new Map();
    }

    set(key, value, ttl = 120000) { // TTL por defecto: 2 minutos
        const expires = Date.now() + ttl;
        this.cache.set(key, { value, expires });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }

    has(key) {
        return this.get(key) !== null;
    }

    clear() {
        this.cache.clear();
    }

    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expires) {
                this.cache.delete(key);
            }
        }
    }
}

// Instancia global del cache
const cache = new CacheManager();

// Limpieza automática cada 5 minutos
setInterval(() => cache.cleanup(), 300000);

// ====== MEMOIZACIÓN ======
/**
 * Memoriza resultados de funciones costosas
 */
function memoize(fn) {
    const cache = new Map();
    return function(...args) {
        const key = JSON.stringify(args);
        if (cache.has(key)) {
            return cache.get(key);
        }
        const result = fn.apply(this, args);
        cache.set(key, result);
        return result;
    };
}

// ====== LAZY LOADING DE IMÁGENES ======
/**
 * Carga imágenes cuando están cerca del viewport
 */
function setupLazyLoading() {
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    observer.unobserve(img);
                }
            });
        });

        document.querySelectorAll('img.lazy').forEach(img => {
            imageObserver.observe(img);
        });
    }
}

// ====== BATCH UPDATES ======
/**
 * Agrupa múltiples actualizaciones del DOM en una sola
 */
class BatchUpdater {
    constructor() {
        this.queue = [];
        this.scheduled = false;
    }

    add(callback) {
        this.queue.push(callback);
        if (!this.scheduled) {
            this.scheduled = true;
            requestAnimationFrame(() => this.flush());
        }
    }

    flush() {
        this.queue.forEach(callback => callback());
        this.queue = [];
        this.scheduled = false;
    }
}

const batchUpdater = new BatchUpdater();

// ====== REQUEST ANIMATION FRAME THROTTLE ======
/**
 * Usa RAF para limitar actualizaciones visuales
 */
function rafThrottle(callback) {
    let requestId = null;
    let lastArgs;

    const later = (context) => {
        requestId = null;
        callback.apply(context, lastArgs);
    };

    return function(...args) {
        lastArgs = args;
        if (requestId === null) {
            requestId = requestAnimationFrame(() => later(this));
        }
    };
}

// ====== VIRTUAL SCROLL ======
/**
 * Renderiza solo elementos visibles en listas largas
 */
class VirtualScroller {
    constructor(container, items, itemHeight, renderItem) {
        this.container = container;
        this.items = items;
        this.itemHeight = itemHeight;
        this.renderItem = renderItem;
        this.visibleRange = { start: 0, end: 0 };
        
        this.setupContainer();
        this.attachScrollListener();
        this.render();
    }

    setupContainer() {
        this.viewport = document.createElement('div');
        this.viewport.style.overflow = 'auto';
        this.viewport.style.height = '100%';
        
        this.content = document.createElement('div');
        this.content.style.position = 'relative';
        this.content.style.height = `${this.items.length * this.itemHeight}px`;
        
        this.viewport.appendChild(this.content);
        this.container.appendChild(this.viewport);
    }

    attachScrollListener() {
        this.viewport.addEventListener('scroll', 
            throttle(() => this.render(), 16) // ~60fps
        );
    }

    render() {
        const scrollTop = this.viewport.scrollTop;
        const viewportHeight = this.viewport.clientHeight;
        
        const start = Math.floor(scrollTop / this.itemHeight);
        const end = Math.ceil((scrollTop + viewportHeight) / this.itemHeight);
        
        // Render with buffer
        const bufferSize = 5;
        const renderStart = Math.max(0, start - bufferSize);
        const renderEnd = Math.min(this.items.length, end + bufferSize);
        
        if (renderStart !== this.visibleRange.start || renderEnd !== this.visibleRange.end) {
            this.visibleRange = { start: renderStart, end: renderEnd };
            this.updateDOM(renderStart, renderEnd);
        }
    }

    updateDOM(start, end) {
        this.content.innerHTML = '';
        
        for (let i = start; i < end; i++) {
            const item = this.items[i];
            const element = this.renderItem(item, i);
            element.style.position = 'absolute';
            element.style.top = `${i * this.itemHeight}px`;
            element.style.width = '100%';
            this.content.appendChild(element);
        }
    }

    updateItems(newItems) {
        this.items = newItems;
        this.content.style.height = `${this.items.length * this.itemHeight}px`;
        this.render();
    }
}

// ====== WEB WORKER HELPER ======
/**
 * Simplifica uso de Web Workers para tareas pesadas
 */
function createWorker(fn) {
    const blob = new Blob(['self.onmessage = ', fn.toString()], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    return new Worker(url);
}

// ====== PREFETCH DE DATOS ======
/**
 * Pre-carga datos que probablemente se necesitarán
 */
async function prefetchData(url, cacheKey) {
    if (cache.has(cacheKey)) return;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        cache.set(cacheKey, data, 300000); // 5 minutos
    } catch (err) {
        console.warn('Prefetch failed:', err);
    }
}

// ====== IDLE CALLBACK ======
/**
 * Ejecuta tareas no críticas cuando el browser está idle
 */
function runWhenIdle(callback, options = {}) {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(callback, options);
    } else {
        setTimeout(callback, 1);
    }
}

// ====== PERFORMANCE MONITOR ======
/**
 * Mide y reporta performance
 */
class PerformanceMonitor {
    constructor() {
        this.marks = new Map();
    }

    start(label) {
        this.marks.set(label, performance.now());
    }

    end(label) {
        const start = this.marks.get(label);
        if (!start) {
            console.warn(`No start mark for: ${label}`);
            return;
        }
        
        const duration = performance.now() - start;
        console.log(`⚡ ${label}: ${duration.toFixed(2)}ms`);
        this.marks.delete(label);
        return duration;
    }

    measure(label, fn) {
        this.start(label);
        const result = fn();
        this.end(label);
        return result;
    }

    async measureAsync(label, fn) {
        this.start(label);
        const result = await fn();
        this.end(label);
        return result;
    }
}

const perfMonitor = new PerformanceMonitor();

// ====== RESOURCE HINTS ======
/**
 * Añade hints al browser para optimizar carga
 */
function addResourceHint(url, type = 'prefetch') {
    const link = document.createElement('link');
    link.rel = type; // 'prefetch', 'preload', 'dns-prefetch', 'preconnect'
    link.href = url;
    document.head.appendChild(link);
}

// ====== OPTIMIZED EVENT LISTENER ======
/**
 * Event listener optimizado con passive flag
 */
function addOptimizedListener(element, event, handler, options = {}) {
    const defaultOptions = {
        passive: true,
        capture: false,
        ...options
    };
    
    element.addEventListener(event, handler, defaultOptions);
}

// Exportar todas las utilidades
window.PerfUtils = {
    debounce,
    throttle,
    cache,
    memoize,
    setupLazyLoading,
    batchUpdater,
    rafThrottle,
    VirtualScroller,
    createWorker,
    prefetchData,
    runWhenIdle,
    perfMonitor,
    addResourceHint,
    addOptimizedListener
};

console.log('⚡ Performance utilities loaded');
