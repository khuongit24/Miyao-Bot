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
import { TIME, MEMORY, MUSIC_MANAGER, SEARCH_PREFIXES, SOURCE_PRIORITY, PLATFORM_NAMES } from '../utils/constants.js';
import CircuitBreaker from '../utils/CircuitBreaker.js';
import { withTimeout } from '../utils/resilience.js';
import { SearchCache } from './SearchCache.js';
import { NodeHealthMonitor } from './NodeHealthMonitor.js';
import { EnhancedQueue } from './EnhancedQueue.js';

// FIX-L04: Module-level cache for dynamic imports used in createQueue
let _GuildSettingsModule = null;

// MM-M01: Module-level marker object for cache warm requester (avoids re-creating per track)
const CACHE_WARM_REQUESTER = Object.freeze({ id: '__cache_warm__', username: 'CacheWarmer' });

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
        this.setMaxListeners(20);
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

        this.lastNodeConnectionWarningAt = new Map();

        const lavalinkConfig = config?.lavalink;
        if (!lavalinkConfig || !Array.isArray(lavalinkConfig.nodes) || lavalinkConfig.nodes.length === 0) {
            throw new Error('Invalid Lavalink configuration: config.lavalink.nodes must be a non-empty array');
        }

        // Initialize Shoukaku with enhanced options
        // Contract: reconnect interval must be configured explicitly in ms or seconds.
        const reconnectDelayMs = Number.isFinite(lavalinkConfig.reconnectDelayMs)
            ? lavalinkConfig.reconnectDelayMs
            : Number.isFinite(lavalinkConfig.reconnectDelay)
              ? lavalinkConfig.reconnectDelay
              : MUSIC_MANAGER.LAVALINK_RECONNECT_DELAY_MS;
        const reconnectIntervalSeconds = Number.isFinite(lavalinkConfig.reconnectIntervalSeconds)
            ? Math.max(
                  MUSIC_MANAGER.MIN_RECONNECT_INTERVAL_SECONDS,
                  Math.floor(lavalinkConfig.reconnectIntervalSeconds)
              )
            : Math.max(MUSIC_MANAGER.MIN_RECONNECT_INTERVAL_SECONDS, Math.floor(reconnectDelayMs / TIME.SECOND));

        // Security: Override Lavalink password from environment variable
        // FIX-L01: Clone lavalink nodes config to avoid mutating the shared config object
        const lavalinkNodes = lavalinkConfig.nodes.map(node => ({ ...node }));
        if (process.env.LAVALINK_PASSWORD) {
            lavalinkNodes.forEach(node => {
                // Update if using placeholder OR if env var is present (priority to env)
                if (node.auth === 'FROM_ENV' || node.auth === 'youshallnotpass' || process.env.LAVALINK_PASSWORD) {
                    node.auth = process.env.LAVALINK_PASSWORD;
                }
            });
            logger.debug('Loaded Lavalink authentication from environment variables');
        }

        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), lavalinkNodes, {
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
                    this.nodeMonitor.getBestNode(this.shoukaku) || [...nodes.values()].find(node => node.state === 1) // 1 = CONNECTED in Shoukaku v4.3.0
                );
            }
        });

        this._setupEventListeners();
        this._backgroundTasksStarted = false;

        logger.info('MusicManager initialized with advanced features');
    }

    startBackgroundTasks() {
        if (this._backgroundTasksStarted) {
            return;
        }

        this._startHealthMonitor();
        this._startMemoryMonitor();
        this._startPendingSearchCleanup();
        this._startStaleQueueCleanup();
        this._backgroundTasksStarted = true;
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
            const errorCode = error?.code || '';
            const errorMessage = error?.message || '';
            const isConnectionRefused = errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED');

            if (isConnectionRefused) {
                const warningKey = `${name}:${errorCode || 'ECONNREFUSED'}`;
                const lastWarningAt = this.lastNodeConnectionWarningAt.get(warningKey) || 0;
                const now = Date.now();
                const shouldLogWarning = now - lastWarningAt >= 30000;

                if (shouldLogWarning) {
                    // MM-M02: Cap lastNodeConnectionWarningAt to prevent unbounded growth
                    if (this.lastNodeConnectionWarningAt.size >= 100) {
                        // Evict oldest entry
                        let oldestKey = null,
                            oldestTime = Infinity;
                        for (const [k, t] of this.lastNodeConnectionWarningAt.entries()) {
                            if (t < oldestTime) {
                                oldestTime = t;
                                oldestKey = k;
                            }
                        }
                        if (oldestKey) this.lastNodeConnectionWarningAt.delete(oldestKey);
                    }
                    this.lastNodeConnectionWarningAt.set(warningKey, now);
                    logger.warn(
                        `Lavalink node "${name}" is unreachable (ECONNREFUSED). Music features are temporarily degraded until node recovers.`,
                        {
                            errorCode,
                            host: error?.address,
                            port: error?.port,
                            action: 'Start Lavalink server, verify password, and check firewall/network binding.'
                        }
                    );
                }
            } else {
                logger.error(
                    `❌ Lavalink node "${name}" error`,
                    error instanceof Error
                        ? error
                        : new Error(
                              typeof error === 'object'
                                  ? JSON.stringify(error, Object.getOwnPropertyNames(error))
                                  : String(error)
                          )
                );
            }

            this.metrics.errors++;
            this.emit('nodeError', { name, error });
        });

        this.shoukaku.on('close', (name, code, reason) => {
            logger.warn(`⚠️ Lavalink node "${name}" closed`, { code, reason });
            this.emit('nodeClose', { name, code, reason });
        });

        this.shoukaku.on('disconnect', (name, moved, count) => {
            logger.warn(`🔌 Lavalink node "${name}" disconnected`, { moved, playerCount: count });

            // MM-M02: Clean up lastNodeConnectionWarningAt entries for this node on disconnect
            for (const key of this.lastNodeConnectionWarningAt.keys()) {
                if (key.startsWith(`${name}:`)) {
                    this.lastNodeConnectionWarningAt.delete(key);
                }
            }

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
        // FIX-PB02: Throttle disconnect handling per node to prevent cascading recovery storms
        // FIX-PB03: _disconnectCooldowns is bounded by Lavalink node count (~1-5 entries).
        // Stale entries are evicted on access (older than 60s) to prevent any long-term leak.
        if (!this._disconnectCooldowns) this._disconnectCooldowns = new Map();
        const now = Date.now();
        const disconnectCooldownMs = this.config?.music?.disconnectCooldownMs || MUSIC_MANAGER.DISCONNECT_COOLDOWN_MS;
        const disconnectStaleMs = this.config?.music?.disconnectStaleMs || MUSIC_MANAGER.DISCONNECT_STALE_MS;

        // Evict stale entries on each access
        for (const [node, ts] of this._disconnectCooldowns.entries()) {
            if (now - ts > disconnectStaleMs) this._disconnectCooldowns.delete(node);
        }

        const lastDisconnect = this._disconnectCooldowns.get(nodeName) || 0;

        if (now - lastDisconnect < disconnectCooldownMs) {
            logger.warn(`Throttling disconnect handler for node "${nodeName}" (cooldown ${disconnectCooldownMs}ms)`);
            return;
        }
        this._disconnectCooldowns.set(nodeName, now);

        // BUG-050: Collect affected guild IDs first to avoid accessing queue after potential destroy
        const affectedGuilds = [];
        const guildIds = [...this.queues.keys()];
        for (const guildId of guildIds) {
            const queue = this.queues.get(guildId);
            if (!queue) continue;

            if (!queue.player?.node?.name || queue.player.node.name === nodeName) {
                affectedGuilds.push(guildId);
            }
        }

        // MM-H02: Parallel recovery with concurrency limiter (max 10 concurrent)
        const MAX_CONCURRENCY = 10;
        const recoverGuild = async guildId => {
            // BUG-050: Check if queue still exists before accessing it
            let queue = this.queues.get(guildId);
            if (!queue) return;

            if (moved) {
                // Node was moved, try to reconnect
                logger.info(`Attempting to recover queue for guild ${guildId}`);
                try {
                    await queue.reconnect();

                    // BUG-N13: TOCTOU re-check after await
                    queue = this.queues.get(guildId);
                    if (!queue) return;
                } catch (error) {
                    logger.error(`Failed to recover queue for guild ${guildId}`, error);
                    if (this.queues.has(guildId)) {
                        await this.destroyQueue(guildId);
                    }
                }
            } else {
                // Node permanently down, clean up
                if (this.queues.has(guildId)) {
                    await this.destroyQueue(guildId);
                }
            }
        };

        // Semaphore-based concurrency limiter with proper waiter queue
        let activeCount = 0;
        const waitQueue = [];
        const acquireSlot = () => {
            if (activeCount < MAX_CONCURRENCY) {
                activeCount++;
                return Promise.resolve();
            }
            return new Promise(resolve => waitQueue.push(resolve));
        };
        const releaseSlot = () => {
            if (waitQueue.length > 0) {
                const next = waitQueue.shift();
                next();
            } else {
                activeCount--;
            }
        };

        const tasks = affectedGuilds.map(async guildId => {
            await acquireSlot();
            try {
                await recoverGuild(guildId);
            } finally {
                releaseSlot();
            }
        });

        const results = await Promise.allSettled(tasks);
        const failedCount = results.filter(r => r.status === 'rejected').length;
        if (failedCount > 0) {
            logger.warn(`Node disconnect recovery: ${failedCount}/${affectedGuilds.length} guild(s) failed`);
        }
    }

    /**
     * Start node health monitoring
     * @private
     */
    _startHealthMonitor() {
        const healthMonitorIntervalMs =
            this.config?.music?.nodeHealthMonitorIntervalMs || MUSIC_MANAGER.HEALTH_MONITOR_INTERVAL_MS;
        this.nodeMonitor.start(this.shoukaku, healthMonitorIntervalMs);

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
                this._performGradientCleanup(cleanupLevel, heapUsedMB).catch(err =>
                    logger.error('Gradient cleanup failed', { error: err.message })
                );
            }
        }, TIME.CACHE_CLEANUP_INTERVAL);
        this.memoryMonitorInterval.unref();
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
        this.pendingSearchCleanupInterval.unref();

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
     * Start periodic stale queue cleanup
     * Removes queues that have been idle (no current track, no queued tracks, no active player)
     * for longer than the configured stale timeout.
     * @private
     */
    _startStaleQueueCleanup() {
        const checkInterval =
            this.config?.music?.staleQueueCheckIntervalMs ||
            parseInt(process.env.STALE_QUEUE_CHECK_INTERVAL_MS) ||
            5 * TIME.MINUTE;
        const staleTimeout =
            this.config?.music?.staleQueueTimeoutMs || parseInt(process.env.STALE_QUEUE_TIMEOUT_MS) || 30 * TIME.MINUTE;

        this.staleQueueCleanupInterval = setInterval(async () => {
            try {
                let cleaned = 0;
                const now = Date.now();

                const guildIds = [...this.queues.keys()];

                for (const guildId of guildIds) {
                    const queue = this.queues.get(guildId);
                    if (!queue) continue;

                    const hasCurrentTrack = queue.current !== null && queue.current !== undefined;
                    const hasQueuedTracks = queue.tracks && queue.tracks.length > 0;
                    const isPlayerPlaying = queue.player && queue.player.track;

                    // Queue is stale if idle AND last activity exceeds timeout
                    if (!hasCurrentTrack && !hasQueuedTracks && !isPlayerPlaying) {
                        const lastActivity = queue.lastActivityTime || 0;
                        const idleDuration = now - lastActivity;

                        if (idleDuration >= staleTimeout) {
                            try {
                                await this.destroyQueue(guildId);
                                cleaned++;
                                logger.info('Cleaned stale queue', {
                                    guildId,
                                    idleDurationMin: Math.round(idleDuration / TIME.MINUTE)
                                });
                            } catch (err) {
                                logger.error(`Failed to destroy stale queue ${guildId}`, err);
                            }
                        }
                    }
                }

                if (cleaned > 0) {
                    logger.info(
                        `Stale queue cleanup: removed ${cleaned} idle queue(s). Remaining: ${this.queues.size}`
                    );
                }
            } catch (error) {
                logger.error('Error during stale queue cleanup', error);
            }
        }, checkInterval);
        this.staleQueueCleanupInterval.unref();

        logger.info('Stale queue cleanup started', {
            checkIntervalMs: checkInterval,
            staleTimeoutMs: staleTimeout
        });
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
    async _performGradientCleanup(level, heapUsedMB) {
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
            const guildIds = [...this.queues.keys()];

            for (const guildId of guildIds) {
                const queue = this.queues.get(guildId);
                if (!queue) continue;

                if (!queue.current && queue.tracks.length === 0) {
                    try {
                        await queue._sendGoodbyeMessage({
                            textChannel: queue.textChannel,
                            guildId,
                            reason: 'disconnect',
                            footer: this.config?.bot?.footer || 'Miyao Music Bot'
                        });
                    } catch (error) {
                        logger.debug('Failed to send gradient cleanup goodbye message', {
                            guildId,
                            error: error.message
                        });
                    }
                    await this.destroyQueue(guildId);
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
        // Configurable max concurrent queues (default 50)
        const maxConcurrentQueues =
            this.config?.music?.maxConcurrentQueues || parseInt(process.env.MAX_CONCURRENT_QUEUES) || 50;

        if (this.queues.size >= maxConcurrentQueues) {
            logger.warn('Max concurrent queues reached', {
                current: this.queues.size,
                max: maxConcurrentQueues
            });
            throw new Error(`Đã đạt giới hạn ${maxConcurrentQueues} hàng đợi đồng thời. Vui lòng thử lại sau.`);
        }

        // Graceful degradation: check if Lavalink is available before creating queue
        if (!this.hasAvailableNode()) {
            logger.warn('No Lavalink nodes available when creating queue', { guildId });
            throw new Error('Hệ thống phát nhạc hiện không khả dụng. Vui lòng thử lại sau.');
        }

        const queue = new EnhancedQueue(this, guildId, voiceChannelId, textChannel);

        // Apply guild settings for duplicate handling
        try {
            // FIX-L04: Cache the dynamic import so it's not re-imported on every queue creation
            if (!_GuildSettingsModule) {
                _GuildSettingsModule = (await import('../database/models/GuildSettings.js')).default;
            }
            const GuildSettings = _GuildSettingsModule;
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
    async destroyQueue(guildId, options = {}) {
        if (!this.queues.has(guildId)) return;
        const { skipDestroy = false } = options;
        const queue = this.queues.get(guildId);
        if (queue) {
            if (!skipDestroy) {
                await queue.destroy({ skipManagerDelete: true });
            }
            this.queues.delete(guildId);

            // MM-M02: Clean up lastNodeConnectionWarningAt entries for this guild
            // Prune entries that are older than 5 minutes to prevent unbounded growth
            const now = Date.now();
            for (const [key, timestamp] of this.lastNodeConnectionWarningAt.entries()) {
                if (now - timestamp > 5 * 60 * 1000) {
                    this.lastNodeConnectionWarningAt.delete(key);
                }
            }

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

        // Graceful degradation: return empty results when Lavalink is down
        if (!this.hasAvailableNode() && this.circuitBreaker.state === 'OPEN') {
            logger.warn('Search skipped: No nodes available and circuit breaker is OPEN', { query });
            return {
                loadType: 'empty',
                tracks: [],
                playlistInfo: null,
                error: 'SERVICE_UNAVAILABLE',
                message: 'Hệ thống tìm kiếm nhạc hiện không khả dụng. Vui lòng thử lại sau.'
            };
        }

        // Check cache first
        // BUG-051: Normalize search query key to lowercase for case-insensitive dedup
        // SRCH-C01: Include requestedSource in cache key for /search explicit source
        // P1-03: Use _buildCacheKey for consistent key format across search() and warmCache()
        const cacheKey = this._buildCacheKey(query, options.requestedSource || options.source || 'auto');
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

        // Create placeholder promise first to avoid race before map insertion
        let resolveSearch;
        let rejectSearch;
        const searchPromise = new Promise((resolve, reject) => {
            resolveSearch = resolve;
            rejectSearch = reject;
        });

        this.pendingSearches.set(cacheKey, {
            promise: searchPromise,
            timestamp: Date.now()
        });

        (async () => {
            try {
                const result = await this._executeSearch(query, requester, options, cacheKey);
                resolveSearch(result);
            } catch (error) {
                rejectSearch(error);
            } finally {
                this.pendingSearches.delete(cacheKey);
            }
        })();

        return searchPromise;
    }

    /**
     * Execute search with multi-source fallback chain.
     * v1.11.0: Replaces single-source search with priority-based fallback.
     *
     * Flow:
     * 1. URLs → resolve directly via Lavalink (no prefix needed)
     * 2. Text queries → try sources in priority order:
     *    ytsearch → ytmsearch → scsearch → dzsearch (if enabled)
     * 3. Skip remaining YouTube sources if OAuth error detected
     * 4. Cache successful results with source metadata
     *
     * @param {string} query - Raw query or URL
     * @param {object} requester - Discord user who requested
     * @param {object} options - { source?: string, bypassCache?: boolean }
     * @param {string} cacheKey - Cache key for storing results
     * @returns {Promise<object>} Search result with tracks
     * @private
     */
    async _executeSearch(query, requester, options, cacheKey) {
        const isUrl = /^https?:\/\//.test(query);

        // === URL: Resolve directly via Lavalink ===
        if (isUrl) {
            return this._resolveUrl(query, requester, cacheKey);
        }

        // === Text query: Multi-source fallback chain ===
        const sources = this._getAvailableSearchSources();
        // SRCH-C01: Support requestedSource from /search command (clean query, source in options)
        const requestedSource = options.requestedSource || options.source;

        // Build ordered search plan
        let searchPlan;
        if (requestedSource) {
            // User requested specific source → put it first, then fallbacks
            searchPlan = [requestedSource, ...sources.map(s => s.prefix).filter(p => p !== requestedSource)];
        } else {
            searchPlan = sources.map(s => s.prefix);
        }

        let lastError = null;
        let youtubeOAuthFailed = false;

        for (const sourcePrefix of searchPlan) {
            // Skip YouTube sources if OAuth error was detected
            if (
                youtubeOAuthFailed &&
                (sourcePrefix === SEARCH_PREFIXES.YOUTUBE || sourcePrefix === SEARCH_PREFIXES.YOUTUBE_MUSIC)
            ) {
                logger.debug(`[MusicManager] Skipping ${sourcePrefix} due to YouTube OAuth failure`);
                continue;
            }

            try {
                const searchQuery = `${sourcePrefix}:${query}`;
                const node = this.nodeMonitor.getBestNode(this.shoukaku);

                if (!node) {
                    throw new Error('Không có Lavalink node khả dụng');
                }

                const searchTimeoutMs = this.config?.music?.searchTimeoutMs || MUSIC_MANAGER.SEARCH_TIMEOUT_MS;

                logger.debug(`[MusicManager] Searching: ${searchQuery} on node ${node.name}`, {
                    source: sourcePrefix,
                    isPrimary: sourcePrefix === searchPlan[0]
                });

                const result = await this.circuitBreaker.execute(
                    () => withTimeout(() => node.rest.resolve(searchQuery), searchTimeoutMs, 'Search timeout'),
                    `search:${sourcePrefix}`
                );

                if (result && this._hasValidTracks(result)) {
                    // Parse tracks from result
                    let tracks = [];
                    if (result.loadType === 'search' || result.loadType === 'track') {
                        tracks = Array.isArray(result.data) ? result.data : [result.data];
                    } else if (result.loadType === 'playlist') {
                        tracks = result.data?.tracks || [];
                    }

                    this.metrics.totalTracks += tracks.length;

                    const searchResult = {
                        loadType: result.loadType,
                        tracks: tracks.map(track => ({ ...track, requester })),
                        playlistInfo: result.data?.info || null,
                        searchSource: sourcePrefix,
                        searchSourceName: PLATFORM_NAMES[this._prefixToPlatform(sourcePrefix)] || sourcePrefix
                    };

                    // Cache successful non-URL search
                    if (cacheKey && tracks.length > 0) {
                        this.searchCache.set(cacheKey, {
                            loadType: result.loadType,
                            tracks: tracks,
                            playlistInfo: result.data?.info || null,
                            searchSource: sourcePrefix,
                            searchSourceName: searchResult.searchSourceName
                        });
                    }

                    // Log fallback usage
                    if (sourcePrefix !== searchPlan[0]) {
                        const sourceName = searchResult.searchSourceName;
                        logger.info(
                            `[MusicManager] Fallback search successful via ${sourceName} ` +
                                `for "${query}" (primary: ${searchPlan[0]})`
                        );
                    }

                    return searchResult;
                }

                // Result exists but no valid tracks — try next source
                logger.debug(`[MusicManager] No valid tracks from ${sourcePrefix} for "${query}"`);
            } catch (error) {
                lastError = error;
                const sourceName = PLATFORM_NAMES[this._prefixToPlatform(sourcePrefix)] || sourcePrefix;
                logger.warn(`[MusicManager] Search failed with ${sourceName}: ${error.message}`);

                // Detect YouTube OAuth errors → skip remaining YouTube sources
                if (this._isRecoverableYouTubeLoadError(error)) {
                    if (sourcePrefix === SEARCH_PREFIXES.YOUTUBE || sourcePrefix === SEARCH_PREFIXES.YOUTUBE_MUSIC) {
                        youtubeOAuthFailed = true;
                        logger.warn(
                            `[MusicManager] YouTube OAuth/auth error detected, ` + `skipping to alternative sources`
                        );
                    }
                }
            }
        }

        // All sources exhausted
        const errMsg = (lastError?.message || '').toLowerCase();
        if (errMsg.includes('login') || errMsg.includes('oauth') || errMsg.includes('all clients failed')) {
            logger.warn(
                'YouTube search/load thất bại có thể do OAuth token hết hạn hoặc chưa cấu hình. ' +
                    'Kiểm tra YT_OAUTH_REFRESH_TOKEN trong .env và khởi động lại Lavalink.',
                { query, error: lastError?.message }
            );
        }

        this.metrics.errors++;
        throw lastError || new Error('Không tìm thấy bài hát từ bất kỳ nguồn nào');
    }

    /**
     * Resolve URL directly via Lavalink with circuit breaker.
     * URLs from any source (YouTube, SoundCloud, Bandcamp, Deezer, etc.)
     * are sent raw — Lavalink auto-detects source.
     *
     * @param {string} url - Direct URL
     * @param {object} requester - Discord user
     * @param {string} cacheKey - Cache key
     * @returns {Promise<object>} Search result
     * @private
     */
    async _resolveUrl(url, requester, cacheKey) {
        try {
            const primaryNode = this.nodeMonitor.getBestNode(this.shoukaku);
            if (!primaryNode) {
                throw new Error('Không có Lavalink node khả dụng');
            }

            const searchTimeoutMs = this.config?.music?.searchTimeoutMs || MUSIC_MANAGER.SEARCH_TIMEOUT_MS;

            const result = await this.circuitBreaker.execute(
                () => withTimeout(() => primaryNode.rest.resolve(url), searchTimeoutMs, 'Search timeout'),
                'resolve:url'
            );

            if (!result || !result.data) {
                // Try secondary node as fallback for URL resolution
                const secondaryNode = this._findSecondaryConnectedNode(primaryNode.name);
                if (secondaryNode) {
                    try {
                        logger.debug(`[MusicManager] Primary node returned empty for URL, trying fallback node`);
                        const fallbackResult = await withTimeout(
                            () => secondaryNode.rest.resolve(url),
                            searchTimeoutMs,
                            'Search timeout'
                        );

                        if (fallbackResult && fallbackResult.data) {
                            return this._parseUrlResult(fallbackResult, requester, cacheKey, url);
                        }
                    } catch (fallbackError) {
                        logger.warn(`[MusicManager] Fallback node also failed for URL: ${fallbackError.message}`);
                    }
                }

                return { tracks: [], loadType: 'empty', searchSource: 'url', searchSourceName: 'Direct URL' };
            }

            return this._parseUrlResult(result, requester, cacheKey, url);
        } catch (error) {
            // For URLs, try secondary node as fallback
            const primaryNode = this.nodeMonitor.getBestNode(this.shoukaku);
            const secondaryNode = primaryNode ? this._findSecondaryConnectedNode(primaryNode.name) : null;

            if (secondaryNode) {
                try {
                    const searchTimeoutMs = this.config?.music?.searchTimeoutMs || MUSIC_MANAGER.SEARCH_TIMEOUT_MS;

                    logger.debug(`[MusicManager] Primary resolve failed, trying fallback node for URL`);
                    const fallbackResult = await withTimeout(
                        () => secondaryNode.rest.resolve(url),
                        searchTimeoutMs,
                        'Search timeout'
                    );

                    if (fallbackResult && fallbackResult.data) {
                        return this._parseUrlResult(fallbackResult, requester, cacheKey, url);
                    }
                } catch (fallbackError) {
                    logger.warn(`[MusicManager] Fallback node also failed for URL: ${fallbackError.message}`);
                }
            }

            const errMsg = (error?.message || '').toLowerCase();
            if (errMsg.includes('login') || errMsg.includes('oauth') || errMsg.includes('all clients failed')) {
                logger.warn(
                    'YouTube URL load thất bại có thể do OAuth token hết hạn. ' +
                        'Kiểm tra YT_OAUTH_REFRESH_TOKEN trong .env.',
                    { url, error: error.message }
                );
            }

            logger.error('[MusicManager] URL resolve error', error);
            this.metrics.errors++;
            throw error;
        }
    }

    /**
     * Parse raw Lavalink URL result into standardized format.
     * @private
     */
    _parseUrlResult(result, requester, cacheKey, url) {
        let tracks = [];

        if (result.loadType === 'search' || result.loadType === 'track') {
            tracks = Array.isArray(result.data) ? result.data : [result.data];
        } else if (result.loadType === 'playlist') {
            tracks = result.data?.tracks || [];
        }

        this.metrics.totalTracks += tracks.length;

        // Warn if all tracks missing encoded field (OAuth issue)
        if (tracks.length > 0 && tracks.every(t => !t.encoded)) {
            logger.warn(
                'Tất cả tracks trả về đều thiếu trường "encoded". ' +
                    'Có thể YouTube OAuth token đã hết hạn hoặc chưa được cấu hình.',
                { url, trackCount: tracks.length }
            );
        }

        const searchResult = {
            loadType: result.loadType,
            tracks: tracks.map(track => ({ ...track, requester })),
            playlistInfo: result.data?.info || null,
            searchSource: 'url',
            searchSourceName: 'Direct URL'
        };

        // Cache URL results
        if (cacheKey && tracks.length > 0) {
            this.searchCache.set(cacheKey, {
                loadType: result.loadType,
                tracks: tracks,
                playlistInfo: result.data?.info || null,
                searchSource: 'url',
                searchSourceName: 'Direct URL'
            });
        }

        return searchResult;
    }

    /**
     * Check if search result has valid playable tracks.
     * Also checks for missing 'encoded' field (OAuth token expired indicator).
     *
     * @param {object} result - Raw Lavalink search result
     * @returns {boolean} True if result has valid tracks
     * @private
     */
    _hasValidTracks(result) {
        if (!result) return false;

        const loadType = result.loadType;

        if (loadType === 'search' || loadType === 'track') {
            const tracks = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
            if (tracks.length === 0) return false;

            // Check for missing encoded field (OAuth issue)
            const allMissingEncoded = tracks.every(t => !t.encoded);
            if (allMissingEncoded) {
                logger.warn('[MusicManager] All tracks missing encoded field — possible OAuth issue');
                return false;
            }

            return true;
        }

        if (loadType === 'playlist') {
            const tracks = result.data?.tracks || [];
            return tracks.length > 0;
        }

        return false;
    }

    /**
     * Build a normalized cache key for search results.
     * Ensures consistent key format across search() and warmCache().
     *
     * @param {string} query - The search query or URL
     * @param {string} [source='auto'] - The search source
     * @returns {string} Normalized cache key
     * @private
     */
    _buildCacheKey(query, source) {
        return `${query.toLowerCase()}:${source || 'auto'}`;
    }

    /**
     * Get available search sources in priority order.
     * Includes Deezer dynamically if enabled via environment.
     *
     * @returns {Array<{prefix: string, name: string}>} Ordered source list
     * @private
     */
    _getAvailableSearchSources() {
        const sources = SOURCE_PRIORITY.map(prefix => ({
            prefix,
            name: PLATFORM_NAMES[this._prefixToPlatform(prefix)] || prefix
        }));

        // Add Deezer if enabled and ARL configured
        if (process.env.DEEZER_ENABLED === 'true' && process.env.DEEZER_ARL) {
            sources.push({
                prefix: SEARCH_PREFIXES.DEEZER,
                name: PLATFORM_NAMES.deezer
            });
        }

        return sources;
    }

    /**
     * Map search prefix to platform key.
     * @param {string} prefix - Search prefix (e.g., 'ytsearch')
     * @returns {string} Platform key (e.g., 'youtube')
     * @private
     */
    _prefixToPlatform(prefix) {
        const map = {
            [SEARCH_PREFIXES.YOUTUBE]: 'youtube',
            [SEARCH_PREFIXES.YOUTUBE_MUSIC]: 'youtube_music',
            [SEARCH_PREFIXES.SOUNDCLOUD]: 'soundcloud',
            [SEARCH_PREFIXES.DEEZER]: 'deezer',
            spsearch: 'spotify'
        };
        return map[prefix] || 'unknown';
    }

    /**
     * Direct search bypassing cache and deduplication.
     * Used by EnhancedQueue for alternative source search during playback errors.
     *
     * @param {string} query - Pre-formatted search query (e.g., "scsearch:song name")
     * @returns {Promise<object|null>} Search result with tracks array, or null on failure
     */
    async searchDirect(query) {
        const node = this.nodeMonitor.getBestNode(this.shoukaku);
        if (!node) return null;

        try {
            const searchTimeoutMs = this.config?.music?.searchTimeoutMs || MUSIC_MANAGER.SEARCH_TIMEOUT_MS;

            const result = await withTimeout(() => node.rest.resolve(query), searchTimeoutMs, 'Search timeout');

            if (!result) return null;

            // Normalize to common format
            const loadType = result.loadType;
            if (loadType === 'search') {
                return { tracks: Array.isArray(result.data) ? result.data : [], loadType };
            }
            if (loadType === 'track') {
                return { tracks: result.data ? [result.data] : [], loadType };
            }
            if (loadType === 'playlist') {
                return { tracks: result.data?.tracks || [], loadType };
            }

            return null;
        } catch (error) {
            logger.warn(`[MusicManager] searchDirect failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Check if error is recoverable for YouTube-based search and worth retrying
     * @private
     * @param {Error} error - Search error
     * @returns {boolean}
     */
    _isRecoverableYouTubeLoadError(error) {
        const text = `${error?.message || ''} ${error?.stack || ''}`.toLowerCase();

        if (!text) {
            return false;
        }

        const recoverablePatterns = [
            'video player configuration error',
            'web_embedded_player',
            'login required',
            'video requires login',
            'sign in to confirm',
            'status code 403',
            'status code 429',
            'youtube source is unavailable',
            // YouTube OAuth / client rotation errors (2026+)
            'youtube is no longer supported',
            'all clients failed',
            'allclientsfailedexception',
            'embedder_identity_denied',
            'this video is unavailable'
        ];

        return recoverablePatterns.some(pattern => text.includes(pattern));
    }

    /**
     * Find another connected Lavalink node different from primary node
     * @private
     * @param {string} primaryNodeName - Name of primary node
     * @returns {Object|null}
     */
    _findSecondaryConnectedNode(primaryNodeName) {
        if (!this.shoukaku?.nodes) {
            return null;
        }

        for (const [name, node] of this.shoukaku.nodes) {
            if (name !== primaryNodeName && node.state === 1) {
                // 1 = CONNECTED in Shoukaku v4.3.0
                return node;
            }
        }

        return null;
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
            if (node.state === 1) {
                // 1 = CONNECTED in Shoukaku v4.3.0
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
            let settled = false;

            // FIX-L02: Centralized cleanup to prevent listener leaks
            const cleanup = () => {
                clearInterval(intervalId);
                this.shoukaku.off('ready', onReady);
            };

            // Also listen for the 'ready' event from Shoukaku for faster response
            const onReady = () => {
                if (!settled && this.hasAvailableNode()) {
                    settled = true;
                    cleanup();
                    const elapsed = Date.now() - startTime;
                    logger.info(`Lavalink node ready (via event) after ${elapsed}ms`);
                    resolve(true);
                }
            };

            const intervalId = setInterval(() => {
                if (settled) return;

                // Check if node is now available
                if (this.hasAvailableNode()) {
                    settled = true;
                    cleanup();
                    const elapsed = Date.now() - startTime;
                    logger.info(`Lavalink node ready after ${elapsed}ms`);
                    resolve(true);
                    return;
                }

                // Check for timeout
                if (Date.now() - startTime >= timeoutMs) {
                    settled = true;
                    cleanup();
                    logger.warn(`Timeout waiting for Lavalink node (${timeoutMs}ms)`);
                    resolve(false);
                }
            }, checkInterval);

            this.shoukaku.on('ready', onReady);
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
                            // P1-03: Use _buildCacheKey for consistent key format with search()
                            const cacheKey = this._buildCacheKey(track.track_url, 'auto');
                            if (this.searchCache.get(cacheKey)) {
                                skipped++;
                                return;
                            }

                            // MM-M01: Use module-level frozen marker object for cache warm requester
                            await this.search(track.track_url, CACHE_WARM_REQUESTER, { bypassCache: false });
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

        // Clear stale queue cleanup interval
        if (this.staleQueueCleanupInterval) {
            clearInterval(this.staleQueueCleanupInterval);
            this.staleQueueCleanupInterval = null;
            logger.debug('Stale queue cleanup interval stopped');
        }

        // Clear any pending searches
        this.pendingSearches.clear();

        // BUG-019: Snapshot keys first — destroy() mutates this.queues map
        const guildIds = [...this.queues.keys()];
        const promises = [];
        for (const guildId of guildIds) {
            const queue = this.queues.get(guildId);
            if (queue) {
                promises.push(queue.destroy().catch(err => logger.error(`Error destroying queue ${guildId}`, err)));
            }
        }

        await Promise.allSettled(promises);

        if (this.shoukaku?.disconnect) {
            try {
                this.shoukaku.disconnect();
                logger.debug('Shoukaku disconnected');
            } catch (error) {
                logger.warn('Failed to disconnect Shoukaku cleanly', { error: error.message });
            }
        }

        if (this.shoukaku?.removeAllListeners) {
            this.shoukaku.removeAllListeners();
        }

        this.removeAllListeners();

        // Clear caches
        // FIX-MM-C01: Use dispose() instead of clear() to also stop prune interval
        this.searchCache.dispose();

        logger.info('Graceful shutdown completed');
    }
}

export default MusicManager;
