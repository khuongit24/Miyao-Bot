/**
 * Performance Monitoring Utilities
 * Tools for profiling, benchmarking, and performance tracking
 */

import logger from './logger.js';

/**
 * Performance timer for tracking execution time
 */
export class PerformanceTimer {
    constructor(name) {
        this.name = name;
        this.startTime = null;
        this.endTime = null;
    }

    start() {
        this.startTime = performance.now();
        return this;
    }

    end() {
        this.endTime = performance.now();
        const duration = this.duration();

        // Log if execution takes too long
        if (duration > 500) {
            logger.warn(`Slow operation detected: ${this.name}`, { duration: `${duration.toFixed(2)}ms` });
        }

        return duration;
    }

    duration() {
        if (!this.startTime || !this.endTime) {
            return 0;
        }
        return this.endTime - this.startTime;
    }
}

/**
 * Create a performance timer
 * @param {string} name - Name of the operation
 * @returns {PerformanceTimer}
 */
export function createTimer(name) {
    return new PerformanceTimer(name);
}

/**
 * Measure async function execution time
 * @param {Function} fn - Async function to measure
 * @param {string} name - Operation name
 * @returns {Promise<{result: any, duration: number}>}
 */
export async function measureAsync(fn, name = 'Operation') {
    const timer = createTimer(name);
    timer.start();

    try {
        const result = await fn();
        const duration = timer.end();
        return { result, duration };
    } catch (error) {
        const duration = timer.end();
        logger.error(`${name} failed after ${duration.toFixed(2)}ms`, error);
        throw error;
    }
}

/**
 * Measure sync function execution time
 * @param {Function} fn - Function to measure
 * @param {string} name - Operation name
 * @returns {{result: any, duration: number}}
 */
export function measureSync(fn, name = 'Operation') {
    const timer = createTimer(name);
    timer.start();

    try {
        const result = fn();
        const duration = timer.end();
        return { result, duration };
    } catch (error) {
        const duration = timer.end();
        logger.error(`${name} failed after ${duration.toFixed(2)}ms`, error);
        throw error;
    }
}

/**
 * Simple cache implementation with TTL
 */
export class SimpleCache {
    constructor(maxSize = 100, ttl = 5 * 60 * 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
        this.hits = 0;
        this.misses = 0;
    }

    set(key, value) {
        // Evict oldest entry if cache is full
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            value,
            expires: Date.now() + this.ttl
        });
    }

    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }

        this.hits++;
        return entry.value;
    }

    has(key) {
        return this.get(key) !== null;
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    size() {
        return this.cache.size;
    }

    getStats() {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(2) : '0.00';

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: `${hitRate}%`,
            ttl: this.ttl
        };
    }

    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expires) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }
}

/**
 * Debounce function to limit execution rate
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
    let timeoutId;

    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Throttle function to limit execution rate
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function}
 */
export function throttle(fn, limit = 1000) {
    let inThrottle;

    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Batch multiple operations
 * @param {Array} items - Items to process
 * @param {Function} processor - Function to process each item
 * @param {number} batchSize - Batch size
 * @returns {Promise<Array>}
 */
export async function batchProcess(items, processor, batchSize = 10) {
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processor));
        results.push(...batchResults);
    }

    return results;
}

/**
 * Memory usage snapshot
 * @returns {Object} Memory usage info
 */
export function getMemoryUsage() {
    const usage = process.memoryUsage();

    return {
        heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        external: (usage.external / 1024 / 1024).toFixed(2) + ' MB',
        rss: (usage.rss / 1024 / 1024).toFixed(2) + ' MB',
        heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024)
    };
}

/**
 * Performance metrics collector
 */
export class MetricsCollector {
    constructor() {
        this.metrics = new Map();
    }

    record(name, value) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, {
                count: 0,
                total: 0,
                min: Infinity,
                max: -Infinity,
                values: []
            });
        }

        const metric = this.metrics.get(name);
        metric.count++;
        metric.total += value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);

        // Keep last 100 values for percentile calculations
        metric.values.push(value);
        if (metric.values.length > 100) {
            metric.values.shift();
        }
    }

    getMetrics(name) {
        const metric = this.metrics.get(name);
        if (!metric) return null;

        const avg = metric.total / metric.count;

        // Calculate p95 and p99
        const sorted = [...metric.values].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        const p99Index = Math.floor(sorted.length * 0.99);

        return {
            count: metric.count,
            avg: avg.toFixed(2),
            min: metric.min.toFixed(2),
            max: metric.max.toFixed(2),
            p95: sorted[p95Index]?.toFixed(2) || '0',
            p99: sorted[p99Index]?.toFixed(2) || '0'
        };
    }

    getAllMetrics() {
        const all = {};
        for (const [name, _] of this.metrics) {
            all[name] = this.getMetrics(name);
        }
        return all;
    }

    reset(name) {
        if (name) {
            this.metrics.delete(name);
        } else {
            this.metrics.clear();
        }
    }
}

// Global metrics collector
export const globalMetrics = new MetricsCollector();

/**
 * Decorator for measuring command execution time
 * @param {Function} commandFn - Command execute function
 * @returns {Function}
 */
export function measureCommand(commandFn) {
    return async function (interaction, ...args) {
        const commandName = interaction.commandName || 'unknown';
        const timer = createTimer(`Command: ${commandName}`);
        timer.start();

        try {
            const result = await commandFn.call(this, interaction, ...args);
            const duration = timer.end();
            globalMetrics.record(`command.${commandName}`, duration);

            // Log slow commands
            if (duration > 1000) {
                logger.warn(`Slow command execution: ${commandName}`, {
                    duration: `${duration.toFixed(2)}ms`,
                    user: interaction.user.tag,
                    guild: interaction.guild?.name
                });
            }

            return result;
        } catch (error) {
            timer.end();
            throw error;
        }
    };
}

export default {
    createTimer,
    measureAsync,
    measureSync,
    SimpleCache,
    debounce,
    throttle,
    batchProcess,
    getMemoryUsage,
    MetricsCollector,
    globalMetrics,
    measureCommand
};
