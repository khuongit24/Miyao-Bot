/**
 * Memory Optimization Utilities
 * Provides tools for reducing memory footprint and preventing leaks
 */

import logger from './logger.js';

/**
 * Optimized Embed Builder - Reduces memory usage of Discord embeds
 */
export class OptimizedEmbed {
    constructor() {
        this.data = {};
    }

    setTitle(title) {
        if (title) this.data.title = String(title).slice(0, 256);
        return this;
    }

    setDescription(description) {
        if (description) this.data.description = String(description).slice(0, 4096);
        return this;
    }

    setColor(color) {
        if (color !== undefined) this.data.color = color;
        return this;
    }

    setAuthor(name, iconURL, url) {
        if (name) {
            this.data.author = { name: String(name).slice(0, 256) };
            if (iconURL) this.data.author.icon_url = String(iconURL);
            if (url) this.data.author.url = String(url);
        }
        return this;
    }

    setThumbnail(url) {
        if (url) this.data.thumbnail = { url: String(url) };
        return this;
    }

    setImage(url) {
        if (url) this.data.image = { url: String(url) };
        return this;
    }

    setFooter(text, iconURL) {
        if (text) {
            this.data.footer = { text: String(text).slice(0, 2048) };
            if (iconURL) this.data.footer.icon_url = String(iconURL);
        }
        return this;
    }

    setTimestamp(timestamp) {
        this.data.timestamp = timestamp || new Date();
        return this;
    }

    addFields(...fields) {
        if (!this.data.fields) this.data.fields = [];
        
        for (const field of fields) {
            if (this.data.fields.length >= 25) break;
            
            this.data.fields.push({
                name: String(field.name || '\u200b').slice(0, 256),
                value: String(field.value || '\u200b').slice(0, 1024),
                inline: Boolean(field.inline)
            });
        }
        
        return this;
    }

    toJSON() {
        return this.data;
    }

    // Calculate approximate size
    getSize() {
        return JSON.stringify(this.data).length * 2; // UTF-16
    }
}

/**
 * String Optimization - Reduce string concatenation overhead
 */
export class StringBuilder {
    constructor(initialCapacity = 100) {
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
            percentUsed: (usage.heapUsed / usage.heapTotal * 100).toFixed(2)
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
            percentUsed: (usage.heapUsed / usage.heapTotal * 100).toFixed(2) + '%'
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
        if (this.history.length < windowSize) {
            return { hasLeak: false, message: 'Not enough data' };
        }
        
        const recent = this.history.slice(-windowSize);
        const trend = this.calculateTrend(recent.map(s => s.heapUsed));
        
        // If memory consistently growing over time
        if (trend > 0.1) { // Growing more than 10% over window
            return {
                hasLeak: true,
                confidence: 'high',
                trend: (trend * 100).toFixed(2) + '%',
                message: 'Potential memory leak detected'
            };
        }
        
        return { hasLeak: false, message: 'No leak detected' };
    }

    calculateTrend(values) {
        if (values.length < 2) return 0;
        
        const first = values[0];
        const last = values[values.length - 1];
        
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
        
        logger.info('Running idle cleanup...');
        
        for (const { name, callback } of this.cleanupCallbacks) {
            try {
                await callback();
                logger.debug(`Idle cleanup completed: ${name}`);
            } catch (error) {
                logger.error(`Idle cleanup failed: ${name}`, error);
            }
        }
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
            logger.debug('Forced garbage collection');
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
