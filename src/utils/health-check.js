/**
 * Health Check & Monitoring System
 * Proactive monitoring and alerting for system health
 */

import logger from './logger.js';
import { getMemoryUsage } from './performance.js';
import { TIME, MEMORY } from './constants.js';
import { getEventQueue } from './EventQueue.js';
import { COLORS } from '../config/design-system.js';
import { statfs } from 'fs/promises';

/**
 * Health status levels
 */
export const HealthStatus = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy',
    CRITICAL: 'critical'
};

/**
 * Health Check Manager
 */
export class HealthCheckManager {
    constructor(client) {
        this.client = client;
        this.checks = new Map();
        this.lastStatus = new Map();
        this.alertCooldowns = new Map();
        this.checkInterval = null;
        this._cooldownCleanupInterval = null;
        this.webhookUrl = process.env.ALERT_WEBHOOK_URL || null;
    }

    /**
     * Register a health check
     * @param {string} name - Check name
     * @param {Function} checkFn - Function that returns { status, message, details }
     * @param {number} interval - Check interval in ms
     */
    registerCheck(name, checkFn, interval = TIME.HEALTH_CHECK_INTERVAL) {
        this.checks.set(name, {
            fn: checkFn,
            interval,
            lastRun: 0,
            lastStatus: HealthStatus.HEALTHY
        });
        logger.info(`Health check registered: ${name}`);
    }

    /**
     * Start health monitoring
     */
    start() {
        // Register default checks
        this.registerDefaultChecks();

        // Run checks periodically
        this.checkInterval = setInterval(() => {
            this.runAllChecks();
        }, TIME.HEALTH_CHECK_INTERVAL);
        this.checkInterval.unref();

        // Periodically clean up expired alert cooldowns (every 5 minutes)
        const COOLDOWN_CLEANUP_INTERVAL = 5 * TIME.MINUTE;
        const COOLDOWN_EXPIRY = 5 * TIME.MINUTE;
        this._cooldownCleanupInterval = setInterval(() => {
            const now = Date.now();
            let cleaned = 0;
            for (const [key, timestamp] of this.alertCooldowns) {
                if (now - timestamp >= COOLDOWN_EXPIRY) {
                    this.alertCooldowns.delete(key);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                logger.debug(`Health check: Cleaned ${cleaned} expired alert cooldowns`);
            }
        }, COOLDOWN_CLEANUP_INTERVAL);
        this._cooldownCleanupInterval.unref();

        logger.info('Health check manager started');
    }

    /**
     * Stop health monitoring
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        if (this._cooldownCleanupInterval) {
            clearInterval(this._cooldownCleanupInterval);
            this._cooldownCleanupInterval = null;
        }
        this.alertCooldowns.clear();
        logger.info('Health check manager stopped');
    }

    /**
     * Register default health checks
     */
    registerDefaultChecks() {
        // Bot connectivity check
        this.registerCheck('bot_connectivity', async () => {
            try {
                const isReady = this.client.isReady();
                const wsStatus = this.client.ws.status;
                const ping = this.client.ws.ping;

                if (!isReady || wsStatus !== 0) {
                    return {
                        status: HealthStatus.CRITICAL,
                        message: 'Bot is not connected to Discord',
                        details: { isReady, wsStatus, ping }
                    };
                }

                if (ping > 300) {
                    return {
                        status: HealthStatus.DEGRADED,
                        message: `High latency detected: ${ping}ms`,
                        details: { ping }
                    };
                }

                return {
                    status: HealthStatus.HEALTHY,
                    message: 'Bot is connected',
                    details: { ping }
                };
            } catch (error) {
                return {
                    status: HealthStatus.CRITICAL,
                    message: 'Failed to check bot connectivity',
                    details: { error: error.message }
                };
            }
        });

        // Memory usage check
        this.registerCheck('memory_usage', async () => {
            try {
                const memory = getMemoryUsage();
                const heapUsedMB = memory.heapUsedMB;

                if (heapUsedMB > MEMORY.CRITICAL_THRESHOLD) {
                    return {
                        status: HealthStatus.CRITICAL,
                        message: `Critical memory usage: ${heapUsedMB}MB`,
                        details: memory
                    };
                }

                if (heapUsedMB > MEMORY.WARNING_THRESHOLD) {
                    return {
                        status: HealthStatus.DEGRADED,
                        message: `High memory usage: ${heapUsedMB}MB`,
                        details: memory
                    };
                }

                return {
                    status: HealthStatus.HEALTHY,
                    message: `Memory usage normal: ${heapUsedMB}MB`,
                    details: memory
                };
            } catch (error) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    message: 'Failed to check memory usage',
                    details: { error: error.message }
                };
            }
        });

