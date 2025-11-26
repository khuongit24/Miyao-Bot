/**
 * @file NodeHealthMonitor.js
 * @description Node Health Monitor - Track Lavalink node performance and availability
 * @version 1.8.0 - Extracted from MusicManagerEnhanced.js
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import { LAVALINK } from '../utils/constants.js';

/**
 * Node Health Monitor - Track node performance and availability
 * @extends EventEmitter
 * @fires NodeHealthMonitor#unhealthy - When a node becomes unhealthy
 * @fires NodeHealthMonitor#healthy - When a node becomes healthy
 * @fires NodeHealthMonitor#statsUpdated - When node stats are updated
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
        
        logger.info('NodeHealthMonitor started', { intervalMs });
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.info('NodeHealthMonitor stopped');
        }
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
                stats.memoryPercent = (stats.memory / stats.memoryAllocated * 100);
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
     * @param {Shoukaku} shoukaku - Shoukaku instance
     * @returns {Node|null} Best available node
     */
    getBestNode(shoukaku) {
        let bestNode = null;
        let lowestLoad = Infinity;

        for (const [name, stats] of this.nodeStats) {
            if (!stats.connected) continue;
            
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

        // Fallback: Find any connected node directly (prevent infinite recursion)
        if (!bestNode && shoukaku && shoukaku.nodes) {
            // State 2 = CONNECTED in Shoukaku v4
            bestNode = [...shoukaku.nodes.values()].find(node => node.state === 2);
        }

        return bestNode;
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
        
        return {
            totalNodes: nodes.length,
            healthyNodes: healthy.length,
            unhealthyNodes: unhealthy.length,
            totalPlayers: nodes.reduce((sum, n) => sum + (n.players || 0), 0),
            totalPlayingPlayers: nodes.reduce((sum, n) => sum + (n.playingPlayers || 0), 0),
            averageCpu: nodes.length > 0 
                ? nodes.reduce((sum, n) => sum + (n.cpu || 0), 0) / nodes.length 
                : 0,
            nodes: nodes
        };
    }
}

export default NodeHealthMonitor;
