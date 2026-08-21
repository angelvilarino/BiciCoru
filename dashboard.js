/**
 * 📊 DASHBOARD DE RED Y ANALÍTICA AVANZADA
 * Panel de control en tiempo real: estadísticas globales de la flota,
 * ocupación de estaciones, alertas de rebalanceo y métricas de uso.
 */

class AdvancedDashboard {
    constructor() {
        this.historicalData = this.loadHistoricalData();
        this.currentStations = [];
        this.activeTab = 'overview';
        this.stationFilter = 'all';
        this.stationSearch = '';
        this.stationSort = 'occupancy-desc';
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
                leastOccupied: []
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

    // ====== GESTIÓN DE DATOS HISTÓRICOS DE USUARIO ======
    loadHistoricalData() {
        try {
            return JSON.parse(localStorage.getItem('historicalData') || '{"trips": [], "monthly": {}}');
        } catch (e) {
            return { trips: [], monthly: {} };
        }
    }

    saveHistoricalData() {
        localStorage.setItem('historicalData', JSON.stringify(this.historicalData));
    }

    recordTrip(tripData) {
        const trip = {
            date: new Date().toISOString(),
            distance: tripData.distance,
            duration: tripData.duration,
            stationId: tripData.stationId,
            hour: new Date().getHours(),
            dayOfWeek: new Date().getDay()
        };
        
        this.historicalData.trips.push(trip);
        this.updateMonthlyStats();
        this.saveHistoricalData();
    }

    updateMonthlyStats() {
        const currentMonth = new Date().toISOString().slice(0, 7);
        if (!this.historicalData.monthly[currentMonth]) {
            this.historicalData.monthly[currentMonth] = { km: 0, trips: 0, co2: 0, avgDistance: 0 };
        }
        const monthTrips = this.historicalData.trips.filter(t => t.date.startsWith(currentMonth));
        const stats = this.historicalData.monthly[currentMonth];
        stats.trips = monthTrips.length;
        stats.km = monthTrips.reduce((sum, t) => sum + t.distance, 0);
        stats.co2 = stats.km * 0.12;
        stats.avgDistance = stats.trips > 0 ? stats.km / stats.trips : 0;
    }

    getBestHours() {
        const hourCounts = new Array(24).fill(0);
        const hourDistances = new Array(24).fill(0);
        this.historicalData.trips.forEach(trip => {
            hourCounts[trip.hour]++;
            hourDistances[trip.hour] += trip.distance;
        });
        return hourCounts.map((count, hour) => ({
            hour,
            trips: count,
            avgDistance: count > 0 ? hourDistances[hour] / count : 0
        })).filter(h => h.trips > 0).sort((a, b) => b.trips - a.trips).slice(0, 3);
    }

    getWeekdayPattern() {
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const dayStats = new Array(7).fill(0).map(() => ({ trips: 0, km: 0 }));
        this.historicalData.trips.forEach(trip => {
            dayStats[trip.dayOfWeek].trips++;
            dayStats[trip.dayOfWeek].km += trip.distance;
        });
        return dayStats.map((stats, index) => ({
            day: days[index],
            ...stats,
            avgKm: stats.trips > 0 ? stats.km / stats.trips : 0
        }));
    }

    compareWithPreviousMonth() {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
        const current = this.historicalData.monthly[currentMonth] || { km: 0, trips: 0, co2: 0 };
        const previous = this.historicalData.monthly[lastMonth] || { km: 0, trips: 0, co2: 0 };
        return {
            km: {
                current: current.km,
                previous: previous.km,
                change: previous.km > 0 ? ((current.km - previous.km) / previous.km * 100) : 0,
                trend: current.km >= previous.km ? 'up' : 'down'
            },
            trips: {
                current: current.trips,
                previous: previous.trips,
                change: previous.trips > 0 ? ((current.trips - previous.trips) / previous.trips * 100) : 0,
                trend: current.trips >= previous.trips ? 'up' : 'down'
            },
            co2: {
                current: current.co2,
                previous: previous.co2,
                change: previous.co2 > 0 ? ((current.co2 - previous.co2) / previous.co2 * 100) : 0,
                trend: current.co2 >= previous.co2 ? 'up' : 'down'
            }
        };
    }

    predictMonthlyGoal(targetKm = 100) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const currentStats = this.historicalData.monthly[currentMonth] || { km: 0 };
        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const daysPassed = Math.max(1, today.getDate());
        const daysRemaining = Math.max(0, daysInMonth - daysPassed);
        const currentKm = currentStats.km;
        const dailyAverage = currentKm / daysPassed;
        const projectedKm = currentKm + (dailyAverage * daysRemaining);
        const kmNeeded = Math.max(0, targetKm - currentKm);
        const dailyNeeded = daysRemaining > 0 ? kmNeeded / daysRemaining : 0;
        return {
            current: currentKm,
            target: targetKm,
            projected: projectedKm,
            kmNeeded,
            dailyAverage,
            dailyNeeded,
            onTrack: projectedKm >= targetKm,
            progress: targetKm > 0 ? (currentKm / targetKm * 100).toFixed(1) : '0',
            daysRemaining
        };
    }

