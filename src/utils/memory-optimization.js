/**
 * Memory Optimization Utilities
 * Provides tools for reducing memory footprint and preventing leaks
 *
 * @version 1.8.2 - Removed unused OptimizedEmbed class (use discord.js EmbedBuilder instead)
 */

import logger from './logger.js';

/**
 * String Optimization - Reduce string concatenation overhead
 */
export class StringBuilder {
    constructor(_initialCapacity = 100) {
        this.parts = [];
        this.length = 0;
    }

    append(str) {
        if (str !== null && str !== undefined) {
            const s = String(str);
            this.parts.push(s);
            this.length += s.length;
        }
        return this;
    }

    appendLine(str) {
        return this.append(str).append('\n');
    }

    toString() {
        return this.parts.join('');
    }

    clear() {
        this.parts = [];
        this.length = 0;
    }

    getLength() {
        return this.length;
    }
}

/**
 * Memory Monitor - Track memory usage and detect leaks
 */
export class MemoryMonitor {
    constructor(thresholds = {}) {
        this.thresholds = {
            warning: thresholds.warning || 500 * 1024 * 1024, // 500MB
            critical: thresholds.critical || 800 * 1024 * 1024, // 800MB
            ...thresholds
        };

        this.history = [];
        this.maxHistory = 100;
        this.monitorInterval = null;
    }

    takeSnapshot() {
        const usage = process.memoryUsage();
        const snapshot = {
            timestamp: Date.now(),
            ...usage,
            percentUsed: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(2)
        };

        this.history.push(snapshot);

        // Keep only recent history
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        return snapshot;
    }

    getCurrentUsage() {
        return process.memoryUsage();
    }

    getFormatted() {
        const usage = this.getCurrentUsage();

        return {
            heapUsed: this.formatBytes(usage.heapUsed),
            heapTotal: this.formatBytes(usage.heapTotal),
            rss: this.formatBytes(usage.rss),
            external: this.formatBytes(usage.external),
            percentUsed: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(2) + '%'
        };
    }

    checkThresholds() {
        const usage = process.memoryUsage();

        if (usage.heapUsed > this.thresholds.critical) {
            return {
                level: 'critical',
                message: `Memory usage critical: ${this.formatBytes(usage.heapUsed)}`,
                usage
            };
        }

        if (usage.heapUsed > this.thresholds.warning) {
            return {
                level: 'warning',
                message: `Memory usage high: ${this.formatBytes(usage.heapUsed)}`,
                usage
            };
        }

        return {
            level: 'normal',
            message: 'Memory usage normal',
            usage
        };
    }

    detectLeak(windowSize = 10) {
        // FIX-UTL-M08: Require minimum 10 samples to avoid false alerts with few data points
        const minSamples = Math.max(windowSize, 10);
        if (this.history.length < minSamples) {
            return { hasLeak: false, message: 'Not enough data (minimum 10 samples required)' };
        }

        const recent = this.history.slice(-windowSize);
        const trend = this.calculateTrend(recent.map(s => s.heapUsed));
        const latestHeap = recent[recent.length - 1].heapUsed;
        const minHeapForLeak = 200 * 1024 * 1024; // 200MB minimum

        // Only flag leak if:
        // 1. Heap > 200MB AND growth > 15%, OR
        // 2. Very high growth > 25% regardless of size (indicates aggressive leak)
        if (trend > 0.25 || (latestHeap > minHeapForLeak && trend > 0.15)) {
            return {
                hasLeak: true,
                confidence: trend > 0.25 ? 'high' : 'medium',
                trend: (trend * 100).toFixed(2) + '%',
                heapMB: Math.round(latestHeap / 1024 / 1024),
                message: 'Potential memory leak detected'
            };
        }

        return { hasLeak: false, message: 'No leak detected' };
    }

    calculateTrend(values) {
        if (values.length < 2) return 0;

        const first = values[0];
        const last = values[values.length - 1];

        // Guard against division by zero
        if (first === 0) return 0;

        return (last - first) / first;
    }

    startMonitoring(intervalMs = 60000, callback) {
        this.monitorInterval = setInterval(() => {
            const snapshot = this.takeSnapshot();
            const threshold = this.checkThresholds();
            const leak = this.detectLeak();

            if (callback) {
                callback({ snapshot, threshold, leak });
            }

            // Log warnings
            if (threshold.level === 'warning') {
                logger.warn(threshold.message, { usage: this.getFormatted() });
            } else if (threshold.level === 'critical') {
                logger.error(threshold.message, { usage: this.getFormatted() });
            }

            if (leak.hasLeak) {
                logger.warn('Potential memory leak detected', leak);
            }
        }, intervalMs);

        logger.info('Memory monitoring started');
    }

    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            logger.info('Memory monitoring stopped');
        }
    }

    formatBytes(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }

    getReport() {
        return {
            current: this.getFormatted(),
            threshold: this.checkThresholds(),
            leak: this.detectLeak(),
            history: this.history.slice(-10) // Last 10 snapshots
        };
    }
}

/**
 * Aggressive Cleanup on Idle
 */
export class IdleCleanupManager {
    constructor(idleTimeMs = 5 * 60 * 1000) {
        this.idleTime = idleTimeMs;
        this.lastActivity = Date.now();
        this.cleanupCallbacks = [];
        this.checkInterval = null;
        this._isCleaningUp = false;
    }

    registerCleanup(name, callback) {
        this.cleanupCallbacks.push({ name, callback });
    }

    markActivity() {
        this.lastActivity = Date.now();
    }

    isIdle() {
        return Date.now() - this.lastActivity > this.idleTime;
    }

    async runCleanup() {
        if (!this.isIdle()) return;

        // Guard against concurrent cleanup runs (e.g., overlapping interval ticks)
        if (this._isCleaningUp) return;
        this._isCleaningUp = true;

        logger.info('Running idle cleanup...');

        try {
            for (const { name, callback } of this.cleanupCallbacks) {
                try {
                    await callback();
                    logger.debug(`Idle cleanup completed: ${name}`);
                } catch (error) {
                    logger.error(`Idle cleanup failed: ${name}`, error);
                }
            }

            // Force garbage collection if available
            if (typeof global.gc === 'function') {
                global.gc();
                logger.debug('Forced garbage collection');
            }
        } finally {
            this._isCleaningUp = false;
        }
    }

    startMonitoring(intervalMs = 60000) {
        this.checkInterval = setInterval(async () => {
            if (this.isIdle()) {
                await this.runCleanup();
            }
        }, intervalMs);

        logger.info('Idle cleanup monitoring started');
    }

    stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}

// Export singleton instances
export const memoryMonitor = new MemoryMonitor();
export const idleCleanup = new IdleCleanupManager();
