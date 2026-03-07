/**
 * Performance Metrics Tracker
 * Tracks and monitors bot performance metrics
 */

import { VERSION, ENVIRONMENT } from './version.js';
import logger from './logger.js';

const MAX_BY_COMMAND_ENTRIES = 1000;

class MetricsTracker {
    constructor() {
        this.startTime = Date.now();

        // Command metrics
        // FIX-PB03: byCommand is bounded by registered slash command count (~30-50 entries)
        this.commands = {
            total: 0,
            successful: 0,
            failed: 0,
            byCommand: new Map(),
            lastCommand: null
        };

        // Music metrics
        this.music = {
            totalTracks: 0,
            totalPlaylists: 0,
            totalPlaytime: 0, // milliseconds
            tracksSkipped: 0,
            tracksCompleted: 0,
            searchQueries: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        // Error metrics
        // FIX-PB03: byType is bounded by fixed error type constants ('command', 'discord_client', 'general')
        this.errors = {
            total: 0,
            byType: new Map(),
            lastError: null,
            lastErrorTime: null
        };

        // Performance metrics
        this.performance = {
            avgResponseTime: 0,
            responseTimes: [],
            maxResponseTime: 0,
            minResponseTime: Infinity
        };

        // System metrics (updated periodically)
        this.system = {
            memory: {
                heapUsed: 0,
                heapTotal: 0,
                external: 0,
                rss: 0
            },
            cpu: {
                user: 0,
                system: 0
            }
        };

        // Store initial CPU usage for delta calculation
        this._lastCpuUsage = process.cpuUsage();

        // Start periodic system metrics collection
        this.startSystemMetrics();
    }

    /**
     * Track command execution
     */
    trackCommand(commandName, success = true, responseTime = 0) {
        this.commands.total++;
        if (success) {
            this.commands.successful++;
        } else {
            this.commands.failed++;
        }

        // Track by command
        const stats = this.commands.byCommand.get(commandName) || { total: 0, success: 0, failed: 0, lastUsed: 0 };
        stats.total++;
        if (success) {
            stats.success++;
        } else {
            stats.failed++;
        }
        stats.lastUsed = Date.now();

        // Prune least-recent entries when map exceeds limit
        if (!this.commands.byCommand.has(commandName) && this.commands.byCommand.size >= MAX_BY_COMMAND_ENTRIES) {
            this._pruneByCommand();
        }

        // Re-insert to keep Map ordered by recent use
        this.commands.byCommand.delete(commandName);
        this.commands.byCommand.set(commandName, stats);

        this.commands.lastCommand = {
            name: commandName,
            success,
            time: Date.now(),
            responseTime
        };

        // Track response time
        if (responseTime > 0) {
            this.trackResponseTime(responseTime);
        }
    }

    /**
     * Prune least-recent entries from byCommand Map
     * @private
     */
    _pruneByCommand() {
        const toRemove = Math.floor(this.commands.byCommand.size / 4);
        let removed = 0;
        // Map iterates in insertion order; oldest entries are first
        for (const key of this.commands.byCommand.keys()) {
            if (removed >= toRemove) break;
            this.commands.byCommand.delete(key);
            removed++;
        }
        logger.debug(`MetricsTracker: pruned ${removed} least-recent byCommand entries`, {
            remaining: this.commands.byCommand.size
        });
    }

    /**
     * Track music action
     */
    trackMusic(action, data = {}) {
        switch (action) {
            case 'track_added':
                this.music.totalTracks++;
                break;
            case 'playlist_added':
                this.music.totalPlaylists++;
                this.music.totalTracks += data.trackCount || 0;
                break;
            case 'track_completed':
                this.music.tracksCompleted++;
                if (data.duration) {
                    this.music.totalPlaytime += data.duration;
                }
                break;
            case 'track_skipped':
                this.music.tracksSkipped++;
                break;
            case 'search':
                this.music.searchQueries++;
                if (data.cacheHit) {
                    this.music.cacheHits++;
                } else {
                    this.music.cacheMisses++;
                }
                break;
        }
    }

    /**
     * Track error
     */
    trackError(error, type = 'general') {
        this.errors.total++;

        const count = this.errors.byType.get(type) || 0;
        this.errors.byType.set(type, count + 1);

        this.errors.lastError = {
            message: error.message || String(error),
            stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : undefined,
            type,
            time: Date.now()
        };
        this.errors.lastErrorTime = Date.now();
    }

    /**
     * Track response time
     */
    trackResponseTime(time) {
        this.performance.responseTimes.push(time);

        // Keep only last 100 response times
        if (this.performance.responseTimes.length > 100) {
            this.performance.responseTimes.shift();
        }

        // Update stats
        this.performance.avgResponseTime =
            this.performance.responseTimes.reduce((a, b) => a + b, 0) / this.performance.responseTimes.length;

        this.performance.maxResponseTime = Math.max(this.performance.maxResponseTime, time);
        this.performance.minResponseTime = Math.min(this.performance.minResponseTime, time);
    }

    /**
     * Start collecting system metrics
     */
    startSystemMetrics() {
        this.systemMetricsInterval = setInterval(() => {
            const mem = process.memoryUsage();
            this.system.memory = {
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024), // MB
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024), // MB
                external: Math.round(mem.external / 1024 / 1024), // MB
                rss: Math.round(mem.rss / 1024 / 1024) // MB
            };

            const cpu = process.cpuUsage(this._lastCpuUsage);
            this._lastCpuUsage = process.cpuUsage();
            // Convert microseconds delta to percentage over the 60s interval
            const intervalMs = 60000;
            const userPercent = (cpu.user / 1000 / intervalMs) * 100;
            const systemPercent = (cpu.system / 1000 / intervalMs) * 100;
            this.system.cpu = {
                user: Math.round(userPercent * 10) / 10, // percentage
                system: Math.round(systemPercent * 10) / 10 // percentage
            };

            // Log if memory usage is high
            if (this.system.memory.heapUsed > 500) {
                logger.warn('High memory usage detected', {
                    heapUsed: this.system.memory.heapUsed,
                    heapTotal: this.system.memory.heapTotal,
                    rss: this.system.memory.rss
                });
            }
        }, 60000).unref(); // Every minute — unref to prevent blocking process exit
    }

    /**
     * Stop system metrics collection
     */
    stopSystemMetrics() {
        if (this.systemMetricsInterval) {
            clearInterval(this.systemMetricsInterval);
        }
    }

    /**
     * Get uptime
     */
    getUptime() {
        return Date.now() - this.startTime;
    }

    /**
     * Get cache hit rate
     */
    getCacheHitRate() {
        const total = this.music.cacheHits + this.music.cacheMisses;
        if (total === 0) return 0;
        return Math.round((this.music.cacheHits / total) * 100);
    }

    /**
     * Get success rate
     */
    getSuccessRate() {
        if (this.commands.total === 0) return 100;
        return Math.round((this.commands.successful / this.commands.total) * 100);
    }

    /**
     * Get full metrics summary
     */
    getSummary() {
        return {
            version: VERSION.full,
            environment: ENVIRONMENT.env,
            uptime: this.getUptime(),
            commands: {
                total: this.commands.total,
                successful: this.commands.successful,
                failed: this.commands.failed,
                successRate: this.getSuccessRate(),
                byCommand: Array.from(this.commands.byCommand.entries()).map(([name, stats]) => ({
                    name,
                    ...stats,
                    successRate: Math.round((stats.success / stats.total) * 100)
                }))
            },
            music: {
                ...this.music,
                cacheHitRate: this.getCacheHitRate()
            },
            errors: {
                total: this.errors.total,
                byType: Array.from(this.errors.byType.entries()).map(([type, count]) => ({
                    type,
                    count
                })),
                lastError: this.errors.lastError
            },
            performance: {
                avgResponseTime: Math.round(this.performance.avgResponseTime),
                maxResponseTime: this.performance.maxResponseTime,
                minResponseTime: this.performance.minResponseTime === Infinity ? 0 : this.performance.minResponseTime
            },
            system: this.system
        };
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.commands.total = 0;
        this.commands.successful = 0;
        this.commands.failed = 0;
        this.commands.byCommand.clear();

        this.music.totalTracks = 0;
        this.music.totalPlaylists = 0;
        this.music.totalPlaytime = 0;
        this.music.tracksSkipped = 0;
        this.music.tracksCompleted = 0;
        this.music.searchQueries = 0;
        this.music.cacheHits = 0;
        this.music.cacheMisses = 0;

        this.errors.total = 0;
        this.errors.byType.clear();

        this.performance.avgResponseTime = 0;
        this.performance.responseTimes = [];
        this.performance.maxResponseTime = 0;
        this.performance.minResponseTime = Infinity;

        logger.info('Metrics reset');
    }

    /**
     * Log metrics summary
     */
    logSummary() {
        const summary = this.getSummary();
        logger.info('Performance Metrics Summary', summary);
    }
}

// Export singleton instance
export const metricsTracker = new MetricsTracker();

export default metricsTracker;
