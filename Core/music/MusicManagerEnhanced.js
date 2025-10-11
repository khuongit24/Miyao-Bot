/**
 * Advanced Music Manager with Performance & Reliability Enhancements
 * - Connection pooling & node load balancing
 * - Advanced error recovery with circuit breaker
 * - Memory optimization & automatic cleanup
 * - Full Lavalink filter support
 * - Health monitoring & metrics
 */

import { Shoukaku, Connectors } from 'shoukaku';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';
import { TIME, CACHE, QUEUE, PLAYBACK, LAVALINK } from '../utils/constants.js';
import CircuitBreaker, { CircuitBreakerError } from '../utils/CircuitBreaker.js';
import { retryWithBackoff, withFallback } from '../utils/resilience.js';

/**
 * Node Health Monitor - Track node performance and availability
 */
class NodeHealthMonitor extends EventEmitter {
    constructor() {
        super();
        this.nodeStats = new Map();
        this.healthCheckInterval = null;
    }

    start(shoukaku, intervalMs = LAVALINK.HEALTH_CHECK_INTERVAL) {
        this.healthCheckInterval = setInterval(() => {
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
                    uptime: node.stats?.uptime || 0,
                    timestamp: Date.now()
                };
                
                this.nodeStats.set(name, stats);
                
                // Alert if node is unhealthy (only warn if actually problematic)
                if (isConnected && stats.cpu > 80) {
                    this.emit('unhealthy', stats);
                    logger.warn(`Node ${name} is unhealthy (high CPU: ${stats.cpu.toFixed(1)}%)`, stats);
                }
            }
        }, intervalMs);
    }

    stop() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
    }

    getBestNode(shoukaku) {
        let bestNode = null;
        let lowestLoad = Infinity;

        for (const [name, stats] of this.nodeStats) {
            if (!stats.connected) continue;
            
            // Calculate load score (lower is better)
            const load = (stats.cpu || 0) + (stats.players * 10);
            
            if (load < lowestLoad) {
                lowestLoad = load;
                bestNode = shoukaku.nodes.get(name);
            }
        }

        // Fallback: Find any connected node directly (prevent infinite recursion)
        if (!bestNode && shoukaku && shoukaku.nodes) {
            bestNode = [...shoukaku.nodes.values()].find(node => node.state === 3);
        }

        return bestNode;
    }
}

/**
 * Enhanced Search Cache with TTL, LRU eviction, compression, and warming
 */
class SearchCache {
    constructor(maxSize = CACHE.MAX_SIZE, ttlMs = TIME.SEARCH_CACHE_TTL) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.accessCount = new Map(); // Track access frequency for LRU
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            compressionSavings: 0
        };
    }

    set(key, value, compress = false) {
        // Evict LRU item if at capacity
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        const entry = {
            value,
            timestamp: Date.now(),
            compressed: compress,
            size: this.estimateSize(value)
        };

        // Compress large objects if requested
        if (compress && entry.size > 10000) {
            entry.value = this.compress(value);
            const newSize = this.estimateSize(entry.value);
            this.stats.compressionSavings += (entry.size - newSize);
            entry.size = newSize;
        }

        this.cache.set(key, entry);
        this.accessCount.set(key, 1);
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            this.accessCount.delete(key);
            this.stats.misses++;
            return null;
        }

        // Update access count for LRU
        this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
        this.stats.hits++;

        // Decompress if needed
        return entry.compressed ? this.decompress(entry.value) : entry.value;
    }

    evictLRU() {
        // Find least recently used (lowest access count)
        let minAccess = Infinity;
        let lruKey = null;

        for (const [key, count] of this.accessCount.entries()) {
            if (count < minAccess) {
                minAccess = count;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.cache.delete(lruKey);
            this.accessCount.delete(lruKey);
            this.stats.evictions++;
        } else {
            // Fallback to oldest
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
                this.accessCount.delete(firstKey);
                this.stats.evictions++;
            }
        }
    }

    compress(value) {
        // Simple compression: JSON stringify and remove whitespace
        // For production, consider using zlib or similar
        return JSON.stringify(value);
    }

    decompress(value) {
        return JSON.parse(value);
    }

    estimateSize(obj) {
        // Rough estimate of object size in bytes
        try {
            return JSON.stringify(obj).length * 2; // UTF-16
        } catch {
            return 1000; // Default estimate
        }
    }

    clear() {
        this.cache.clear();
        this.accessCount.clear();
    }

    size() {
        return this.cache.size;
    }

    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0;

        return {
            ...this.stats,
            hitRate: hitRate + '%',
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }

    /**
     * Pre-warm cache with popular searches
     */
    async warmCache(searches, searchFn) {
        logger.info(`Warming cache with ${searches.length} popular searches...`);
        
        let warmed = 0;
        for (const query of searches) {
            if (this.cache.has(query)) continue;
            
            try {
                const result = await searchFn(query);
                if (result) {
                    this.set(query, result, true);
                    warmed++;
                }
            } catch (error) {
                logger.debug(`Cache warm failed for: ${query}`, { error: error.message });
            }
        }

        logger.info(`Cache warmed: ${warmed}/${searches.length} entries`);
        return { warmed, total: searches.length };
    }
}

