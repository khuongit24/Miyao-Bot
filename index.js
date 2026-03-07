import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import logger from './src/utils/logger.js';
import { loadConfig } from './src/utils/helpers.js';
import { VERSION } from './src/utils/version.js';
import metricsTracker from './src/utils/metrics.js';
import MusicManager from './src/music/MusicManager.js';
import { startMetricsServer } from './src/api/metrics-server.js';
import { getDatabaseManager } from './src/database/DatabaseManager.js';
import { getHistoryBatcher } from './src/database/HistoryBatcher.js';
import { getCacheManager } from './src/services/cache/CacheManager.js';
import { getEventQueue } from './src/utils/EventQueue.js';
import { TIME, DATABASE } from './src/utils/constants.js';
import { createHealthCheckManager } from './src/utils/health-check.js';
import { validateEnvironmentOrExit, getEnvironmentInfo } from './src/utils/validate-env.js';
import { memoryMonitor, idleCleanup } from './src/utils/memory-optimization.js';
import { resourceLeakMonitor } from './src/utils/resource-leak-detector.js';
import { clearHistoryCacheCleanup } from './src/events/buttons/MusicHandlers.js';
import { clearAllVoiceTimers } from './src/events/voiceStateUpdate.js';
import { cancelPendingLyricsRequests } from './src/utils/lyrics.js';
import { getShutdownRegistry } from './src/utils/ShutdownRegistry.js';
// graceful-degradation.js removed (dead code — BUG-U16)

// Load environment variables
dotenvConfig();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate all environment variables (will exit if invalid)
validateEnvironmentOrExit();

// Log environment info
const envInfo = getEnvironmentInfo();
logger.info(`🌍 Environment: ${envInfo.nodeEnv}`);
logger.info(`📝 Log Level: ${envInfo.logLevel}`);
logger.debug('Environment configuration:', envInfo);

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Required for prefix commands
    ]
});

// Load configuration
client.config = loadConfig();

// Initialize commands collection
client.commands = new Collection();

// Attach metrics tracker to client
client.metrics = metricsTracker;

// Initialize Unified Cache Manager
// This replaces all disconnected caches (searchResults, discovery, similar, trending, history)
const cacheManager = getCacheManager({
    // Total memory budget from environment or default 200MB
    totalBudgetBytes: parseInt(process.env.CACHE_BUDGET_MB || '200') * 1024 * 1024,
    defaultTTLMs: TIME.SEARCH_CACHE_TTL,
    cleanupIntervalMs: TIME.CACHE_CLEANUP_INTERVAL
});
cacheManager.start();
client.cacheManager = cacheManager;

// Legacy compatibility: client._lastSearchResults now uses CacheManager
// This Map interface is maintained for backward compatibility with existing code
client._lastSearchResults = {
    _namespace: 'searchResults',
    get size() {
        const ns = cacheManager.getNamespace(this._namespace);
        return ns ? ns.cache.size : 0;
    },
    get(key) {
        return cacheManager.get(this._namespace, key);
    },
    set(key, value) {
        // Add createdAt for compatibility
        if (value && !value.createdAt) {
            value.createdAt = Date.now();
        }
        return cacheManager.set(this._namespace, key, value);
    },
    has(key) {
        return cacheManager.has(this._namespace, key);
    },
    delete(key) {
        return cacheManager.delete(this._namespace, key);
    },
    clear() {
        cacheManager.clearNamespace(this._namespace);
    },
    entries() {
        const ns = cacheManager.getNamespace(this._namespace);
        return ns ? ns.cache.entries() : [].entries();
    },
    [Symbol.iterator]() {
        const ns = cacheManager.getNamespace(this._namespace);
        return ns ? ns.cache[Symbol.iterator]() : [][Symbol.iterator]();
    }
};

logger.info('Unified Cache Manager initialized', {
    totalBudgetMB: parseInt(process.env.CACHE_BUDGET_MB || '200'),
    namespaces: [...cacheManager.namespaces.keys()]
});

