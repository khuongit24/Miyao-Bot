/**
 * Graceful Degradation System
 * Handles failures gracefully with fallbacks and circuit breakers
 */

import logger from './logger.js';
import CircuitBreaker from './CircuitBreaker.js';
import { EventEmitter } from 'events';

/**
 * Service Health Status
 */
export const ServiceStatus = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNAVAILABLE: 'unavailable'
};

/**
 * Fallback Strategy
 */
class FallbackChain {
    constructor(name) {
        this.name = name;
        this.strategies = [];
        this.currentIndex = 0;
    }

    addStrategy(strategy, priority = 0) {
        this.strategies.push({ strategy, priority });
        // Sort by priority (higher first)
        this.strategies.sort((a, b) => b.priority - a.priority);
    }

    async execute(...args) {
        const errors = [];
        
        for (let i = 0; i < this.strategies.length; i++) {
            const { strategy } = this.strategies[i];
            
            try {
                const result = await strategy(...args);
                
                // Reset to first strategy on success
                if (i > 0) {
                    logger.info(`${this.name}: Fallback strategy ${i} succeeded, resetting to primary`);
                    this.currentIndex = 0;
                }
                
                return result;
            } catch (error) {
                errors.push({ strategy: i, error });
                logger.warn(`${this.name}: Strategy ${i} failed, trying next`, { error: error.message });
                
                // If last strategy, throw
                if (i === this.strategies.length - 1) {
                    const allErrors = errors.map(e => e.error.message).join(', ');
                    throw new Error(`All fallback strategies failed: ${allErrors}`);
                }
            }
        }
        
        throw new Error(`${this.name}: No strategies available`);
    }

    reset() {
        this.currentIndex = 0;
    }
}

/**
 * Service Degradation Manager
 */
export class DegradationManager extends EventEmitter {
    constructor() {
        super();
        this.services = new Map();
        this.fallbackChains = new Map();
        this.circuitBreakers = new Map();
    }

    /**
     * Register a service
     */
    registerService(name, config = {}) {
        this.services.set(name, {
            name,
            status: ServiceStatus.HEALTHY,
            lastCheck: Date.now(),
            config: {
                healthCheckInterval: config.healthCheckInterval || 30000,
                timeout: config.timeout || 10000,
                retries: config.retries || 3,
                ...config
            },
            stats: {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                lastError: null
            }
        });

        // Create circuit breaker for this service
        const breaker = new CircuitBreaker({
            name,
            failureThreshold: config.failureThreshold || 5,
            successThreshold: config.successThreshold || 2,
            timeout: config.circuitTimeout || 60000,
            resetTimeout: config.resetTimeout || 30000,
            onStateChange: (oldState, newState) => {
                this.handleCircuitBreakerStateChange(name, oldState, newState);
            }
        });

        this.circuitBreakers.set(name, breaker);
        
        logger.info(`Registered service: ${name}`);
    }

    /**
     * Register fallback chain
     */
    registerFallback(serviceName, strategies) {
        const chain = new FallbackChain(serviceName);
        
        strategies.forEach((strategy, index) => {
            chain.addStrategy(strategy.fn, strategy.priority || strategies.length - index);
        });
        
        this.fallbackChains.set(serviceName, chain);
        logger.info(`Registered fallback chain for: ${serviceName}`);
    }

    /**
     * Execute service with degradation handling
     */
    async execute(serviceName, fn, ...args) {
        const service = this.services.get(serviceName);
        if (!service) {
            throw new Error(`Service not registered: ${serviceName}`);
        }

        service.stats.totalRequests++;

        // Check circuit breaker
        const breaker = this.circuitBreakers.get(serviceName);
        
        try {
            // Execute through circuit breaker
            const result = await breaker.execute(async () => {
                return await this.executeWithTimeout(fn, service.config.timeout, ...args);
            });

            service.stats.successfulRequests++;
            this.updateServiceStatus(serviceName, ServiceStatus.HEALTHY);
            
            return result;
            
        } catch (error) {
            service.stats.failedRequests++;
            service.stats.lastError = error.message;

            // Try fallback if available
            const fallbackChain = this.fallbackChains.get(serviceName);
            if (fallbackChain) {
                try {
                    logger.warn(`${serviceName} failed, trying fallback`, { error: error.message });
                    const fallbackResult = await fallbackChain.execute(...args);
                    
                    this.updateServiceStatus(serviceName, ServiceStatus.DEGRADED);
                    return fallbackResult;
                    
                } catch (fallbackError) {
                    this.updateServiceStatus(serviceName, ServiceStatus.UNAVAILABLE);
                    throw fallbackError;
                }
            }

            this.updateServiceStatus(serviceName, ServiceStatus.UNAVAILABLE);
            throw error;
        }
    }

