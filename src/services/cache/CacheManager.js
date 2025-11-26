/**
 * Unified Cache Manager
 * 
 * Problem: Multiple disconnected caches with no shared memory budget:
 * - client._lastSearchResults
 * - client._historyCache  
 * - client._discoveryCache
 * - client._similarCache
 * - client._trendingCache
 * - musicManager.searchCache
 * 
 * Solution: A unified cache manager that:
 * 1. Maintains a total memory budget (default: 200MB)
 * 2. Allocates budgets to individual caches
 * 3. Performs global eviction when total exceeds budget
 * 4. Provides consistent TTL and LRU behavior across all caches
 * 
 * @module CacheManager
 */

import { EventEmitter } from 'events';
import logger from '../../utils/logger.js';

/**
 * Default cache budgets as percentages of total budget
 */
const DEFAULT_CACHE_BUDGETS = {
    searchCache: 0.40,      // 40% for search results cache (hot)
    searchResults: 0.20,    // 20% for ephemeral search selections
    discovery: 0.10,        // 10% for discovery cache
    similar: 0.10,          // 10% for similar tracks cache
    trending: 0.10,         // 10% for trending cache
    history: 0.05,          // 5% for history replay cache
    other: 0.05             // 5% for miscellaneous
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    /** Total memory budget in bytes (default: 200MB) */
    totalBudgetBytes: 200 * 1024 * 1024,
    /** Default TTL for cache entries in milliseconds */
    defaultTTLMs: 5 * 60 * 1000, // 5 minutes
    /** Cleanup check interval in milliseconds */
    cleanupIntervalMs: 60 * 1000, // 1 minute
    /** Enable global eviction when total exceeds budget */
    enableGlobalEviction: true,
    /** Percentage of budget to evict when over limit (0-1) */
    evictionPercentage: 0.2, // Evict 20% when over budget
    /** Cache budget allocations */
    budgets: DEFAULT_CACHE_BUDGETS
};

/**
 * Individual cache namespace with LRU eviction
 */
class CacheNamespace {
    /**
     * Create a new cache namespace
     * @param {string} name - Namespace name
     * @param {number} budgetBytes - Memory budget in bytes
     * @param {number} ttlMs - Default TTL in milliseconds
     */
    constructor(name, budgetBytes, ttlMs) {
        this.name = name;
        this.budgetBytes = budgetBytes;
        this.ttlMs = ttlMs;
        this.cache = new Map(); // LRU via Map insertion order
        this.currentSizeBytes = 0;
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            sets: 0
        };
    }

    /**
     * Set a value in the cache
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttlMs - Optional custom TTL
     * @returns {boolean} Success
     */
    set(key, value, ttlMs = null) {
        // Remove existing entry first (for size tracking and LRU update)
        if (this.cache.has(key)) {
            const existing = this.cache.get(key);
            this.currentSizeBytes -= existing.size;
            this.cache.delete(key);
        }

        const size = this._estimateSize(value);
        
        // Evict entries if over budget
        while (this.currentSizeBytes + size > this.budgetBytes && this.cache.size > 0) {
            this._evictLRU();
        }

        const entry = {
            value,
            timestamp: Date.now(),
            ttl: ttlMs || this.ttlMs,
            size
        };

        this.cache.set(key, entry);
        this.currentSizeBytes += size;
        this.stats.sets++;

        return true;
    }

    /**
     * Get a value from the cache
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            this.currentSizeBytes -= entry.size;
            this.stats.misses++;
            return null;
        }

        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        
        this.stats.hits++;
        return entry.value;
    }

    /**
     * Check if a key exists (without affecting LRU)
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;
        
        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            this.currentSizeBytes -= entry.size;
            return false;
        }
        
        return true;
    }

    /**
     * Delete a key from the cache
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    delete(key) {
        const entry = this.cache.get(key);
        if (entry) {
            this.currentSizeBytes -= entry.size;
            return this.cache.delete(key);
        }
        return false;
    }

    /**
     * Clear all entries
     */
    clear() {
        this.cache.clear();
        this.currentSizeBytes = 0;
    }

    /**
     * Get namespace statistics
     * @returns {Object}
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0;

        return {
            name: this.name,
            ...this.stats,
            hitRate: `${hitRate}%`,
            size: this.cache.size,
            currentSizeBytes: this.currentSizeBytes,
            currentSizeMB: (this.currentSizeBytes / 1024 / 1024).toFixed(2),
            budgetBytes: this.budgetBytes,
            budgetMB: (this.budgetBytes / 1024 / 1024).toFixed(2),
            usagePercent: ((this.currentSizeBytes / this.budgetBytes) * 100).toFixed(1)
        };
    }

    /**
     * Evict least recently used entry
     * @private
     */
    _evictLRU() {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
            const entry = this.cache.get(firstKey);
            this.currentSizeBytes -= entry.size;
            this.cache.delete(firstKey);
            this.stats.evictions++;
        }
    }

    /**
     * Prune expired entries
     * @returns {number} Number of entries pruned
     */
    pruneExpired() {
        const now = Date.now();
        let pruned = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.currentSizeBytes -= entry.size;
                this.cache.delete(key);
                pruned++;
            }
        }
        
        return pruned;
    }

    /**
     * Estimate size of a value in bytes
     * @private
     */
    _estimateSize(value) {
        try {
            return JSON.stringify(value).length * 2; // UTF-16
        } catch {
            return 1000; // Default estimate
        }
    }

    /**
     * Force evict a percentage of entries
     * @param {number} percentage - Percentage to evict (0-1)
     * @returns {number} Number of entries evicted
     */
    forceEvict(percentage) {
        const targetCount = Math.ceil(this.cache.size * percentage);
        let evicted = 0;
        
        while (evicted < targetCount && this.cache.size > 0) {
            this._evictLRU();
            evicted++;
        }
        
        return evicted;
    }
}

