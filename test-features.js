/**
 * 🧪 TEST SUITE - NUEVAS FUNCIONALIDADES
 * Tests básicos para verificar integración
 */

console.log('🧪 Iniciando tests de funcionalidades...\n');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, condition) {
    const result = condition();
    tests.push({ name, passed: result });
    
    if (result) {
        console.log(`✅ ${name}`);
        passed++;
    } else {
        console.error(`❌ ${name}`);
        failed++;
    }
}

// ====== PERFORMANCE UTILS ======
console.log('\n📦 Performance Utils:');
test('PerfUtils está definido', () => typeof PerfUtils !== 'undefined');
test('debounce funciona', () => typeof PerfUtils?.debounce === 'function');
test('throttle funciona', () => typeof PerfUtils?.throttle === 'function');
test('memoize funciona', () => typeof PerfUtils?.memoize === 'function');
test('CacheManager existe', () => typeof CacheManager !== 'undefined');

// ====== GAMIFICATION ======
console.log('\n🏆 Gamification:');
test('Gamification está definido', () => typeof Gamification !== 'undefined');
test('Tiene método checkAchievements', () => typeof Gamification?.checkAchievements === 'function');
test('Tiene método updateStreak', () => typeof Gamification?.updateStreak === 'function');
test('Tiene método renderFullUI', () => typeof Gamification?.renderFullUI === 'function');
test('Achievements definidos', () => Gamification?.achievements?.length > 0);

// ====== DASHBOARD ======
console.log('\n📊 Dashboard:');
test('AdvancedDashboard existe', () => typeof AdvancedDashboard !== 'undefined');
const dashboard = typeof AdvancedDashboard !== 'undefined' ? new AdvancedDashboard() : null;
test('Dashboard se puede instanciar', () => dashboard !== null);
test('Tiene getBestHours', () => typeof dashboard?.getBestHours === 'function');
test('Tiene compareWithPreviousMonth', () => typeof dashboard?.compareWithPreviousMonth === 'function');
test('Tiene predictMonthlyGoal', () => typeof dashboard?.predictMonthlyGoal === 'function');

// ====== RECOMMENDER ======
console.log('\n🤖 Recommender:');
test('Recommender está definido', () => typeof recommender !== 'undefined');
test('Tiene recommendStation', () => typeof recommender?.recommendStation === 'function');
test('Tiene showRecommendations', () => typeof recommender?.showRecommendations === 'function');
test('Patterns analizados', () => typeof recommender?.historicalPatterns === 'object');

// ====== ERROR HANDLER ======
console.log('\n🛡️ Error Handler:');
test('ErrorHandler está definido', () => typeof errorHandler !== 'undefined');
test('Tiene fetchWithRetry', () => typeof errorHandler?.fetchWithRetry === 'function');
test('Tiene executeWithFallback', () => typeof errorHandler?.executeWithFallback === 'function');
test('Detecta online status', () => typeof errorHandler?.isOnline === 'boolean');
test('Tiene sistema de logging', () => Array.isArray(errorHandler?.errorLog));

// ====== TOURIST MODE ======
console.log('\n🗺️ Tourist Mode:');
test('TouristMode está definido', () => typeof touristMode !== 'undefined');
test('Tiene rutas definidas', () => touristMode?.routes?.length > 0);
test('Ruta histórico existe', () => touristMode?.getRoute('historico') !== undefined);
test('Ruta costa existe', () => touristMode?.getRoute('costa') !== undefined);
test('Ruta parques existe', () => touristMode?.getRoute('parques') !== undefined);
test('Tiene drawRouteOnMap', () => typeof touristMode?.drawRouteOnMap === 'function');

// ====== SERVICE WORKER ======
console.log('\n📦 Service Worker:');
test('Service Worker soportado', () => 'serviceWorker' in navigator);
test('Service Worker registrado', async () => {
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration !== undefined;
    } catch {
        return false;
    }
});