/**
 * Enhanced Music Manager with advanced features
 * Now using the comprehensive CircuitBreaker from Core/utils/CircuitBreaker.js
 */
export class MusicManager extends EventEmitter {
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
        this.pendingSearches = new Map();
        
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
        this.shoukaku = new Shoukaku(
            new Connectors.DiscordJS(client),
            config.lavalink.nodes,
            {
                moveOnDisconnect: true,
                resume: true,
                resumeTimeout: config.lavalink.resumeTimeout || 60,
                resumeByLibrary: true, // Important for better recovery
                reconnectTries: config.lavalink.reconnectTries || 10,
                reconnectInterval: config.lavalink.reconnectDelay || 5,
                restTimeout: 60,
                voiceConnectionTimeout: 15,
                userAgent: `Miyao-Bot/${config.bot.version} (Discord Music Bot)`,
                // Custom node resolver for load balancing
                nodeResolver: (nodes) => {
                    return this.nodeMonitor.getBestNode(this.shoukaku) || 
                           [...nodes.values()].find(node => node.state === 3);
                }
            }
        );
        
        this.setupEventListeners();
        this.startHealthMonitor();
        this.startMemoryMonitor();
        
        logger.info('Enhanced Music Manager initialized with advanced features');
    }
    
    /**
     * Setup comprehensive event listeners
     */
    setupEventListeners() {
        this.shoukaku.on('ready', (name) => {
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
            this.handleNodeDisconnect(name, moved);
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
     */
    async handleNodeDisconnect(nodeName, moved) {
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
     */
    startHealthMonitor() {
        this.nodeMonitor.start(this.shoukaku, 30000);
        
        this.nodeMonitor.on('unhealthy', (stats) => {
            logger.warn(`Node ${stats.name} is unhealthy, redistributing load...`);
            // Could trigger player migration here
        });
    }
    
    /**
     * Start memory monitoring and cleanup
     */
    startMemoryMonitor() {
        setInterval(() => {
            const memUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
            
            logger.debug(`Memory: ${heapUsedMB}MB / ${heapTotalMB}MB | Queues: ${this.queues.size} | Cache: ${this.searchCache.size()}`);
            
            // Aggressive cleanup if memory is high
            if (heapUsedMB > 800) {
                logger.warn('High memory usage detected, performing cleanup...');
                this.performCleanup();
            }
        }, TIME.CACHE_CLEANUP_INTERVAL);
    }
    
    /**
     * Perform aggressive cleanup
     */
    performCleanup() {
        // Clean up idle queues
        for (const [guildId, queue] of this.queues.entries()) {
            if (!queue.current && queue.tracks.length === 0) {
                this.destroyQueue(guildId);
            }
        }
        
        // Clear old cache entries
        this.searchCache.clear();
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
            logger.info('Forced garbage collection completed');
        }
    }
    
    /**
     * Get queue with memory limit check
     */
    getQueue(guildId) {
        return this.queues.get(guildId);
    }
    
    /**
     * Create queue with memory limit
     */
    async createQueue(guildId, voiceChannelId, textChannel) {
        // Limit total queues for memory
        if (this.queues.size >= 500) {
            throw new Error('Maximum queue limit reached');
        }
        
        const queue = new EnhancedQueue(this, guildId, voiceChannelId, textChannel);
        this.queues.set(guildId, queue);
        logger.music('Queue created', { guildId, totalQueues: this.queues.size });
        return queue;
    }
    
    /**
     * Destroy queue with cleanup
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
        if (this.pendingSearches.has(cacheKey)) {
            this.metrics.dedupHits++;
            logger.debug(`Dedup hit: Waiting for existing search: ${query}`);
            
            try {
                // Wait for existing search to complete
                const result = await this.pendingSearches.get(cacheKey);
                return {
                    ...result,
                    tracks: result.tracks.map(t => ({ ...t, requester }))
                };
            } catch (error) {
                // If pending search failed, fall through to create new search
                logger.warn('Pending search failed, retrying', { query, error: error.message });
            }
        }
        
        // Create a new search promise and store it for deduplication
        const searchPromise = this.executeSearch(query, requester, options, cacheKey);
        this.pendingSearches.set(cacheKey, searchPromise);
        
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
    async executeSearch(query, requester, options, cacheKey) {
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
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Search timeout')), 10 * TIME.SECOND)
                    )
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
     * Warm cache with popular tracks
     * Call this on startup or periodically to preload frequently played tracks
     * @param {number} topN - Number of top tracks to preload (default: 50)
     * @returns {Object} Warming results
     */
    async warmCache(topN = 50) {
        try {
            logger.info(`Starting cache warming for top ${topN} tracks...`);
            
            // Dynamically import History model to avoid circular dependency
            const { default: History } = await import('../database/models/History.js');
            
            // Get top tracks across all guilds (by play count)
            const popularTracks = await this.getPopularTracksForWarming(topN);
            
            if (popularTracks.length === 0) {
                logger.info('No tracks in history to warm cache');
                return { warmed: 0, failed: 0, skipped: 0 };
            }
            
            let warmed = 0;
            let failed = 0;
            let skipped = 0;
            
            // Warm cache in small batches to avoid overloading
            const BATCH_SIZE = 5;
            for (let i = 0; i < popularTracks.length; i += BATCH_SIZE) {
                const batch = popularTracks.slice(i, i + BATCH_SIZE);
                
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
                            logger.debug(`Cached: ${track.track_title}`);
                        } catch (error) {
                            failed++;
                            logger.debug(`Failed to cache: ${track.track_title}`, { error: error.message });
                        }
                    })
                );
                
                // Small delay between batches to be gentle on Lavalink
                if (i + BATCH_SIZE < popularTracks.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            const result = { warmed, failed, skipped, total: popularTracks.length };
            logger.info(`Cache warming completed:`, result);
            
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
    async getPopularTracksForWarming(limit = 50) {
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
     */
    getMetrics() {
        const cacheHitRate = this.metrics.totalSearches > 0 
            ? (this.metrics.cacheHits / this.metrics.totalSearches * 100).toFixed(2) 
            : 0;
        
        const dedupRate = this.metrics.totalSearches > 0
            ? (this.metrics.dedupHits / this.metrics.totalSearches * 100).toFixed(2)
            : 0;
        
        return {
            ...this.metrics,
            cacheHitRate: `${cacheHitRate}%`,
            dedupRate: `${dedupRate}%`,
            activeQueues: this.queues.size,
            cacheSize: this.searchCache.size(),
            pendingSearches: this.pendingSearches.size,
            nodeStats: Array.from(this.nodeMonitor.nodeStats.values()),
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
        
        // Destroy all queues
        const promises = [];
        for (const [guildId, queue] of this.queues) {
            promises.push(queue.destroy().catch(err => 
                logger.error(`Error destroying queue ${guildId}`, err)
            ));
        }
        
        await Promise.allSettled(promises);
        
        // Clear caches
        this.searchCache.clear();
        
        logger.info('Graceful shutdown completed');
    }
}

/**
 * Enhanced Queue with advanced features
 */
export class EnhancedQueue {
    constructor(manager, guildId, voiceChannelId, textChannel) {
        this.manager = manager;
        this.guildId = guildId;
        this.voiceChannelId = voiceChannelId;
        this.textChannel = textChannel;
        
        this.tracks = [];
        this.current = null;
        this.player = null;
        this.loop = 'off';
        this.volume = manager.config.music.defaultVolume || 50;
        this.paused = false;
        this.autoplay = false; // Autoplay related tracks
        
        // Filters
        this.filters = {
            equalizer: [],
            karaoke: null,
            timescale: null,
            tremolo: null,
            vibrato: null,
            rotation: null,
            distortion: null,
            channelMix: null,
            lowPass: null
        };
        
        this.leaveTimeout = null;
        this.nowPlayingMessage = null;
        this.updateInterval = null;
        
        // Track history for analytics
        this.history = [];
        this.maxHistory = 50;
        
        // Playback statistics
        this.stats = {
            tracksPlayed: 0,
            totalDuration: 0,
            skips: 0,
            errors: 0
        };
    }
    
    /**
     * Connect with retry logic
     */
    async connect(retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const node = this.manager.nodeMonitor.getBestNode(this.manager.shoukaku);
                
                if (!node) {
                    throw new Error('No available nodes');
                }
                
                const guild = this.manager.client.guilds.cache.get(this.guildId);
                const shardId = guild ? guild.shardId : 0;
                
                logger.info(`Connecting to voice channel (attempt ${i + 1}/${retries})`);
                
                this.player = await this.manager.shoukaku.joinVoiceChannel({
                    guildId: this.guildId,
                    channelId: this.voiceChannelId,
                    shardId: shardId
                });
                
                this.setupPlayerEvents();
                await this.player.setGlobalVolume(this.volume);
                
                // Apply any existing filters
                await this.applyFilters();
                
                logger.music('Player connected successfully', { 
                    guildId: this.guildId,
                    node: node.name
                });
                
                return this.player;
            } catch (error) {
                logger.error(`Connection attempt ${i + 1} failed`, error);
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    
    /**
     * Reconnect after node failure
     */
    async reconnect() {
        logger.info(`Attempting to reconnect queue for guild ${this.guildId}`);
        
        const currentTrack = this.current;
        const currentPosition = this.player?.position || 0;
        
        // Disconnect old player
        if (this.player) {
            try {
                await this.manager.shoukaku.leaveVoiceChannel(this.guildId);
            } catch (err) {
                logger.warn('Error leaving voice channel during reconnect', err);
            }
        }
        
        // Reconnect
        await this.connect();
        
        // Resume playback if there was a track playing
        if (currentTrack) {
            await this.player.playTrack({ track: { encoded: currentTrack.encoded } });
            if (currentPosition > 0) {
                await this.player.seekTo(currentPosition);
            }
        }
        
        logger.info(`Queue reconnected successfully for guild ${this.guildId}`);
    }
    
    /**
     * Setup enhanced player events
     */
    setupPlayerEvents() {
        if (!this.player) return;
        
        this.player.on('start', async (data) => {
            logger.music('Track started', { 
                guildId: this.guildId,
                track: data.track?.info?.title 
            });
            this.clearLeaveTimeout();
            this.stats.tracksPlayed++;
            
            // Add to in-memory history
            if (this.current) {
                this.history.unshift({
                    track: this.current,
                    playedAt: Date.now()
                });
                if (this.history.length > this.maxHistory) {
                    this.history.pop();
                }
                
                // Add to database history (non-blocking)
                this._saveToDatabase(this.current).catch(error => {
                    logger.error('Failed to save track to database history', { 
                        guildId: this.guildId,
                        track: this.current?.info?.title,
                        error 
                    });
                });
            }
            
            if (this.nowPlayingMessage) {
                this.startProgressUpdates();
            }
        });
        
        this.player.on('end', (data) => {
            logger.music('Track ended', { guildId: this.guildId, reason: data.reason });
            this.stopProgressUpdates();
            
            if (this.current) {
                this.stats.totalDuration += this.current.info.length;
            }
            
            if (data.reason === 'replaced') return;
            
            if (this.loop === 'track' && this.current) {
                this.play(this.current);
                return;
            }
            
            if (this.loop === 'queue' && this.current) {
                this.tracks.push(this.current);
            }
            
            if (this.tracks.length > 0) {
                this.play();
            } else if (this.autoplay && this.current) {
                // Autoplay: add related track
                logger.info('Autoplay enabled, searching for related track', { guildId: this.guildId });
                this.addRelatedTrack().catch(error => {
                    logger.error('Autoplay failed', { guildId: this.guildId, error: error.message });
                    this.current = null;
                    this.scheduleLeave();
                });
            } else {
                this.current = null;
                this.scheduleLeave();
            }
        });
        
        this.player.on('exception', (data) => {
            logger.error('Player exception', { guildId: this.guildId, exception: data.exception });
            this.stats.errors++;
            
            if (this.tracks.length > 0) {
                this.play();
            } else {
                this.scheduleLeave();
            }
        });
        
        this.player.on('stuck', (data) => {
            logger.warn('Player stuck', { guildId: this.guildId, threshold: data.thresholdMs });
            if (this.tracks.length > 0) {
                this.play();
            }
        });
        
        this.player.on('closed', (data) => {
            logger.warn('WebSocket closed', { guildId: this.guildId, code: data.code, reason: data.reason });
        });
        
        this.player.on('update', (data) => {
            // Position updates
        });
    }
    
    /**
     * Apply filters to player
     */
    async applyFilters() {
        if (!this.player) {
            logger.warn('Cannot apply filters: player not connected', { guildId: this.guildId });
            return false;
        }
        
        try {
            const filters = {};
            
            // Build filters object from current state
            if (this.filters.equalizer.length > 0) {
                filters.equalizer = this.filters.equalizer;
            }
            if (this.filters.karaoke) {
                filters.karaoke = this.filters.karaoke;
            }
            if (this.filters.timescale) {
                filters.timescale = this.filters.timescale;
            }
            if (this.filters.tremolo) {
                filters.tremolo = this.filters.tremolo;
            }
            if (this.filters.vibrato) {
                filters.vibrato = this.filters.vibrato;
            }
            if (this.filters.rotation) {
                filters.rotation = this.filters.rotation;
            }
            if (this.filters.distortion) {
                filters.distortion = this.filters.distortion;
            }
            if (this.filters.channelMix) {
                filters.channelMix = this.filters.channelMix;
            }
            if (this.filters.lowPass) {
                filters.lowPass = this.filters.lowPass;
            }
            
            // CRITICAL FIX: Always call setFilters, even with empty object
            // This is required to clear filters in Lavalink
            // According to Lavalink v4 docs: "filters overrides all previously applied filters"
            await this.player.setFilters(filters);
            
            const filterCount = Object.keys(filters).length;
            if (filterCount > 0) {
                logger.info(`Applied ${filterCount} filter(s) to player`, { 
                    guildId: this.guildId, 
                    filters: Object.keys(filters) 
                });
            } else {
                logger.info('Cleared all filters from player', { guildId: this.guildId });
            }
            
            return true;
        } catch (error) {
            logger.error('Failed to apply filters', error, { guildId: this.guildId });
            return false;
        }
    }
    
    /**
     * Clear all filters and reset to default state
     * @returns {Promise<boolean>} Success status
     */
    async clearFilters() {
        try {
            // Reset all filter states to default
            this.filters = {
                equalizer: [],
                karaoke: null,
                timescale: null,
                tremolo: null,
                vibrato: null,
                rotation: null,
                distortion: null,
                channelMix: null,
                lowPass: null
            };
            
            // Apply empty filters to Lavalink
            const success = await this.applyFilters();
            
            if (success) {
                logger.info('Successfully cleared all filters', { guildId: this.guildId });
            }
            
            return success;
        } catch (error) {
            logger.error('Failed to clear filters', error, { guildId: this.guildId });
            return false;
        }
    }
    
    /**
     * Get active filter names
     * @returns {string[]} Array of active filter names
     */
    getActiveFilters() {
        const active = [];
        
        if (this.filters.equalizer.length > 0) active.push('equalizer');
        if (this.filters.karaoke) active.push('karaoke');
        if (this.filters.timescale) active.push('timescale');
        if (this.filters.tremolo) active.push('tremolo');
        if (this.filters.vibrato) active.push('vibrato');
        if (this.filters.rotation) active.push('rotation');
        if (this.filters.distortion) active.push('distortion');
        if (this.filters.channelMix) active.push('channelMix');
        if (this.filters.lowPass) active.push('lowPass');
        
        return active;
    }
    
    /**
     * Set equalizer preset
     */
    async setEqualizer(preset) {
        const presets = {
            flat: [],
            bass: [
                { band: 0, gain: 0.6 }, { band: 1, gain: 0.67 }, { band: 2, gain: 0.67 },
                { band: 3, gain: 0 }, { band: 4, gain: -0.5 }, { band: 5, gain: 0.15 },
                { band: 6, gain: -0.45 }, { band: 7, gain: 0.23 }, { band: 8, gain: 0.35 },
                { band: 9, gain: 0.45 }, { band: 10, gain: 0.55 }, { band: 11, gain: 0.6 },
                { band: 12, gain: 0.55 }, { band: 13, gain: 0 }
            ],
            rock: [
                { band: 0, gain: 0.3 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.2 },
                { band: 3, gain: 0.1 }, { band: 4, gain: 0.05 }, { band: 5, gain: -0.05 },
                { band: 6, gain: -0.15 }, { band: 7, gain: -0.2 }, { band: 8, gain: -0.1 },
                { band: 9, gain: -0.05 }, { band: 10, gain: 0.05 }, { band: 11, gain: 0.1 },
                { band: 12, gain: 0.15 }, { band: 13, gain: 0.2 }
            ],
            jazz: [
                { band: 0, gain: 0.3 }, { band: 1, gain: 0.3 }, { band: 2, gain: 0.2 },
                { band: 3, gain: 0.2 }, { band: 4, gain: -0.2 }, { band: 5, gain: -0.2 },
                { band: 6, gain: 0 }, { band: 7, gain: 0.2 }, { band: 8, gain: 0.25 },
                { band: 9, gain: 0.3 }, { band: 10, gain: 0.3 }, { band: 11, gain: 0.3 },
                { band: 12, gain: 0.3 }, { band: 13, gain: 0.3 }
            ],
            pop: [
                { band: 0, gain: -0.25 }, { band: 1, gain: -0.2 }, { band: 2, gain: -0.15 },
                { band: 3, gain: -0.1 }, { band: 4, gain: -0.05 }, { band: 5, gain: 0.05 },
                { band: 6, gain: 0.15 }, { band: 7, gain: 0.2 }, { band: 8, gain: 0.25 },
                { band: 9, gain: 0.25 }, { band: 10, gain: 0.25 }, { band: 11, gain: 0.25 },
                { band: 12, gain: 0.25 }, { band: 13, gain: 0.25 }
            ]
        };
        
        if (!presets[preset]) {
            logger.warn(`Unknown equalizer preset: ${preset}`, { guildId: this.guildId });
            return false;
        }
        
        // Clear timescale filters when applying equalizer to avoid conflicts
        this.filters.timescale = null;
        this.filters.equalizer = presets[preset];
        
        const success = await this.applyFilters();
        if (success) {
            logger.info(`Applied equalizer preset: ${preset}`, { guildId: this.guildId });
        }
        
        return success;
    }
    
    /**
     * Set nightcore filter
     */
    async setNightcore(enabled) {
        try {
            if (enabled) {
                // Clear conflicting filters
                this.filters.equalizer = [];
                this.filters.timescale = { speed: 1.1, pitch: 1.1, rate: 1 };
                logger.info('Enabled nightcore filter', { guildId: this.guildId });
            } else {
                this.filters.timescale = null;
                logger.info('Disabled nightcore filter', { guildId: this.guildId });
            }
            
            const success = await this.applyFilters();
            return success;
        } catch (error) {
            logger.error('Failed to set nightcore filter', error, { guildId: this.guildId });
            return false;
        }
    }
    
    /**
     * Set vaporwave filter
     */
    async setVaporwave(enabled) {
        try {
            if (enabled) {
                // Clear conflicting filters
                this.filters.equalizer = [];
                this.filters.timescale = { speed: 0.8, pitch: 0.8, rate: 1 };
                logger.info('Enabled vaporwave filter', { guildId: this.guildId });
            } else {
                this.filters.timescale = null;
                logger.info('Disabled vaporwave filter', { guildId: this.guildId });
            }
            
            const success = await this.applyFilters();
            return success;
        } catch (error) {
            logger.error('Failed to set vaporwave filter', error, { guildId: this.guildId });
            return false;
        }
    }
    
    /**
     * Set 8D audio filter
     */
    async set8D(enabled) {
        try {
            if (enabled) {
                this.filters.rotation = { rotationHz: 0.2 };
                logger.info('Enabled 8D audio filter', { guildId: this.guildId });
            } else {
                this.filters.rotation = null;
                logger.info('Disabled 8D audio filter', { guildId: this.guildId });
            }
            
            const success = await this.applyFilters();
            return success;
        } catch (error) {
            logger.error('Failed to set 8D filter', error, { guildId: this.guildId });
            return false;
        }
    }
    
    add(track) {
        if (Array.isArray(track)) {
            this.tracks.push(...track);
        } else {
            this.tracks.push(track);
        }
    }
    
    async play(track) {
        if (!this.player) {
            await this.connect();
        }
        
        const toPlay = track || this.tracks.shift();
        
        if (!toPlay) {
            this.current = null;
            this.scheduleLeave();
            return false;
        }
        
        this.current = toPlay;
        this.paused = false;
        
        try {
            await this.player.playTrack({ track: { encoded: toPlay.encoded } });
            return true;
        } catch (error) {
            logger.error('Failed to play track', error);
            this.stats.errors++;
            
            if (this.tracks.length > 0) {
                return await this.play();
            }
            
            return false;
        }
    }
    
    async pause() {
        if (!this.player || this.paused) return false;
        await this.player.setPaused(true);
        this.paused = true;
        await this.updateNowPlaying();
        return true;
    }
    
    async resume() {
        if (!this.player || !this.paused) return false;
        await this.player.setPaused(false);
        this.paused = false;
        await this.updateNowPlaying();
        return true;
    }
    
    async skip() {
        if (!this.player) return false;
        this.stats.skips++;
        await this.player.stopTrack();
        return true;
    }
    
    async stop() {
        this.tracks = [];
        this.current = null;
        if (this.player) {
            await this.player.stopTrack();
        }
        this.scheduleLeave();
        return true;
    }
    
    async setVolume(volume) {
        volume = Math.max(0, Math.min(100, volume));
        this.volume = volume;
        if (this.player) {
            await this.player.setGlobalVolume(volume);
        }
        return volume;
    }
    
    async seek(position) {
        if (!this.player || !this.current) return false;
        await this.player.seekTo(position);
        return true;
    }
    
    async setLoop(mode) {
        if (!['off', 'track', 'queue'].includes(mode)) {
            throw new Error('Invalid loop mode');
        }
        this.loop = mode;
        await this.updateNowPlaying();
        return mode;
    }
    
    shuffle() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
    }
    
    clear() {
        this.tracks = [];
    }
    
    remove(index) {
        if (index < 0 || index >= this.tracks.length) {
            return null;
        }
        return this.tracks.splice(index, 1)[0];
    }
    
    move(fromIndex, toIndex) {
        if (this.tracks.length === 0) return false;
        if (fromIndex === toIndex) return true;
        if (fromIndex < 0 || fromIndex >= this.tracks.length) return false;
        if (toIndex < 0 || toIndex >= this.tracks.length) return false;
        const [track] = this.tracks.splice(fromIndex, 1);
        this.tracks.splice(toIndex, 0, track);
        return true;
    }
    
    async jump(position) {
        if (!Number.isInteger(position)) return false;
        if (position < 1 || position > this.tracks.length) return false;
        const index = position - 1;
        const [track] = this.tracks.splice(index, 1);
        if (!track) return false;
        await this.play(track);
        return true;
    }
    
    scheduleLeave() {
        this.clearLeaveTimeout();
        const delay = this.manager.config.music.leaveOnEndDelay || PLAYBACK.AUTO_LEAVE_DELAY;
        if (this.manager.config.music.leaveOnEnd) {
            this.leaveTimeout = setTimeout(() => {
                this.destroy();
            }, delay);
        }
    }
    
    clearLeaveTimeout() {
        if (this.leaveTimeout) {
            clearTimeout(this.leaveTimeout);
            this.leaveTimeout = null;
        }
    }
    
    startProgressUpdates() {
        this.stopProgressUpdates();
        this.updateInterval = setInterval(async () => {
            try {
                await this.updateNowPlaying();
            } catch (error) {
                logger.error('Failed to update now playing message', error);
            }
        }, TIME.PROGRESS_UPDATE_INTERVAL);
    }
    
    stopProgressUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    async updateNowPlaying() {
        if (!this.nowPlayingMessage || !this.current || !this.player) {
            return;
        }
        
        try {
            const { createNowPlayingEmbed } = await import('../../UI/embeds/MusicEmbeds.js');
            const { createNowPlayingButtons } = await import('../../UI/components/MusicControls.js');
            
            const currentPosition = this.player.position || 0;
            const embed = createNowPlayingEmbed(this.current, this, this.manager.config, currentPosition);
            const components = createNowPlayingButtons(this, false);
            
            await this.nowPlayingMessage.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            if (error.code === 10008 || error.code === 50001) {
                this.nowPlayingMessage = null;
                this.stopProgressUpdates();
            } else {
                logger.error('Failed to update now playing embed', error);
            }
        }
    }
    
    setNowPlayingMessage(message) {
        this.nowPlayingMessage = message;
        if (message && this.current) {
            this.startProgressUpdates();
        } else {
            this.stopProgressUpdates();
        }
    }
    
    /**
     * Set autoplay state
     */
    setAutoplay(enabled) {
        this.autoplay = enabled;
        logger.music(`Autoplay ${enabled ? 'enabled' : 'disabled'}`, { guildId: this.guildId });
    }
    
    /**
     * Add a related track when queue is empty (autoplay feature)
     */
    async addRelatedTrack() {
        if (!this.current || !this.current.info) {
            logger.warn('Cannot add related track: no current track', { guildId: this.guildId });
            return;
        }
        
        try {
            const track = this.current;
            const title = track.info.title;
            const author = track.info.author;
            
            // Build multiple search strategies for better results
            const searchStrategies = [
                `${author} ${title} official audio`,  // Primary: Same artist + title
                `${author} top songs hits`,           // Fallback 1: Artist's popular tracks
                `${title.split(' ').slice(0, 3).join(' ')} remix cover`,  // Fallback 2: Similar title variations
                `trending ${author.split(' ')[0]} music 2025`  // Fallback 3: Trending from artist
            ];
            
            logger.info('Autoplay searching for related track', { 
                guildId: this.guildId,
                currentTrack: title,
                currentAuthor: author,
                strategies: searchStrategies.length
            });
            
            let result = null;
            let strategyUsed = 0;
            
            // Try strategies in order until we get results
            for (let i = 0; i < searchStrategies.length && !result; i++) {
                try {
                    const searchQuery = searchStrategies[i];
                    logger.debug(`Autoplay strategy ${i + 1}: ${searchQuery}`, { guildId: this.guildId });
                    
                    const searchResult = await this.manager.search(`ytsearch:${searchQuery}`, null);
                    
                    if (searchResult && searchResult.tracks && searchResult.tracks.length > 0) {
                        result = searchResult;
                        strategyUsed = i + 1;
                        logger.debug(`Autoplay strategy ${i + 1} succeeded with ${searchResult.tracks.length} results`);
                        break;
                    }
                } catch (error) {
                    logger.debug(`Autoplay strategy ${i + 1} failed: ${error.message}`);
                }
            }
            
            if (!result || !result.tracks || result.tracks.length === 0) {
                logger.warn('Autoplay: No related tracks found after all strategies', { guildId: this.guildId });
                this.current = null;
                this.scheduleLeave();
                return;
            }
            
            // Filter out recently played tracks and current track
            const currentLower = title.toLowerCase();
            const recentTitles = new Set(
                this.history.slice(0, 5).map(h => h.track?.info?.title?.toLowerCase())
            );
            
            const candidates = result.tracks.filter(t => {
                const tTitle = t.info?.title?.toLowerCase() || '';
                // Skip if same as current or recently played
                if (tTitle === currentLower || recentTitles.has(tTitle)) {
                    return false;
                }
                // Skip if too short (likely ads/intros)
                if (t.info?.length < 60000) {
                    return false;
                }
                return true;
            });
            
            if (candidates.length === 0) {
                logger.warn('Autoplay: All results were filtered out (recent/duplicate/too short)', { guildId: this.guildId });
                // Use first track as last resort
                if (result.tracks.length > 1) {
                    const fallback = result.tracks[1]; // Skip first to avoid exact duplicate
                    fallback.requester = 'autoplay';
                    this.tracks.push(fallback);
                    logger.info('Autoplay: Added fallback track', { 
                        guildId: this.guildId,
                        track: fallback.info.title
                    });
                    await this.play();
                    
                    // Send notification
                    await this._sendAutoplayNotification(fallback);
                    return;
                }
                this.current = null;
                this.scheduleLeave();
                return;
            }
            
            // Select a random track from candidates for variety
            const selectedTrack = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
            selectedTrack.requester = 'autoplay';
            
            logger.info('Autoplay: Added related track', { 
                guildId: this.guildId,
                track: selectedTrack.info.title,
                author: selectedTrack.info.author,
                strategy: strategyUsed,
                candidatesCount: candidates.length
            });
            
            this.tracks.push(selectedTrack);
            await this.play();
            
            // Send notification
            await this._sendAutoplayNotification(selectedTrack);
            
        } catch (error) {
            logger.error('Autoplay error', { guildId: this.guildId, error: error.message, stack: error.stack });
            this.current = null;
            this.scheduleLeave();
        }
    }
    
    /**
     * Send autoplay notification to text channel
     * @private
     */
    async _sendAutoplayNotification(track) {
        if (!this.textChannel || !track) return;
        
        try {
            const { EmbedBuilder } = await import('discord.js');
            
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setDescription(`🎵 **Autoplay:** Thêm [${track.info.title}](${track.info.uri})\nBởi ${track.info.author}`)
                .setFooter({ text: 'Dùng /autoplay để tắt' });
            
            await this.textChannel.send({ embeds: [embed] });
        } catch (error) {
            logger.debug('Could not send autoplay notification', { guildId: this.guildId, error: error.message });
        }
    }
    
    async destroy() {
        this.clearLeaveTimeout();
        this.stopProgressUpdates();
        
        if (this.player) {
            try {
                await this.manager.shoukaku.leaveVoiceChannel(this.guildId);
            } catch (err) {
                logger.warn('Error leaving voice channel', err);
            }
            this.player = null;
        }
        
        this.tracks = [];
        this.current = null;
        this.nowPlayingMessage = null;
        
        this.manager.queues.delete(this.guildId);
    }
    
    /**
     * Save track to database history (non-blocking)
     * @private
     */
    async _saveToDatabase(track) {
        try {
            // Dynamically import to avoid circular dependencies
            const { default: History } = await import('../database/models/History.js');
            
            // Get requester from track metadata
            const userId = track.requester || track.requesterId || 'unknown';
            
            // Save to database
            History.add(this.guildId, userId, track);
            
            logger.debug('Track saved to database history', { 
                guildId: this.guildId, 
                track: track.info?.title,
                userId 
            });
        } catch (error) {
            // Don't throw - this is a non-critical operation
            logger.warn('Failed to save track to database history', { 
                guildId: this.guildId,
                track: track?.info?.title,
                error: error.message 
            });
        }
    }
    
    /**
     * Get queue statistics
     */
    getStats() {
        return {
            ...this.stats,
            queueLength: this.tracks.length,
            historyLength: this.history.length,
            volume: this.volume,
            loop: this.loop,
            paused: this.paused,
            activeFilters: Object.keys(this.filters).filter(k => this.filters[k] !== null)
        };
    }
}

export default MusicManager;
