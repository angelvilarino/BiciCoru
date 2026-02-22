/**
 * 🗺️ MODO TURISTA CON RUTAS TEMÁTICAS (#7)
 * Rutas predefinidas con puntos de interés
 */

class TouristMode {
    constructor() {
        this.routes = this.initializeRoutes();
        this.currentRoute = null;
        this.visitedPOIs = new Set(JSON.parse(localStorage.getItem('visitedPOIs') || '[]'));
    }

    initializeRoutes() {
        return [
            {
                id: 'historico',
                name: 'Tour Histórico',
                description: 'Descubre el casco antiguo de A Coruña',
                distance: 5.2,
                duration: 45,
                difficulty: 'Fácil',
                icon: '🏛️',
                color: '#d4af37',
                stations: [
                    { id: 1, name: 'Plaza de María Pita' },
                    { id: 5, name: 'Jardines San Carlos' },
                    { id: 8, name: 'Marina' },
                    { id: 12, name: 'Ciudad Vieja' }
                ],
                pois: [
                    {
                        id: 'poi_pita',
                        name: 'Plaza de María Pita',
                        type: 'plaza',
                        lat: 43.3713,
                        lng: -8.3960,
                        description: 'Corazón de la ciudad, dedicada a la heroína María Pita',
                        icon: '🏛️'
                    },
                    {
                        id: 'poi_colegiata',
                        name: 'Colegiata de Santa María',
                        type: 'monumento',
                        lat: 43.3725,
                        lng: -8.3980,
                        description: 'Iglesia románica del siglo XII',
                        icon: '⛪'
                    },
                    {
                        id: 'poi_sancarlos',
                        name: 'Jardines de San Carlos',
                        type: 'parque',
                        lat: 43.3760,
                        lng: -8.4015,
                        description: 'Jardín histórico con la tumba de Sir John Moore',
                        icon: '🌳'
                    },
                    {
                        id: 'poi_picasso',
                        name: 'Casa Museo Picasso',
                        type: 'museo',
                        lat: 43.3695,
                        lng: -8.3985,
                        description: 'Residencia de Picasso durante su infancia',
                        icon: '🎨'
                    }
                ]
            },
            {
                id: 'costa',
                name: 'Costa Panorámica',
                description: 'Pedalea junto al Atlántico',
                distance: 12.5,
                duration: 90,
                difficulty: 'Media',
                icon: '🌊',
                color: '#1e90ff',
                stations: [
                    { id: 3, name: 'Orzán' },
                    { id: 7, name: 'Riazor' },
                    { id: 15, name: 'Torre de Hércules' },
                    { id: 20, name: 'Portiño' }
                ],
                pois: [
                    {
                        id: 'poi_orzan',
                        name: 'Playa de Orzán',
                        type: 'playa',
                        lat: 43.3671,
                        lng: -8.4190,
                        description: 'Playa urbana popular para surf',
                        icon: '🏄'
                    },
                    {
                        id: 'poi_riazor',
                        name: 'Playa de Riazor',
                        type: 'playa',
                        lat: 43.3705,
                        lng: -8.4135,
                        description: 'Emblemática playa del Estadio de Riazor',
                        icon: '🏖️'
                    },
                    {
                        id: 'poi_hercules',
                        name: 'Torre de Hércules',
                        type: 'monumento',
                        lat: 43.3886,
                        lng: -8.4062,
                        description: 'Faro romano más antiguo en funcionamiento del mundo (UNESCO)',
                        icon: '🗼'
                    },
                    {
                        id: 'poi_aquarium',
                        name: 'Aquarium Finisterrae',
                        type: 'museo',
                        lat: 43.3810,
                        lng: -8.4225,
                        description: 'Acuario interactivo dedicado al océano Atlántico',
                        icon: '🐠'
                    },
                    {
                        id: 'poi_domus',
                        name: 'Domus - Casa del Hombre',
                        type: 'museo',
                        lat: 43.3730,
                        lng: -8.4165,
                        description: 'Museo interactivo sobre el ser humano',
                        icon: '🧬'
                    }
                ]
            },
            {
                id: 'parques',
                name: 'Parques Verdes',
                description: 'Circuito de áreas verdes y naturaleza',
                distance: 8.3,
                duration: 60,
                difficulty: 'Fácil',
                icon: '🌳',
                color: '#2ecc71',
                stations: [
                    { id: 4, name: 'Santa Margarita' },
                    { id: 9, name: 'Monte de San Pedro' },
                    { id: 14, name: 'Parque de Bens' },
                    { id: 18, name: 'Adormideras' }
                ],
                pois: [
                    {
                        id: 'poi_margarita',
                        name: 'Parque de Santa Margarita',
                        type: 'parque',
                        lat: 43.3650,
                        lng: -8.4050,
                        description: 'Gran parque urbano con áreas deportivas',
                        icon: '⚽'
                    },
                    {
                        id: 'poi_sanpedro',
                        name: 'Monte de San Pedro',
                        type: 'parque',
                        lat: 43.3820,
                        lng: -8.4280,
                        description: 'Parque en colina con vistas panorámicas de 360°',
                        icon: '🏔️'
                    },
                    {
                        id: 'poi_bens',
                        name: 'Parque de Bens',
                        type: 'parque',
                        lat: 43.3590,
                        lng: -8.3850,
                        description: 'Bosque urbano con senderos naturales',
                        icon: '🌲'
                    },
                    {
                        id: 'poi_jardinbotanico',
                        name: 'Jardín Botánico',
                        type: 'jardin',
                        lat: 43.3450,
                        lng: -8.3920,
                        description: 'Colección de flora atlántica',
                        icon: '🌺'
                    }
                ]
            }
        ];
    }

