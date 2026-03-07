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
 * 5. Supports configuration via config.json
 * 6. Supports runtime budget adjustment
 *
 * @module CacheManager
 */

import { EventEmitter } from 'events';
import logger from '../../utils/logger.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Default cache budgets as percentages of total budget
 */
const DEFAULT_CACHE_BUDGETS = {
    searchCache: 0.4, // 40% for search results cache (hot)
    searchResults: 0.2, // 20% for ephemeral search selections
    discovery: 0.1, // 10% for discovery cache
    similar: 0.1, // 10% for similar tracks cache
    trending: 0.1, // 10% for trending cache
    history: 0.05, // 5% for history replay cache
    other: 0.05 // 5% for miscellaneous
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
 * Load cache configuration from config.json
 * @returns {Object|null} Cache configuration or null if not found
 */
function loadConfigFromFile() {
    try {
        // Get directory of current module
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        // Try to load config.json from src/config/
        const configPath = join(__dirname, '../../config/config.json');

        if (!existsSync(configPath)) {
            logger.debug('Config file not found, using default cache configuration');
            return null;
        }

        const configContent = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        if (!config.cache) {
            logger.debug('No cache configuration in config.json, using defaults');
            return null;
        }

        // Convert MB to bytes for totalBudget
        const cacheConfig = {
            totalBudgetBytes: (config.cache.totalBudgetMB || 200) * 1024 * 1024,
            defaultTTLMs: config.cache.defaultTTLMs || DEFAULT_CONFIG.defaultTTLMs,
            cleanupIntervalMs: config.cache.cleanupIntervalMs || DEFAULT_CONFIG.cleanupIntervalMs,
            enableGlobalEviction: config.cache.enableGlobalEviction ?? DEFAULT_CONFIG.enableGlobalEviction,
            evictionPercentage: config.cache.evictionPercentage || DEFAULT_CONFIG.evictionPercentage,
            budgets: config.cache.budgets || DEFAULT_CACHE_BUDGETS
        };

        logger.info('Loaded cache configuration from config.json', {
            totalBudgetMB: config.cache.totalBudgetMB || 200,
            budgets: Object.keys(cacheConfig.budgets)
        });

        return cacheConfig;
    } catch (error) {
        logger.warn('Failed to load cache configuration from file, using defaults', {
            error: error.message
        });
        return null;
    }
}

/**
 * Validate cache budget configuration
 * @param {Object} budgets - Budget allocations
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateBudgets(budgets) {
    const errors = [];
    let total = 0;

    for (const [name, percentage] of Object.entries(budgets)) {
        if (typeof percentage !== 'number') {
            errors.push(`Budget "${name}" must be a number`);
            continue;
        }

        if (percentage < 0 || percentage > 1) {
            errors.push(`Budget "${name}" must be between 0 and 1 (got ${percentage})`);
        }

        total += percentage;
    }

    // Allow small floating point error (0.99 to 1.001) — reject over-allocation above 100.1%
    if (total < 0.99 || total > 1.001) {
        errors.push(`Budget percentages must sum to 1.0 (got ${total.toFixed(4)})`);
    }

    // Normalize budgets to sum exactly to 1.0 to prevent drift
    if (errors.length === 0 && total !== 1.0) {
        for (const name of Object.keys(budgets)) {
            budgets[name] = budgets[name] / total;
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// Import CacheNamespace from extracted module (v1.9.0)
import { CacheNamespace } from './CacheNamespace.js';

/**
 * Unified Cache Manager
 * Manages multiple cache namespaces with a shared memory budget
 * @extends EventEmitter
 */
class CacheManager extends EventEmitter {
    /**
     * Create a new CacheManager
     * @param {Object} config - Configuration options (overrides config.json and defaults)
     */
    constructor(config = {}) {
        super();

        // Load configuration: config.json > passed config > defaults
        const fileConfig = loadConfigFromFile();
        this.config = {
            ...DEFAULT_CONFIG,
            ...fileConfig,
            ...config
        };

        // Budget priority: passed config > fileConfig > defaults
        // If config.budgets is provided directly, use it exclusively (don't merge with defaults)
        // This allows tests to provide custom budgets without merging with defaults
        if (config.budgets && Object.keys(config.budgets).length > 0) {
            this.config.budgets = config.budgets;
        } else if (fileConfig?.budgets && Object.keys(fileConfig.budgets).length > 0) {
            this.config.budgets = { ...DEFAULT_CACHE_BUDGETS, ...fileConfig.budgets };
        } else {
            this.config.budgets = DEFAULT_CACHE_BUDGETS;
        }

        // Validate budgets
        const validation = validateBudgets(this.config.budgets);
        if (!validation.valid) {
            logger.warn('Invalid cache budgets detected', { errors: validation.errors });
            // Use defaults if invalid
            this.config.budgets = DEFAULT_CACHE_BUDGETS;
        }

        this.namespaces = new Map();
        this.cleanupInterval = null;

        // Create default namespaces based on budget allocations
        for (const [name, percentage] of Object.entries(this.config.budgets)) {
            const budgetBytes = Math.floor(this.config.totalBudgetBytes * percentage);
            this.createNamespace(name, budgetBytes, this.config.defaultTTLMs);
        }

        logger.info('CacheManager initialized', {
            totalBudgetMB: (this.config.totalBudgetBytes / 1024 / 1024).toFixed(0),
            namespaces: [...this.namespaces.keys()],
            configSource: fileConfig ? 'config.json' : 'defaults'
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
        this.cleanupInterval.unref();

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

        const namespace = new CacheNamespace(name, budgetBytes, ttlMs || this.config.defaultTTLMs);

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
        const totalHitRate =
            totalHits + totalMisses > 0 ? ((totalHits / (totalHits + totalMisses)) * 100).toFixed(2) : 0;

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
        // Calculate how much each namespace is over its budget
        const totalOver = [...this.namespaces.values()].reduce(
            (sum, ns) => sum + Math.max(0, ns.currentSizeBytes - ns.budgetBytes),
            0
        );

        // Proportional eviction: evict from each namespace based on how over-budget it is
        let totalEvicted = 0;
        for (const ns of this.namespaces.values()) {
            const over = Math.max(0, ns.currentSizeBytes - ns.budgetBytes);
            if (over > 0 && totalOver > 0) {
                const proportion = over / totalOver;
                const evicted = ns.forceEvict(Math.min(1, proportion * 0.3));
                totalEvicted += evicted;

                logger.debug(
                    `Global eviction from ${ns.name}: ${evicted} entries (proportion: ${(proportion * 100).toFixed(1)}%)`
                );
            }
        }

        // If still over budget after proportional eviction, fall back to evicting from largest consumers
        if (this.getTotalMemoryUsage() > this.config.totalBudgetBytes * 0.9) {
            const sortedNamespaces = [...this.namespaces.values()].sort((a, b) => {
                const aUsage = a.currentSizeBytes / a.budgetBytes;
                const bUsage = b.currentSizeBytes / b.budgetBytes;
                return bUsage - aUsage;
            });

            for (const ns of sortedNamespaces) {
                if (ns.currentSizeBytes > 0) {
                    const evicted = ns.forceEvict(this.config.evictionPercentage);
                    totalEvicted += evicted;

                    logger.debug(`Fallback eviction from ${ns.name}: ${evicted} entries`);
                }

                if (this.getTotalMemoryUsage() <= this.config.totalBudgetBytes * 0.9) {
                    break;
                }
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

    /**
     * Update cache budgets at runtime
     * @param {Object} newBudgets - New budget allocations (partial or full)
     * @returns {{success: boolean, errors?: string[]}}
     */
    updateBudgets(newBudgets) {
        // Merge with current budgets
        const mergedBudgets = { ...this.config.budgets, ...newBudgets };

        // Validate
        const validation = validateBudgets(mergedBudgets);
        if (!validation.valid) {
            logger.warn('Invalid budget update rejected', { errors: validation.errors });
            return { success: false, errors: validation.errors };
        }

        // Apply new budgets
        this.config.budgets = mergedBudgets;

        // Update namespace budgets
        for (const [name, percentage] of Object.entries(mergedBudgets)) {
            const newBudgetBytes = Math.floor(this.config.totalBudgetBytes * percentage);
            const namespace = this.namespaces.get(name);

            if (namespace) {
                const oldBudget = namespace.budgetBytes;
                namespace.budgetBytes = newBudgetBytes;

                logger.debug(`Updated budget for ${name}`, {
                    oldMB: (oldBudget / 1024 / 1024).toFixed(2),
                    newMB: (newBudgetBytes / 1024 / 1024).toFixed(2)
                });
            } else {
                // Create new namespace if doesn't exist
                this.createNamespace(name, newBudgetBytes, this.config.defaultTTLMs);
            }
        }

        logger.info('Cache budgets updated', { budgets: mergedBudgets });
        this.emit('budgetsUpdated', mergedBudgets);

        // Trigger global memory check after budget change
        this._checkGlobalMemory();

        return { success: true };
    }

    /**
     * Update total memory budget at runtime
     * @param {number} newBudgetMB - New total budget in megabytes
     * @returns {boolean} Success
     */
    updateTotalBudget(newBudgetMB) {
        if (typeof newBudgetMB !== 'number' || newBudgetMB < 10) {
            logger.warn('Invalid total budget update', { value: newBudgetMB });
            return false;
        }

        const oldBudget = this.config.totalBudgetBytes;
        this.config.totalBudgetBytes = newBudgetMB * 1024 * 1024;

        // Recalculate namespace budgets
        for (const [name, percentage] of Object.entries(this.config.budgets)) {
            const namespace = this.namespaces.get(name);
            if (namespace) {
                namespace.budgetBytes = Math.floor(this.config.totalBudgetBytes * percentage);
            }
        }

        logger.info('Total cache budget updated', {
            oldMB: (oldBudget / 1024 / 1024).toFixed(0),
            newMB: newBudgetMB
        });

        this.emit('totalBudgetUpdated', { oldBytes: oldBudget, newBytes: this.config.totalBudgetBytes });

        // Trigger global memory check
        this._checkGlobalMemory();

        return true;
    }

    /**
     * Get current configuration (read-only copy)
     * @returns {Object}
     */
    getConfig() {
        return {
            totalBudgetMB: (this.config.totalBudgetBytes / 1024 / 1024).toFixed(0),
            totalBudgetBytes: this.config.totalBudgetBytes,
            defaultTTLMs: this.config.defaultTTLMs,
            cleanupIntervalMs: this.config.cleanupIntervalMs,
            enableGlobalEviction: this.config.enableGlobalEviction,
            evictionPercentage: this.config.evictionPercentage,
            budgets: { ...this.config.budgets }
        };
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
