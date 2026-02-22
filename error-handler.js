/**
 * 🛡️ SISTEMA DE MANEJO DE ERRORES ROBUSTO (#10)
 * Error handling con retry logic y graceful degradation
 */

class ErrorHandler {
    constructor() {
        this.retryAttempts = 3;
        this.retryDelay = 1000; // 1 segundo inicial
        this.maxRetryDelay = 10000; // 10 segundos máximo
        this.errorLog = [];
        this.isOnline = navigator.onLine;
        
        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showToast('Conexión restaurada', 'success');
            this.retryFailedRequests();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showToast('Sin conexión a Internet', 'warning');
        });
        
        // Capturar errores globales
        window.addEventListener('error', (event) => {
            this.logError({
                type: 'runtime',
                message: event.message,
                source: event.filename,
                line: event.lineno,
                timestamp: new Date().toISOString()
            });
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.logError({
                type: 'promise',
                message: event.reason,
                timestamp: new Date().toISOString()
            });
        });
    }

    // ====== RETRY CON EXPONENTIAL BACKOFF ======
    async fetchWithRetry(url, options = {}, attempt = 1) {
        try {
            if (!this.isOnline) {
                throw new Error('Sin conexión a Internet');
            }
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
            
        } catch (error) {
            this.logError({
                type: 'network',
                url,
                attempt,
                message: error.message,
                timestamp: new Date().toISOString()
            });
            
            if (attempt < this.retryAttempts) {
                const delay = Math.min(
                    this.retryDelay * Math.pow(2, attempt - 1),
                    this.maxRetryDelay
                );
                
                this.showToast(`Error al cargar datos. Reintentando (${attempt}/${this.retryAttempts})...`, 'warning');
                
                await this.sleep(delay);
                return this.fetchWithRetry(url, options, attempt + 1);
            }
            
            throw error;
        }
    }

    // ====== WRAPPER PARA FUNCIONES CRÍTICAS ======
    async executeWithFallback(primaryFn, fallbackFn, errorMessage) {
        try {
            return await primaryFn();
        } catch (error) {
            this.logError({
                type: 'execution',
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            
            console.warn(`Primary function failed: ${error.message}`);
            
            if (fallbackFn) {
                try {
                    this.showToast('Usando modo offline', 'info');
                    return await fallbackFn();
                } catch (fallbackError) {
                    this.logError({
                        type: 'fallback',
                        message: fallbackError.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            
            this.showToast(errorMessage || 'Error al procesar la solicitud', 'error');
            throw error;
        }
    }

    // ====== VALIDACIÓN DE DATOS ======
    validateStationData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Datos de estación inválidos');
        }
        
        const required = ['station_id', 'name', 'latitude', 'longitude'];
        const missing = required.filter(field => !(field in data));
        
        if (missing.length > 0) {
            throw new Error(`Faltan campos requeridos: ${missing.join(', ')}`);
        }
        
        if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
            throw new Error('Coordenadas inválidas');
        }
        
        if (data.latitude < -90 || data.latitude > 90 || data.longitude < -180 || data.longitude > 180) {
            throw new Error('Coordenadas fuera de rango');
        }
        
        return true;
    }

    validateTripData(trip) {
        if (!trip || typeof trip !== 'object') {
            throw new Error('Datos de viaje inválidos');
        }
        
        const required = ['stationId', 'date', 'distance'];
        const missing = required.filter(field => !(field in trip));
        
        if (missing.length > 0) {
            throw new Error(`Faltan campos requeridos: ${missing.join(', ')}`);
        }
        
        if (typeof trip.distance !== 'number' || trip.distance < 0) {
            throw new Error('Distancia inválida');
        }
        
        return true;
    }

    // ====== MANEJO DE ERRORES DE API ======
    handleAPIError(error, context = '') {
        let userMessage = 'Error al conectar con el servidor';
        
        if (error.message.includes('Failed to fetch')) {
            userMessage = 'No se pudo conectar. Verifica tu conexión a Internet.';
        } else if (error.message.includes('timeout')) {
            userMessage = 'La solicitud tardó demasiado. Intenta de nuevo.';
        } else if (error.message.includes('404')) {
            userMessage = 'Recurso no encontrado.';
        } else if (error.message.includes('500') || error.message.includes('503')) {
            userMessage = 'El servidor está experimentando problemas.';
        }
        
        this.showToast(`${context ? context + ': ' : ''}${userMessage}`, 'error');
        
        return {
            success: false,
            error: userMessage
        };
    }

    // ====== LOGGING Y MONITOREO ======
    logError(errorData) {
        this.errorLog.push(errorData);
        
        // Mantener solo los últimos 100 errores
        if (this.errorLog.length > 100) {
            this.errorLog.shift();
        }
        
        // Persistir en localStorage
        try {
            localStorage.setItem('errorLog', JSON.stringify(this.errorLog.slice(-50)));
        } catch (e) {
            console.warn('No se pudo guardar el log de errores');
        }
        
        // En producción, enviar a servicio de telemetría
        if (this.shouldReportError(errorData)) {
            this.reportToTelemetry(errorData);
        }
    }

    shouldReportError(errorData) {
        // Reportar solo errores críticos o repetidos
        return errorData.type === 'runtime' || 
               this.errorLog.filter(e => e.message === errorData.message).length > 3;
    }

    reportToTelemetry(errorData) {
        // Placeholder para integración con Sentry, LogRocket, etc.
        console.log('📊 Telemetry:', errorData);
    }

    getErrorStats() {
        const stats = {
            total: this.errorLog.length,
            byType: {},
            recent: this.errorLog.slice(-10)
        };
        
        this.errorLog.forEach(error => {
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
        });
        
        return stats;
    }

    // ====== FALLBACKS ======
    async getOfflineData(key) {
        try {
            const cached = localStorage.getItem(key);
            return cached ? JSON.parse(cached) : null;
        } catch (e) {
            console.error('Error al leer datos offline:', e);
            return null;
        }
    }

    async retryFailedRequests() {
        // Reintentar solicitudes fallidas cuando vuelva la conexión
        console.log('🔄 Reintentando solicitudes fallidas...');
        // Implementación específica según las necesidades de la app
    }

    // ====== UI ======
    showToast(message, type = 'info') {
        const existingToast = document.querySelector('.error-toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = `error-toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${this.getIcon(type)}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    // ====== UTILIDADES ======
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearErrorLog() {
        this.errorLog = [];
        localStorage.removeItem('errorLog');
    }
}

// Instancia global
const errorHandler = new ErrorHandler();
window.ErrorHandler = errorHandler;

console.log('🛡️ Error Handler loaded');
