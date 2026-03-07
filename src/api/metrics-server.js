/**
 * Metrics API Server
 * Provides real-time bot metrics for launcher dashboard
 * Enhanced with security features: rate limiting, helmet, request logging
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import os from 'os';
import v8 from 'v8';
import { timingSafeEqual } from 'crypto';
import { metricsTracker } from '../utils/metrics.js';
import { VERSION, ENVIRONMENT } from '../utils/version.js';
import logger from '../utils/logger.js';

const app = express();
const PORT = process.env.METRICS_PORT || 3000;
const SHOW_ERROR_DETAILS = process.env.SHOW_ERROR_DETAILS === 'true';

// API key and whitelist will be validated on server start
let VALID_API_KEYS = [];
let IP_WHITELIST = [];

// Security middleware
app.use(helmet());
// FIX-API-C01: Default CORS origin restricted to localhost instead of wildcard '*'
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || 'http://127.0.0.1',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'x-api-key']
    })
);
app.use(express.json({ limit: '100kb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const strictLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 requests per minute
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please slow down.'
    }
});

// Apply rate limiting to all routes
app.use('/api/', limiter);

// IP Whitelist middleware
app.use('/api/', (req, res, next) => {
    // Skip if whitelist is empty (allow all)
    if (IP_WHITELIST.length === 0) {
        return next();
    }

    const clientIp = req.ip || req.connection.remoteAddress;

    // Check if IP is whitelisted (exact match only)
    const isAllowed = IP_WHITELIST.some(allowedIp => {
        return clientIp === allowedIp;
    });

    if (!isAllowed) {
        logger.warn('IP blocked by whitelist', { ip: clientIp, path: req.path });
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Your IP address is not whitelisted'
        });
    }

    next();
});

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('API Request', {
            method: req.method,
            path: req.path,
            ip: req.ip,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('user-agent')
        });
    });
    next();
});

// API Key authentication middleware with audit logging
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        logger.warn('API request without key', { ip: req.ip, path: req.path });
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key required. Please provide x-api-key header.'
        });
    }

    // Check against all valid API keys (support rotation) using constant-time comparison
    const apiKeyBuffer = Buffer.from(apiKey);
    const isValidKey = VALID_API_KEYS.some(validKey => {
        const validKeyBuffer = Buffer.from(validKey);
        if (apiKeyBuffer.length !== validKeyBuffer.length) return false;
        return timingSafeEqual(apiKeyBuffer, validKeyBuffer);
    });

    if (!isValidKey) {
        logger.warn('API request with invalid key', {
            ip: req.ip,
            path: req.path,
            keyPrefix: apiKey.substring(0, 8) + '...' // Log only prefix for security
        });
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid API key'
        });
    }

    // Log successful authentication
    logger.debug('API authenticated', { ip: req.ip, path: req.path });
    next();
};

// Health check endpoint (no auth required)
app.get('/health', async (req, res) => {
    try {
        const client = app.locals.client;
        let healthStatus = 'ok';

        // Get detailed health if health check manager is available
        if (client && client.healthCheck) {
            const health = await client.healthCheck.getOverallHealth();
            healthStatus = health.status;
        }

        res.json({
            status: healthStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: SHOW_ERROR_DETAILS ? error.message : 'Health check failed'
        });
    }
});

// Detailed health check endpoint (requires auth)
app.get('/api/health', authenticate, async (req, res) => {
    try {
        const client = app.locals.client;

        if (!client || !client.healthCheck) {
            return res.status(503).json({
                success: false,
                error: 'Health check not available',
                message: 'Health check manager not initialized'
            });
        }

        const health = await client.healthCheck.getOverallHealth();

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            overall: health.status,
            checks: health.checks
        });
    } catch (error) {
        logger.error('Error fetching health status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: SHOW_ERROR_DETAILS ? error.message : 'An unexpected error occurred'
        });
    }
});

// Get all metrics (requires auth)
app.get('/api/metrics', authenticate, (req, res) => {
    try {
        const client = app.locals.client;
        const summary = metricsTracker.getSummary();
        const activeQueues = client?.musicManager?.queues?.size || 0;

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: VERSION.full,
            codename: VERSION.codename,
            build: VERSION.build,
            environment: ENVIRONMENT.env,
            metrics: {
                uptime: {
                    seconds: summary.uptime,
                    formatted: formatUptime(summary.uptime)
                },
                commands: {
                    total: summary.commands.total,
                    successful: summary.commands.successful,
                    failed: summary.commands.failed,
                    successRate: summary.commands.successRate,
                    topCommands: summary.commands.byCommand || []
                },
                music: {
                    tracksPlayed: summary.music.totalTracks || 0,
                    totalPlaytime: summary.music.totalPlaytime || 0,
                    activeQueues,
                    mostPlayed: null
                },
                performance: {
                    averageResponseTime: summary.performance.avgResponseTime,
                    minResponseTime: summary.performance.minResponseTime,
                    maxResponseTime: summary.performance.maxResponseTime,
                    responseTimeHistory: []
                },
                system: {
                    memory: {
                        // FIX-API-C03: Use dynamic heap limit instead of hardcoded 512MB
                        used: process.memoryUsage().heapUsed,
                        limit: v8.getHeapStatistics().heap_size_limit,
                        percentage: (
                            (process.memoryUsage().heapUsed / v8.getHeapStatistics().heap_size_limit) *
                            100
                        ).toFixed(1)
                    },
                    cpu: {
                        usage: getCPUUsage(),
                        cores: os.cpus().length
                    }
                },
                errors: {
                    total: summary.errors.total || 0,
                    rate:
                        summary.commands.total > 0
                            ? (((summary.errors.total || 0) / summary.commands.total) * 100).toFixed(1)
                            : 0,
                    breakdown: summary.errors.byType || {},
                    recent: summary.errors.lastError ? [summary.errors.lastError] : []
                },
                cache: {
                    hits: summary.music.cacheHits || 0,
                    misses: summary.music.cacheMisses || 0,
                    hitRate: summary.music.cacheHitRate || 0
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: SHOW_ERROR_DETAILS ? error.message : 'An unexpected error occurred'
        });
    }
});

// Get specific metric category
app.get('/api/metrics/:category', authenticate, (req, res) => {
    try {
        const { category } = req.params;
        const client = app.locals.client;
        const summary = metricsTracker.getSummary();
        const activeQueues = client?.musicManager?.queues?.size || 0;

        let data;

        switch (category) {
            case 'commands':
                data = {
                    total: summary.commands.total,
                    successful: summary.commands.successful,
                    failed: summary.commands.failed,
                    successRate: summary.commands.successRate,
                    topCommands: summary.commands.byCommand || []
                };
                break;

            case 'music':
                data = {
                    tracksPlayed: summary.music.totalTracks || 0,
                    totalPlaytime: summary.music.totalPlaytime || 0,
                    activeQueues,
                    mostPlayed: null
                };
                break;

            case 'performance':
                data = {
                    averageResponseTime: summary.performance.avgResponseTime,
                    minResponseTime: summary.performance.minResponseTime,
                    maxResponseTime: summary.performance.maxResponseTime,
                    responseTimeHistory: []
                };
                break;

            case 'system':
                data = {
                    memory: {
                        // FIX-API-C03: Use dynamic heap limit instead of hardcoded 512MB
                        used: process.memoryUsage().heapUsed,
                        limit: v8.getHeapStatistics().heap_size_limit,
                        percentage: (
                            (process.memoryUsage().heapUsed / v8.getHeapStatistics().heap_size_limit) *
                            100
                        ).toFixed(1)
                    },
                    cpu: {
                        usage: getCPUUsage(),
                        cores: os.cpus().length
                    },
                    uptime: summary.uptime
                };
                break;

            case 'errors':
                data = {
                    total: summary.errors.total || 0,
                    rate:
                        summary.commands.total > 0
                            ? (((summary.errors.total || 0) / summary.commands.total) * 100).toFixed(1)
                            : 0,
                    breakdown: summary.errors.byType || {},
                    recent: summary.errors.lastError ? [summary.errors.lastError] : []
                };
                break;

            default:
                // FIX-API-C02: Do not reflect user input in error response (XSS risk)
                return res.status(404).json({
                    success: false,
                    error: 'Category not found',
                    message: 'Unknown category',
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
            message: SHOW_ERROR_DETAILS ? error.message : 'An unexpected error occurred'
        });
    }
});

// Get real-time stats (lightweight endpoint for frequent polling)
app.get('/api/stats/realtime', authenticate, (req, res) => {
    try {
        const client = app.locals.client;
        const summary = metricsTracker.getSummary();
        const activeQueues = client?.musicManager?.queues?.size || 0;

        res.json({
            success: true,
            timestamp: Date.now(),
            stats: {
                uptime: summary.uptime,
                memory: process.memoryUsage().heapUsed,
                commands: summary.commands.total,
                successRate: summary.commands.successRate,
                avgResponseTime: summary.performance.avgResponseTime,
                activeQueues,
                errors: summary.errors.total || 0
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: SHOW_ERROR_DETAILS ? error.message : 'Failed to fetch realtime stats'
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
    const cpuPercent = ((totalUsage / uptime) * 100).toFixed(1);

    return parseFloat(cpuPercent);
}

/**
 * Start metrics server
 */
