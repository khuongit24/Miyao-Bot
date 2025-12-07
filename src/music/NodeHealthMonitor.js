/**
 * @file NodeHealthMonitor.js
 * @description Node Health Monitor - Track Lavalink node performance and availability
 * @version 1.8.2 - Added node blacklisting feature
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import { LAVALINK } from '../utils/constants.js';

/**
 * Node blacklist configuration
 */
const BLACKLIST_CONFIG = {
    /** Default blacklist duration in milliseconds (5 minutes) */
    DEFAULT_DURATION_MS: 5 * 60 * 1000,
    /** Number of consecutive failures before auto-blacklisting */
    FAILURE_THRESHOLD: 3,
    /** Cleanup interval for expired blacklist entries (1 minute) */
    CLEANUP_INTERVAL_MS: 60 * 1000
};

/**
 * Node Health Monitor - Track node performance and availability
 * @extends EventEmitter
 * @fires NodeHealthMonitor#unhealthy - When a node becomes unhealthy
 * @fires NodeHealthMonitor#healthy - When a node becomes healthy
 * @fires NodeHealthMonitor#statsUpdated - When node stats are updated
 * @fires NodeHealthMonitor#nodeBlacklisted - When a node is blacklisted
 * @fires NodeHealthMonitor#nodeUnblacklisted - When a node is removed from blacklist
 */
export class NodeHealthMonitor extends EventEmitter {
    constructor() {
        super();
        this.nodeStats = new Map();
        this.healthCheckInterval = null;
        this.unhealthyThresholds = {
            cpuPercent: 80,
            memoryPercent: 90,
            playerLimit: 500
        };

        // Blacklist Map: nodeName -> { blacklistedAt: timestamp, duration: ms, reason: string }
        this.blacklist = new Map();

        // Failure counter Map: nodeName -> { count: number, lastFailure: timestamp }
        this.failureCounters = new Map();

        // Blacklist cleanup interval
        this.blacklistCleanupInterval = null;
    }

    /**
     * Start monitoring Lavalink nodes
     * @param {Shoukaku} shoukaku - Shoukaku instance
     * @param {number} intervalMs - Health check interval in milliseconds
     */
    start(shoukaku, intervalMs = LAVALINK.HEALTH_CHECK_INTERVAL) {
        this.healthCheckInterval = setInterval(() => {
            this._performHealthCheck(shoukaku);
        }, intervalMs);

        // Start blacklist cleanup interval
        this.blacklistCleanupInterval = setInterval(() => {
            this._cleanupExpiredBlacklist();
        }, BLACKLIST_CONFIG.CLEANUP_INTERVAL_MS);

        logger.info('NodeHealthMonitor started', {
            healthCheckIntervalMs: intervalMs,
            blacklistCleanupIntervalMs: BLACKLIST_CONFIG.CLEANUP_INTERVAL_MS
        });
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        if (this.blacklistCleanupInterval) {
            clearInterval(this.blacklistCleanupInterval);
            this.blacklistCleanupInterval = null;
        }

        logger.info('NodeHealthMonitor stopped');
    }

    /**
     * Perform health check on all nodes
     * @private
     */
    _performHealthCheck(shoukaku) {
        for (const [name, node] of shoukaku.nodes) {
            // Shoukaku v4 state: 0=DISCONNECTED, 1=CONNECTING, 2=CONNECTED, 3=RECONNECTING
            const isConnected = node.state === 2; // CONNECTED state in v4
            const stats = {
                name,
                connected: isConnected,
                players: node.stats?.players || 0,
                playingPlayers: node.stats?.playingPlayers || 0,
                cpu: (node.stats?.cpu?.lavalinkLoad || 0) * 100, // Convert to percentage
                memory: node.stats?.memory?.used || 0,
                memoryAllocated: node.stats?.memory?.allocated || 0,
                uptime: node.stats?.uptime || 0,
                timestamp: Date.now()
            };

            // Calculate memory percentage
            if (stats.memoryAllocated > 0) {
                stats.memoryPercent = (stats.memory / stats.memoryAllocated) * 100;
            } else {
                stats.memoryPercent = 0;
            }

            const previousStats = this.nodeStats.get(name);
            this.nodeStats.set(name, stats);

            // Check health status
            const healthIssues = this._checkHealthIssues(stats);

            if (healthIssues.length > 0) {
                // Node is unhealthy
                if (!previousStats || !previousStats.unhealthy) {
                    stats.unhealthy = true;
                    this.emit('unhealthy', { ...stats, issues: healthIssues });
                    logger.warn(`Node ${name} is unhealthy`, { issues: healthIssues, stats });
                }
            } else if (previousStats?.unhealthy) {
                // Node recovered
                stats.unhealthy = false;
                this.emit('healthy', stats);
                logger.info(`Node ${name} is now healthy`, stats);
            }

            this.emit('statsUpdated', stats);
        }
    }