    // ====== GESTIÓN DE RUTAS ======
    getRoute(routeId) {
        return this.routes.find(r => r.id === routeId);
    }

    selectRoute(routeId) {
        this.currentRoute = this.getRoute(routeId);
        localStorage.setItem('currentTouristRoute', routeId);
        return this.currentRoute;
    }

    getCurrentRoute() {
        if (!this.currentRoute) {
            const savedId = localStorage.getItem('currentTouristRoute');
            if (savedId) {
                this.currentRoute = this.getRoute(savedId);
            }
        }
        return this.currentRoute;
    }

    resetRoute() {
        this.currentRoute = null;
        localStorage.removeItem('currentTouristRoute');
    }

    // ====== POIs ======
    visitPOI(poiId) {
        this.visitedPOIs.add(poiId);
        localStorage.setItem('visitedPOIs', JSON.stringify([...this.visitedPOIs]));
        
        // Verificar si completó la ruta
        if (this.currentRoute) {
            const routePOIs = this.currentRoute.pois.map(p => p.id);
            const visited = routePOIs.filter(id => this.visitedPOIs.has(id));
            
            if (visited.length === routePOIs.length) {
                this.completeRoute(this.currentRoute.id);
            }
        }
    }

    completeRoute(routeId) {
        const completedRoutes = JSON.parse(localStorage.getItem('completedRoutes') || '[]');
        
        if (!completedRoutes.includes(routeId)) {
            completedRoutes.push(routeId);
            localStorage.setItem('completedRoutes', JSON.stringify(completedRoutes));
            
            // Mostrar notificación
            this.showRouteCompletionModal(routeId);
            
            // Verificar achievement "Tourist Completo"
            if (completedRoutes.length === this.routes.length && window.Gamification) {
                window.Gamification.checkAchievements();
            }
        }
    }

    getProgress() {
        if (!this.currentRoute) return null;
        
        const totalPOIs = this.currentRoute.pois.length;
        const visited = this.currentRoute.pois.filter(poi => this.visitedPOIs.has(poi.id)).length;
        
        return {
            visited,
            total: totalPOIs,
            percentage: (visited / totalPOIs) * 100
        };
    }

