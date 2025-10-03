/**
 * Metrics API Server
 * Provides real-time bot metrics for launcher dashboard
 */

import express from 'express';
import cors from 'cors';
import { metricsTracker } from '../utils/metrics.js';
import { VERSION } from '../utils/version.js';
import logger from '../utils/logger.js';

const app = express();
const PORT = process.env.METRICS_PORT || 3000;
const API_KEY = process.env.METRICS_API_KEY || 'miyao-metrics-dev-key';

// Middleware
app.use(cors());
app.use(express.json());

// API Key authentication middleware
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (apiKey !== API_KEY) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid API key'
        });
    }
    
    next();
};

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: VERSION.full,
        uptime: process.uptime()
    });
});

// Get all metrics (requires auth)
app.get('/api/metrics', authenticate, (req, res) => {
    try {
        const summary = metricsTracker.getSummary();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: VERSION.full,
            codename: VERSION.codename,
            build: VERSION.build,
            environment: VERSION.ENVIRONMENT,
            metrics: {
                uptime: {
                    seconds: summary.uptime,
                    formatted: formatUptime(summary.uptime)
                },
                commands: {
                    total: summary.totalCommands,
                    successful: summary.successfulCommands,
                    failed: summary.failedCommands,
                    successRate: summary.commandSuccessRate,
                    topCommands: summary.topCommands || []
                },
                music: {
                    tracksPlayed: summary.tracksPlayed || 0,
                    totalPlaytime: summary.totalPlaytime || 0,
                    activeQueues: summary.activeQueues || 0,
                    mostPlayed: summary.mostPlayedTrack || null
                },
                performance: {
                    averageResponseTime: summary.avgResponseTime,
                    minResponseTime: summary.minResponseTime,
                    maxResponseTime: summary.maxResponseTime,
                    responseTimeHistory: summary.responseTimeHistory || []
                },
                system: {
                    memory: {
                        used: summary.memoryUsage,
                        limit: summary.memoryLimit || 512 * 1024 * 1024,
                        percentage: ((summary.memoryUsage / (summary.memoryLimit || 512 * 1024 * 1024)) * 100).toFixed(1)
                    },
                    cpu: {
                        usage: getCPUUsage(),
                        cores: require('os').cpus().length
                    }
                },
                errors: {
                    total: summary.totalErrors || 0,
                    rate: summary.errorRate || 0,
                    breakdown: summary.errorBreakdown || {},
                    recent: summary.recentErrors || []
                },
                cache: {
                    hits: summary.cacheHits || 0,
                    misses: summary.cacheMisses || 0,
                    hitRate: summary.cacheHitRate || 0
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Get specific metric category
app.get('/api/metrics/:category', authenticate, (req, res) => {
    try {
        const { category } = req.params;
        const summary = metricsTracker.getSummary();
        
        let data;
        
        switch (category) {
            case 'commands':
                data = {
                    total: summary.totalCommands,
                    successful: summary.successfulCommands,
                    failed: summary.failedCommands,
                    successRate: summary.commandSuccessRate,
                    topCommands: summary.topCommands || []
                };
                break;
                
            case 'music':
                data = {
                    tracksPlayed: summary.tracksPlayed || 0,
                    totalPlaytime: summary.totalPlaytime || 0,
                    activeQueues: summary.activeQueues || 0,
                    mostPlayed: summary.mostPlayedTrack || null
                };
                break;
                
            case 'performance':
                data = {
                    averageResponseTime: summary.avgResponseTime,
                    minResponseTime: summary.minResponseTime,
                    maxResponseTime: summary.maxResponseTime,
                    responseTimeHistory: summary.responseTimeHistory || []
                };
                break;
                
            case 'system':
                data = {
                    memory: {
                        used: summary.memoryUsage,
                        limit: summary.memoryLimit || 512 * 1024 * 1024,
                        percentage: ((summary.memoryUsage / (summary.memoryLimit || 512 * 1024 * 1024)) * 100).toFixed(1)
                    },
                    cpu: {
                        usage: getCPUUsage(),
                        cores: require('os').cpus().length
                    },
                    uptime: summary.uptime
                };
                break;
                
            case 'errors':
                data = {
                    total: summary.totalErrors || 0,
                    rate: summary.errorRate || 0,
                    breakdown: summary.errorBreakdown || {},
                    recent: summary.recentErrors || []
                };
                break;
                
            default:
                return res.status(404).json({
                    success: false,
                    error: 'Category not found',
                    message: `Unknown category: ${category}`,
                    availableCategories: ['commands', 'music', 'performance', 'system', 'errors']
                });
        }
        
        res.json({
            success: true,
            category,
            data
        });
    } catch (error) {
        logger.error(`Error fetching ${req.params.category} metrics:`, error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Get real-time stats (lightweight endpoint for frequent polling)
app.get('/api/stats/realtime', authenticate, (req, res) => {
    try {
        const summary = metricsTracker.getSummary();
        
        res.json({
            success: true,
            timestamp: Date.now(),
            stats: {
                uptime: summary.uptime,
                memory: summary.memoryUsage,
                commands: summary.totalCommands,
                successRate: summary.commandSuccessRate,
                avgResponseTime: summary.avgResponseTime,
                activeQueues: summary.activeQueues || 0,
                errors: summary.totalErrors || 0
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Helper Functions
 */

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
}

function getCPUUsage() {
    const usage = process.cpuUsage();
    const totalUsage = (usage.user + usage.system) / 1000000; // Convert to seconds
    const uptime = process.uptime();
    const cpuPercent = (totalUsage / uptime * 100).toFixed(1);
    
    return parseFloat(cpuPercent);
}

/**
 * Start metrics server
 */
export function startMetricsServer(client) {
    // Store client reference for future use
    app.locals.client = client;
    
    const server = app.listen(PORT, () => {
        logger.info(`Metrics API server started on port ${PORT}`);
        logger.info(`Health check: http://localhost:${PORT}/health`);
        logger.info(`Metrics endpoint: http://localhost:${PORT}/api/metrics`);
    });
    
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            logger.warn(`Port ${PORT} is already in use. Metrics API not started.`);
        } else {
            logger.error('Metrics API server error:', error);
        }
    });
    
    return server;
}

export default app;
