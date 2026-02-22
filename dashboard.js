/**
 * 📊 DASHBOARD DE MÉTRICAS AVANZADO (#11)
 * Sistema avanzado de análisis de datos y métricas personalizadas
 */

class AdvancedDashboard {
    constructor() {
        this.historicalData = this.loadHistoricalData();
    }

    // ====== GESTIÓN DE DATOS HISTÓRICOS ======
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
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        
        if (!this.historicalData.monthly[currentMonth]) {
            this.historicalData.monthly[currentMonth] = {
                km: 0,
                trips: 0,
                co2: 0,
                avgDistance: 0
            };
        }
        
        const monthTrips = this.historicalData.trips.filter(t => 
            t.date.startsWith(currentMonth)
        );
        
        const stats = this.historicalData.monthly[currentMonth];
        stats.trips = monthTrips.length;
        stats.km = monthTrips.reduce((sum, t) => sum + t.distance, 0);
        stats.co2 = stats.km * 0.12;
        stats.avgDistance = stats.trips > 0 ? stats.km / stats.trips : 0;
    }

    // ====== ANÁLISIS DE PATRONES ======
    getBestHours() {
        const hourCounts = new Array(24).fill(0);
        const hourDistances = new Array(24).fill(0);
        
        this.historicalData.trips.forEach(trip => {
            hourCounts[trip.hour]++;
            hourDistances[trip.hour] += trip.distance;
        });
        
        const hours = hourCounts.map((count, hour) => ({
            hour,
            trips: count,
            avgDistance: count > 0 ? hourDistances[hour] / count : 0
        })).filter(h => h.trips > 0).sort((a, b) => b.trips - a.trips);
        
        return hours.slice(0, 3);
    }

    getMostFrequentRoutes() {
        const stationCount = {};
        
        this.historicalData.trips.forEach(trip => {
            stationCount[trip.stationId] = (stationCount[trip.stationId] || 0) + 1;
        });
        
        return Object.entries(stationCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([stationId, count]) => ({ stationId, count }));
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

    // ====== COMPARACIÓN CON MES ANTERIOR ======
    compareWithPreviousMonth() {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1))
            .toISOString().slice(0, 7);
        
        const current = this.historicalData.monthly[currentMonth] || { km: 0, trips: 0, co2: 0 };
        const previous = this.historicalData.monthly[lastMonth] || { km: 0, trips: 0, co2: 0 };
        
        return {
            km: {
                current: current.km,
                previous: previous.km,
                change: previous.km > 0 ? ((current.km - previous.km) / previous.km * 100) : 0,
                trend: current.km > previous.km ? 'up' : 'down'
            },
            trips: {
                current: current.trips,
                previous: previous.trips,
                change: previous.trips > 0 ? ((current.trips - previous.trips) / previous.trips * 100) : 0,
                trend: current.trips > previous.trips ? 'up' : 'down'
            },
            co2: {
                current: current.co2,
                previous: previous.co2,
                change: previous.co2 > 0 ? ((current.co2 - previous.co2) / previous.co2 * 100) : 0,
                trend: current.co2 > previous.co2 ? 'up' : 'down'
            }
        };
    }

    // ====== PREDICCIÓN DE OBJETIVOS ======
    predictMonthlyGoal(targetKm = 100) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const currentStats = this.historicalData.monthly[currentMonth] || { km: 0 };
        
        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const daysPassed = today.getDate();
        const daysRemaining = daysInMonth - daysPassed;
        
        const currentKm = currentStats.km;
        const dailyAverage = currentKm / daysPassed;
        const projectedKm = currentKm + (dailyAverage * daysRemaining);
        
        const kmNeeded = Math.max(0, targetKm - currentKm);
        const dailyNeeded = daysRemaining > 0 ? kmNeeded / daysRemaining : 0;
        
        return {
            current: currentKm,
            target: targetKm,
            projected: projectedKm,
            kmNeeded: kmNeeded,
            dailyAverage: dailyAverage,
            dailyNeeded: dailyNeeded,
            onTrack: projectedKm >= targetKm,
            progress: (currentKm / targetKm * 100).toFixed(1),
            daysRemaining: daysRemaining
        };
    }

    // ====== ANÁLISIS DE RENDIMIENTO ======
    getPerformanceMetrics() {
        const last30Days = this.historicalData.trips.filter(trip => {
            const tripDate = new Date(trip.date);
            const daysDiff = (new Date() - tripDate) / (1000 * 60 * 60 * 24);
            return daysDiff <= 30;
        });
        
        const totalKm = last30Days.reduce((sum, t) => sum + t.distance, 0);
        const avgTripLength = last30Days.length > 0 ? totalKm / last30Days.length : 0;
        const longestTrip = last30Days.length > 0 ? 
            Math.max(...last30Days.map(t => t.distance)) : 0;
        
        return {
            totalKm: totalKm.toFixed(1),
            totalTrips: last30Days.length,
            avgTripLength: avgTripLength.toFixed(1),
            longestTrip: longestTrip.toFixed(1),
            co2Saved: (totalKm * 0.12).toFixed(1),
            caloriesBurned: (totalKm * 25).toFixed(0)
        };
    }

    // ====== RECOMENDACIONES PERSONALIZADAS ======
    getPersonalizedRecommendations() {
        const recommendations = [];
        const bestHours = this.getBestHours();
        const comparison = this.compareWithPreviousMonth();
        const prediction = this.predictMonthlyGoal();
        
        // Recomendación de horario
        if (bestHours.length > 0) {
            recommendations.push({
                type: 'schedule',
                icon: '⏰',
                title: 'Mejor horario',
                message: `Sueles usar más bicis a las ${bestHours[0].hour}:00h`
            });
        }
        
        // Recomendación de objetivo
        if (!prediction.onTrack && prediction.daysRemaining > 0) {
            recommendations.push({
                type: 'goal',
                icon: '🎯',
                title: 'Meta mensual',
                message: `Necesitas ${prediction.dailyNeeded.toFixed(1)}km/día para alcanzar tu objetivo`
            });
        }
        
        // Recomendación de mejora
        if (comparison.km.trend === 'down') {
            recommendations.push({
                type: 'motivation',
                icon: '💪',
                title: 'Actívate',
                message: `El mes pasado recorriste ${comparison.km.change.toFixed(0)}% más. ¡Tú puedes!`
            });
        }
        
        // Logro cercano
        if (typeof Gamification !== 'undefined') {
            const stats = Gamification.getUserStats();
            if (stats.km >= 95 && stats.km < 100) {
                recommendations.push({
                    type: 'achievement',
                    icon: '🏆',
                    title: 'Logro cerca',
                    message: `¡Solo te faltan ${(100 - stats.km).toFixed(1)}km para "Maratonista"!`
                });
            }
        }
        
        return recommendations;
    }

    // ====== RENDERIZADO UI ======
    renderDashboard(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const bestHours = this.getBestHours();
        const weekPattern = this.getWeekdayPattern();
        const comparison = this.compareWithPreviousMonth();
        const prediction = this.predictMonthlyGoal();
        const performance = this.getPerformanceMetrics();
        const recommendations = this.getPersonalizedRecommendations();
        
        container.innerHTML = `
            <!-- Recomendaciones -->
            <div class="recommendations-section">
                <h3>💡 Recomendaciones Personalizadas</h3>
                <div class="recommendations-grid">
                    ${recommendations.map(rec => `
                        <div class="recommendation-card">
                            <span class="rec-icon">${rec.icon}</span>
                            <strong>${rec.title}</strong>
                            <p>${rec.message}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Objetivo mensual -->
            <div class="goal-section">
                <h3>🎯 Objetivo del Mes</h3>
                <div class="goal-card ${prediction.onTrack ? 'on-track' : 'off-track'}">
                    <div class="goal-header">
                        <span class="goal-current">${prediction.current.toFixed(1)} km</span>
                        <span class="goal-target">/ ${prediction.target} km</span>
                    </div>
                    <div class="goal-progress-bar">
                        <div class="goal-progress-fill" style="width: ${Math.min(prediction.progress, 100)}%"></div>
                    </div>
                    <div class="goal-details">
                        <div class="goal-stat">
                            <span>Proyectado</span>
                            <strong>${prediction.projected.toFixed(1)} km</strong>
                        </div>
                        <div class="goal-stat">
                            <span>Diario necesario</span>
                            <strong>${prediction.dailyNeeded.toFixed(1)} km</strong>
                        </div>
                        <div class="goal-stat">
                            <span>Días restantes</span>
                            <strong>${prediction.daysRemaining}</strong>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Comparación mensual -->
            <div class="comparison-section">
                <h3>📊 Comparación con Mes Anterior</h3>
                <div class="comparison-grid">
                    <div class="comparison-card">
                        <span class="comparison-icon">🚴</span>
                        <div class="comparison-data">
                            <strong>${comparison.km.current.toFixed(1)} km</strong>
                            <span class="comparison-change ${comparison.km.trend}">
                                ${comparison.km.trend === 'up' ? '↑' : '↓'} ${Math.abs(comparison.km.change).toFixed(0)}%
                            </span>
                        </div>
                    </div>
                    <div class="comparison-card">
                        <span class="comparison-icon">🚲</span>
                        <div class="comparison-data">
                            <strong>${comparison.trips.current} viajes</strong>
                            <span class="comparison-change ${comparison.trips.trend}">
                                ${comparison.trips.trend === 'up' ? '↑' : '↓'} ${Math.abs(comparison.trips.change).toFixed(0)}%
                            </span>
                        </div>
                    </div>
                    <div class="comparison-card">
                        <span class="comparison-icon">🌱</span>
                        <div class="comparison-data">
                            <strong>${comparison.co2.current.toFixed(1)} kg CO2</strong>
                            <span class="comparison-change ${comparison.co2.trend}">
                                ${comparison.co2.trend === 'up' ? '↑' : '↓'} ${Math.abs(comparison.co2.change).toFixed(0)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Mejores horarios -->
            <div class="insights-section">
                <h3>⏰ Tus Mejores Horarios</h3>
                <div class="hours-list">
                    ${bestHours.map((h, i) => `
                        <div class="hour-item">
                            <span class="hour-rank">${i + 1}</span>
                            <span class="hour-time">${h.hour}:00 - ${h.hour + 1}:00</span>
                            <span class="hour-trips">${h.trips} viajes</span>
                            <span class="hour-avg">${h.avgDistance.toFixed(1)} km/viaje</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Patrón semanal -->
            <div class="pattern-section">
                <h3>📅 Patrón Semanal</h3>
                <div class="weekday-chart">
                    ${weekPattern.map(day => `
                        <div class="weekday-bar">
                            <div class="weekday-fill" style="height: ${day.km > 0 ? (day.km / Math.max(...weekPattern.map(d => d.km)) * 100) : 0}%">
                                <span class="weekday-value">${day.km.toFixed(0)}</span>
                            </div>
                            <span class="weekday-label">${day.day}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Rendimiento últimos 30 días -->
            <div class="performance-section">
                <h3>📈 Últimos 30 Días</h3>
                <div class="performance-grid">
                    <div class="perf-card">
                        <span class="perf-icon">🚴</span>
                        <strong>${performance.totalKm} km</strong>
                        <span>Distancia total</span>
                    </div>
                    <div class="perf-card">
                        <span class="perf-icon">🚲</span>
                        <strong>${performance.totalTrips}</strong>
                        <span>Viajes</span>
                    </div>
                    <div class="perf-card">
                        <span class="perf-icon">📏</span>
                        <strong>${performance.avgTripLength} km</strong>
                        <span>Promedio/viaje</span>
                    </div>
                    <div class="perf-card">
                        <span class="perf-icon">🏔️</span>
                        <strong>${performance.longestTrip} km</strong>
                        <span>Viaje más largo</span>
                    </div>
                </div>
            </div>
        `;
    }
}

// Crear instancia global
const dashboard = new AdvancedDashboard();

// Exportar para uso global
window.Dashboard = dashboard;

console.log('📊 Advanced Dashboard loaded');