    // ====== MAPAS ======
    drawRouteOnMap(map, routeId) {
        const route = this.getRoute(routeId);
        if (!route || !map) return;
        
        // Limpiar rutas previas
        if (window.currentTouristLayer) {
            map.removeLayer(window.currentTouristLayer);
        }
        
        const layerGroup = L.layerGroup();
        
        // Añadir POIs como marcadores
        route.pois.forEach(poi => {
            const isVisited = this.visitedPOIs.has(poi.id);
            
            const marker = L.marker([poi.lat, poi.lng], {
                icon: L.divIcon({
                    className: `tourist-poi-marker ${isVisited ? 'visited' : ''}`,
                    html: `<div class="poi-icon" style="background-color: ${route.color}">${poi.icon}</div>`,
                    iconSize: [40, 40]
                })
            });
            
            marker.bindPopup(`
                <div class="poi-popup">
                    <h4>${poi.icon} ${poi.name}</h4>
                    <p>${poi.description}</p>
                    <button class="visit-poi-btn" onclick="touristMode.visitPOI('${poi.id}')">
                        ${isVisited ? '✓ Visitado' : 'Marcar como visitado'}
                    </button>
                </div>
            `);
            
            layerGroup.addLayer(marker);
        });
        
        // Añadir polyline de la ruta (simplificado)
        const coords = route.pois.map(poi => [poi.lat, poi.lng]);
        const polyline = L.polyline(coords, {
            color: route.color,
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 5'
        });
        
        layerGroup.addLayer(polyline);
        
        // Añadir al mapa
        layerGroup.addTo(map);
        window.currentTouristLayer = layerGroup;
        
        // Ajustar vista
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    }

    // ====== UI ======
    renderRouteSelector() {
        const completedRoutes = JSON.parse(localStorage.getItem('completedRoutes') || '[]');
        
        return `
            <div class="tourist-mode-panel">
                <h3>🗺️ Rutas Turísticas</h3>
                <div class="routes-grid">
                    ${this.routes.map(route => `
                        <div class="route-card ${completedRoutes.includes(route.id) ? 'completed' : ''}" 
                             data-route-id="${route.id}">
                            <div class="route-icon">${route.icon}</div>
                            <h4>${route.name}</h4>
                            <p>${route.description}</p>
                            <div class="route-stats">
                                <span>📏 ${route.distance} km</span>
                                <span>⏱️ ${route.duration} min</span>
                                <span class="difficulty">${route.difficulty}</span>
                            </div>
                            ${completedRoutes.includes(route.id) ? '<div class="completed-badge">✓ Completada</div>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    selectAndShowRoute(routeId) {
        this.selectRoute(routeId);
        
        // Cerrar selector
        const modal = document.getElementById('tourist-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        
        // Dibujar en el mapa
        if (window.map) {
            this.drawRouteOnMap(window.map, routeId);
        }
        
        // Mostrar progreso
        this.showProgressBar();
    }

    showProgressBar() {
        const progress = this.getProgress();
        if (!progress) return;
        
        let progressBar = document.getElementById('tourist-progress');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.id = 'tourist-progress';
            progressBar.className = 'tourist-progress-bar';
            document.body.appendChild(progressBar);
        }
        
        progressBar.innerHTML = `
            <div class="progress-content">
                <span>${this.currentRoute.icon} ${this.currentRoute.name}</span>
                <span>${progress.visited}/${progress.total} POIs</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress.percentage}%"></div>
            </div>
            <button class="close-route-btn" onclick="touristMode.resetRoute(); this.parentElement.remove()">×</button>
        `;
    }

    showRouteCompletionModal(routeId) {
        const route = this.getRoute(routeId);
        
        const modal = document.createElement('div');
        modal.className = 'completion-modal';
        modal.innerHTML = `
            <div class="completion-content">
                <div class="confetti-burst"></div>
                <h2>🎉 ¡Ruta Completada!</h2>
                <p>Has completado el <strong>${route.name}</strong></p>
                <p class="route-stats">
                    ${route.icon} ${route.distance} km | ${route.duration} minutos
                </p>
                <button onclick="this.closest('.completion-modal').remove()">Continuar</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        setTimeout(() => modal.remove(), 8000);
    }
}

// Instancia global
const touristMode = new TouristMode();
window.TouristMode = touristMode;

console.log('🗺️ Tourist Mode loaded');