/**
 * Load commands recursively from subfolders
 * Supports grouped command structure: commands/music/, commands/queue/, etc.
 */
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'src', 'commands');
    let totalLoaded = 0;
    let totalExpected = 0;
    const failedModules = [];
    const skippedModules = [];

    /**
     * Recursively load commands from a directory
     * @param {string} dirPath - Directory path to scan
     * @param {string} category - Category name for logging
     */
    async function loadFromDirectory(dirPath, category = '') {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively load from subdirectory
                await loadFromDirectory(fullPath, entry.name);
            } else if (entry.name.endsWith('.js')) {
                // Skip context-menus.js as it's handled separately by interactionCreate event
                if (entry.name === 'context-menus.js') {
                    logger.debug('Skipped context-menus.js (handled by interactionCreate)');
                    continue;
                }

                totalExpected++;

                try {
                    const command = await import(pathToFileURL(fullPath).href);

                    if ('data' in command.default && 'execute' in command.default) {
                        const cmdName = command.default.data.name;

                        // Check for duplicate command names
                        if (client.commands.has(cmdName)) {
                            logger.warn(
                                `Duplicate command name "${cmdName}" in ${entry.name} — skipping (already registered)`
                            );
                            skippedModules.push(entry.name);
                            continue;
                        }

                        // Store command with category metadata
                        command.default.category = category || 'general';
                        client.commands.set(cmdName, command.default);
                        totalLoaded++;
                        logger.debug(`Loaded command: ${cmdName}${category ? ` [${category}]` : ''}`);
                    } else {
                        skippedModules.push(entry.name);
                        logger.warn(`Command ${entry.name} is missing required "data" or "execute" property`);
                    }
                } catch (error) {
                    failedModules.push(entry.name);
                    logger.error(`Failed to load command ${entry.name}`, error);
                }
            }
        }
    }

    logger.info('Loading commands from categorized structure...');
    await loadFromDirectory(commandsPath);

    // Summary warning if any modules failed or were skipped
    if (failedModules.length > 0 || skippedModules.length > 0) {
        logger.warn(
            `Command loading summary: ${totalLoaded}/${totalExpected} loaded, ${failedModules.length} failed, ${skippedModules.length} skipped`,
            {
                failedModules,
                skippedModules
            }
        );
    }

    logger.info(`Successfully loaded ${totalLoaded}/${totalExpected} commands (${client.commands.size} unique)`);
}

/**
 * Load events
 */
async function loadEvents() {
    const eventsPath = path.join(__dirname, 'src', 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    logger.info(`Loading ${eventFiles.length} event files...`);

    let loadedCount = 0;
    const failedEvents = [];
    const skippedEvents = [];

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);

        try {
            const event = await import(pathToFileURL(filePath).href);

            // Skip helper modules that don't export event structure
            if (!event.default || !event.default.name || !event.default.execute) {
                skippedEvents.push(file);
                logger.debug(`Skipped non-event file: ${file}`);
                continue;
            }

            if (event.default.once) {
                client.once(event.default.name, (...args) => event.default.execute(...args, client));
            } else {
                client.on(event.default.name, (...args) => event.default.execute(...args, client));
            }

            loadedCount++;
            const eventName = event.default.name;
            const eventKind = eventName === 'error' ? 'client-error-handler' : 'event';
            logger.debug(`Loaded ${eventKind}: ${eventName} from ${file}`);
        } catch (error) {
            failedEvents.push(file);
            logger.error(`Failed to load event ${file}`, error);
        }
    }

    // Summary warning if any events failed
    if (failedEvents.length > 0) {
        logger.warn(
            `Event loading summary: ${loadedCount}/${eventFiles.length} loaded, ${failedEvents.length} failed`,
            {
                failedEvents,
                skippedEvents
            }
        );
    }

    logger.info(`Successfully loaded ${loadedCount}/${eventFiles.length} events (${skippedEvents.length} skipped)`);
}

/**
 * Initialize Database
 */
