/**
 * Resource Leak Detector
 * Monitors and prevents resource leaks (event listeners, timers, etc.)
 */

import logger from './logger.js';
import { EventEmitter } from 'events';

/**
 * Event Listener Tracker
 */
export class EventListenerTracker {
    constructor() {
        this.listeners = new Map();
        this.warnings = [];
        this.maxListeners = 10;
    }

    /**
     * Track event listener
     */
    track(emitter, event, listener, context = {}) {
        const key = this.getKey(emitter, event);

        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }

        this.listeners.get(key).push({
            listener,
            context,
            timestamp: Date.now(),
            stack: new Error().stack
        });

        // Check for potential leak
        const count = this.listeners.get(key).length;
        if (count > this.maxListeners) {
            const warning = {
                key,
                count,
                timestamp: Date.now(),
                message: `Potential leak: ${count} listeners for ${event}`
            };

            this.warnings.push(warning);
            logger.warn(warning.message, { event, count });
        }
    }

    /**
     * Untrack event listener
     */
    untrack(emitter, event, listener) {
        const key = this.getKey(emitter, event);
        const listeners = this.listeners.get(key);

        if (listeners) {
            const index = listeners.findIndex(l => l.listener === listener);
            if (index !== -1) {
                listeners.splice(index, 1);

                if (listeners.length === 0) {
                    this.listeners.delete(key);
                }
            }
        }
    }

    /**
     * Get unique key for emitter + event
     */
    getKey(emitter, event) {
        const emitterId = emitter.id || emitter.constructor.name || 'unknown';
        return `${emitterId}:${event}`;
    }

    /**
     * Get listener count
     */
    getCount(emitter, event) {
        const key = this.getKey(emitter, event);
        const listeners = this.listeners.get(key);
        return listeners ? listeners.length : 0;
    }

    /**
     * Get all tracked listeners
     */
    getAllListeners() {
        const result = {};

        for (const [key, listeners] of this.listeners.entries()) {
            result[key] = {
                count: listeners.length,
                listeners: listeners.map(l => ({
                    context: l.context,
                    timestamp: l.timestamp,
                    age: Date.now() - l.timestamp
                }))
            };
        }

        return result;
    }

    /**
     * Find potential leaks
     */
    findLeaks(threshold = 10) {
        const leaks = [];

        for (const [key, listeners] of this.listeners.entries()) {
            if (listeners.length > threshold) {
                leaks.push({
                    key,
                    count: listeners.length,
                    oldestAge: Date.now() - Math.min(...listeners.map(l => l.timestamp)),
                    contexts: listeners.map(l => l.context)
                });
            }
        }

        return leaks;
    }

    /**
     * Generate report
     */
    generateReport() {
        return {
            totalTracked: this.listeners.size,
            warnings: this.warnings,
            potentialLeaks: this.findLeaks(),
            allListeners: this.getAllListeners()
        };
    }

    /**
     * Clear all tracking
     */
    clear() {
        this.listeners.clear();
        this.warnings = [];
    }
}

/**
 * Timer/Interval Tracker
 */
export class TimerTracker {
    constructor() {
        this.timers = new Map();
        this.intervals = new Map();
        this.nextId = 1;
    }

    /**
     * Track setTimeout
     */
    trackTimeout(callback, delay, context = {}) {
        const id = this.nextId++;

        const wrappedCallback = () => {
            this.timers.delete(id);
            callback();
        };

        const timerId = setTimeout(wrappedCallback, delay);

        this.timers.set(id, {
            type: 'timeout',
            timerId,
            callback,
            delay,
            context,
            createdAt: Date.now(),
            stack: new Error().stack
        });

        return { id, timerId };
    }

    /**
     * Track setInterval
     */
    trackInterval(callback, interval, context = {}) {
        const id = this.nextId++;

        const intervalId = setInterval(callback, interval);

        this.intervals.set(id, {
            type: 'interval',
            intervalId,
            callback,
            interval,
            context,
            createdAt: Date.now(),
            stack: new Error().stack
        });

        return { id, intervalId };
    }

    /**
     * Clear tracked timeout
     */
    clearTimeout(id) {
        const timer = this.timers.get(id);
        if (timer) {
            clearTimeout(timer.timerId);
            this.timers.delete(id);
            return true;
        }
        return false;
    }

    /**
     * Clear tracked interval
     */
    clearInterval(id) {
        const interval = this.intervals.get(id);
        if (interval) {
            clearInterval(interval.intervalId);
            this.intervals.delete(id);
            return true;
        }
        return false;
    }

    /**
     * Find long-running intervals
     */
    findLongRunning(ageThreshold = 60 * 60 * 1000) {
        const now = Date.now();
        const longRunning = [];

        for (const [id, interval] of this.intervals.entries()) {
            const age = now - interval.createdAt;
            if (age > ageThreshold) {
                longRunning.push({
                    id,
                    age,
                    interval: interval.interval,
                    context: interval.context
                });
            }
        }

        return longRunning;
    }

    /**
     * Get all active timers/intervals
     */
    getActive() {
        return {
            timeouts: {
                count: this.timers.size,
                items: Array.from(this.timers.values()).map(t => ({
                    delay: t.delay,
                    context: t.context,
                    age: Date.now() - t.createdAt
                }))
            },
            intervals: {
                count: this.intervals.size,
                items: Array.from(this.intervals.values()).map(i => ({
                    interval: i.interval,
                    context: i.context,
                    age: Date.now() - i.createdAt
                }))
            }
        };
    }

