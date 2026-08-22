/**
 * 📊 DASHBOARD DE RED Y ANALÍTICA AVANZADA
 * Panel de control en tiempo real: estadísticas globales de la flota,
 * ocupación de estaciones de alta densidad, alertas operativas y log analítico de viajes con evaluación IA.
 */

class AdvancedDashboard {
    constructor() {
        this.historicalData = this.loadHistoricalData();
        this.currentStations = [];
        this.activeTab = 'overview';
        this.stationFilter = 'all';
        this.stationSearch = '';
        this.stationSort = 'occupancy-desc';
        this.tripFilter = 'all';
        this.tripSearch = '';
        this.expandedTripId = null;
    }

    // ====== ANÁLISIS DE RED EN TIEMPO REAL ======
    getNetworkStats(stations = []) {
        const list = Array.isArray(stations) ? stations : [];
        const totalStations = list.length;
        
        if (totalStations === 0) {
            return {
                totalStations: 0,
                activeStations: 0,
                totalBikes: 0,
                totalSlots: 0,
                totalCapacity: 0,
                occupancyPercent: 0,
                emptyStations: [],
                fullStations: [],
                lowBikeStations: [],
                highAvailabilityStations: [],
                mediumAvailabilityStations: [],
                avgBikesPerStation: 0,
                networkHealth: 'Sin datos',
                healthScore: 0,
                topStationsBikes: [],
                topStationsSlots: [],
                mostOccupied: [],
                leastOccupied: [],
                allStations: []
            };
        }

        let totalBikes = 0;
        let totalSlots = 0;
        let totalCapacity = 0;
        const emptyStations = [];
        const fullStations = [];
        const lowBikeStations = [];
        const highAvailabilityStations = [];
        const mediumAvailabilityStations = [];

        const enrichedStations = list.map(st => {
            const bikes = Number(st.available_bikes) || 0;
            const cap = Number(st.total_capacity) || (bikes + (Number(st.available_slots) || 0)) || 10;
            const slots = typeof st.available_slots === 'number' ? Number(st.available_slots) : Math.max(0, cap - bikes);
            const occupancy = Math.min(100, Math.round((bikes / (cap || 1)) * 100));

            totalBikes += bikes;
            totalSlots += slots;
            totalCapacity += cap;

            const stationInfo = {
                ...st,
                available_bikes: bikes,
                available_slots: slots,
                total_capacity: cap,
                occupancyPercent: occupancy
            };

            if (bikes === 0) {
                emptyStations.push(stationInfo);
            } else if (bikes <= 2) {
                lowBikeStations.push(stationInfo);
            }

            if (slots === 0 || bikes >= cap) {
                fullStations.push(stationInfo);
            }

            if (bikes >= 5) {
                highAvailabilityStations.push(stationInfo);
            } else if (bikes >= 1 && bikes < 5) {
                mediumAvailabilityStations.push(stationInfo);
            }

            return stationInfo;
        });

        const occupancyPercent = totalCapacity > 0 ? Math.round((totalBikes / totalCapacity) * 100) : 0;
        const avgBikesPerStation = (totalBikes / (totalStations || 1)).toFixed(1);

        // Índice de Salud de la Red
        const emptyRatio = emptyStations.length / totalStations;
        const fullRatio = fullStations.length / totalStations;
        let networkHealth = 'Óptima';
        let healthScore = 95;

        if (emptyRatio > 0.3 || fullRatio > 0.3 || occupancyPercent < 15 || occupancyPercent > 85) {
            networkHealth = 'Crítica / Desbalanceada';
            healthScore = 45;
        } else if (emptyRatio > 0.15 || fullRatio > 0.15 || occupancyPercent < 25 || occupancyPercent > 75) {
            networkHealth = 'Moderada';
            healthScore = 72;
        }

        // Rankings
        const topStationsBikes = [...enrichedStations].sort((a, b) => b.available_bikes - a.available_bikes).slice(0, 5);
        const topStationsSlots = [...enrichedStations].sort((a, b) => b.available_slots - a.available_slots).slice(0, 5);
        const mostOccupied = [...enrichedStations].sort((a, b) => b.occupancyPercent - a.occupancyPercent).slice(0, 5);
        const leastOccupied = [...enrichedStations].sort((a, b) => a.occupancyPercent - b.occupancyPercent).slice(0, 5);

        return {
            totalStations,
            activeStations: totalStations,
            totalBikes,
            totalSlots,
            totalCapacity,
            occupancyPercent,
            emptyStations,
            fullStations,
            lowBikeStations,
            highAvailabilityStations,
            mediumAvailabilityStations,
            avgBikesPerStation,
            networkHealth,
            healthScore,
            topStationsBikes,
            topStationsSlots,
            mostOccupied,
            leastOccupied,
            allStations: enrichedStations
        };
    }