        // Lavalink node health check
        this.registerCheck('lavalink_nodes', async () => {
            try {
                const musicManager = this.client.musicManager;
                if (!musicManager || !musicManager.shoukaku) {
                    return {
                        status: HealthStatus.CRITICAL,
                        message: 'Music manager not initialized',
                        details: {}
                    };
                }

                const nodes = Array.from(musicManager.shoukaku.nodes.values());
                const healthyNodes = nodes.filter(node => node.state === 1); // 1 = CONNECTED in Shoukaku v4.3.0
                const totalNodes = nodes.length;

                if (healthyNodes.length === 0) {
                    return {
                        status: HealthStatus.CRITICAL,
                        message: 'All Lavalink nodes are down',
                        details: { totalNodes, healthyNodes: 0 }
                    };
                }

                if (healthyNodes.length < totalNodes) {
                    return {
                        status: HealthStatus.DEGRADED,
                        message: `Some Lavalink nodes are down (${healthyNodes.length}/${totalNodes})`,
                        details: { totalNodes, healthyNodes: healthyNodes.length }
                    };
                }

                return {
                    status: HealthStatus.HEALTHY,
                    message: `All Lavalink nodes are healthy (${totalNodes})`,
                    details: { totalNodes, healthyNodes: healthyNodes.length }
                };
            } catch (error) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    message: 'Failed to check Lavalink nodes',
                    details: { error: error.message }
                };
            }
        });

        // Database connectivity check
        this.registerCheck('database', async () => {
            try {
                const db = this.client.database;
                if (!db || !db.isReady) {
                    return {
                        status: HealthStatus.CRITICAL,
                        message: 'Database not initialized',
                        details: {}
                    };
                }

                // Try a simple query
                const result = db.queryOne('SELECT 1 as test');

                if (result && result.test === 1) {
                    return {
                        status: HealthStatus.HEALTHY,
                        message: 'Database is accessible',
                        details: {}
                    };
                }

                return {
                    status: HealthStatus.UNHEALTHY,
                    message: 'Database query failed',
                    details: {}
                };
            } catch (error) {
                return {
                    status: HealthStatus.CRITICAL,
                    message: 'Database connection failed',
                    details: { error: error.message }
                };
            }
        });

        // Disk space check (optional, depends on environment)
        this.registerCheck('disk_space', async () => {
            try {
                const fsStats = await statfs(process.cwd());
                const totalBytes = Number(fsStats.blocks) * Number(fsStats.bsize);
                const availableBytes = Number(fsStats.bavail) * Number(fsStats.bsize);
                const usedPercent = totalBytes > 0 ? ((totalBytes - availableBytes) / totalBytes) * 100 : 0;

                if (usedPercent >= 95) {
                    return {
                        status: HealthStatus.CRITICAL,
                        message: `Disk usage critical: ${usedPercent.toFixed(1)}%`,
                        details: {
                            totalBytes,
                            availableBytes,
                            usedPercent: Number(usedPercent.toFixed(2))
                        }
                    };
                }

                if (usedPercent >= 85) {
                    return {
                        status: HealthStatus.DEGRADED,
                        message: `Disk usage high: ${usedPercent.toFixed(1)}%`,
                        details: {
                            totalBytes,
                            availableBytes,
                            usedPercent: Number(usedPercent.toFixed(2))
                        }
                    };
                }

                return {
                    status: HealthStatus.HEALTHY,
                    message: `Disk usage healthy: ${usedPercent.toFixed(1)}%`,
                    details: {
                        totalBytes,
                        availableBytes,
                        usedPercent: Number(usedPercent.toFixed(2))
                    }
                };
            } catch (error) {
                return {
                    status: HealthStatus.DEGRADED,
                    message: 'Disk space check unavailable (UNKNOWN)',
                    details: { reason: error.message, state: 'unknown' }
                };
            }
        });

        // Event Queue health check
        this.registerCheck('event_queue', async () => {
            try {
                const eventQueue = getEventQueue();
                if (!eventQueue) {
                    return {
                        status: HealthStatus.HEALTHY,
                        message: 'Event queue not initialized (normal on startup)',
                        details: {}
                    };
                }

                const stats = eventQueue.getStats();

                // Critical if queue is overloaded
                if (stats.isCritical) {
                    return {
                        status: HealthStatus.CRITICAL,
                        message: `Event queue at critical capacity (${stats.queueSize} items)`,
                        details: stats
                    };
                }

                // Degraded if experiencing backpressure
                if (stats.isBackpressured) {
                    return {
                        status: HealthStatus.DEGRADED,
                        message: `Event queue under backpressure (${stats.queueSize} items)`,
                        details: stats
                    };
                }

                // Degraded if high error rate
                const errorRate = stats.metrics.totalErrors / (stats.metrics.totalProcessed || 1);
                if (errorRate > 0.1) {
                    // >10% error rate
                    return {
                        status: HealthStatus.DEGRADED,
                        message: `High event queue error rate: ${(errorRate * 100).toFixed(1)}%`,
                        details: stats
                    };
                }

                return {
                    status: HealthStatus.HEALTHY,
                    message: `Event queue healthy (${stats.queueSize} queued, ${stats.activeCount} active)`,
                    details: {
                        queueSize: stats.queueSize,
                        activeCount: stats.activeCount,
                        avgProcessingTime: stats.metrics.avgProcessingTime,
                        successRate: stats.metrics.successRate
                    }
                };
            } catch (error) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    message: 'Failed to check event queue',
                    details: { error: error.message }
                };
            }
        });
    }

    /**
     * Run all health checks
     */
    async runAllChecks() {
        const now = Date.now();
        const results = {};

        for (const [name, check] of this.checks) {
            // Check if it's time to run this check
            if (now - check.lastRun < check.interval) {
                continue;
            }

            try {
                const result = await check.fn();
                check.lastRun = now;
                check.lastStatus = result.status;
                results[name] = result;

                // Log status changes
                const prevStatus = this.lastStatus.get(name);
                if (prevStatus && prevStatus !== result.status) {
                    logger.warn(`Health check status changed: ${name}`, {
                        from: prevStatus,
                        to: result.status,
                        message: result.message
                    });

                    // Send alert for critical status
                    if (result.status === HealthStatus.CRITICAL || result.status === HealthStatus.UNHEALTHY) {
                        await this.sendAlert(name, result);
                    }
                }

                this.lastStatus.set(name, result.status);

                // Log unhealthy checks
                if (result.status !== HealthStatus.HEALTHY) {
                    logger.warn(`Health check warning: ${name}`, result);
                }
            } catch (error) {
                logger.error(`Health check failed: ${name}`, error);
                results[name] = {
                    status: HealthStatus.UNHEALTHY,
                    message: 'Check execution failed',
                    details: { error: error.message }
                };
            }
        }

        return results;
    }

    /**
     * Run a specific health check
     * @param {string} name - Check name
     * @returns {Promise<Object>}
     */
    async runCheck(name) {
        const check = this.checks.get(name);
        if (!check) {
            throw new Error(`Health check not found: ${name}`);
        }

        try {
            const result = await check.fn();
            check.lastRun = Date.now();
            check.lastStatus = result.status;
            this.lastStatus.set(name, result.status);
            return result;
        } catch (error) {
            logger.error(`Health check failed: ${name}`, error);
            return {
                status: HealthStatus.UNHEALTHY,
                message: 'Check execution failed',
                details: { error: error.message }
            };
        }
    }

    /**
     * Get all health check results
     * @returns {Promise<Object>}
     */
    async getHealthStatus() {
        const results = {};
        const now = Date.now();
        // BUG-U10: Mark data as stale if check hasn't run within 2x its interval
        const DEFAULT_STALE_MULTIPLIER = 2;

        for (const [name, check] of this.checks) {
            if (check.lastStatus) {
                const age = now - check.lastRun;
                const staleThreshold = (check.interval || 60000) * DEFAULT_STALE_MULTIPLIER;
                results[name] = {
                    status: check.lastStatus,
                    lastRun: check.lastRun,
                    age,
                    stale: age > staleThreshold
                };
                // Invalidate stale status to force re-check
                if (age > staleThreshold) {
                    check.lastRun = 0;
                }
            }
        }

        return results;
    }

    /**
     * Get overall system health
     * @returns {Promise<Object>}
     */
    async getOverallHealth() {
        const results = await this.runAllChecks();

        // Determine overall status (worst status wins)
        let overallStatus = HealthStatus.HEALTHY;
        const statusPriority = {
            [HealthStatus.HEALTHY]: 0,
            [HealthStatus.DEGRADED]: 1,
            [HealthStatus.UNHEALTHY]: 2,
            [HealthStatus.CRITICAL]: 3
        };

        for (const result of Object.values(results)) {
            if (statusPriority[result.status] > statusPriority[overallStatus]) {
                overallStatus = result.status;
            }
        }

        return {
            status: overallStatus,
            checks: results,
            timestamp: Date.now()
        };
    }

    /**
     * Send alert via webhook or logging
     * @param {string} checkName - Check name
     * @param {Object} result - Check result
     */
    async sendAlert(checkName, result) {
        // Implement cooldown to prevent alert spam
        const cooldownKey = `${checkName}:${result.status}`;
        const lastAlert = this.alertCooldowns.get(cooldownKey);
        const cooldownPeriod = 5 * TIME.MINUTE; // 5 minutes

        if (lastAlert && Date.now() - lastAlert < cooldownPeriod) {
            return; // Skip alert due to cooldown
        }

        this.alertCooldowns.set(cooldownKey, Date.now());

        // Log alert
        logger.error(`🚨 ALERT: ${checkName}`, {
            status: result.status,
            message: result.message,
            details: result.details
        });

        // Send webhook if configured
        if (this.webhookUrl) {
            try {
                // Use native fetch (Node 18+) - no need for node-fetch
                await fetch(this.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(5000),
                    body: JSON.stringify({
                        content: `🚨 **Alert: ${checkName}**\n**Status:** ${result.status}\n**Message:** ${result.message}`,
                        embeds: [
                            {
                                title: `Health Check Alert: ${checkName}`,
                                description: result.message,
                                color: this.getAlertColor(result.status),
                                fields: Object.entries(result.details || {}).map(([key, value]) => ({
                                    name: key,
                                    value: String(value),
                                    inline: true
                                })),
                                timestamp: new Date().toISOString()
                            }
                        ]
                    })
                });
            } catch (error) {
                logger.error('Failed to send webhook alert', error);
            }
        }
    }

    /**
     * Get alert color based on status
     * @param {string} status - Health status
     * @returns {number} Discord color code
     */
    getAlertColor(status) {
        const colors = {
            [HealthStatus.HEALTHY]: COLORS.SUCCESS,
            [HealthStatus.DEGRADED]: COLORS.WARNING,
            [HealthStatus.UNHEALTHY]: COLORS.ERROR,
            [HealthStatus.CRITICAL]: COLORS.SEVERITY.critical
        };
        const hex = colors[status] || COLORS.MUTED;
        return parseInt(hex.replace('#', ''), 16);
    }
}

/**
 * Create and initialize health check manager
 * @param {Client} client - Discord client
 * @returns {HealthCheckManager}
 */
export function createHealthCheckManager(client) {
    return new HealthCheckManager(client);
}

export default {
    HealthStatus,
    HealthCheckManager,
    createHealthCheckManager
};