    /**
     * Check for health issues
     * @private
     * @returns {string[]} Array of issue descriptions
     */
    _checkHealthIssues(stats) {
        const issues = [];

        if (!stats.connected) {
            issues.push('disconnected');
        }

        if (stats.cpu > this.unhealthyThresholds.cpuPercent) {
            issues.push(`high_cpu:${stats.cpu.toFixed(1)}%`);
        }

        if (stats.memoryPercent > this.unhealthyThresholds.memoryPercent) {
            issues.push(`high_memory:${stats.memoryPercent.toFixed(1)}%`);
        }

        if (stats.players > this.unhealthyThresholds.playerLimit) {
            issues.push(`too_many_players:${stats.players}`);
        }

        return issues;
    }

    /**
     * Get the best available node based on load
     * Excludes blacklisted nodes from selection
     * @param {Shoukaku} shoukaku - Shoukaku instance
     * @returns {Node|null} Best available node
     */
    getBestNode(shoukaku) {
        let bestNode = null;
        let lowestLoad = Infinity;

        for (const [name, stats] of this.nodeStats) {
            // Skip disconnected nodes
            if (!stats.connected) continue;

            // Skip blacklisted nodes
            if (this.isBlacklisted(name)) {
                logger.debug(`Skipping blacklisted node: ${name}`, { guildId: 'system' });
                continue;
            }

            // Calculate load score (lower is better)
            // Weight: CPU is more important than player count
            const cpuScore = stats.cpu || 0;
            const playerScore = (stats.players || 0) * 2; // 2 points per player
            const memoryScore = stats.memoryPercent ? stats.memoryPercent * 0.5 : 0;

            const load = cpuScore + playerScore + memoryScore;

            if (load < lowestLoad) {
                lowestLoad = load;
                bestNode = shoukaku.nodes.get(name);
            }
        }

        // Fallback: Find any connected, non-blacklisted node directly
        if (!bestNode && shoukaku && shoukaku.nodes) {
            // State 2 = CONNECTED in Shoukaku v4
            bestNode = [...shoukaku.nodes.values()].find(node => {
                return node.state === 2 && !this.isBlacklisted(node.name);
            });
        }

        // Last resort: If all nodes are blacklisted, try to find any connected node
        // This prevents complete service outage when all nodes have issues
        if (!bestNode && shoukaku && shoukaku.nodes) {
            const anyConnected = [...shoukaku.nodes.values()].find(node => node.state === 2);
            if (anyConnected) {
                logger.warn('All nodes blacklisted, using any available node as last resort', {
                    node: anyConnected.name
                });
                bestNode = anyConnected;
            }
        }

        return bestNode;
    }

    /**
     * Check if a node is currently blacklisted
     * @param {string} nodeName - Node name to check
     * @returns {boolean} True if node is blacklisted
     */
    isBlacklisted(nodeName) {
        const entry = this.blacklist.get(nodeName);
        if (!entry) return false;

        // Check if blacklist has expired
        const now = Date.now();
        if (now - entry.blacklistedAt > entry.duration) {
            // Auto-remove expired entry
            this.blacklist.delete(nodeName);
            logger.info(`Node ${nodeName} blacklist expired, auto-removed`);
            this.emit('nodeUnblacklisted', { name: nodeName, reason: 'expired' });
            return false;
        }

        return true;
    }

    /**
     * Blacklist a node for a specified duration
     * @param {string} nodeName - Node name to blacklist
     * @param {string} reason - Reason for blacklisting
     * @param {number} durationMs - Duration in milliseconds (default: 5 minutes)
     */
    blacklistNode(nodeName, reason = 'manual', durationMs = BLACKLIST_CONFIG.DEFAULT_DURATION_MS) {
        const entry = {
            blacklistedAt: Date.now(),
            duration: durationMs,
            reason
        };

        this.blacklist.set(nodeName, entry);

        logger.warn(`Node ${nodeName} blacklisted`, {
            reason,
            durationMs,
            expiresAt: new Date(Date.now() + durationMs).toISOString()
        });

        this.emit('nodeBlacklisted', { name: nodeName, ...entry });
    }

    /**
     * Remove a node from the blacklist
     * @param {string} nodeName - Node name to unblacklist
     * @returns {boolean} True if node was in blacklist and removed
     */
    unblacklistNode(nodeName) {
        const existed = this.blacklist.has(nodeName);

        if (existed) {
            this.blacklist.delete(nodeName);
            // Reset failure counter when manually unblacklisted
            this.failureCounters.delete(nodeName);

            logger.info(`Node ${nodeName} manually removed from blacklist`);
            this.emit('nodeUnblacklisted', { name: nodeName, reason: 'manual' });
        }

        return existed;
    }