/**
 * Unified Cache Manager
 * Manages multiple cache namespaces with a shared memory budget
 * @extends EventEmitter
 */
class CacheManager extends EventEmitter {
    /**
     * Create a new CacheManager
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        super();
        
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.config.budgets = { ...DEFAULT_CACHE_BUDGETS, ...config.budgets };
        
        this.namespaces = new Map();
        this.cleanupInterval = null;
        
        // Create default namespaces based on budget allocations
        for (const [name, percentage] of Object.entries(this.config.budgets)) {
            const budgetBytes = Math.floor(this.config.totalBudgetBytes * percentage);
            this.createNamespace(name, budgetBytes, this.config.defaultTTLMs);
        }
        
        logger.info('CacheManager initialized', {
            totalBudgetMB: (this.config.totalBudgetBytes / 1024 / 1024).toFixed(0),
            namespaces: [...this.namespaces.keys()]
        });
    }

    /**
     * Start the cache manager (periodic cleanup)
     */
    start() {
        if (this.cleanupInterval) {
            return;
        }
        
        this.cleanupInterval = setInterval(() => {
            this._periodicCleanup();
        }, this.config.cleanupIntervalMs);
        
        logger.info('CacheManager started');
    }

    /**
     * Stop the cache manager
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        logger.info('CacheManager stopped');
    }

    /**
     * Create a new cache namespace
     * @param {string} name - Namespace name
     * @param {number} budgetBytes - Memory budget in bytes
     * @param {number} ttlMs - Default TTL in milliseconds
     * @returns {CacheNamespace}
     */
    createNamespace(name, budgetBytes, ttlMs = null) {
        if (this.namespaces.has(name)) {
            return this.namespaces.get(name);
        }
        
        const namespace = new CacheNamespace(
            name,
            budgetBytes,
            ttlMs || this.config.defaultTTLMs
        );
        
        this.namespaces.set(name, namespace);
        
        logger.debug(`Cache namespace created: ${name}`, {
            budgetMB: (budgetBytes / 1024 / 1024).toFixed(2)
        });
        
        return namespace;
    }

    /**
     * Get a cache namespace by name
     * @param {string} name - Namespace name
     * @returns {CacheNamespace|null}
     */
    getNamespace(name) {
        return this.namespaces.get(name) || null;
    }

    /**
     * Set a value in a specific namespace
     * @param {string} namespace - Namespace name
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttlMs - Optional custom TTL
     * @returns {boolean} Success
     */
    set(namespace, key, value, ttlMs = null) {
        const ns = this.namespaces.get(namespace);
        if (!ns) {
            logger.warn(`Cache namespace not found: ${namespace}`);
            return false;
        }
        
        const result = ns.set(key, value, ttlMs);
        
        // Check global memory after set
        if (this.config.enableGlobalEviction) {
            this._checkGlobalMemory();
        }
        
        return result;
    }

    /**
     * Get a value from a specific namespace
     * @param {string} namespace - Namespace name
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    get(namespace, key) {
        const ns = this.namespaces.get(namespace);
        if (!ns) {
            return null;
        }
        return ns.get(key);
    }

    /**
     * Check if a key exists in a namespace
     * @param {string} namespace - Namespace name
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(namespace, key) {
        const ns = this.namespaces.get(namespace);
        if (!ns) {
            return false;
        }
        return ns.has(key);
    }

    /**
     * Delete a key from a namespace
     * @param {string} namespace - Namespace name
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    delete(namespace, key) {
        const ns = this.namespaces.get(namespace);
        if (!ns) {
            return false;
        }
        return ns.delete(key);
    }

    /**
     * Clear a specific namespace
     * @param {string} namespace - Namespace name
     */
    clearNamespace(namespace) {
        const ns = this.namespaces.get(namespace);
        if (ns) {
            ns.clear();
            logger.debug(`Cache namespace cleared: ${namespace}`);
        }
    }