async function initializeDatabase() {
    try {
        logger.info('Initializing database...');
        const configuredDbPath = process.env.DATABASE_PATH || './data/miyao.db';
        const db = getDatabaseManager(configuredDbPath);
        await db.initialize();
        client.database = db;
        logger.info('Database initialized successfully');

        // Initialize and start HistoryBatcher for batched history inserts
        logger.info('Starting HistoryBatcher...');
        const historyBatcher = getHistoryBatcher({
            maxQueueSize: DATABASE.HISTORY_BATCH_SIZE,
            flushIntervalMs: DATABASE.HISTORY_FLUSH_INTERVAL
        });
        historyBatcher.start();
        client.historyBatcher = historyBatcher;
        logger.info('HistoryBatcher started', {
            maxQueueSize: DATABASE.HISTORY_BATCH_SIZE,
            flushIntervalMs: DATABASE.HISTORY_FLUSH_INTERVAL
        });

        // Schedule periodic cleanup and store interval ID for shutdown cleanup
        // CRITICAL FIX: Store interval ID so it can be cleared on shutdown
        client.dbCleanupInterval = setInterval(() => {
            db.cleanupCache();
            db.cleanupHistory();
        }, TIME.DAY);
        client.dbCleanupInterval.unref();

        // Schedule periodic WAL checkpoint to prevent data loss
        // This ensures data is regularly flushed from WAL to main database
        // Important: Prevents data loss if bot crashes or is force-killed
        client.walCheckpointInterval = setInterval(() => {
            try {
                db.checkpoint();
            } catch (error) {
                logger.warn('Periodic WAL checkpoint failed', { error: error.message });
            }
        }, DATABASE.WAL_CHECKPOINT_INTERVAL);
        client.walCheckpointInterval.unref();

        logger.info('WAL checkpoint scheduler started', {
            intervalMs: DATABASE.WAL_CHECKPOINT_INTERVAL
        });

        return true;
    } catch (error) {
        logger.error('Failed to initialize database', error);
        throw error;
    }
}

/**
 * Initialize Music Manager
 */
function initializeMusicManager() {
    try {
        logger.info('Initializing Music Manager...');
        client.musicManager = new MusicManager(client, client.config);
        if (typeof client.musicManager.startBackgroundTasks === 'function') {
            client.musicManager.startBackgroundTasks();
        }
        logger.info('Music Manager initialized successfully');
        return true;
    } catch (error) {
        client.musicManager = null;
        logger.warn('Music Manager initialization failed; bot will continue without music features', {
            error: error.message
        });
        return false;
    }
}

/**
 * Handle errors
 */
process.on('unhandledRejection', error => {
    logger.error('Unhandled promise rejection', error instanceof Error ? error : new Error(String(error)));
});

process.on('uncaughtException', error => {
    const normalizedError = error instanceof Error ? error : new Error(String(error));

    if (error && typeof error === 'object' && !('code' in normalizedError) && 'code' in error) {
        normalizedError.code = error.code;
    }

    logger.error('Uncaught exception', normalizedError);

    // Check for recoverable network errors - don't exit for these
    const recoverablePatterns = ['handshake', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'socket hang up'];
    const isRecoverable = recoverablePatterns.some(
        pattern => normalizedError.message?.includes(pattern) || normalizedError.code === pattern
    );

    if (isRecoverable) {
        logger.warn('Recoverable network error detected, bot will continue running');
        return;
    }

    // Exit gracefully for unrecoverable errors
    process.exit(1);
});

/**
 * Graceful shutdown
 */
let _shuttingDown = false;

