/**
 * 🎮 SISTEMA DE GAMIFICACIÓN (#4)
 * Sistema completo de logros, niveles, badges y desafíos
 */

class GamificationSystem {
    constructor() {
        this.achievements = this.defineAchievements();
        this.levels = this.defineLevels();
        this.unlockedAchievements = this.loadUnlockedAchievements();
        this.userLevel = this.calculateUserLevel();
        this.dailyStreak = this.loadStreak();
    }

    // ====== DEFINICIÓN DE LOGROS ======
    defineAchievements() {
        return {
            // Logros de distancia
            'primer_km': {
                id: 'primer_km',
                name: 'Primer Kilómetro',
                description: 'Completa tu primer kilómetro en bici',
                icon: '🚲',
                condition: (stats) => stats.km >= 1,
                points: 10,
                category: 'distance'
            },
            'explorador': {
                id: 'explorador',
                name: 'Explorador',
                description: 'Visita 10 estaciones diferentes',
                icon: '🗺️',
                condition: (stats) => stats.uniqueStations >= 10,
                points: 25,
                category: 'exploration'
            },
            'madrugador': {
                id: 'madrugador',
                name: 'Madrugador',
                description: 'Usa una bici antes de las 7:00 AM',
                icon: '🌅',
                condition: (stats) => stats.earlyRides > 0,
                points: 15,
                category: 'special'
            },
            'eco_warrior': {
                id: 'eco_warrior',
                name: 'Eco Guerrero',
                description: 'Ahorra 50 kg de CO2',
                icon: '🌱',
                condition: (stats) => stats.co2 >= 50,
                points: 50,
                category: 'environmental'
            },
            'maraton': {
                id: 'maraton',
                name: 'Maratonista',
                description: 'Recorre 100 km en total',
                icon: '🏃',
                condition: (stats) => stats.km >= 100,
                points: 100,
                category: 'distance'
            },
            'adventure': {
                id: 'adventure',
                name: 'Aventurero',
                description: 'Completa una ruta de +20 km en un día',
                icon: '🏔️',
                condition: (stats) => stats.longestRide >= 20,
                points: 75,
                category: 'challenge'
            },
            'turistacompleto': {
                id: 'turista_completo',
                name: 'Turista Completo',
                description: 'Completa todas las rutas turísticas',
                icon: '📸',
                condition: (stats) => stats.touristRoutesCompleted >= 3,
                points: 100,
                category: 'tourist'
            },
            'nocturno': {
                id: 'nocturno',
                name: 'Ciclista Nocturno',
                description: 'Usa una bici después de las 10:00 PM',
                icon: '🌙',
                condition: (stats) => stats.nightRides > 0,
                points: 20,
                category: 'special'
            },
            'racha_7': {
                id: 'racha_7',
                name: 'Racha Semanal',
                description: 'Usa bici 7 días seguidos',
                icon: '🔥',
                condition: (stats) => stats.streak >= 7,
                points: 50,
                category: 'streak'
            },
            'velocista': {
                id: 'velocista',
                name: 'Velocista',
                description: 'Completa 10 viajes en una semana',
                icon: '⚡',
                condition: (stats) => stats.weeklyRides >= 10,
                points: 40,
                category: 'frequency'
            },
            'reportero': {
                id: 'reportero',
                name: 'Reportero Ciudadano',
                description: 'Envía 5 reportes de problemas',
                icon: '📝',
                condition: (stats) => stats.reports >= 5,
                points: 30,
                category: 'community'
            },
            'centenario': {
                id: 'centenario',
                name: 'Centenario',
                description: 'Alcanza 100 viajes completados',
                icon: '💯',
                condition: (stats) => stats.totalTrips >= 100,
                points: 200,
                category: 'milestone'
            }
        };
    }