    /**
     * Clear all namespaces
     */
    clearAll() {
        for (const ns of this.namespaces.values()) {
            ns.clear();
        }
        logger.info('All cache namespaces cleared');
    }

    /**
     * Get total memory usage across all namespaces
     * @returns {number} Total bytes used
     */
    getTotalMemoryUsage() {
        let total = 0;
        for (const ns of this.namespaces.values()) {
            total += ns.currentSizeBytes;
        }
        return total;
    }

    /**
     * Get comprehensive statistics
     * @returns {Object}
     */
    getStats() {
        const namespaceStats = {};
        let totalHits = 0;
        let totalMisses = 0;
        let totalEvictions = 0;
        let totalEntries = 0;
        
        for (const [name, ns] of this.namespaces.entries()) {
            const stats = ns.getStats();
            namespaceStats[name] = stats;
            totalHits += stats.hits;
            totalMisses += stats.misses;
            totalEvictions += stats.evictions;
            totalEntries += stats.size;
        }
        
        const totalMemory = this.getTotalMemoryUsage();
        const totalHitRate = totalHits + totalMisses > 0
            ? (totalHits / (totalHits + totalMisses) * 100).toFixed(2)
            : 0;

        return {
            totalMemoryBytes: totalMemory,
            totalMemoryMB: (totalMemory / 1024 / 1024).toFixed(2),
            budgetBytes: this.config.totalBudgetBytes,
            budgetMB: (this.config.totalBudgetBytes / 1024 / 1024).toFixed(0),
            usagePercent: ((totalMemory / this.config.totalBudgetBytes) * 100).toFixed(1),
            totalEntries,
            totalHits,
            totalMisses,
            totalEvictions,
            totalHitRate: `${totalHitRate}%`,
            namespaces: namespaceStats
        };
    }

    /**
     * Check global memory and evict if over budget
     * @private
     */
    _checkGlobalMemory() {
        const totalUsage = this.getTotalMemoryUsage();
        
        if (totalUsage > this.config.totalBudgetBytes) {
            logger.warn('Global cache budget exceeded, performing eviction', {
                usageMB: (totalUsage / 1024 / 1024).toFixed(2),
                budgetMB: (this.config.totalBudgetBytes / 1024 / 1024).toFixed(0)
            });
            
            this._globalEviction();
            
            this.emit('overBudget', {
                usageBefore: totalUsage,
                usageAfter: this.getTotalMemoryUsage(),
                budget: this.config.totalBudgetBytes
            });
        }
    }

    /**
     * Perform global eviction across all namespaces
     * @private
     */
    _globalEviction() {
        // Sort namespaces by usage percentage (highest first)
        const sortedNamespaces = [...this.namespaces.values()].sort((a, b) => {
            const aUsage = a.currentSizeBytes / a.budgetBytes;
            const bUsage = b.currentSizeBytes / b.budgetBytes;
            return bUsage - aUsage;
        });
        
        // Evict from namespaces that are over their budget first
        let totalEvicted = 0;
        for (const ns of sortedNamespaces) {
            if (ns.currentSizeBytes > 0) {
                const evicted = ns.forceEvict(this.config.evictionPercentage);
                totalEvicted += evicted;
                
                logger.debug(`Global eviction from ${ns.name}: ${evicted} entries`);
            }
            
            // Check if we're back under budget
            if (this.getTotalMemoryUsage() <= this.config.totalBudgetBytes * 0.9) {
                break;
            }
        }
        
        logger.info(`Global eviction complete: ${totalEvicted} total entries evicted`);
    }

    /**
     * Periodic cleanup task
     * @private
     */
    _periodicCleanup() {
        let totalPruned = 0;
        
        for (const ns of this.namespaces.values()) {
            totalPruned += ns.pruneExpired();
        }
        
        if (totalPruned > 0) {
            logger.debug(`Periodic cache cleanup: ${totalPruned} expired entries removed`);
        }
        
        // Also check global memory
        this._checkGlobalMemory();
    }

    /**
     * Graceful shutdown
     */
    shutdown() {
        this.stop();
        this.clearAll();
        logger.info('CacheManager shutdown complete');
    }
}

// Singleton instance
let instance = null;

/**
 * Get or create CacheManager singleton
 * @param {Object} config - Configuration (only used on first call)
 * @returns {CacheManager}
 */
export function getCacheManager(config) {
    if (!instance) {
        instance = new CacheManager(config);
    }
    return instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetCacheManager() {
    if (instance) {
        instance.shutdown();
        instance = null;
    }
}

export { CacheManager, CacheNamespace, DEFAULT_CACHE_BUDGETS };
export default CacheManager;