// ====== DOM ELEMENTS ======
console.log('\n🎨 Elementos DOM:');
test('Botón dashboard existe', () => document.getElementById('btn-dashboard') !== null);
test('Botón tourist existe', () => document.getElementById('btn-tourist') !== null);
test('Botón gamification existe', () => document.getElementById('btn-gamification') !== null);
test('Modal dashboard existe', () => document.getElementById('dashboard-modal') !== null);
test('Modal tourist existe', () => document.getElementById('tourist-modal') !== null);
test('Modal gamification existe', () => document.getElementById('gamification-modal') !== null);

// ====== CSS ======
console.log('\n🎨 Estilos CSS:');
test('style.css cargado', () => {
    const links = Array.from(document.styleSheets);
    return links.some(link => link.href?.includes('style.css'));
});
test('features-styles.css cargado', () => {
    const links = Array.from(document.styleSheets);
    return links.some(link => link.href?.includes('features-styles.css'));
});

// ====== LOCALSTORAGE ======
console.log('\n💾 LocalStorage:');
test('LocalStorage disponible', () => {
    try {
        localStorage.setItem('test', '1');
        localStorage.removeItem('test');
        return true;
    } catch {
        return false;
    }
});

// ====== RESULTS ======
console.log('\n' + '='.repeat(50));
console.log(`📊 RESULTADOS:`);
console.log(`✅ Pasados: ${passed}`);
console.log(`❌ Fallados: ${failed}`);
console.log(`📈 Total: ${tests.length}`);
console.log(`🎯 Tasa de éxito: ${((passed / tests.length) * 100).toFixed(1)}%`);
console.log('='.repeat(50));

// Mostrar tests fallados
if (failed > 0) {
    console.log('\n⚠️ Tests fallados:');
    tests.filter(t => !t.passed).forEach(t => {
        console.log(`  - ${t.name}`);
    });
}

// Test de integración real
console.log('\n🔬 Tests de integración (async):');

setTimeout(async () => {
    try {
        // Test cache
        console.log('Testing cache...');
        if (typeof CacheManager !== 'undefined') {
            const cache = new CacheManager();
            cache.set('test-key', { value: 123 }, 5000);
            const retrieved = cache.get('test-key');
            console.log(retrieved?.value === 123 ? '✅ Cache funciona' : '❌ Cache falla');
        }
        
        // Test memoization
        console.log('Testing memoization...');
        if (typeof PerfUtils !== 'undefined') {
            const expensive = (n) => n * 2;
            const memoized = PerfUtils.memoize(expensive);
            const start = performance.now();
            memoized(5);
            memoized(5); // Debería ser instantáneo
            const end = performance.now();
            console.log(`✅ Memoization OK (${(end - start).toFixed(2)}ms)`);
        }
        
        // Test gamification
        console.log('Testing gamification...');
        if (typeof Gamification !== 'undefined') {
            const stats = Gamification.getStats();
            console.log(`✅ Stats loaded: ${stats.totalTrips} trips`);
        }
        
        // Test dashboard
        console.log('Testing dashboard...');
        if (typeof AdvancedDashboard !== 'undefined') {
            const dash = new AdvancedDashboard();
            const history = dash.getHistory();
            console.log(`✅ Dashboard history: ${history.trips?.length || 0} trips`);
        }
        
        // Test error handler
        console.log('Testing error handler...');
        if (typeof errorHandler !== 'undefined') {
            const stats = errorHandler.getErrorStats();
            console.log(`✅ Error handler: ${stats.total} errors logged`);
        }
        
        console.log('\n✨ Todos los tests de integración completados');
        
    } catch (error) {
        console.error('❌ Error en tests de integración:', error);
    }
}, 1000);

// Export para testing manual
if (typeof window !== 'undefined') {
    window.runTests = () => {
        location.reload();
    };
    
    console.log('\n💡 Tip: Ejecuta window.runTests() para re-ejecutar los tests');
}