export function startMetricsServer(client) {
    // Validate API key configuration
    const API_KEY = process.env.METRICS_API_KEY;
    if (!API_KEY) {
        logger.error('METRICS_API_KEY environment variable is required but not set');
        logger.error('Please set METRICS_API_KEY in your .env file with a strong random key (min 32 characters)');
        logger.error('Example: METRICS_API_KEY=your-secure-random-key-here');
        throw new Error('METRICS_API_KEY is required for security');
    }

    // Validate API key strength
    if (API_KEY.length < 32) {
        logger.error('METRICS_API_KEY must be at least 32 characters long for security');
        throw new Error('METRICS_API_KEY too short (minimum 32 characters)');
    }

    // Support multiple API keys for rotation (comma-separated)
    VALID_API_KEYS = API_KEY.split(',').map(k => k.trim());
    logger.info(`Metrics API initialized with ${VALID_API_KEYS.length} API key(s)`);

    // IP Whitelist (optional, empty = allow all)
    IP_WHITELIST = process.env.METRICS_ALLOWED_IPS
        ? process.env.METRICS_ALLOWED_IPS.split(',').map(ip => ip.trim())
        : [];

    if (IP_WHITELIST.length > 0) {
        logger.info(`IP whitelist enabled with ${IP_WHITELIST.length} allowed IP(s)`);
    } else {
        logger.warn('IP whitelist is empty - all IPs allowed (set METRICS_ALLOWED_IPS to restrict)');
    }

    // Store client reference for future use
    app.locals.client = client;

    const server = app.listen(PORT, '127.0.0.1', () => {
        logger.info(`Metrics API server started on 127.0.0.1:${PORT}`);
        logger.info(`Health check: http://127.0.0.1:${PORT}/health`);
        logger.info(`Metrics endpoint: http://127.0.0.1:${PORT}/api/metrics`);
    });

    server.on('error', error => {
        if (error.code === 'EADDRINUSE') {
            logger.warn(`Port ${PORT} is already in use. Metrics API not started.`);
            // FIX-LB08: Clear server reference so shutdown doesn't try to close a failed server
            if (client) {
                client._metricsServer = null;
            }
        } else {
            logger.error('Metrics API server error:', error);
        }
    });

    // Store server reference on client for shutdown cleanup
    if (client) {
        client._metricsServer = server;
    }

    return server;
}

export default app;