    // ====== GESTIÓN DE DATOS HISTÓRICOS & LOG DE VIAJES ======
    loadHistoricalData() {
        try {
            const raw = localStorage.getItem('historicalData');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.trips) && parsed.trips.length > 0 && parsed.trips[0].originName) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('Error reading historicalData, generating seed data:', e);
        }

        // Semilla de datos analíticos realistas para BiciCoruña
        const seedData = this.generateRealisticSeedTrips();
        localStorage.setItem('historicalData', JSON.stringify(seedData));
        return seedData;
    }

    generateRealisticSeedTrips() {
        const now = Date.now();
        const hourMs = 3600 * 1000;
        const dayMs = 24 * hourMs;

        const routes = [
            {
                id: 'TRIP-COR-01',
                offset: 2 * hourMs,
                originId: 1, originName: '01 - Obelisco',
                destId: 4, destName: '04 - Riazor (Estadio)',
                distance: 2.7, durationSeconds: 780, // 13:00 min
                avgSpeed: 12.5,
                realSlots: 6, predSlots: 5, predAccuracy: 95
            },
            {
                id: 'TRIP-COR-02',
                offset: 1 * dayMs + 3 * hourMs,
                originId: 3, originName: '03 - Plaza de Pontevedra',
                destId: 18, destName: '18 - Matogrande',
                distance: 3.9, durationSeconds: 1140, // 19:00 min
                avgSpeed: 12.3,
                realSlots: 4, predSlots: 4, predAccuracy: 100
            },
            {
                id: 'TRIP-COR-03',
                offset: 2 * dayMs + 5 * hourMs,
                originId: 2, originName: '02 - Plaza de María Pita',
                destId: 10, destName: '10 - Estación de Tren (San Cristóbal)',
                distance: 2.4, durationSeconds: 690, // 11:30 min
                avgSpeed: 12.5,
                realSlots: 3, predSlots: 2, predAccuracy: 92
            },
            {
                id: 'TRIP-COR-04',
                offset: 4 * dayMs + 1 * hourMs,
                originId: 7, originName: '07 - Cuatro Caminos',
                destId: 8, destName: '08 - Monte Alto (Mercado)',
                distance: 3.3, durationSeconds: 960, // 16:00 min
                avgSpeed: 12.4,
                realSlots: 7, predSlots: 6, predAccuracy: 94
            },
            {
                id: 'TRIP-COR-05',
                offset: 6 * dayMs + 4 * hourMs,
                originId: 14, originName: '14 - Los Rosales',
                destId: 6, destName: '06 - Plaza de Lugo',
                distance: 3.6, durationSeconds: 1020, // 17:00 min
                avgSpeed: 12.7,
                realSlots: 5, predSlots: 5, predAccuracy: 100
            },
            {
                id: 'TRIP-COR-06',
                offset: 9 * dayMs + 2 * hourMs,
                originId: 9, originName: '09 - San Andrés',
                destId: 12, destName: '12 - Oza (Parque)',
                distance: 3.1, durationSeconds: 880, // 14:40 min
                avgSpeed: 12.7,
                realSlots: 8, predSlots: 6, predAccuracy: 88
            },
            {
                id: 'TRIP-COR-07',
                offset: 12 * dayMs + 6 * hourMs,
                originId: 22, originName: '22 - Campus Elviña',
                destId: 1, destName: '01 - Obelisco',
                distance: 4.4, durationSeconds: 1250, // 20:50 min
                avgSpeed: 12.7,
                realSlots: 5, predSlots: 4, predAccuracy: 93
            }
        ];

        const trips = routes.map(r => {
            const startDate = new Date(now - r.offset);
            const endDate = new Date(startDate.getTime() + (r.durationSeconds * 1000));
            const delta = r.realSlots - r.predSlots;
            const co2Kg = Number((r.distance * 0.142).toFixed(2)); // Factor 142g CO2/km evitado vs coche urbano

            return {
                id: r.id,
                date: startDate.toISOString(),
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
                originStationId: r.originId,
                originName: r.originName,
                destStationId: r.destId,
                destName: r.destName,
                distance: r.distance,
                durationSeconds: r.durationSeconds,
                avgSpeed: r.avgSpeed,
                co2SavedKg: co2Kg,
                arrivalRealSlots: r.realSlots,
                arrivalPredictedSlots: r.predSlots,
                predictionDelta: delta,
                predictionAccuracyPct: r.predAccuracy,
                hour: startDate.getHours(),
                dayOfWeek: startDate.getDay()
            };
        });

        return {
            trips,
            monthly: {}
        };
    }

    saveHistoricalData() {
        localStorage.setItem('historicalData', JSON.stringify(this.historicalData));
    }

    recordTrip(tripData) {
        const start = tripData.startTime ? new Date(tripData.startTime) : new Date();
        const durationSec = Number(tripData.durationSeconds) || Number(tripData.duration) * 60 || 600;
        const end = tripData.endTime ? new Date(tripData.endTime) : new Date(start.getTime() + durationSec * 1000);
        const distance = Number(tripData.distance) || 2.5;
        const realSlots = typeof tripData.arrivalRealSlots === 'number' ? tripData.arrivalRealSlots : 5;
        const predSlots = typeof tripData.arrivalPredictedSlots === 'number' ? tripData.arrivalPredictedSlots : 5;
        const delta = realSlots - predSlots;
        const accuracy = Math.max(70, Math.round(100 - (Math.abs(delta) * 8)));

        const trip = {
            id: `TRIP-${Date.now()}`,
            date: start.toISOString(),
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            originStationId: tripData.originStationId || tripData.stationId || 1,
            originName: tripData.originName || 'Estación Origen',
            destStationId: tripData.destStationId || 4,
            destName: tripData.destName || 'Estación Destino',
            distance: distance,
            durationSeconds: durationSec,
            avgSpeed: Number(((distance / (durationSec / 3600))).toFixed(1)),
            co2SavedKg: Number((distance * 0.142).toFixed(2)),
            arrivalRealSlots: realSlots,
            arrivalPredictedSlots: predSlots,
            predictionDelta: delta,
            predictionAccuracyPct: accuracy,
            hour: start.getHours(),
            dayOfWeek: start.getDay()
        };
        
        this.historicalData.trips.unshift(trip);
        this.updateMonthlyStats();
        this.saveHistoricalData();
    }

    updateMonthlyStats() {
        const currentMonth = new Date().toISOString().slice(0, 7);
        if (!this.historicalData.monthly) this.historicalData.monthly = {};
        if (!this.historicalData.monthly[currentMonth]) {
            this.historicalData.monthly[currentMonth] = { km: 0, trips: 0, co2: 0, avgDistance: 0 };
        }
        const monthTrips = this.historicalData.trips.filter(t => (t.startTime || t.date || '').startsWith(currentMonth));
        const stats = this.historicalData.monthly[currentMonth];
        stats.trips = monthTrips.length;
        stats.km = monthTrips.reduce((sum, t) => sum + (Number(t.distance) || 0), 0);
        stats.co2 = Number((stats.km * 0.142).toFixed(1));
        stats.avgDistance = stats.trips > 0 ? stats.km / stats.trips : 0;
    }

    getPerformanceMetrics() {
        const trips = Array.isArray(this.historicalData?.trips) ? this.historicalData.trips : [];
        const last30Days = trips.filter(trip => {
            const tripDate = new Date(trip.startTime || trip.date);
            return ((Date.now() - tripDate.getTime()) / (1000 * 60 * 60 * 24)) <= 30;
        });

        const totalKm = last30Days.reduce((sum, t) => sum + (Number(t.distance) || 0), 0);
        const totalTrips = last30Days.length;
        const avgTripLength = totalTrips > 0 ? (totalKm / totalTrips).toFixed(1) : '0.0';
        
        // Ahorro de CO2 estandarizado (factor 0.142 kg CO2 / km evitado vs coche)
        const co2Saved = (totalKm * 0.142).toFixed(1);

        // Precisión Predictiva IA
        const validPredictions = last30Days.filter(t => typeof t.predictionAccuracyPct === 'number');
        const aiAccuracy = validPredictions.length > 0
            ? Math.round(validPredictions.reduce((sum, t) => sum + t.predictionAccuracyPct, 0) / validPredictions.length)
            : 94;

        const deltas = last30Days.map(t => Math.abs(typeof t.predictionDelta === 'number' ? t.predictionDelta : 0));
        const avgDelta = deltas.length > 0
            ? (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1)
            : '0.5';

        return {
            totalKm: totalKm.toFixed(1),
            totalTrips,
            avgTripLength,
            co2Saved,
            aiAccuracy,
            avgDelta,
            recentTrips: last30Days
        };
    }

    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0 min';
        const mins = Math.floor(seconds / 60);
        return `${mins} min`;
    }

    formatSimplifiedDate(isoString) {
        if (!isoString) return '--';
        const date = new Date(isoString);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();
        
        const pad = (n) => String(n).padStart(2, '0');
        const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
        
        if (isToday) return `Hoy, ${timeStr}`;
        if (isYesterday) return `Ayer, ${timeStr}`;
        
        const month = date.toLocaleDateString('es-ES', { month: 'short' });
        return `${date.getDate()} ${month}, ${timeStr}`;
    }

    cleanStationName(name) {
        if (!name) return 'Estación';
        let cleaned = String(name).replace(/^\d+\s*[-–]\s*/, '').trim();
        cleaned = cleaned.replace(/^Plaza de\s+/i, '').replace(/^Plaza\s+/i, '');
        cleaned = cleaned.replace(/^Estación de Tren\s*\((.*?)\)/i, '$1');
        cleaned = cleaned.replace(/\s*\((Estadio|Mercado|Parque)\)/i, '');
        return cleaned.trim();
    }

    // ====== RENDERIZADO PRINCIPAL ======
    renderDashboard(containerId, stationsList = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const stations = stationsList || window.stationsData || window.currentStations || [];
        this.currentStations = stations;
        const stats = this.getNetworkStats(stations);

        container.innerHTML = `
            <div class="dash-shell">
                <!-- Barra de pestañas -->
                <nav class="dash-nav-tabs" role="tablist" aria-label="Secciones del dashboard">
                    <button class="dash-tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview" role="tab" aria-selected="${this.activeTab === 'overview'}">
                        <i class="ph-bold ph-chart-polar"></i> Visión General
                    </button>
                    <button class="dash-tab-btn ${this.activeTab === 'stations' ? 'active' : ''}" data-tab="stations" role="tab" aria-selected="${this.activeTab === 'stations'}">
                        <i class="ph-bold ph-buildings"></i> Ocupación Estaciones
                    </button>
                    <button class="dash-tab-btn ${this.activeTab === 'alerts' ? 'active' : ''}" data-tab="alerts" role="tab" aria-selected="${this.activeTab === 'alerts'}">
                        <i class="ph-bold ph-warning-octagon"></i> Rebalanceo & Alertas
                        ${stats.emptyStations.length + stats.fullStations.length > 0 ? `<span class="dash-tab-badge">${stats.emptyStations.length + stats.fullStations.length}</span>` : ''}
                    </button>
                    <button class="dash-tab-btn ${this.activeTab === 'user' ? 'active' : ''}" data-tab="user" role="tab" aria-selected="${this.activeTab === 'user'}">
                        <i class="ph-bold ph-user-circle"></i> Mi Actividad
                    </button>
                </nav>

                <!-- Contenido dinámico según pestaña activa -->
                <div class="dash-tab-body" id="dash-tab-body">
                    ${this.renderActiveTabContent(stats)}
                </div>
            </div>
        `;

        this.attachDashboardEvents(container, stats);
    }

    renderActiveTabContent(stats) {
        if (this.activeTab === 'stations') {
            return this.renderStationsTab(stats);
        } else if (this.activeTab === 'alerts') {
            return this.renderAlertsTab(stats);
        } else if (this.activeTab === 'user') {
            return this.renderUserTab();
        }
        return this.renderOverviewTab(stats);
    }

    // ====== TAB 1: VISIÓN GENERAL ======
    renderOverviewTab(stats) {
        const highPct = stats.totalStations > 0 ? Math.round((stats.highAvailabilityStations.length / stats.totalStations) * 100) : 0;
        const medPct = stats.totalStations > 0 ? Math.round((stats.mediumAvailabilityStations.length / stats.totalStations) * 100) : 0;
        const emptyPct = stats.totalStations > 0 ? Math.round((stats.emptyStations.length / stats.totalStations) * 100) : 0;
        const fullPct = stats.totalStations > 0 ? Math.round((stats.fullStations.length / stats.totalStations) * 100) : 0;

        return `
            <!-- Tarjetas de KPIs Principales -->
            <div class="dash-kpi-grid">
                <div class="dash-kpi-card accent-primary">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-bicycle"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">Bicicletas Disponibles</span>
                        <div class="kpi-value-row">
                            <span class="kpi-value">${stats.totalBikes}</span>
                            <span class="kpi-subtext">de ${stats.totalCapacity} total</span>
                        </div>
                        <div class="kpi-progress">
                            <div class="kpi-bar" style="width: ${stats.occupancyPercent}%"></div>
                        </div>
                        <span class="kpi-footer-note">${stats.occupancyPercent}% ocupación global</span>
                    </div>
                </div>

                <div class="dash-kpi-card accent-success">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-lock-key-open"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">Huecos Libres</span>
                        <div class="kpi-value-row">
                            <span class="kpi-value">${stats.totalSlots}</span>
                            <span class="kpi-subtext">anclajes libres</span>
                        </div>
                        <div class="kpi-progress">
                            <div class="kpi-bar bg-success" style="width: ${100 - stats.occupancyPercent}%"></div>
                        </div>
                        <span class="kpi-footer-note">${100 - stats.occupancyPercent}% disponibilidad para aparcar</span>
                    </div>
                </div>

                <div class="dash-kpi-card accent-info">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-map-pin"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">Estaciones Activas</span>
                        <div class="kpi-value-row">
                            <span class="kpi-value">${stats.totalStations}</span>
                            <span class="kpi-subtext">en la ciudad</span>
                        </div>
                        <div class="kpi-stat-pill">
                            <span>Promedio: <b>${stats.avgBikesPerStation}</b> bicis/estación</span>
                        </div>
                        <span class="kpi-footer-note">100% de la red monitorizada</span>
                    </div>
                </div>

                <div class="dash-kpi-card ${stats.emptyStations.length > 3 ? 'accent-danger' : 'accent-warning'}">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-shield-check"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">Salud del Sistema</span>
                        <div class="kpi-value-row">
                            <span class="kpi-value health-tag ${stats.networkHealth.includes('Óptima') ? 'text-success' : (stats.networkHealth.includes('Moderada') ? 'text-warning' : 'text-danger')}">
                                ${stats.networkHealth}
                            </span>
                        </div>
                        <div class="kpi-critical-summary">
                            <span class="crit-chip empty">🔴 ${stats.emptyStations.length} vacías</span>
                            <span class="crit-chip full">🔵 ${stats.fullStations.length} llenas</span>
                        </div>
                        <span class="kpi-footer-note">Puntuación: ${stats.healthScore}/100</span>
                    </div>
                </div>
            </div>

            <!-- Distribución de la Red -->
            <div class="dash-section-card">
                <div class="section-card-header">
                    <h4><i class="ph-bold ph-chart-bar-horizontal"></i> Distribución de Disponibilidad en Estaciones</h4>
                    <span class="section-hint">${stats.totalStations} estaciones totales</span>
                </div>
                <div class="dash-stacked-bar-container">
                    <div class="dash-stacked-bar">
                        <div class="bar-segment high" style="width: ${highPct}%" title="Alta disponibilidad (5+ bicis): ${stats.highAvailabilityStations.length} estaciones (${highPct}%)"></div>
                        <div class="bar-segment med" style="width: ${medPct}%" title="Media (1-4 bicis): ${stats.mediumAvailabilityStations.length} estaciones (${medPct}%)"></div>
                        <div class="bar-segment empty" style="width: ${emptyPct}%" title="Sin bicis (0): ${stats.emptyStations.length} estaciones (${emptyPct}%)"></div>
                        <div class="bar-segment full" style="width: ${fullPct}%" title="Sin huecos: ${stats.fullStations.length} estaciones (${fullPct}%)"></div>
                    </div>
                    <div class="dash-bar-legend">
                        <span class="leg-item"><span class="leg-dot bg-high"></span> Alta (5+ bicis): <b>${stats.highAvailabilityStations.length}</b> (${highPct}%)</span>
                        <span class="leg-item"><span class="leg-dot bg-med"></span> Media (1-4 bicis): <b>${stats.mediumAvailabilityStations.length}</b> (${medPct}%)</span>
                        <span class="leg-item"><span class="leg-dot bg-empty"></span> Vacías: <b>${stats.emptyStations.length}</b> (${emptyPct}%)</span>
                        <span class="leg-item"><span class="leg-dot bg-full"></span> Sin huecos: <b>${stats.fullStations.length}</b> (${fullPct}%)</span>
                    </div>
                </div>
            </div>

            <!-- Comparativa: Más Bicis vs Menos Bicis -->
            <div class="dash-two-cols">
                <div class="dash-section-card">
                    <div class="section-card-header">
                        <h4><i class="ph-bold ph-arrow-circle-up text-success"></i> Top Estaciones con Más Bicis</h4>
                    </div>
                    <div class="dash-rank-list">
                        ${stats.topStationsBikes.map((st, i) => `
                            <div class="dash-rank-item" data-station-id="${st.station_id}">
                                <span class="rank-num">${i + 1}</span>
                                <div class="rank-info">
                                    <strong class="rank-name">${st.name}</strong>
                                    <div class="rank-bar-bg">
                                        <div class="rank-bar-fill bg-success" style="width:${st.occupancyPercent}%"></div>
                                    </div>
                                </div>
                                <div class="rank-counts">
                                    <span class="badge-count text-success"><b>${st.available_bikes}</b> bicis</span>
                                    <button class="btn-goto-station" data-id="${st.station_id}" title="Ver estación en el mapa">Ver ➔</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="dash-section-card">
                    <div class="section-card-header">
                        <h4><i class="ph-bold ph-arrow-circle-down text-danger"></i> Estaciones con Menor Disponibilidad</h4>
                    </div>
                    <div class="dash-rank-list">
                        ${stats.leastOccupied.map((st, i) => `
                            <div class="dash-rank-item" data-station-id="${st.station_id}">
                                <span class="rank-num">${i + 1}</span>
                                <div class="rank-info">
                                    <strong class="rank-name">${st.name}</strong>
                                    <div class="rank-bar-bg">
                                        <div class="rank-bar-fill ${st.available_bikes === 0 ? 'bg-danger' : 'bg-warning'}" style="width:${Math.max(5, st.occupancyPercent)}%"></div>
                                    </div>
                                </div>
                                <div class="rank-counts">
                                    <span class="badge-count ${st.available_bikes === 0 ? 'text-danger' : 'text-warning'}"><b>${st.available_bikes}</b> bicis</span>
                                    <button class="btn-goto-station" data-id="${st.station_id}" title="Ver estación en el mapa">Ver ➔</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // ====== TAB 2: DETALLE DE TODAS LAS ESTACIONES (ALTA DENSIDAD) ======
    renderStationsTab(stats) {
        let list = [...(stats.allStations || [])];

        // Filtros
        if (this.stationFilter === 'bikes') {
            list = list.filter(s => s.available_bikes > 0);
        } else if (this.stationFilter === 'empty') {
            list = list.filter(s => s.available_bikes === 0);
        } else if (this.stationFilter === 'slots') {
            list = list.filter(s => s.available_slots > 0);
        } else if (this.stationFilter === 'full') {
            list = list.filter(s => s.available_slots === 0);
        } else if (this.stationFilter === 'high') {
            list = list.filter(s => s.available_bikes >= 5);
        }

        // Búsqueda
        if (this.stationSearch.trim()) {
            const query = this.stationSearch.toLowerCase().trim();
            list = list.filter(s => s.name.toLowerCase().includes(query) || String(s.station_id).includes(query));
        }

        // Ordenación
        if (this.stationSort === 'occupancy-desc') {
            list.sort((a, b) => b.occupancyPercent - a.occupancyPercent);
        } else if (this.stationSort === 'occupancy-asc') {
            list.sort((a, b) => a.occupancyPercent - b.occupancyPercent);
        } else if (this.stationSort === 'bikes-desc') {
            list.sort((a, b) => b.available_bikes - a.available_bikes);
        } else if (this.stationSort === 'bikes-asc') {
            list.sort((a, b) => a.available_bikes - b.available_bikes);
        } else if (this.stationSort === 'name-asc') {
            list.sort((a, b) => a.name.localeCompare(b.name));
        }

        return `
            <div class="dash-stations-toolbar">
                <div class="dash-search-box">
                    <i class="ph-bold ph-magnifying-glass"></i>
                    <input type="text" id="dash-station-search-input" placeholder="Buscar por estación o ID..." value="${this.stationSearch}">
                    ${this.stationSearch ? `<button id="btn-clear-dash-search" class="clear-btn">✕</button>` : ''}
                </div>
                
                <div class="dash-filters-row">
                    <div class="dash-filter-chips">
                        <button class="dash-chip ${this.stationFilter === 'all' ? 'active' : ''}" data-filter="all">Todas (${stats.totalStations})</button>
                        <button class="dash-chip ${this.stationFilter === 'high' ? 'active' : ''}" data-filter="high">5+ Bicis (${stats.highAvailabilityStations.length})</button>
                        <button class="dash-chip ${this.stationFilter === 'empty' ? 'active' : ''}" data-filter="empty">🔴 0 Bicis (${stats.emptyStations.length})</button>
                        <button class="dash-chip ${this.stationFilter === 'full' ? 'active' : ''}" data-filter="full">🔵 0 Huecos (${stats.fullStations.length})</button>
                    </div>

                    <div class="dash-sort-select-wrap">
                        <label for="dash-sort-select"><i class="ph-bold ph-sort-ascending"></i> Ordenar:</label>
                        <select id="dash-sort-select" class="dash-select">
                            <option value="occupancy-desc" ${this.stationSort === 'occupancy-desc' ? 'selected' : ''}>Mayor % Ocupación</option>
                            <option value="occupancy-asc" ${this.stationSort === 'occupancy-asc' ? 'selected' : ''}>Menor % Ocupación</option>
                            <option value="bikes-desc" ${this.stationSort === 'bikes-desc' ? 'selected' : ''}>Más Bicicletas</option>
                            <option value="bikes-asc" ${this.stationSort === 'bikes-asc' ? 'selected' : ''}>Menos Bicicletas</option>
                            <option value="name-asc" ${this.stationSort === 'name-asc' ? 'selected' : ''}>Nombre (A-Z)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Grid de Estaciones - Alta Densidad Operativa -->
            <div class="dash-stations-grid">
                ${list.length === 0 ? `
                    <div class="dash-empty-state">
                        <i class="ph-bold ph-bicycle"></i>
                        <p>No se encontraron estaciones con los filtros seleccionados.</p>
                    </div>
                ` : list.map(st => {
                    const isCriticalEmpty = st.available_bikes === 0;
                    const isCriticalFull = st.available_slots === 0;
                    const statusClass = isCriticalEmpty 
                        ? 'status-critical-empty' 
                        : (isCriticalFull ? 'status-critical-full' : (st.available_bikes >= 5 ? 'status-optimal' : 'status-med'));
                    
                    const barFillClass = isCriticalEmpty ? 'bg-danger' : (isCriticalFull ? 'bg-info' : (st.available_bikes >= 5 ? 'bg-success' : 'bg-warning'));

                    return `
                        <div class="dash-station-card ${statusClass}" data-station-id="${st.station_id}">
                            <div class="station-card-top">
                                <div class="st-card-name-group">
                                    <span class="st-id-tag">#${st.station_id}</span>
                                    <strong class="st-name" title="${st.name}">${st.name}</strong>
                                </div>
                                ${isCriticalEmpty 
                                    ? `<span class="st-status-badge badge-empty"><i class="ph-bold ph-warning-octagon"></i> 0 Bicis</span>` 
                                    : (isCriticalFull 
                                        ? `<span class="st-status-badge badge-full"><i class="ph-bold ph-prohibit"></i> 0 Huecos</span>` 
                                        : `<span class="st-status-badge badge-normal">${st.occupancyPercent}%</span>`)}
                            </div>

                            <div class="st-card-bar-wrap">
                                <div class="st-card-bar-fill ${barFillClass}" style="width:${Math.max(4, st.occupancyPercent)}%"></div>
                            </div>

                            <!-- Métricas Densas Estandarizadas por Iconos -->
                            <div class="st-card-metrics-dense">
                                <div class="st-metric-col">
                                    <div class="st-metric-col-header"><i class="ph-bold ph-bicycle"></i></div>
                                    <span class="st-metric-col-val ${st.available_bikes === 0 ? 'text-danger' : 'text-success'}">${st.available_bikes}</span>
                                </div>
                                <div class="st-metric-col">
                                    <div class="st-metric-col-header"><i class="ph-bold ph-lock-key-open"></i></div>
                                    <span class="st-metric-col-val ${st.available_slots === 0 ? 'text-danger' : 'text-info'}">${st.available_slots}</span>
                                </div>
                                <div class="st-metric-col">
                                    <div class="st-metric-col-header"><i class="ph-bold ph-stack"></i></div>
                                    <span class="st-metric-col-val text-muted">${st.total_capacity}</span>
                                </div>
                            </div>

                            <button class="btn-card-goto-station" data-id="${st.station_id}">
                                <i class="ph-bold ph-crosshair"></i> Ver en mapa
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // ====== TAB 3: ALERTAS Y REBALANCEO ======
    renderAlertsTab(stats) {
        return `
            <div class="dash-alerts-wrapper">
                <div class="dash-alert-banner ${stats.emptyStations.length + stats.fullStations.length > 0 ? 'banner-warning' : 'banner-success'}">
                    <i class="ph-bold ${stats.emptyStations.length + stats.fullStations.length > 0 ? 'ph-warning-circle' : 'ph-check-circle'}"></i>
                    <div>
                        <strong>Diagnóstico de la Red: ${stats.networkHealth}</strong>
                        <p>Se detectan ${stats.emptyStations.length} estaciones sin bicicletas y ${stats.fullStations.length} estaciones saturadas sin huecos para aparcar.</p>
                    </div>
                </div>

                <div class="dash-two-cols">
                    <!-- Estaciones Sin Bicis -->
                    <div class="dash-section-card">
                        <div class="section-card-header">
                            <h4><i class="ph-bold ph-warning-octagon text-danger"></i> Estaciones Vacías (${stats.emptyStations.length})</h4>
                            <span class="section-hint">Requieren reposición de flota</span>
                        </div>
                        <div class="dash-alerts-list">
                            ${stats.emptyStations.length === 0 ? `
                                <div class="dash-all-ok">✅ ¡Excelente! No hay estaciones vacías en este momento.</div>
                            ` : stats.emptyStations.map(st => `
                                <div class="dash-alert-item empty-alert">
                                    <div class="alert-info">
                                        <strong>${st.name}</strong>
                                        <span class="alert-sub">Capacidad: ${st.total_capacity} | Huecos: ${st.available_slots}</span>
                                    </div>
                                    <div class="alert-actions">
                                        <span class="badge-alert-tag tag-empty">0 Bicis</span>
                                        <button class="btn-goto-station" data-id="${st.station_id}">Ver ➔</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Estaciones Llenas -->
                    <div class="dash-section-card">
                        <div class="section-card-header">
                            <h4><i class="ph-bold ph-prohibit text-info"></i> Estaciones Llenas / Saturadas (${stats.fullStations.length})</h4>
                            <span class="section-hint">Sin huecos para devolución</span>
                        </div>
                        <div class="dash-alerts-list">
                            ${stats.fullStations.length === 0 ? `
                                <div class="dash-all-ok">✅ ¡Todo despejado! Hay huecos libres en todas las estaciones.</div>
                            ` : stats.fullStations.map(st => `
                                <div class="dash-alert-item full-alert">
                                    <div class="alert-info">
                                        <strong>${st.name}</strong>
                                        <span class="alert-sub">Bicis: ${st.available_bikes} / ${st.total_capacity} | Ocupación: 100%</span>
                                    </div>
                                    <div class="alert-actions">
                                        <span class="badge-alert-tag tag-full">0 Huecos</span>
                                        <button class="btn-goto-station" data-id="${st.station_id}">Ver ➔</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ====== TAB 4: LOG DE VIAJES ANALÍTICO (MINIMALISTA) ======
    renderUserTab() {
        const performance = this.getPerformanceMetrics();
        let tripsList = [...(performance.recentTrips || [])];

        // Filtro por búsqueda
        if (this.tripSearch.trim()) {
            const query = this.tripSearch.toLowerCase().trim();
            tripsList = tripsList.filter(t => 
                (t.originName || '').toLowerCase().includes(query) ||
                (t.destName || '').toLowerCase().includes(query) ||
                this.cleanStationName(t.originName).toLowerCase().includes(query) ||
                this.cleanStationName(t.destName).toLowerCase().includes(query)
            );
        }

        // Filtro por precisión predictiva
        if (this.tripFilter === 'exact') {
            tripsList = tripsList.filter(t => (t.predictionDelta || 0) === 0);
        } else if (this.tripFilter === 'minor') {
            tripsList = tripsList.filter(t => Math.abs(t.predictionDelta || 0) === 1);
        } else if (this.tripFilter === 'deviation') {
            tripsList = tripsList.filter(t => Math.abs(t.predictionDelta || 0) > 1);
        }

        return `
            <!-- Métricas Globales Prominentes (Cabecera Limpia) -->
            <div class="dash-kpi-grid dash-kpi-minimal">
                <div class="dash-kpi-card accent-primary">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-path"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">Distancia Total</span>
                        <div class="kpi-value-row">
                            <span class="kpi-value">${performance.totalKm}</span>
                            <span class="kpi-subtext">km</span>
                        </div>
                        <span class="kpi-footer-note">Últimos 30 días</span>
                    </div>
                </div>

                <div class="dash-kpi-card accent-success">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-bicycle"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">Total de Viajes</span>
                        <div class="kpi-value-row">
                            <span class="kpi-value">${performance.totalTrips}</span>
                            <span class="kpi-subtext">viajes</span>
                        </div>
                        <span class="kpi-footer-note">Promedio: <b>${performance.avgTripLength}</b> km/viaje</span>
                    </div>
                </div>
            </div>

            <!-- Tabla Minimalista de Historial de Viajes -->
            <div class="dash-section-card dash-trips-minimal-card">
                <div class="dash-trips-toolbar minimal-toolbar">
                    <div class="dash-search-box minimal-search">
                        <i class="ph-bold ph-magnifying-glass"></i>
                        <input type="text" id="dash-trip-search-input" placeholder="Buscar por estación..." value="${this.tripSearch}">
                        ${this.tripSearch ? `<button id="btn-clear-trip-search" class="clear-btn">✕</button>` : ''}
                    </div>

                    <div class="dash-filter-chips">
                        <button class="dash-chip dash-trip-chip ${this.tripFilter === 'all' ? 'active' : ''}" data-filter="all">Todos (${performance.totalTrips})</button>
                        <button class="dash-chip dash-trip-chip ${this.tripFilter === 'exact' ? 'active' : ''}" data-filter="exact">Exacta</button>
                        <button class="dash-chip dash-trip-chip ${this.tripFilter === 'minor' ? 'active' : ''}" data-filter="minor">Desv. Mínima</button>
                    </div>
                </div>

                <div class="dash-trips-table-wrapper minimal-table-wrapper">
                    <table class="dash-trips-table minimal-trips-table" aria-label="Historial de viajes">
                        <thead>
                            <tr>
                                <th>Fecha & Hora</th>
                                <th>Ruta</th>
                                <th>Duración / Distancia</th>
                                <th>Precisión IA</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tripsList.length === 0 ? `
                                <tr>
                                    <td colspan="4" class="dash-empty-state">
                                        <i class="ph-bold ph-bicycle"></i>
                                        <p>No hay viajes que coincidan con el filtro.</p>
                                    </td>
                                </tr>
                            ` : tripsList.map(trip => {
                                const delta = typeof trip.predictionDelta === 'number' ? trip.predictionDelta : 0;
                                const accuracy = typeof trip.predictionAccuracyPct === 'number' 
                                    ? trip.predictionAccuracyPct 
                                    : Math.max(70, Math.round(100 - (Math.abs(delta) * 8)));

                                const isExact = accuracy >= 98 || delta === 0;
                                const isMinor = accuracy >= 90;

                                const statusClass = isExact ? 'exact' : (isMinor ? 'minor' : 'dev');

                                return `
                                    <tr class="trip-minimal-row">
                                        <td class="col-date">
                                            <span class="trip-date-simple">${this.formatSimplifiedDate(trip.startTime || trip.date)}</span>
                                        </td>
                                        <td class="col-route">
                                            <div class="trip-route-clean">
                                                <span class="route-point">${this.cleanStationName(trip.originName)}</span>
                                                <i class="ph-bold ph-arrow-right route-arrow-icon"></i>
                                                <span class="route-point">${this.cleanStationName(trip.destName)}</span>
                                            </div>
                                        </td>
                                        <td class="col-metric">
                                            <span class="trip-metric-pill">${Math.round((trip.durationSeconds || 600) / 60)} min • ${trip.distance} km</span>
                                        </td>
                                        <td class="col-ai">
                                            <span class="ai-status-pill ${statusClass}">
                                                <span class="ai-dot-indicator"></span>
                                                ${accuracy}%
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ====== ATTACH EVENTS ======
    attachDashboardEvents(container, stats) {
        // Pestañas (con preservación del scroll horizontal en móvil)
        container.querySelectorAll('.dash-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (tab && this.activeTab !== tab) {
                    this.activeTab = tab;

                    // 1. Actualizar clases activas en los botones sin destruir el nav
                    container.querySelectorAll('.dash-tab-btn').forEach(b => {
                        const isSelected = b.dataset.tab === tab;
                        b.classList.toggle('active', isSelected);
                        b.setAttribute('aria-selected', String(isSelected));
                    });

                    // 2. Mantener la pestaña activa visible y centrada en la barra de scroll
                    try {
                        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    } catch (err) {}

                    // 3. Re-renderizar exclusivamente el cuerpo del tab
                    const tabBody = container.querySelector('#dash-tab-body');
                    if (tabBody) {
                        tabBody.innerHTML = this.renderActiveTabContent(stats);
                        this.attachDashboardEvents(container, stats);
                    }
                }
            });
        });

        // Buscador en tab de estaciones
        const searchInput = container.querySelector('#dash-station-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.stationSearch = e.target.value;
                const tabBody = container.querySelector('#dash-tab-body');
                if (tabBody) {
                    tabBody.innerHTML = this.renderStationsTab(this.getNetworkStats(this.currentStations));
                    this.attachDashboardEvents(container, stats);
                    const reInput = container.querySelector('#dash-station-search-input');
                    if (reInput) {
                        reInput.focus();
                        reInput.setSelectionRange(reInput.value.length, reInput.value.length);
                    }
                }
            });
        }

        // Limpiar búsqueda en estaciones
        const btnClear = container.querySelector('#btn-clear-dash-search');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                this.stationSearch = '';
                this.renderDashboard(container.id, this.currentStations);
            });
        }

        // Filtros en tab de estaciones
        container.querySelectorAll('.dash-chip:not(.dash-trip-chip)').forEach(chip => {
            chip.addEventListener('click', () => {
                this.stationFilter = chip.dataset.filter || 'all';
                this.renderDashboard(container.id, this.currentStations);
            });
        });

        // Ordenación en tab de estaciones
        const sortSelect = container.querySelector('#dash-sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.stationSort = e.target.value;
                this.renderDashboard(container.id, this.currentStations);
            });
        }

        // Buscador en log de viajes
        const tripSearchInput = container.querySelector('#dash-trip-search-input');
        if (tripSearchInput) {
            tripSearchInput.addEventListener('input', (e) => {
                this.tripSearch = e.target.value;
                const tabBody = container.querySelector('#dash-tab-body');
                if (tabBody) {
                    tabBody.innerHTML = this.renderUserTab();
                    this.attachDashboardEvents(container, stats);
                    const reTripInput = container.querySelector('#dash-trip-search-input');
                    if (reTripInput) {
                        reTripInput.focus();
                        reTripInput.setSelectionRange(reTripInput.value.length, reTripInput.value.length);
                    }
                }
            });
        }

        // Limpiar búsqueda en viajes
        const btnClearTrip = container.querySelector('#btn-clear-trip-search');
        if (btnClearTrip) {
            btnClearTrip.addEventListener('click', () => {
                this.tripSearch = '';
                this.renderDashboard(container.id, this.currentStations);
            });
        }

        // Filtros de viajes
        container.querySelectorAll('.dash-trip-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.tripFilter = chip.dataset.filter || 'all';
                this.renderDashboard(container.id, this.currentStations);
            });
        });

        // Botones "Ver en mapa"
        container.querySelectorAll('.btn-goto-station, .btn-card-goto-station').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stationId = btn.dataset.id;
                if (stationId) {
                    // Cerrar modal
                    document.getElementById('dashboard-modal')?.classList.add('hidden');
                    
                    // Abrir estación
                    if (typeof window.openStationById === 'function') {
                        window.openStationById(stationId);
                    } else if (typeof window.loadStationDetails === 'function') {
                        const st = (window.stationsData || []).find(s => String(s.station_id) === String(stationId));
                        if (st) window.loadStationDetails(st);
                    }
                }
            });
        });
    }
}

// Instancia global
const dashboard = new AdvancedDashboard();
window.Dashboard = dashboard;
window.AdvancedDashboard = AdvancedDashboard;

console.log('📊 Advanced Network & Personal Dashboard loaded');
