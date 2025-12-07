/**
 * @file MusicManager.js
 * @description Advanced Music Manager with Performance & Reliability Enhancements
 * @version 1.8.0 - Refactored from MusicManagerEnhanced.js
 *
 * Features:
 * - Connection pooling & node load balancing
 * - Advanced error recovery with circuit breaker
 * - Memory optimization & automatic cleanup
 * - Full Lavalink filter support
 * - Health monitoring & metrics
 */

import { Shoukaku, Connectors } from 'shoukaku';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import { TIME, MEMORY } from '../utils/constants.js';
import CircuitBreaker from '../utils/CircuitBreaker.js';
import { SearchCache } from './SearchCache.js';
import { NodeHealthMonitor } from './NodeHealthMonitor.js';
import { EnhancedQueue } from './EnhancedQueue.js';

/**
 * Enhanced Music Manager with advanced features
 * @extends EventEmitter
 */
export class MusicManager extends EventEmitter {
    /**
     * Create a new MusicManager
     * @param {Client} client - Discord.js client
     * @param {Object} config - Bot configuration
     */
    constructor(client, config) {
        super();
        this.client = client;
        this.config = config;
        this.queues = new Map();

        // Performance enhancements
        this.searchCache = new SearchCache(100, 300000);
        this.nodeMonitor = new NodeHealthMonitor();

        // Circuit breaker for Lavalink calls (prevent cascading failures)
        this.circuitBreaker = new CircuitBreaker({
            name: 'Lavalink',
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 60000, // 60s before retry
            resetTimeout: 30000,
            onStateChange: (oldState, newState, stats) => {
                this.emit('circuitBreakerStateChange', { oldState, newState, stats });
            }
        });

        // In-flight request deduplication (prevents duplicate concurrent searches)
        // Each entry: { promise, timestamp }
        this.pendingSearches = new Map();

        // Pending search TTL configuration
        this.PENDING_SEARCH_TTL = 30 * TIME.SECOND; // 30 seconds TTL
        this.PENDING_SEARCH_CLEANUP_INTERVAL = 10 * TIME.SECOND; // Cleanup every 10 seconds

        // Metrics
        this.metrics = {
            totalSearches: 0,
            cacheHits: 0,
            cacheMisses: 0,
            totalTracks: 0,
            errors: 0,
            dedupHits: 0 // Track how many duplicate requests were prevented
        };

        // Initialize Shoukaku with enhanced options
        // Note: Shoukaku expects reconnectInterval in SECONDS, not milliseconds
        // If config.lavalink.reconnectDelay > 1000, assume it's milliseconds and convert
        const reconnectDelayRaw = config.lavalink.reconnectDelay || 5000;
        const reconnectIntervalSeconds =
            reconnectDelayRaw > 1000 ? Math.round(reconnectDelayRaw / 1000) : reconnectDelayRaw;

        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), config.lavalink.nodes, {
            moveOnDisconnect: true,
            resume: true,
            resumeTimeout: config.lavalink.resumeTimeout || 60,
            resumeByLibrary: true, // Important for better recovery
            reconnectTries: config.lavalink.reconnectTries || 10,
            reconnectInterval: reconnectIntervalSeconds, // In seconds!
            restTimeout: 60,
            voiceConnectionTimeout: 15,
            userAgent: `Miyao-Bot/${config.bot.version} (Discord Music Bot)`,
            // Custom node resolver for load balancing
            nodeResolver: nodes => {
                return (
                    this.nodeMonitor.getBestNode(this.shoukaku) || [...nodes.values()].find(node => node.state === 2)
                );
            }
        });

        this._setupEventListeners();
        this._startHealthMonitor();
        this._startMemoryMonitor();
        this._startPendingSearchCleanup();

        logger.info('MusicManager initialized with advanced features');
    }

    /**
     * Setup comprehensive event listeners
     * @private
     */
    _setupEventListeners() {
        this.shoukaku.on('ready', name => {
            logger.info(`✅ Lavalink node "${name}" is ready`);
            this.emit('nodeReady', name);
        });

        this.shoukaku.on('error', (name, error) => {
            logger.error(`❌ Lavalink node "${name}" error`, { error });
            this.metrics.errors++;
            this.emit('nodeError', { name, error });
        });

        this.shoukaku.on('close', (name, code, reason) => {
            logger.warn(`⚠️ Lavalink node "${name}" closed`, { code, reason });
            this.emit('nodeClose', { name, code, reason });
        });

        this.shoukaku.on('disconnect', (name, moved, count) => {
            logger.warn(`🔌 Lavalink node "${name}" disconnected`, { moved, playerCount: count });

            // Enhanced cleanup with retry
            this._handleNodeDisconnect(name, moved);
        });

        this.shoukaku.on('reconnecting', (name, tries, remaining) => {
            logger.info(`🔄 Reconnecting to "${name}" - Try ${tries}/${tries + remaining}`);
        });

        this.shoukaku.on('debug', (name, info) => {
            if (process.env.NODE_ENV !== 'production') {
                logger.debug(`🐛 Lavalink node "${name}": ${info}`);
            }
        });
    }

    /**
     * Handle node disconnection with smart recovery
     * @private
     */
    async _handleNodeDisconnect(nodeName, moved) {
        for (const [guildId, queue] of this.queues.entries()) {
            if (!queue.player?.node?.name || queue.player.node.name === nodeName) {
                if (moved) {
                    // Node was moved, try to reconnect
                    logger.info(`Attempting to recover queue for guild ${guildId}`);
                    try {
                        await queue.reconnect();
                    } catch (error) {
                        logger.error(`Failed to recover queue for guild ${guildId}`, error);
                        this.destroyQueue(guildId);
                    }
                } else {
                    // Node permanently down, clean up
                    this.destroyQueue(guildId);
                }
            }
        }
    }

    /**
     * Start node health monitoring
     * @private
     */
    _startHealthMonitor() {
        this.nodeMonitor.start(this.shoukaku, 30000);

        this.nodeMonitor.on('unhealthy', stats => {
            logger.warn(`Node ${stats.name} is unhealthy, redistributing load...`);
            // Could trigger player migration here
        });
    }

    /**
     * Start memory monitoring and cleanup with gradient levels
     * @private
     */
    _startMemoryMonitor() {
        // CRITICAL FIX: Store interval ID for cleanup on shutdown
        this.memoryMonitorInterval = setInterval(() => {
            const memUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

            logger.debug(
                `Memory: ${heapUsedMB}MB / ${heapTotalMB}MB | Queues: ${this.queues.size} | Cache: ${this.searchCache.size()}`
            );

            // Determine cleanup level based on memory usage
            const cleanupLevel = this._determineCleanupLevel(heapUsedMB);

            if (cleanupLevel !== 'none') {
                this._performGradientCleanup(cleanupLevel, heapUsedMB);
            }
        }, TIME.CACHE_CLEANUP_INTERVAL);
    }

    /**
     * Start pending search cleanup interval to prevent memory leaks
     * Cleans up stale pending searches that have exceeded TTL
     * @private
     */
    _startPendingSearchCleanup() {
        this.pendingSearchCleanupInterval = setInterval(() => {
            this._cleanupStalePendingSearches();
        }, this.PENDING_SEARCH_CLEANUP_INTERVAL);

        logger.debug('Pending search cleanup interval started');
    }

    /**
     * Cleanup stale pending searches that have exceeded TTL
     * This prevents memory leaks when search promises hang indefinitely
     * @private
     */
    _cleanupStalePendingSearches() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [cacheKey, entry] of this.pendingSearches.entries()) {
            // Check if entry has exceeded TTL
            if (now - entry.timestamp > this.PENDING_SEARCH_TTL) {
                this.pendingSearches.delete(cacheKey);
                cleanedCount++;
                logger.warn(
                    `Cleaned up stale pending search: ${cacheKey} (age: ${Math.round((now - entry.timestamp) / 1000)}s)`
                );
            }
        }

        if (cleanedCount > 0) {
            logger.info(`Cleaned ${cleanedCount} stale pending search(es). Remaining: ${this.pendingSearches.size}`);
        }
    }

    /**
     * Determine which cleanup level based on current memory usage
     * @param {number} heapUsedMB - Current heap usage in MB
     * @returns {'none'|'soft'|'normal'|'critical'} Cleanup level
     * @private
     */
    _determineCleanupLevel(heapUsedMB) {
        if (heapUsedMB >= MEMORY.CRITICAL_CLEANUP_MB) {
            return 'critical';
        } else if (heapUsedMB >= MEMORY.NORMAL_CLEANUP_MB) {
            return 'normal';
        } else if (heapUsedMB >= MEMORY.SOFT_CLEANUP_MB) {
            return 'soft';
        }
        return 'none';
    }

    /**
     * Perform gradient cleanup based on memory pressure level
     * @param {'soft'|'normal'|'critical'} level - Cleanup level
     * @param {number} heapUsedMB - Current heap usage for logging
     * @private
     */
    _performGradientCleanup(level, heapUsedMB) {
        const startTime = Date.now();
        let evictedCount = 0;
        let cleanedQueues = 0;

        // Emit memory pressure event for other components to respond
        this.emit('memoryPressure', { level, heapUsedMB });

        logger.warn(`Memory pressure detected: ${level.toUpperCase()} (${heapUsedMB}MB) - Starting cleanup...`);

        // Determine eviction percentage
        const evictPercent = {
            soft: MEMORY.SOFT_EVICT_PERCENT,
            normal: MEMORY.NORMAL_EVICT_PERCENT,
            critical: MEMORY.CRITICAL_EVICT_PERCENT
        }[level];

        // Evict cache entries based on level
        const cacheSize = this.searchCache.size();
        const toEvict = Math.ceil((cacheSize * evictPercent) / 100);

        for (let i = 0; i < toEvict; i++) {
            if (this.searchCache.evictLRU()) {
                evictedCount++;
            }
        }

        // For normal and critical: clean up idle queues
        if (level === 'normal' || level === 'critical') {
            for (const [guildId, queue] of this.queues.entries()) {
                if (!queue.current && queue.tracks.length === 0) {
                    this.destroyQueue(guildId);
                    cleanedQueues++;
                }
            }
        }

        // For critical: force garbage collection if available
        if (level === 'critical' && global.gc) {
            global.gc();
            logger.info('Forced garbage collection completed');
        }

        const duration = Date.now() - startTime;
        logger.info(
            `Cleanup completed (${level}): evicted ${evictedCount} cache entries, removed ${cleanedQueues} idle queues in ${duration}ms`
        );

        // Emit cleanup completed event
        this.emit('cleanupCompleted', { level, evictedCount, cleanedQueues, duration });
    }

    /**
     * Perform aggressive cleanup (legacy method)
     * @deprecated Use _performGradientCleanup('critical') instead
     */
    performCleanup() {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        this._performGradientCleanup('critical', heapUsedMB);
    }

    /**
     * Get queue for a guild
     * @param {string} guildId - Guild ID
     * @returns {EnhancedQueue|undefined}
     */
    getQueue(guildId) {
        return this.queues.get(guildId);
    }

    /**
     * Create queue with memory limit
     * @param {string} guildId - Guild ID
     * @param {string} voiceChannelId - Voice channel ID
     * @param {TextChannel} textChannel - Text channel for notifications
     * @returns {Promise<EnhancedQueue>}
     */
    async createQueue(guildId, voiceChannelId, textChannel) {
        // Limit total queues for memory
        if (this.queues.size >= 500) {
            throw new Error('Maximum queue limit reached');
        }

        const queue = new EnhancedQueue(this, guildId, voiceChannelId, textChannel);

        // Apply guild settings for duplicate handling
        try {
            const { default: GuildSettings } = await import('../database/models/GuildSettings.js');
            const guildSettings = GuildSettings.get(guildId);

            // If guild doesn't allow duplicates, enable removeDuplicates
            if (guildSettings && !guildSettings.allowDuplicates) {
                queue.setRemoveDuplicates(true);
                logger.debug('Applied guild setting: removeDuplicates enabled', { guildId });
            }

            // Apply default volume from guild settings if set
            if (guildSettings?.defaultVolume && guildSettings.defaultVolume !== 50) {
                queue.volume = guildSettings.defaultVolume;
                logger.debug('Applied guild setting: default volume', { guildId, volume: guildSettings.defaultVolume });
            }
        } catch (error) {
            logger.debug('Could not apply guild settings to queue', { guildId, error: error.message });
        }

        this.queues.set(guildId, queue);
        logger.music('Queue created', { guildId, totalQueues: this.queues.size });
        return queue;
    }

    /**
     * Destroy queue with cleanup
     * @param {string} guildId - Guild ID
     */
    destroyQueue(guildId) {
        const queue = this.queues.get(guildId);
        if (queue) {
            queue.destroy();
            this.queues.delete(guildId);
            logger.music('Queue destroyed', { guildId, remainingQueues: this.queues.size });
        }
    }

    /**
     * Enhanced search with caching, deduplication, and retry
     * @param {string} query - Search query
     * @param {User} requester - User who requested
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async search(query, requester, options = {}) {
        this.metrics.totalSearches++;

        // Check cache first
        const cacheKey = `${query}:${options.source || 'youtube'}`;
        const cached = this.searchCache.get(cacheKey);
        if (cached && !options.bypassCache) {
            this.metrics.cacheHits++;
            logger.debug(`Cache hit for query: ${query}`);
            return {
                ...cached,
                tracks: cached.tracks.map(t => ({ ...t, requester }))
            };
        }

        this.metrics.cacheMisses++;

        // Check if same query is already in-flight (deduplication)
        const pendingEntry = this.pendingSearches.get(cacheKey);
        if (pendingEntry) {
            this.metrics.dedupHits++;
            logger.debug(`Dedup hit: Waiting for existing search: ${query}`);

            try {
                // Wait for existing search to complete
                const result = await pendingEntry.promise;
                return {
                    ...result,
                    tracks: result.tracks.map(t => ({ ...t, requester }))
                };
            } catch (error) {
                // If pending search failed, fall through to create new search
                logger.warn('Pending search failed, retrying', { query, error: error.message });
            }
        }

        // Create a new search promise and store it for deduplication with timestamp
        const searchPromise = this._executeSearch(query, requester, options, cacheKey);
        this.pendingSearches.set(cacheKey, {
            promise: searchPromise,
            timestamp: Date.now()
        });

        try {
            const result = await searchPromise;
            return result;
        } finally {
            // Clean up pending search after completion (whether success or failure)
            this.pendingSearches.delete(cacheKey);
        }
    }

    /**
     * Execute actual search with circuit breaker
     * @private
     */
    async _executeSearch(query, requester, options, cacheKey) {
        // Use circuit breaker for resilience
        try {
            const result = await this.circuitBreaker.execute(async () => {
                const node = this.nodeMonitor.getBestNode(this.shoukaku);

                if (!node) {
                    throw new Error('No available nodes');
                }

                // Enhanced search query
                const isUrl = /^https?:\/\//.test(query);
                let searchQuery;

                if (isUrl) {
                    searchQuery = query;
                } else {
                    const source = options.source || 'ytsearch';
                    searchQuery = `${source}:${query}`;
                }

                logger.debug(`Searching: ${searchQuery} on node ${node.name}`);

                // Search with timeout
                const result = await Promise.race([
                    node.rest.resolve(searchQuery),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timeout')), 10 * TIME.SECOND))
                ]);

                if (!result || !result.data) {
                    return { tracks: [], loadType: 'empty' };
                }

                // Parse response
                let tracks = [];

                if (result.loadType === 'search' || result.loadType === 'track') {
                    tracks = Array.isArray(result.data) ? result.data : [result.data];
                } else if (result.loadType === 'playlist') {
                    tracks = result.data.tracks || [];
                }

                this.metrics.totalTracks += tracks.length;

                const searchResult = {
                    loadType: result.loadType,
                    tracks: tracks.map(track => ({ ...track, requester })),
                    playlistInfo: result.data.info || null
                };

                // Cache successful searches
                if (tracks.length > 0 && !isUrl) {
                    this.searchCache.set(cacheKey, {
                        loadType: result.loadType,
                        tracks: tracks,
                        playlistInfo: result.data.info || null
                    });
                }

                return searchResult;
            });

            return result;
        } catch (error) {
            logger.error('Search error', error);
            this.metrics.errors++;
            throw error;
        }
    }

    /**
     * Check if any Lavalink node is available and connected
     * @returns {boolean} True if at least one node is connected
     */
    hasAvailableNode() {
        if (!this.shoukaku || !this.shoukaku.nodes) {
            return false;
        }

        // State 2 = CONNECTED in Shoukaku v4
        for (const [, node] of this.shoukaku.nodes) {
            if (node.state === 2) {
                return true;
            }
        }
        return false;
    }

    /**
     * Wait for at least one Lavalink node to be ready
     * @param {number} timeoutMs - Maximum time to wait in milliseconds
     * @returns {Promise<boolean>} True if node is ready, false if timeout
     */
    async waitForNode(timeoutMs = 30000) {
        // If already connected, return immediately
        if (this.hasAvailableNode()) {
            return true;
        }

        return new Promise(resolve => {
            const startTime = Date.now();
            const checkInterval = 500; // Check every 500ms

            const intervalId = setInterval(() => {
                // Check if node is now available
                if (this.hasAvailableNode()) {
                    clearInterval(intervalId);
                    const elapsed = Date.now() - startTime;
                    logger.info(`Lavalink node ready after ${elapsed}ms`);
                    resolve(true);
                    return;
                }

                // Check for timeout
                if (Date.now() - startTime >= timeoutMs) {
                    clearInterval(intervalId);
                    logger.warn(`Timeout waiting for Lavalink node (${timeoutMs}ms)`);
                    resolve(false);
                }
            }, checkInterval);

            // Also listen for the 'ready' event from Shoukaku for faster response
            const onReady = () => {
                if (this.hasAvailableNode()) {
                    clearInterval(intervalId);
                    this.shoukaku.off('ready', onReady);
                    const elapsed = Date.now() - startTime;
                    logger.info(`Lavalink node ready (via event) after ${elapsed}ms`);
                    resolve(true);
                }
            };

            this.shoukaku.on('ready', onReady);

            // Cleanup listener on timeout
            setTimeout(() => {
                this.shoukaku.off('ready', onReady);
            }, timeoutMs + 1000);
        });
    }

    /**
     * Warm cache with popular tracks
     * @param {number} topN - Number of top tracks to preload
     * @returns {Promise<Object>} Warming results
     */
    async warmCache(topN = 50) {
        try {
            logger.info(`Starting cache warming for top ${topN} tracks...`);

            // CRITICAL: Check if any Lavalink node is available before starting
            if (!this.hasAvailableNode()) {
                logger.warn('Cache warming skipped: No Lavalink nodes available');
                return { warmed: 0, failed: 0, skipped: 0, reason: 'no_nodes_available' };
            }

            // Check if circuit breaker is OPEN - skip warming if Lavalink is known to be failing
            if (this.circuitBreaker.state === 'OPEN') {
                logger.warn('Cache warming skipped: Circuit breaker is OPEN');
                return { warmed: 0, failed: 0, skipped: 0, reason: 'circuit_breaker_open' };
            }

            // Get popular tracks for warming
            const popularTracks = await this._getPopularTracksForWarming(topN);

            if (popularTracks.length === 0) {
                logger.info('No tracks in history to warm cache');
                return { warmed: 0, failed: 0, skipped: 0 };
            }

            let warmed = 0;
            let failed = 0;
            let skipped = 0;

            // Warm cache in small batches to avoid overloading
            const BATCH_SIZE = 5;
            const MAX_CONSECUTIVE_FAILURES = 3; // Stop early if too many failures
            let consecutiveFailures = 0;

            for (let i = 0; i < popularTracks.length; i += BATCH_SIZE) {
                // Re-check node availability and circuit breaker before each batch
                if (!this.hasAvailableNode()) {
                    logger.warn('Cache warming stopped: Lavalink nodes became unavailable');
                    break;
                }

                if (this.circuitBreaker.state === 'OPEN') {
                    logger.warn('Cache warming stopped: Circuit breaker opened');
                    break;
                }

                // Stop early if we have too many consecutive failures (indicates systemic issue)
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    logger.warn(`Cache warming stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
                    break;
                }

                const batch = popularTracks.slice(i, i + BATCH_SIZE);
                let batchFailures = 0;

                await Promise.allSettled(
                    batch.map(async track => {
                        try {
                            // Check if already cached
                            const cacheKey = `${track.track_url}:youtube`;
                            if (this.searchCache.get(cacheKey)) {
                                skipped++;
                                return;
                            }

                            // Search to populate cache (no requester needed for warming)
                            await this.search(track.track_url, null, { bypassCache: false });
                            warmed++;
                            consecutiveFailures = 0; // Reset on success
                            logger.debug(`Cached: ${track.track_title}`);
                        } catch (error) {
                            failed++;
                            batchFailures++;
                            logger.debug(`Failed to cache: ${track.track_title}`, { error: error.message });
                        }
                    })
                );

                // If entire batch failed, increment consecutive failures counter
                if (batchFailures === batch.length) {
                    consecutiveFailures++;
                }

                // Small delay between batches to be gentle on Lavalink
                if (i + BATCH_SIZE < popularTracks.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            const result = { warmed, failed, skipped, total: popularTracks.length };
            logger.info('Cache warming completed:', result);

            return result;
        } catch (error) {
            logger.error('Cache warming failed', error);
            return { warmed: 0, failed: 0, skipped: 0, error: error.message };
        }
    }

    /**
     * Get popular tracks for cache warming
     * @private
     */
    async _getPopularTracksForWarming(limit = 50) {
        try {
            const { getDatabaseManager } = await import('../database/DatabaseManager.js');
            const db = getDatabaseManager();

            // Get most played tracks across all guilds in the last 30 days
            return db.query(
                `SELECT track_title, track_author, track_url, COUNT(*) as play_count
                 FROM history
                 WHERE played_at > datetime('now', '-30 days')
                 AND track_url IS NOT NULL
                 GROUP BY track_url
                 ORDER BY play_count DESC
                 LIMIT ?`,
                [limit]
            );
        } catch (error) {
            logger.error('Failed to get popular tracks for warming', error);
            return [];
        }
    }

    /**
     * Get performance metrics
     * @returns {Object} Performance metrics
     */
    getMetrics() {
        const cacheHitRate =
            this.metrics.totalSearches > 0
                ? ((this.metrics.cacheHits / this.metrics.totalSearches) * 100).toFixed(2)
                : 0;

        const dedupRate =
            this.metrics.totalSearches > 0
                ? ((this.metrics.dedupHits / this.metrics.totalSearches) * 100).toFixed(2)
                : 0;

        return {
            ...this.metrics,
            cacheHitRate: `${cacheHitRate}%`,
            dedupRate: `${dedupRate}%`,
            activeQueues: this.queues.size,
            cacheSize: this.searchCache.size(),
            cacheStats: this.searchCache.getStats(),
            pendingSearches: this.pendingSearches.size,
            nodeStats: this.nodeMonitor.getAllStats(),
            nodeReport: this.nodeMonitor.getReport(),
            circuitBreakerState: this.circuitBreaker.state,
            uptime: process.uptime()
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger.info('Starting graceful shutdown...');

        this.nodeMonitor.stop();

        // CRITICAL FIX: Clear memory monitor interval
        if (this.memoryMonitorInterval) {
            clearInterval(this.memoryMonitorInterval);
            this.memoryMonitorInterval = null;
            logger.debug('Memory monitor interval stopped');
        }

        // Clear pending search cleanup interval
        if (this.pendingSearchCleanupInterval) {
            clearInterval(this.pendingSearchCleanupInterval);
            this.pendingSearchCleanupInterval = null;
            logger.debug('Pending search cleanup interval stopped');
        }

        // Clear any pending searches
        this.pendingSearches.clear();

        // Destroy all queues
        const promises = [];
        for (const [guildId, queue] of this.queues) {
            promises.push(queue.destroy().catch(err => logger.error(`Error destroying queue ${guildId}`, err)));
        }

        await Promise.allSettled(promises);

        // Clear caches
        this.searchCache.clear();

        logger.info('Graceful shutdown completed');
    }
}

export default MusicManager;