    // ====== NIVELES ======
    defineLevels() {
        return [
            { level: 1, name: 'Principiante', minPoints: 0, badge: '🚴', color: '#95a5a6' },
            { level: 2, name: 'Ciclista', minPoints: 50, badge: '🚴‍♂️', color: '#3498db' },
            { level: 3, name: 'Experimentado', minPoints: 150, badge: '🚴‍♀️', color: '#2ecc71' },
            { level: 4, name: 'Veterano', minPoints: 300, badge: '🏆', color: '#f39c12' },
            { level: 5, name: 'Maestro', minPoints: 500, badge: '👑', color: '#9b59b6' },
            { level: 6, name: 'Leyenda', minPoints: 1000, badge: '⭐', color: '#f1c40f' },
            { level: 7, name: 'Inmortal', minPoints: 2000, badge: '✨', color: '#e74c3c' }
        ];
    }

    // ====== GESTIÓN DE LOGROS ======
    loadUnlockedAchievements() {
        try {
            return JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
        } catch (e) {
            return [];
        }
    }

    saveUnlockedAchievements() {
        localStorage.setItem('unlockedAchievements', JSON.stringify(this.unlockedAchievements));
    }

    checkAchievements() {
        const stats = this.getUserStats();
        const newAchievements = [];

        Object.values(this.achievements).forEach(achievement => {
            if (!this.unlockedAchievements.includes(achievement.id)) {
                if (achievement.condition(stats)) {
                    this.unlockAchievement(achievement.id);
                    newAchievements.push(achievement);
                }
            }
        });

        return newAchievements;
    }

    unlockAchievement(achievementId) {
        if (this.unlockedAchievements.includes(achievementId)) return;
        
        this.unlockedAchievements.push(achievementId);
        this.saveUnlockedAchievements();
        
        const achievement = this.achievements[achievementId];
        this.showAchievementNotification(achievement);
        this.playConfetti();
        
        // Actualizar puntos totales
        const currentPoints = this.getTotalPoints();
        localStorage.setItem('totalPoints', currentPoints);
        
        // Verificar si subió de nivel
        this.checkLevelUp();
    }