    /**
     * Clear all tracked timers/intervals
     */
    clearAll() {
        for (const [id, timer] of this.timers.entries()) {
            clearTimeout(timer.timerId);
        }

        for (const [id, interval] of this.intervals.entries()) {
            clearInterval(interval.intervalId);
        }

        this.timers.clear();
        this.intervals.clear();
    }

    /**
     * Generate report
     */
    generateReport() {
        return {
            active: this.getActive(),
            longRunning: this.findLongRunning()
        };
    }
}

/**
 * Discord.js Collector Tracker
 */
export class CollectorTracker {
    constructor() {
        this.collectors = new Map();
        this.nextId = 1;
    }

    /**
     * Track collector
     */
    track(collector, context = {}) {
        const id = this.nextId++;

        this.collectors.set(id, {
            collector,
            context,
            createdAt: Date.now(),
            ended: false
        });

        // Auto-remove on end
        collector.once('end', () => {
            const entry = this.collectors.get(id);
            if (entry) {
                entry.ended = true;
                entry.endedAt = Date.now();

                // Remove after 5 minutes
                setTimeout(
                    () => {
                        this.collectors.delete(id);
                    },
                    5 * 60 * 1000
                );
            }
        });

        return id;
    }

    /**
     * Stop collector
     */
    stop(id) {
        const entry = this.collectors.get(id);
        if (entry && !entry.ended) {
            entry.collector.stop();
            return true;
        }
        return false;
    }

    /**
     * Find orphaned collectors (not ended after threshold)
     */
    findOrphaned(ageThreshold = 10 * 60 * 1000) {
        const now = Date.now();
        const orphaned = [];

        for (const [id, entry] of this.collectors.entries()) {
            if (!entry.ended) {
                const age = now - entry.createdAt;
                if (age > ageThreshold) {
                    orphaned.push({
                        id,
                        age,
                        context: entry.context
                    });
                }
            }
        }

        return orphaned;
    }

    /**
     * Stop all orphaned collectors
     */
    stopOrphaned(ageThreshold = 10 * 60 * 1000) {
        const orphaned = this.findOrphaned(ageThreshold);
        let stopped = 0;

        for (const { id } of orphaned) {
            if (this.stop(id)) {
                stopped++;
            }
        }

        if (stopped > 0) {
            logger.info(`Stopped ${stopped} orphaned collectors`);
        }

        return stopped;
    }

    /**
     * Generate report
     */
    generateReport() {
        return {
            total: this.collectors.size,
            active: Array.from(this.collectors.values()).filter(e => !e.ended).length,
            ended: Array.from(this.collectors.values()).filter(e => e.ended).length,
            orphaned: this.findOrphaned()
        };
    }
}

/**
 * Resource Leak Monitor
 */
export class ResourceLeakMonitor extends EventEmitter {
    constructor() {
        super();
        this.eventListenerTracker = new EventListenerTracker();
        this.timerTracker = new TimerTracker();
        this.collectorTracker = new CollectorTracker();
        this.monitorInterval = null;
    }

    /**
     * Start monitoring
     */
    startMonitoring(intervalMs = 60000) {
        this.monitorInterval = setInterval(() => {
            this.runChecks();
        }, intervalMs);

        logger.info('Resource leak monitoring started');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        logger.info('Resource leak monitoring stopped');
    }

    /**
     * Run all checks
     */
    runChecks() {
        // Check event listeners
        const listenerLeaks = this.eventListenerTracker.findLeaks();
        if (listenerLeaks.length > 0) {
            logger.warn(`Found ${listenerLeaks.length} potential event listener leaks`, {
                leaks: listenerLeaks
            });
            this.emit('leak', { type: 'eventListener', leaks: listenerLeaks });
        }

        // Check long-running intervals
        const longRunning = this.timerTracker.findLongRunning();
        if (longRunning.length > 0) {
            logger.warn(`Found ${longRunning.length} long-running intervals`, {
                intervals: longRunning
            });
            this.emit('leak', { type: 'interval', leaks: longRunning });
        }

        // Check orphaned collectors
        const orphaned = this.collectorTracker.findOrphaned();
        if (orphaned.length > 0) {
            logger.warn(`Found ${orphaned.length} orphaned collectors`, {
                collectors: orphaned
            });

            // Auto-stop orphaned collectors
            this.collectorTracker.stopOrphaned();

            this.emit('leak', { type: 'collector', leaks: orphaned });
        }
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        return {
            timestamp: Date.now(),
            eventListeners: this.eventListenerTracker.generateReport(),
            timers: this.timerTracker.generateReport(),
            collectors: this.collectorTracker.generateReport()
        };
    }

    /**
     * Cleanup all tracked resources
     */
    cleanupAll() {
        logger.info('Cleaning up all tracked resources...');

        this.timerTracker.clearAll();
        const orphaned = this.collectorTracker.stopOrphaned(0); // Stop all

        logger.info(`Cleanup complete: stopped ${orphaned} collectors`);
    }
}

// Export singleton
export const resourceLeakMonitor = new ResourceLeakMonitor();
export default ResourceLeakMonitor;