    /**
     * Execute with timeout
     */
    async executeWithTimeout(fn, timeout, ...args) {
        return Promise.race([
            fn(...args),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Operation timeout')), timeout)
            )
        ]);
    }

    /**
     * Update service status
     */
    updateServiceStatus(serviceName, newStatus) {
        const service = this.services.get(serviceName);
        if (!service) return;

        const oldStatus = service.status;
        if (oldStatus !== newStatus) {
            service.status = newStatus;
            service.lastCheck = Date.now();
            
            this.emit('statusChange', {
                service: serviceName,
                oldStatus,
                newStatus,
                timestamp: Date.now()
            });

            logger.info(`Service status changed: ${serviceName}`, {
                from: oldStatus,
                to: newStatus
            });
        }
    }

    /**
     * Handle circuit breaker state changes
     */
    handleCircuitBreakerStateChange(serviceName, oldState, newState) {
        logger.info(`Circuit breaker state changed: ${serviceName}`, {
            from: oldState,
            to: newState
        });

        // Map circuit breaker states to service status
        if (newState === 'OPEN') {
            this.updateServiceStatus(serviceName, ServiceStatus.UNAVAILABLE);
        } else if (newState === 'HALF_OPEN') {
            this.updateServiceStatus(serviceName, ServiceStatus.DEGRADED);
        } else if (newState === 'CLOSED') {
            this.updateServiceStatus(serviceName, ServiceStatus.HEALTHY);
        }
    }

    /**
     * Get service status
     */
    getServiceStatus(serviceName) {
        const service = this.services.get(serviceName);
        if (!service) return null;

        const breaker = this.circuitBreakers.get(serviceName);
        
        return {
            name: service.name,
            status: service.status,
            lastCheck: service.lastCheck,
            stats: service.stats,
            circuitBreaker: breaker ? breaker.getStats() : null
        };
    }

    /**
     * Get all services status
     */
    getAllStatus() {
        const status = {};
        
        for (const [name] of this.services) {
            status[name] = this.getServiceStatus(name);
        }
        
        return status;
    }

    /**
     * Check if service is available
     */
    isAvailable(serviceName) {
        const service = this.services.get(serviceName);
        return service && service.status !== ServiceStatus.UNAVAILABLE;
    }

    /**
     * Check if service is healthy
     */
    isHealthy(serviceName) {
        const service = this.services.get(serviceName);
        return service && service.status === ServiceStatus.HEALTHY;
    }

    /**
     * Reset service
     */
    resetService(serviceName) {
        const service = this.services.get(serviceName);
        if (!service) return;

        service.status = ServiceStatus.HEALTHY;
        service.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            lastError: null
        };

        const breaker = this.circuitBreakers.get(serviceName);
        if (breaker) {
            breaker.reset();
        }

        const fallback = this.fallbackChains.get(serviceName);
        if (fallback) {
            fallback.reset();
        }

        logger.info(`Service reset: ${serviceName}`);
    }

    /**
     * Health check for all services
     */
    async runHealthChecks() {
        const results = {};
        
        for (const [name, service] of this.services) {
            if (service.config.healthCheck) {
                try {
                    await service.config.healthCheck();
                    this.updateServiceStatus(name, ServiceStatus.HEALTHY);
                    results[name] = { healthy: true };
                } catch (error) {
                    this.updateServiceStatus(name, ServiceStatus.UNAVAILABLE);
                    results[name] = { healthy: false, error: error.message };
                }
            }
        }
        
        return results;
    }
}

/**
 * Create specific degradation strategies
 */

/**
 * Lavalink Degradation Strategy
 */
export function createLavalinkDegradation(musicManager) {
    const degradation = new DegradationManager();
    
    // Register Lavalink service
    degradation.registerService('lavalink', {
        healthCheckInterval: 30000,
        timeout: 10000,
        failureThreshold: 5,
        successThreshold: 2,
        healthCheck: async () => {
            // Check if any nodes are connected
            if (!musicManager.shoukaku || musicManager.shoukaku.nodes.size === 0) {
                throw new Error('No Lavalink nodes available');
            }
            
            let connectedNodes = 0;
            for (const [, node] of musicManager.shoukaku.nodes) {
                if (node.state === 2) { // CONNECTED
                    connectedNodes++;
                }
            }
            
            if (connectedNodes === 0) {
                throw new Error('No Lavalink nodes connected');
            }
        }
    });
    
    // Register fallback strategies for search
    degradation.registerFallback('lavalink-search', [
        {
            name: 'primary-node',
            priority: 3,
            fn: async (query) => {
                // Try primary node
                return await musicManager.search(query);
            }
        },
        {
            name: 'cached-results',
            priority: 2,
            fn: async (query) => {
                // Try cache
                const cached = musicManager.searchCache.get(query);
                if (cached) {
                    logger.info('Using cached search results (degraded mode)');
                    return cached;
                }
                throw new Error('No cached results');
            }
        },
        {
            name: 'error-response',
            priority: 1,
            fn: async () => {
                // Last resort: return error response
                logger.warn('All search strategies failed, returning error');
                throw new Error('Search temporarily unavailable');
            }
        }
    ]);
    
    return degradation;
}

/**
 * Database Degradation Strategy
 */
export function createDatabaseDegradation(database) {
    const degradation = new DegradationManager();
    
    degradation.registerService('database', {
        healthCheckInterval: 30000,
        timeout: 5000,
        failureThreshold: 3,
        successThreshold: 2,
        healthCheck: async () => {
            // Simple query to check database
            await database.db.prepare('SELECT 1').get();
        }
    });
    
    // Fallback to in-memory cache
    const memoryCache = new Map();
    
    degradation.registerFallback('database-read', [
        {
            name: 'database-primary',
            priority: 2,
            fn: async (query) => {
                return await database.query(query);
            }
        },
        {
            name: 'memory-cache',
            priority: 1,
            fn: async (key) => {
                if (memoryCache.has(key)) {
                    logger.info('Using memory cache (degraded mode)');
                    return memoryCache.get(key);
                }
                throw new Error('No cached data');
            }
        }
    ]);
    
    return degradation;
}

// Export singleton
export const degradationManager = new DegradationManager();
export default DegradationManager;