async function gracefulShutdown(signal) {
    if (_shuttingDown) {
        logger.warn(`Shutdown already in progress, ignoring ${signal}`);
        return;
    }

    _shuttingDown = true;
    let shutdownError = false;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Force exit after 15 seconds if graceful shutdown stalls
    setTimeout(() => {
        logger.error('Graceful shutdown timed out after 15s, forcing exit');
        process.exit(1);
    }, 15000).unref();

    try {
        // FIX-XC-C01: Use ShutdownRegistry for centralized resource disposal
        const registry = getShutdownRegistry();

        // Shutdown EventQueue first (drain pending events)
        const eventQueue = getEventQueue();
        if (eventQueue) {
            logger.info('Shutting down EventQueue...', eventQueue.getStats());
            await eventQueue.shutdown(5000);
            logger.info('EventQueue shutdown complete');
        }

        // Dispose all registered resources via ShutdownRegistry (LIFO order)
        if (registry.size > 0) {
            const registryResult = await registry.shutdownAll();
            if (registryResult.failed > 0) {
                shutdownError = true;
                logger.warn('[Shutdown] Some registry resources failed to dispose', registryResult.errors);
            }
        }

        // Shutdown Unified Cache Manager (handles all caches)
        if (client.cacheManager) {
            const cacheStats = client.cacheManager.getStats();
            logger.info('Cache Manager stats before shutdown', {
                totalMemoryMB: cacheStats.totalMemoryMB,
                totalEntries: cacheStats.totalEntries,
                hitRate: cacheStats.totalHitRate
            });
            client.cacheManager.shutdown();
            logger.info('Cache Manager shutdown complete');
        }

        // Clean up history replay cache (if using legacy cache)
        if (client._historyCache && client._historyCache instanceof Map) {
            const historyCacheSize = client._historyCache.size;
            client._historyCache.clear();
            logger.info(`Cleared ${historyCacheSize} legacy history cache entries`);
        }

        // Stop health check manager
        if (client.healthCheck) {
            client.healthCheck.stop();
            logger.info('Health check manager stopped');
        }

        // Stop memory monitoring
        try {
            memoryMonitor.stopMonitoring();
        } catch (e) {
            logger.warn('memoryMonitor stop failed', { error: e?.message });
        }
        logger.info('Memory monitoring stopped');

        // Stop resource leak monitoring
        try {
            resourceLeakMonitor.stopMonitoring();
            resourceLeakMonitor.cleanupAll();
        } catch (e) {
            logger.warn('resourceLeakMonitor stop failed', { error: e?.message });
        }
        logger.info('Resource leak monitoring stopped');

        // Stop idle cleanup
        try {
            idleCleanup.stopMonitoring();
        } catch (e) {
            logger.warn('idleCleanup stop failed', { error: e?.message });
        }
        logger.info('Idle cleanup stopped');

        // Flush and shutdown HistoryBatcher BEFORE closing database
        if (client.historyBatcher) {
            logger.info('Shutting down HistoryBatcher...');
            const batcherResult = await client.historyBatcher.shutdown();
            logger.info('HistoryBatcher shutdown complete', batcherResult);
        }

        // CRITICAL FIX: Clear database cleanup interval
        if (client.dbCleanupInterval) {
            clearInterval(client.dbCleanupInterval);
            logger.info('Database cleanup interval cleared');
        }

        // CRITICAL FIX: Clear WAL checkpoint interval
        if (client.walCheckpointInterval) {
            clearInterval(client.walCheckpointInterval);
            logger.info('WAL checkpoint interval cleared');
        }

        // Clear auto-play maintenance interval
        if (client.autoPlayMaintenanceInterval) {
            clearInterval(client.autoPlayMaintenanceInterval);
            logger.info('AutoPlay maintenance interval cleared');
        }

        // Clear cache warming timeout
        if (client.cacheWarmingTimeout) {
            clearTimeout(client.cacheWarmingTimeout);
            client.cacheWarmingTimeout = null;
            logger.info('Cache warming timeout cleared');
        }

        // Shutdown auto-play suggestion handler (clear timers and Maps)
        try {
            const { shutdownAutoPlayHandler } = await import('./src/events/autoPlaySuggestionHandler.js');
            shutdownAutoPlayHandler();
            logger.info('Auto-play suggestion handler shutdown complete');
        } catch (e) {
            logger.debug('Auto-play handler shutdown failed (non-critical)', { error: e?.message });
        }

        // CRITICAL FIX: Clear metrics logging interval
        if (client.metricsInterval) {
            clearInterval(client.metricsInterval);
            logger.info('Metrics logging interval cleared');
        }

        // Clear MusicHandlers history cache cleanup timer
        clearHistoryCacheCleanup(client);
        logger.info('MusicHandlers history cache cleanup cleared');

        // Clear all voice channel disconnect timers
        clearAllVoiceTimers();
        logger.info('Voice channel timers cleared');

        // FIX-LB11: Cancel any in-flight lyrics API requests
        cancelPendingLyricsRequests();
        logger.info('Pending lyrics requests cancelled');

        // Shutdown MusicManager BEFORE closing database
        if (client.musicManager) {
            if (typeof client.musicManager.shutdown === 'function') {
                await client.musicManager.shutdown();
            } else {
                // Fallback for basic manager
                for (const [guildId] of client.musicManager.queues) {
                    try {
                        await client.musicManager.destroyQueue(guildId);
                    } catch (e) {
                        logger.warn(`Failed to destroy queue for ${guildId}`, { error: e?.message });
                    }
                }
            }
        }

        // Close database connection AFTER music subsystem is fully stopped
        // The close() method includes WAL checkpoint for data integrity
        if (client.database) {
            client.database.close();
            logger.info('Database connection closed');
        }

        // Close metrics HTTP server
        if (client._metricsServer) {
            await new Promise(resolve => {
                client._metricsServer.close(() => {
                    logger.info('Metrics API server closed');
                    resolve();
                });
                // Force resolve after 3s if server doesn't close
                setTimeout(resolve, 3000).unref();
            });
        }

        // Destroy client
        client.destroy();

        logger.info('Shutdown complete');
    } catch (error) {
        shutdownError = true;
        logger.error('Error during shutdown', error);
    } finally {
        // FIX-IDX-H02: Exit code reflects actual shutdown result
        process.exit(shutdownError ? 1 : 0);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

/**
 * Start the bot
 */
async function start() {
    try {
        logger.info('Starting Miyao Music Bot...');
        logger.info(`Version: ${VERSION.fullDisplay}`);
        logger.info(`Node.js version: ${process.version}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

        // Initialize Database first
        await initializeDatabase();

        // Schedule auto-play preference maintenance (daily)
        try {
            const { getAutoPlayPreferenceService } = await import('./src/services/AutoPlayPreferenceService.js');
            client.autoPlayMaintenanceInterval = setInterval(
                () => {
                    try {
                        const result = getAutoPlayPreferenceService().runMaintenance();
                        logger.info('AutoPlay maintenance completed', result);
                    } catch (err) {
                        logger.error('AutoPlay maintenance failed:', err.message);
                    }
                },
                24 * 60 * 60 * 1000
            ); // Daily
            client.autoPlayMaintenanceInterval.unref();
            logger.info('AutoPlay maintenance scheduler started (interval: 24h)');
        } catch (err) {
            logger.warn('Failed to start AutoPlay maintenance scheduler', { error: err.message });
        }

        // Load commands and events
        await loadCommands();
        await loadEvents();

        // FIX-PB01: Register before login so handler always fires
        // Discord requires sharding when a bot is in 2500+ guilds
        // FIX-IDX-C01: discord.js v14 Client event is 'clientReady' (Events.ClientReady)
        client.once('clientReady', () => {
            const guildCount = client.guilds.cache.size;
            if (guildCount > 2500) {
                logger.error(
                    `⚠️ CRITICAL: Bot is in ${guildCount} guilds (>2500). Discord REQUIRES sharding at this scale. The bot may be disconnected!`,
                    {
                        guildCount,
                        recommendation: 'Implement Discord.js ShardingManager before reaching this limit'
                    }
                );
            } else if (guildCount > 2000) {
                logger.warn(
                    `⚠️ WARNING: Bot is in ${guildCount} guilds. Approaching 2500 guild sharding limit. Plan sharding implementation.`,
                    {
                        guildCount,
                        threshold: 2500,
                        remaining: 2500 - guildCount
                    }
                );
            } else {
                logger.info(`Bot serving ${guildCount} guilds (sharding threshold: 2500)`);
            }
        });

        // Initialize Music Manager
        const musicInitialized = initializeMusicManager();
        if (!musicInitialized) {
            logger.warn('Music subsystem is disabled for this runtime. Check Lavalink and configuration to re-enable.');
        } else if (!client.musicManager.hasAvailableNode()) {
            logger.warn(
                'Lavalink is not connected at startup. Bot is online, but music commands may be temporarily unavailable.',
                {
                    nodeHost: client.config.lavalink?.nodes?.[0]?.host,
                    nodePort: client.config.lavalink?.nodes?.[0]?.port
                }
            );
        }

        // Login to Discord
        logger.info('Logging in to Discord...');
        await client.login(process.env.DISCORD_TOKEN);

        // Warm cache after successful login (background task, don't await)
        // This preloads popular tracks to improve first-play experience
        // IMPORTANT: Wait for Lavalink node to be ready before warming cache
        client.cacheWarmingTimeout = setTimeout(async () => {
            try {
                if (!client.musicManager) {
                    logger.warn('Cache warming skipped: Music Manager is unavailable in current runtime');
                    return;
                }

                logger.info('Starting background cache warming...');

                // Wait for Lavalink node to be ready (max 30 seconds)
                const nodeReady = await client.musicManager.waitForNode(30000);

                if (!nodeReady) {
                    logger.warn('Cache warming skipped: Lavalink node not ready after 30s timeout');
                    return;
                }

                const result = await client.musicManager.warmCache(50);
                logger.info('Cache warming completed', result);
            } catch (error) {
                logger.warn('Cache warming failed (non-critical)', { error: error.message });
            }
        }, 10000); // Wait 10 seconds after login to ensure bot is fully ready
        client.cacheWarmingTimeout.unref();

        // Start metrics API server
        startMetricsServer(client);

        // Initialize health check manager
        logger.info('Starting health check manager...');
        client.healthCheck = createHealthCheckManager(client);
        client.healthCheck.start();
        logger.info('Health check manager started');

        // Start memory monitoring
        logger.info('Starting memory monitoring...');
        memoryMonitor.startMonitoring(60000, data => {
            if (data.threshold.level === 'critical' || data.leak.hasLeak) {
                logger.error('Memory issue detected', {
                    threshold: data.threshold,
                    leak: data.leak,
                    usage: memoryMonitor.getFormatted()
                });
            }
        });

        // Start resource leak monitoring
        logger.info('Starting resource leak monitoring...');
        resourceLeakMonitor.startMonitoring(60000);
        resourceLeakMonitor.on('leak', data => {
            logger.warn(`Resource leak detected: ${data.type}`, {
                count: data.leaks.length,
                details: data.leaks.slice(0, 3) // Log first 3
            });
        });

        // Setup idle cleanup
        idleCleanup.registerCleanup('search-cache', async () => {
            if (client.musicManager && client.musicManager.searchCache) {
                const before = client.musicManager.searchCache.size();
                client.musicManager.searchCache.clear();
                logger.debug(`Cleared search cache: ${before} entries`);
            }
        });

        idleCleanup.startMonitoring(60000);

        // Log metrics summary every hour and store interval ID for shutdown cleanup
        // CRITICAL FIX: Store interval ID so it can be cleared on shutdown
        client.metricsInterval = setInterval(() => {
            metricsTracker.logSummary();
        }, TIME.METRICS_LOG_INTERVAL);
        client.metricsInterval.unref();

        // FIX-IDX-H03: Signal PM2 that the bot is fully initialized
        // ecosystem.config.cjs has wait_ready: true, so PM2 waits for this signal
        if (typeof process.send === 'function') {
            process.send('ready');
            logger.info('Sent PM2 ready signal');
        }
    } catch (error) {
        logger.error('Failed to start bot', error);
        metricsTracker.trackError(error, 'startup');
        process.exit(1);
    }
}

// Start the bot
start();