    getPerformanceMetrics() {
        const last30Days = this.historicalData.trips.filter(trip => {
            const tripDate = new Date(trip.date);
            return ((new Date() - tripDate) / (1000 * 60 * 60 * 24)) <= 30;
        });
        const totalKm = last30Days.reduce((sum, t) => sum + t.distance, 0);
        const avgTripLength = last30Days.length > 0 ? totalKm / last30Days.length : 0;
        const longestTrip = last30Days.length > 0 ? Math.max(...last30Days.map(t => t.distance)) : 0;
        return {
            totalKm: totalKm.toFixed(1),
            totalTrips: last30Days.length,
            avgTripLength: avgTripLength.toFixed(1),
            longestTrip: longestTrip.toFixed(1),
            co2Saved: (totalKm * 0.12).toFixed(1),
            caloriesBurned: (totalKm * 25).toFixed(0)
        };
    }

    getPersonalizedRecommendations() {
        const recommendations = [];
        const bestHours = this.getBestHours();
        const comparison = this.compareWithPreviousMonth();
        const prediction = this.predictMonthlyGoal();
        
        if (bestHours.length > 0) {
            recommendations.push({
                type: 'schedule',
                icon: '⏰',
                title: 'Mejor horario',
                message: `Sueles usar más bicis alrededor de las ${bestHours[0].hour}:00h.`
            });
        }
        
        if (!prediction.onTrack && prediction.daysRemaining > 0) {
            recommendations.push({
                type: 'goal',
                icon: '🎯',
                title: 'Meta mensual',
                message: `Necesitas ${prediction.dailyNeeded.toFixed(1)} km/día para alcanzar tu objetivo.`
            });
        }
        
        if (comparison.km.trend === 'down' && comparison.km.previous > 0) {
            recommendations.push({
                type: 'motivation',
                icon: '💪',
                title: 'Mantén el ritmo',
                message: `El mes pasado recorriste más distancia. ¡Una ruta hoy suma!`
            });
        }
        
        return recommendations;
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

    // ====== TAB 2: DETALLE DE TODAS LAS ESTACIONES ======
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
            list = list.filter(s => s.name.toLowerCase().includes(query));
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
                    <input type="text" id="dash-station-search-input" placeholder="Buscar estación por nombre..." value="${this.stationSearch}">
                    ${this.stationSearch ? `<button id="btn-clear-dash-search" class="clear-btn">✕</button>` : ''}
                </div>
                
                <div class="dash-filters-row">
                    <div class="dash-filter-chips">
                        <button class="dash-chip ${this.stationFilter === 'all' ? 'active' : ''}" data-filter="all">Todas (${stats.totalStations})</button>
                        <button class="dash-chip ${this.stationFilter === 'high' ? 'active' : ''}" data-filter="high">5+ Bicis (${stats.highAvailabilityStations.length})</button>
                        <button class="dash-chip ${this.stationFilter === 'empty' ? 'active' : ''}" data-filter="empty">🔴 Vacías (${stats.emptyStations.length})</button>
                        <button class="dash-chip ${this.stationFilter === 'full' ? 'active' : ''}" data-filter="full">🔵 Llenas (${stats.fullStations.length})</button>
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

            <!-- Listado de Estaciones -->
            <div class="dash-stations-grid">
                ${list.length === 0 ? `
                    <div class="dash-empty-state">
                        <i class="ph-bold ph-bicycle"></i>
                        <p>No se encontraron estaciones con los filtros seleccionados.</p>
                    </div>
                ` : list.map(st => {
                    const statusClass = st.available_bikes === 0 ? 'status-empty' : (st.available_bikes < 5 ? 'status-med' : 'status-high');
                    return `
                        <div class="dash-station-card ${statusClass}">
                            <div class="station-card-top">
                                <div class="st-card-name-group">
                                    <strong class="st-name">${st.name}</strong>
                                    <span class="st-id">#${st.station_id}</span>
                                </div>
                                <span class="st-occupancy-badge">${st.occupancyPercent}%</span>
                            </div>

                            <div class="st-card-bar-wrap">
                                <div class="st-card-bar-fill ${st.available_bikes === 0 ? 'bg-danger' : (st.available_bikes < 5 ? 'bg-warning' : 'bg-success')}" style="width:${Math.max(4, st.occupancyPercent)}%"></div>
                            </div>

                            <div class="st-card-metrics">
                                <div class="st-metric-item">
                                    <span class="metric-num ${st.available_bikes === 0 ? 'text-danger' : 'text-success'}">${st.available_bikes}</span>
                                    <span class="metric-lbl">Bicis</span>
                                </div>
                                <div class="st-metric-item">
                                    <span class="metric-num ${st.available_slots === 0 ? 'text-danger' : 'text-info'}">${st.available_slots}</span>
                                    <span class="metric-lbl">Huecos</span>
                                </div>
                                <div class="st-metric-item">
                                    <span class="metric-num">${st.total_capacity}</span>
                                    <span class="metric-lbl">Capacidad</span>
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
                                        <span class="alert-sub">Capacidad: ${st.total_capacity} | Huecos libres: ${st.available_slots}</span>
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

    // ====== TAB 4: ACTIVIDAD PERSONAL DE USUARIO ======
    renderUserTab() {
        const bestHours = this.getBestHours();
        const weekPattern = this.getWeekdayPattern();
        const comparison = this.compareWithPreviousMonth();
        const prediction = this.predictMonthlyGoal();
        const performance = this.getPerformanceMetrics();
        const recommendations = this.getPersonalizedRecommendations();

        return `
            <!-- Recomendaciones -->
            ${recommendations.length > 0 ? `
                <div class="dash-section-card">
                    <div class="section-card-header"><h4><i class="ph-bold ph-lightbulb"></i> Recomendaciones Inteligentes</h4></div>
                    <div class="dash-recommendations-grid">
                        ${recommendations.map(rec => `
                            <div class="rec-card ${rec.type}">
                                <span class="rec-icon">${rec.icon}</span>
                                <div class="rec-body">
                                    <strong>${rec.title}</strong>
                                    <p>${rec.message}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Métricas últimos 30 días -->
            <div class="dash-kpi-grid">
                <div class="dash-kpi-card accent-primary">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-path"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">Distancia Total</span>
                        <span class="kpi-value">${performance.totalKm} km</span>
                        <span class="kpi-footer-note">Últimos 30 días</span>
                    </div>
                </div>

                <div class="dash-kpi-card accent-success">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-bicycle"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">Total de Viajes</span>
                        <span class="kpi-value">${performance.totalTrips}</span>
                        <span class="kpi-footer-note">Promedio: ${performance.avgTripLength} km/viaje</span>
                    </div>
                </div>

                <div class="dash-kpi-card accent-info">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-plant"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">CO2 Ahorrado</span>
                        <span class="kpi-value">${performance.co2Saved} kg</span>
                        <span class="kpi-footer-note">Impacto ecológico</span>
                    </div>
                </div>

                <div class="dash-kpi-card accent-warning">
                    <div class="kpi-icon-wrap"><i class="ph-bold ph-fire"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-label">Calorías Quemadas</span>
                        <span class="kpi-value">${performance.caloriesBurned} kcal</span>
                        <span class="kpi-footer-note">Estimación de ejercicio</span>
                    </div>
                </div>
            </div>

            <!-- Objetivo Mensual -->
            <div class="dash-section-card">
                <div class="section-card-header">
                    <h4><i class="ph-bold ph-target"></i> Objetivo del Mes</h4>
                    <span class="section-hint">${prediction.current.toFixed(1)} km de ${prediction.target} km (${prediction.progress}%)</span>
                </div>
                <div class="dash-goal-progress-wrap">
                    <div class="dash-goal-bar">
                        <div class="dash-goal-fill" style="width: ${Math.min(100, Number(prediction.progress))}%"></div>
                    </div>
                    <div class="dash-goal-stats-row">
                        <div class="g-stat"><span>Proyectado fin de mes</span><b>${prediction.projected.toFixed(1)} km</b></div>
                        <div class="g-stat"><span>Diario necesario</span><b>${prediction.dailyNeeded.toFixed(1)} km/día</b></div>
                        <div class="g-stat"><span>Días restantes</span><b>${prediction.daysRemaining} días</b></div>
                    </div>
                </div>
            </div>
        `;
    }

    // ====== ATTACH EVENTS ======
    attachDashboardEvents(container, stats) {
        // Pestañas
        container.querySelectorAll('.dash-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (tab && this.activeTab !== tab) {
                    this.activeTab = tab;
                    this.renderDashboard(container.id, this.currentStations);
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
                    // Mantener foco y cursor en el input
                    const reInput = container.querySelector('#dash-station-search-input');
                    if (reInput) {
                        reInput.focus();
                        reInput.setSelectionRange(reInput.value.length, reInput.value.length);
                    }
                }
            });
        }

        // Limpiar búsqueda
        const btnClear = container.querySelector('#btn-clear-dash-search');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                this.stationSearch = '';
                this.renderDashboard(container.id, this.currentStations);
            });
        }

        // Filtros en tab de estaciones
        container.querySelectorAll('.dash-chip').forEach(chip => {
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
