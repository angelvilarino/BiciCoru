/**
 * 🎯 INTEGRACIÓN UI - NUEVAS FUNCIONALIDADES
 * Conecta los modales con los sistemas
 */

// Esperar a que todo esté cargado
window.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Inicializando integraciones UI...');
    
    // ====== DASHBOARD ======
    const btnDashboard = document.getElementById('btn-dashboard');
    const btnCloseDashboard = document.getElementById('btn-close-dashboard');
    const dashboardModal = document.getElementById('dashboard-modal');
    const dashboardContent = document.getElementById('dashboard-content');
    
    if (btnDashboard) {
        btnDashboard.addEventListener('click', () => {
            if (dashboardModal && dashboardContent) {
                dashboardModal.classList.remove('hidden');
                
                if (typeof AdvancedDashboard !== 'undefined') {
                    const dashboard = new AdvancedDashboard();
                    dashboard.renderDashboard('dashboard-content');
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
    
    // ====== TOURIST MODE ======
    const btnTourist = document.getElementById('btn-tourist');
    const btnCloseTourist = document.getElementById('btn-close-tourist');
    const touristModal = document.getElementById('tourist-modal');
    const touristContent = document.getElementById('tourist-content');
    
    if (btnTourist) {
        btnTourist.addEventListener('click', () => {
            if (touristModal && touristContent) {
                touristModal.classList.remove('hidden');
                
                if (typeof touristMode !== 'undefined') {
                    touristContent.innerHTML = touristMode.renderRouteSelector();

                    // Delegar click para rutas turisticas
                    if (!touristContent.dataset.listenerAttached) {
                        touristContent.addEventListener('click', (e) => {
                            const card = e.target.closest('.route-card');
                            if (!card) return;
                            const routeId = card.getAttribute('data-route-id');
                            if (routeId) {
                                touristMode.selectAndShowRoute(routeId);
                                touristModal.classList.add('hidden');
                            }
                        });
                        touristContent.dataset.listenerAttached = 'true';
                    }
                } else {
                    touristContent.innerHTML = '<div class="error-message">Modo turista no disponible</div>';
                }
            }
        });
    }
    
    if (btnCloseTourist) {
        btnCloseTourist.addEventListener('click', () => {
            if (touristModal) {
                touristModal.classList.add('hidden');
            }
        });
    }
    
    // ====== GAMIFICATION ======
    const btnGamification = document.getElementById('btn-gamification');
    const btnCloseGamification = document.getElementById('btn-close-gamification');
    const gamificationModal = document.getElementById('gamification-modal');
    const gamificationContent = document.getElementById('gamification-content');
    
    if (btnGamification) {
        btnGamification.addEventListener('click', () => {
            if (gamificationModal && gamificationContent) {
                gamificationModal.classList.remove('hidden');
                
                if (typeof Gamification !== 'undefined') {
                    // Renderizar UI de gamificación
                    const totalPoints = Gamification.getTotalPoints();
                    const level = Gamification.userLevel;
                    const nextLevel = Gamification.getNextLevel();
                    const progressPct = Gamification.getProgressToNextLevel();
                    const pointsInLevel = totalPoints - level.minPoints;
                    const pointsNeeded = nextLevel ? (nextLevel.minPoints - level.minPoints) : 0;
                    const progressText = nextLevel
                        ? `${pointsInLevel}/${pointsNeeded} pts hasta nivel ${nextLevel.level}`
                        : 'Nivel maximo alcanzado';
                    
                    gamificationContent.innerHTML = `
                        <div class="gamification-dashboard">
                            <div class="level-info">
                                <div class="level-badge">${level.badge}</div>
                                <div class="level-details">
                                    <h3>${level.name}</h3>
                                    <p>Nivel ${level.level} • ${totalPoints} puntos</p>
                                    <div class="progress-bar">
                                        <div class="progress-fill" style="width: ${progressPct}%"></div>
                                    </div>
                                    <p class="progress-text">${progressText}</p>
                                </div>
                            </div>
                            <div id="achievements-container"></div>
                        </div>
                    `;
                    
                    // Renderizar logros
                    Gamification.renderAchievementsList('achievements-container');
                } else {
                    gamificationContent.innerHTML = '<div class="error-message">Sistema de gamificación no disponible</div>';
                }
            }
        });
    }
    
    if (btnCloseGamification) {
        btnCloseGamification.addEventListener('click', () => {
            if (gamificationModal) {
                gamificationModal.classList.add('hidden');
            }
        });
    }
    
    // ====== CERRAR MODALES AL HACER CLIC FUERA ======
    [dashboardModal, touristModal, gamificationModal].forEach(modal => {
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
            [dashboardModal, touristModal, gamificationModal].forEach(modal => {
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
            <h3>📱 Instalar BiciCoruña AI</h3>
            <p>Instala la app para acceso rápido y uso offline</p>
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
                indicator.textContent = '⚠️ Sin conexión - Usando modo offline';
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
                    // Insertar al inicio de la lista
                    const existingPanel = stationsList.querySelector('.recommendations-panel');
                    if (existingPanel) {
                        existingPanel.remove();
                    }
                    
                    stationsList.insertBefore(panel, stationsList.firstChild);
                    
                    // Agregar click handlers
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
    
    // Mostrar también cuando se carguen estaciones
    window.addEventListener('stations-loaded', showRecommendationsInSidebar);
    
    console.log('✅ Integraciones UI completadas');
});

// Estilos adicionales para mensajes de error
const errorStyles = document.createElement('style');
errorStyles.textContent = `
    .error-message {
        padding: 2rem;
        text-align: center;
        color: #e74c3c;
        font-size: 1rem;
    }
    
    .modal-large .modal-card {
        max-width: 1200px;
        max-height: 90vh;
        overflow-y: auto;
    }
`;
document.head.appendChild(errorStyles);