    showAchievementNotification(achievement) {
        const notification = document.createElement('div');
        notification.className = 'achievement-badge';
        notification.innerHTML = `
            <h4>${achievement.icon} ¡Logro Desbloqueado!</h4>
            <p><strong>${achievement.name}</strong></p>
            <p style="font-size:0.85rem; opacity:0.9;">${achievement.description}</p>
            <p style="font-size:0.8rem; margin-top:5px;">+${achievement.points} puntos</p>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.5s ease-out forwards';
            setTimeout(() => notification.remove(), 500);
        }, 4000);
    }

    // ====== SISTEMA DE NIVELES ======
    getTotalPoints() {
        let total = 0;
        this.unlockedAchievements.forEach(achievementId => {
            const achievement = this.achievements[achievementId];
            if (achievement) {
                total += achievement.points;
            }
        });
        return total;
    }

    calculateUserLevel() {
        const points = this.getTotalPoints();
        let currentLevel = this.levels[0];
        
        for (let i = this.levels.length - 1; i >= 0; i--) {
            if (points >= this.levels[i].minPoints) {
                currentLevel = this.levels[i];
                break;
            }
        }
        
        return currentLevel;
    }

    getNextLevel() {
        const currentLevelIndex = this.levels.findIndex(l => l.level === this.userLevel.level);
        if (currentLevelIndex < this.levels.length - 1) {
            return this.levels[currentLevelIndex + 1];
        }
        return null;
    }

    getProgressToNextLevel() {
        const currentPoints = this.getTotalPoints();
        const nextLevel = this.getNextLevel();
        
        if (!nextLevel) return 100;
        
        const pointsInCurrentLevel = currentPoints - this.userLevel.minPoints;
        const pointsNeededForNext = nextLevel.minPoints - this.userLevel.minPoints;
        
        return (pointsInCurrentLevel / pointsNeededForNext) * 100;
    }

    checkLevelUp() {
        const newLevel = this.calculateUserLevel();
        const oldLevelNum = this.userLevel.level;
        
        if (newLevel.level > oldLevelNum) {
            this.userLevel = newLevel;
            this.showLevelUpNotification(newLevel);
        }
    }

    showLevelUpNotification(level) {
        const notification = document.createElement('div');
        notification.className = 'achievement-badge';
        notification.style.background = `linear-gradient(135deg, ${level.color} 0%, ${level.color}dd 100%)`;
        notification.innerHTML = `
            <h4 style="font-size:2rem;">${level.badge}</h4>
            <h4>¡Nivel ${level.level} Alcanzado!</h4>
            <p><strong>${level.name}</strong></p>
        `;
        
        document.body.appendChild(notification);
        this.playConfetti();
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.5s ease-out forwards';
            setTimeout(() => notification.remove(), 500);
        }, 5000);
    }

    // ====== ESTADÍSTICAS ======
    getUserStats() {
        const basicStats = JSON.parse(localStorage.getItem('biciStats') || '{"km":0, "co2":0, "cal":0}');
        const advancedStats = JSON.parse(localStorage.getItem('advancedStats') || '{}');
        
        return {
            km: basicStats.km || 0,
            co2: basicStats.co2 || 0,
            cal: basicStats.cal || 0,
            uniqueStations: advancedStats.uniqueStations || 0,
            earlyRides: advancedStats.earlyRides || 0,
            nightRides: advancedStats.nightRides || 0,
            longestRide: advancedStats.longestRide || 0,
            touristRoutesCompleted: advancedStats.touristRoutesCompleted || 0,
            streak: this.dailyStreak,
            weeklyRides: advancedStats.weeklyRides || 0,
            reports: advancedStats.reports || 0,
            totalTrips: advancedStats.totalTrips || 0
        };
    }

    updateStats(updates) {
        const current = JSON.parse(localStorage.getItem('advancedStats') || '{}');
        const merged = { ...current, ...updates };
        localStorage.setItem('advancedStats', JSON.stringify(merged));
    }

    // ====== RACHA DIARIA ======
    loadStreak() {
        try {
            const data = JSON.parse(localStorage.getItem('dailyStreak') || '{"count":0, "lastDate":null}');
            return this.validateStreak(data);
        } catch (e) {
            return 0;
        }
    }

    validateStreak(streakData) {
        if (!streakData.lastDate) return 0;
        
        const lastDate = new Date(streakData.lastDate);
        const today = new Date();
        const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return streakData.count; // Mismo día
        if (diffDays === 1) return streakData.count; // Día consecutivo
        return 0; // Se rompió la racha
    }

    updateStreak() {
        const data = this.loadStreak();
        const today = new Date().toDateString();
        const lastDate = data.lastDate ? new Date(data.lastDate).toDateString() : null;
        
        if (today === lastDate) {
            // Ya se registró hoy
            return data.count;
        }
        
        const newCount = data.count + 1;
        localStorage.setItem('dailyStreak', JSON.stringify({
            count: newCount,
            lastDate: new Date().toISOString()
        }));
        
        this.dailyStreak = newCount;
        return newCount;
    }

    // ====== EFECTOS VISUALES ======
    playConfetti() {
        const confettiContainer = document.createElement('div');
        confettiContainer.className = 'confetti-container';
        
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.animationDelay = Math.random() * 3 + 's';
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
            confettiContainer.appendChild(confetti);
        }
        
        document.body.appendChild(confettiContainer);
        
        setTimeout(() => confettiContainer.remove(), 5000);
    }

    playSparkles(element) {
        for (let i = 0; i < 8; i++) {
            const sparkle = document.createElement('div');
            sparkle.className = 'sparkle';
            const angle = (i / 8) * Math.PI * 2;
            const distance = 30;
            sparkle.style.left = element.offsetLeft + element.offsetWidth / 2 + Math.cos(angle) * distance + 'px';
            sparkle.style.top = element.offsetTop + element.offsetHeight / 2 + Math.sin(angle) * distance + 'px';
            document.body.appendChild(sparkle);
            
            setTimeout(() => sparkle.remove(), 1000);
        }
    }

    // ====== DESAFÍOS SEMANALES ======
    getWeeklyChallenges() {
        return [
            {
                id: 'weekly_distance',
                name: 'Recorre 50 km esta semana',
                progress: this.getUserStats().km, // Esto debería ser semanal
                target: 50,
                reward: 50,
                icon: '🎯'
            },
            {
                id: 'weekly_stations',
                name: 'Visita 15 estaciones diferentes',
                progress: this.getUserStats().uniqueStations,
                target: 15,
                reward: 30,
                icon: '🗺️'
            },
            {
                id: 'weekly_eco',
                name: 'Ahorra 10 kg de CO2',
                progress: this.getUserStats().co2,
                target: 10,
                reward: 25,
                icon: '🌍'
            }
        ];
    }

    // ====== UI HELPERS ======
    renderAchievementsList(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const categories = {};
        Object.values(this.achievements).forEach(achievement => {
            if (!categories[achievement.category]) {
                categories[achievement.category] = [];
            }
            categories[achievement.category].push(achievement);
        });
        
        let html = '';
        Object.entries(categories).forEach(([category, achievements]) => {
            html += `<div class="achievement-category">
                <h4>${this.getCategoryName(category)}</h4>`;
            
            achievements.forEach(achievement => {
                const unlocked = this.unlockedAchievements.includes(achievement.id);
                html += `
                    <div class="achievement-item ${unlocked ? 'unlocked' : 'locked'}">
                        <span class="achievement-icon">${achievement.icon}</span>
                        <div class="achievement-info">
                            <strong>${achievement.name}</strong>
                            <p>${achievement.description}</p>
                            <span class="achievement-points">${achievement.points} puntos</span>
                        </div>
                        ${unlocked ? '<span class="achievement-check">✓</span>' : ''}
                    </div>
                `;
            });
            
            html += '</div>';
        });
        
        container.innerHTML = html;
    }

    getCategoryName(category) {
        const names = {
            distance: '📏 Distancia',
            exploration: '🗺️ Exploración',
            special: '⭐ Especial',
            environmental: '🌱 Ecológico',
            challenge: '🏔️ Desafío',
            tourist: '📸 Turismo',
            streak: '🔥 Racha',
            frequency: '⚡ Frecuencia',
            community: '👥 Comunidad',
            milestone: '🎉 Hito'
        };
        return names[category] || category;
    }

    renderLevelProgress(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const progress = this.getProgressToNextLevel();
        const nextLevel = this.getNextLevel();
        const totalPoints = this.getTotalPoints();
        
        container.innerHTML = `
            <div class="level-display">
                <div class="level-badge" style="background:${this.userLevel.color}">
                    <span class="level-icon">${this.userLevel.badge}</span>
                    <span class="level-number">Nivel ${this.userLevel.level}</span>
                </div>
                <div class="level-info">
                    <h3>${this.userLevel.name}</h3>
                    <p>${totalPoints} puntos totales</p>
                    ${nextLevel ? `
                        <div class="progress-bar">
                            <div class="progress-fill" style="width:${progress}%"></div>
                        </div>
                        <p class="next-level">Siguiente: ${nextLevel.name} (${nextLevel.minPoints - totalPoints} puntos)</p>
                    ` : '<p class="max-level">¡Nivel máximo alcanzado!</p>'}
                </div>
            </div>
        `;
    }
}

// Crear instancia global
const gamification = new GamificationSystem();

// Exportar para uso global
window.Gamification = gamification;

console.log('🎮 Gamification system loaded');
