import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { degradationManager, createLavalinkDegradation, createDatabaseDegradation } from './src/utils/graceful-degradation.js';

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
                    logger.debug(`Skipped context-menus.js (handled by interactionCreate)`);
                    continue;
                }
                
                try {
                    const command = await import(`file://${fullPath}`);
                    
                    if ('data' in command.default && 'execute' in command.default) {
                        // Store command with category metadata
                        command.default.category = category || 'general';
                        client.commands.set(command.default.data.name, command.default);
                        totalLoaded++;
                        logger.debug(`Loaded command: ${command.default.data.name}${category ? ` [${category}]` : ''}`);
                    } else {
                        logger.warn(`Command ${entry.name} is missing required "data" or "execute" property`);
                    }
                } catch (error) {
                    logger.error(`Failed to load command ${entry.name}`, error);
                }
            }
        }
    }
    
    logger.info('Loading commands from categorized structure...');
    await loadFromDirectory(commandsPath);
    
    logger.info(`Successfully loaded ${totalLoaded} commands from ${client.commands.size} unique commands`);
}

/**
 * Load events
 */
async function loadEvents() {
    const eventsPath = path.join(__dirname, 'src', 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    
    logger.info(`Loading ${eventFiles.length} events...`);
    
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = await import(`file://${filePath}`);
        
        // Skip helper modules that don't export event structure
        if (!event.default || !event.default.name || !event.default.execute) {
            logger.debug(`Skipped non-event file: ${file}`);
            continue;
        }
        
        if (event.default.once) {
            client.once(event.default.name, (...args) => event.default.execute(...args, client));
        } else {
            client.on(event.default.name, (...args) => event.default.execute(...args, client));
        }
        
        logger.debug(`Loaded event: ${event.default.name}`);
    }
    
    logger.info(`Successfully loaded ${eventFiles.length} events`);
}

/**
 * Initialize Database
 */
async function initializeDatabase() {
    try {
        logger.info('Initializing database...');
        const db = getDatabaseManager();
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
        
        // Schedule periodic cleanup
        setInterval(() => {
            db.cleanupCache();
            db.cleanupHistory();
        }, TIME.DAY);
        
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
    logger.info('Initializing Music Manager...');
    client.musicManager = new MusicManager(client, client.config);
    logger.info('Music Manager initialized successfully');
}

/**
 * Handle errors
 */
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection', error);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    
    try {
        // Shutdown EventQueue first (drain pending events)
        const eventQueue = getEventQueue();
        if (eventQueue) {
            logger.info('Shutting down EventQueue...', eventQueue.getStats());
            await eventQueue.shutdown(5000);
            logger.info('EventQueue shutdown complete');
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
        memoryMonitor.stopMonitoring();
        logger.info('Memory monitoring stopped');
        
        // Stop resource leak monitoring
        resourceLeakMonitor.stopMonitoring();
        resourceLeakMonitor.cleanupAll();
        logger.info('Resource leak monitoring stopped');
        
        // Stop idle cleanup
        idleCleanup.stopMonitoring();
        logger.info('Idle cleanup stopped');
        
        // Flush and shutdown HistoryBatcher BEFORE closing database
        if (client.historyBatcher) {
            logger.info('Shutting down HistoryBatcher...');
            const batcherResult = await client.historyBatcher.shutdown();
            logger.info('HistoryBatcher shutdown complete', batcherResult);
        }
        
        // Close database connection AFTER flushing history
        if (client.database) {
            client.database.close();
            logger.info('Database connection closed');
        }
        
        // Use enhanced shutdown method if available
        if (client.musicManager) {
            if (typeof client.musicManager.shutdown === 'function') {
                await client.musicManager.shutdown();
            } else {
                // Fallback for basic manager
                for (const [guildId] of client.musicManager.queues) {
                    client.musicManager.destroyQueue(guildId);
                }
            }
        }
        
        // Destroy client
        client.destroy();
        
        logger.info('Shutdown complete');
    } catch (error) {
        logger.error('Error during shutdown', error);
    } finally {
        process.exit(0);
    }
});

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
        
        // Load commands and events
        await loadCommands();
        await loadEvents();
        
        // Initialize Music Manager
        initializeMusicManager();
        
        // Login to Discord
        logger.info('Logging in to Discord...');
        await client.login(process.env.DISCORD_TOKEN);
        
        // Warm cache after successful login (background task, don't await)
        // This preloads popular tracks to improve first-play experience
        setTimeout(async () => {
            try {
                logger.info('Starting background cache warming...');
                const result = await client.musicManager.warmCache(50);
                logger.info('Cache warming completed', result);
            } catch (error) {
                logger.warn('Cache warming failed (non-critical)', { error: error.message });
            }
        }, 10000); // Wait 10 seconds after login to ensure bot is fully ready
        
        // Start metrics API server
        startMetricsServer(client);
        
        // Initialize health check manager
        logger.info('Starting health check manager...');
        client.healthCheck = createHealthCheckManager(client);
        client.healthCheck.start();
        logger.info('Health check manager started');
        
        // Start memory monitoring
        logger.info('Starting memory monitoring...');
        memoryMonitor.startMonitoring(60000, (data) => {
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
        resourceLeakMonitor.on('leak', (data) => {
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
        
        idleCleanup.registerCleanup('guild-queues', async () => {
            if (client.musicManager) {
                let cleaned = 0;
                for (const [guildId, queue] of client.musicManager.queues.entries()) {
                    // Fixed: Check if queue has current track (actively playing) OR has tracks in queue
                    // Only destroy if BOTH are empty/null AND player is not playing
                    const hasCurrentTrack = queue.current !== null && queue.current !== undefined;
                    const hasQueuedTracks = queue.tracks && queue.tracks.length > 0;
                    const isPlayerPlaying = queue.player && queue.player.track;
                    
                    // Only clean up if: no current track, no queued tracks, and player is not playing
                    if (!hasCurrentTrack && !hasQueuedTracks && !isPlayerPlaying) {
                        client.musicManager.destroyQueue(guildId);
                        cleaned++;
                    }
                }
                if (cleaned > 0) {
                    logger.debug(`Cleaned ${cleaned} idle queues`);
                }
            }
        });
        
        idleCleanup.startMonitoring(60000);
        
        // Setup graceful degradation for services
        const lavalinkDegradation = createLavalinkDegradation(client.musicManager);
        const databaseDegradation = createDatabaseDegradation(client.database);
        
        lavalinkDegradation.on('statusChange', (data) => {
            logger.info('Lavalink service status changed', data);
        });
        
        databaseDegradation.on('statusChange', (data) => {
            logger.info('Database service status changed', data);
        });
        
        // Attach to client for access
        client.degradation = {
            lavalink: lavalinkDegradation,
            database: databaseDegradation
        };
        
        // Log metrics summary every hour
        setInterval(() => {
            metricsTracker.logSummary();
        }, TIME.METRICS_LOG_INTERVAL);
        
    } catch (error) {
        logger.error('Failed to start bot', error);
        metricsTracker.trackError(error, 'startup');
        process.exit(1);
    }
}

// Start the bot
start();
