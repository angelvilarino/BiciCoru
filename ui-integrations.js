/**
 * 🎯 INTEGRACIÓN UI - ANALÍTICA & SERVICIOS
 * Conecta los modales y herramientas del sistema
 */

// Esperar a que todo esté cargado
window.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Inicializando integraciones UI...');
    
    // ====== DASHBOARD DE ANALÍTICA ======
    const btnDashboard = document.getElementById('btn-dashboard');
    const btnCloseDashboard = document.getElementById('btn-close-dashboard');
    const dashboardModal = document.getElementById('dashboard-modal');
    const dashboardContent = document.getElementById('dashboard-content');
    
    if (btnDashboard) {
        btnDashboard.addEventListener('click', () => {
            if (dashboardModal && dashboardContent) {
                dashboardModal.classList.remove('hidden');
                
                const stations = window.stationsData || window.currentStations || [];
                if (window.Dashboard && typeof window.Dashboard.renderDashboard === 'function') {
                    window.Dashboard.renderDashboard('dashboard-content', stations);
                } else if (typeof AdvancedDashboard !== 'undefined') {
                    const dash = new AdvancedDashboard();
                    dash.renderDashboard('dashboard-content', stations);
                } else {
                    dashboardContent.innerHTML = '<div class="error-message">Dashboard no disponible</div>';
                }
            }
        });
    }
    
    if (btnCloseDashboard) {
        btnCloseDashboard.addEventListener('click', () => {
            if (dashboardModal) {
                dashboardModal.classList.add('hidden');
            }
        });
    }
    
    // ====== CERRAR MODALES AL HACER CLIC FUERA ======
    [dashboardModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        }
    });
    
    // ====== ESCAPE KEY ======
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [dashboardModal].forEach(modal => {
                if (modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                }
            });
        }
    });
    
    // ====== PWA INSTALL PROMPT ======
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Mostrar banner de instalación solo si no se ha descartado antes
        const dismissed = localStorage.getItem('pwa-prompt-dismissed');
        if (!dismissed) {
            showPWAPrompt();
        }
    });
    
    function showPWAPrompt() {
        const prompt = document.createElement('div');
        prompt.className = 'pwa-install-prompt';
        prompt.innerHTML = `
            <h3>📱 Instalar PedalIA</h3>
            <p>Acceso rápido en tiempo real con predicciones de disponibilidad</p>
            <div class="pwa-buttons">
                <button class="pwa-install-btn">Instalar</button>
                <button class="pwa-dismiss-btn">Ahora no</button>
            </div>
        `;
        
        document.body.appendChild(prompt);
        setTimeout(() => prompt.classList.add('show'), 100);
        
        // Botón instalar
        prompt.querySelector('.pwa-install-btn').addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`PWA install: ${outcome}`);
                deferredPrompt = null;
            }
            prompt.remove();
        });
        
        // Botón descartar
        prompt.querySelector('.pwa-dismiss-btn').addEventListener('click', () => {
            localStorage.setItem('pwa-prompt-dismissed', 'true');
            prompt.remove();
        });
    }
    
    // ====== OFFLINE INDICATOR ======
    function updateOnlineStatus() {
        let indicator = document.getElementById('offline-indicator');
        
        if (!navigator.onLine) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'offline-indicator';
                indicator.className = 'offline-indicator';
                indicator.textContent = '⚠️ Sin conexión - Mostrando datos en caché';
                document.body.appendChild(indicator);
            }
            setTimeout(() => indicator.classList.add('show'), 10);
        } else {
            if (indicator) {
                indicator.classList.remove('show');
                setTimeout(() => indicator.remove(), 300);
            }
        }
    }
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // Check inicial
    
    // ====== RECOMMENDATIONS PANEL EN SIDEBAR ======
    async function showRecommendationsInSidebar() {
        const stationsList = document.getElementById('stations-list');
        
        if (stationsList && typeof recommender !== 'undefined' && window.userLocation && window.currentStations) {
            try {
                const panel = await recommender.showRecommendations(window.userLocation, window.currentStations);
                
                if (panel) {
                    const existingPanel = stationsList.querySelector('.recommendations-panel');
                    if (existingPanel) {
                        existingPanel.remove();
                    }
                    
                    stationsList.insertBefore(panel, stationsList.firstChild);
                    
                    panel.querySelectorAll('.recommendation-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const stationId = item.dataset.stationId;
                            const station = window.currentStations.find(s => s.station_id == stationId);
                            if (station && typeof openStationModal === 'function') {
                                openStationModal(station);
                            }
                        });
                    });
                }
            } catch (error) {
                console.error('Error mostrando recomendaciones:', error);
            }
        }
    }
    
    // Mostrar recomendaciones cada 5 minutos
    setInterval(showRecommendationsInSidebar, 5 * 60 * 1000);
    window.addEventListener('stations-loaded', showRecommendationsInSidebar);
    
    console.log('✅ Integraciones UI completadas');
});