    /**
     * Record a failure for a node (for auto-blacklisting)
     * @param {string} nodeName - Node name
     * @param {string} reason - Failure reason
     */
    recordFailure(nodeName, reason = 'unknown') {
        const now = Date.now();
        let counter = this.failureCounters.get(nodeName);

        if (!counter) {
            counter = { count: 0, lastFailure: 0 };
        }

        // Reset counter if last failure was more than 5 minutes ago
        // This implements a "sliding window" approach
        if (now - counter.lastFailure > BLACKLIST_CONFIG.DEFAULT_DURATION_MS) {
            counter.count = 0;
        }

        counter.count++;
        counter.lastFailure = now;
        this.failureCounters.set(nodeName, counter);

        logger.debug(`Node ${nodeName} failure recorded`, {
            count: counter.count,
            threshold: BLACKLIST_CONFIG.FAILURE_THRESHOLD,
            reason
        });

        // Auto-blacklist if threshold exceeded
        if (counter.count >= BLACKLIST_CONFIG.FAILURE_THRESHOLD) {
            this.blacklistNode(
                nodeName,
                `auto: ${counter.count} consecutive failures (${reason})`,
                BLACKLIST_CONFIG.DEFAULT_DURATION_MS
            );
            // Reset counter after blacklisting
            this.failureCounters.delete(nodeName);
        }
    }

    /**
     * Record a success for a node (resets failure counter)
     * @param {string} nodeName - Node name
     */
    recordSuccess(nodeName) {
        if (this.failureCounters.has(nodeName)) {
            this.failureCounters.delete(nodeName);
            logger.debug(`Node ${nodeName} failure counter reset due to success`);
        }
    }

    /**
     * Clean up expired blacklist entries
     * @private
     */
    _cleanupExpiredBlacklist() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [nodeName, entry] of this.blacklist.entries()) {
            if (now - entry.blacklistedAt > entry.duration) {
                this.blacklist.delete(nodeName);
                cleanedCount++;
                logger.info(`Cleaned up expired blacklist entry: ${nodeName}`);
                this.emit('nodeUnblacklisted', { name: nodeName, reason: 'expired' });
            }
        }

        // Also cleanup stale failure counters (older than 10 minutes with no recent failures)
        const staleThreshold = 10 * 60 * 1000; // 10 minutes
        for (const [nodeName, counter] of this.failureCounters.entries()) {
            if (now - counter.lastFailure > staleThreshold) {
                this.failureCounters.delete(nodeName);
                logger.debug(`Cleaned up stale failure counter: ${nodeName}`);
            }
        }

        // Cleanup nodeStats for nodes that no longer exist (limit size to prevent memory growth)
        const MAX_NODE_STATS = 20; // Reasonable limit for node stats history
        if (this.nodeStats.size > MAX_NODE_STATS) {
            // Remove oldest entries based on timestamp
            const sorted = [...this.nodeStats.entries()].sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));

            const toRemove = sorted.slice(0, this.nodeStats.size - MAX_NODE_STATS);
            for (const [name] of toRemove) {
                this.nodeStats.delete(name);
                logger.debug(`Cleaned up old node stats: ${name}`);
            }
        }

        if (cleanedCount > 0) {
            logger.debug(`Blacklist cleanup: removed ${cleanedCount} expired entries`);
        }
    }

    /**
     * Get blacklist status for all nodes
     * @returns {Object[]} Array of blacklist entries with TTL info
     */
    getBlacklistStatus() {
        const now = Date.now();
        const status = [];

        for (const [nodeName, entry] of this.blacklist.entries()) {
            const remaining = Math.max(0, entry.duration - (now - entry.blacklistedAt));
            status.push({
                name: nodeName,
                reason: entry.reason,
                blacklistedAt: new Date(entry.blacklistedAt).toISOString(),
                remainingMs: remaining,
                remainingMinutes: Math.round(remaining / 60000)
            });
        }

        return status;
    }

    /**
     * Get stats for a specific node
     * @param {string} nodeName - Node name
     * @returns {Object|null} Node stats
     */
    getNodeStats(nodeName) {
        return this.nodeStats.get(nodeName) || null;
    }

    /**
     * Get stats for all nodes
     * @returns {Object[]} Array of node stats
     */
    getAllStats() {
        return Array.from(this.nodeStats.values());
    }

    /**
     * Check if any node is healthy
     * @returns {boolean}
     */
    hasHealthyNode() {
        for (const stats of this.nodeStats.values()) {
            if (stats.connected && !stats.unhealthy) {
                return true;
            }
        }
        return false;
    }

    /**
     * Set health thresholds
     * @param {Object} thresholds - New thresholds
     */
    setThresholds(thresholds) {
        this.unhealthyThresholds = {
            ...this.unhealthyThresholds,
            ...thresholds
        };
    }

    /**
     * Get summary report of all nodes
     * @returns {Object}
     */
    getReport() {
        const nodes = this.getAllStats();
        const healthy = nodes.filter(n => n.connected && !n.unhealthy);
        const unhealthy = nodes.filter(n => !n.connected || n.unhealthy);
        const blacklisted = this.getBlacklistStatus();

        return {
            totalNodes: nodes.length,
            healthyNodes: healthy.length,
            unhealthyNodes: unhealthy.length,
            blacklistedNodes: blacklisted.length,
            totalPlayers: nodes.reduce((sum, n) => sum + (n.players || 0), 0),
            totalPlayingPlayers: nodes.reduce((sum, n) => sum + (n.playingPlayers || 0), 0),
            averageCpu: nodes.length > 0 ? nodes.reduce((sum, n) => sum + (n.cpu || 0), 0) / nodes.length : 0,
            nodes: nodes,
            blacklist: blacklisted
        };
    }
}

export default NodeHealthMonitor;
