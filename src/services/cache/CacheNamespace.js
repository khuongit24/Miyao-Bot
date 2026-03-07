/**
 * Cache Namespace
 * Individual cache namespace with LRU eviction and memory budgeting.
 * Extracted from CacheManager.js for better separation of concerns.
 *
 * @module CacheNamespace
 * @version 1.9.0
 */

/**
 * Individual cache namespace with LRU eviction.
 * Uses Map insertion order for LRU tracking (delete + re-insert on access).
 *
 * @example
 * const ns = new CacheNamespace('search', 50 * 1024 * 1024, 5 * 60 * 1000);
 * ns.set('query:hello', searchResults);
 * const cached = ns.get('query:hello');
 */
export class CacheNamespace {
    /**
     * Create a new cache namespace.
     *
     * @param {string} name - Namespace name for identification
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
     * Set a value in the cache.
     * Automatically evicts LRU entries if the namespace exceeds its budget.
     *
     * @param {string} key - Cache key
     * @param {*} value - Value to cache (must be JSON-serializable for size estimation)
     * @param {number|null} [ttlMs=null] - Optional custom TTL, falls back to namespace default
     * @returns {boolean} Always true
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
     * Get a value from the cache.
     * Returns null if key doesn't exist or entry has expired.
     * Moves accessed entry to end of Map (most recently used).
     *
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
     * Check if a key exists without affecting LRU order.
     *
     * @param {string} key - Cache key
     * @returns {boolean} Whether key exists and is not expired
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
     * Delete a key from the cache.
     *
     * @param {string} key - Cache key
     * @returns {boolean} Whether the key was found and deleted
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
     * Clear all entries and reset size tracking.
     */
    clear() {
        this.cache.clear();
        this.currentSizeBytes = 0;
    }

    /**
     * Get namespace statistics including hit rate and memory usage.
     *
     * @returns {{name: string, hits: number, misses: number, evictions: number, sets: number, hitRate: string, size: number, currentSizeBytes: number, currentSizeMB: string, budgetBytes: number, budgetMB: string, usagePercent: string}}
     */
    getStats() {
        const hitRate =
            this.stats.hits + this.stats.misses > 0
                ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2)
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
     * Evict least recently used entry (first item in Map).
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
     * Prune all expired entries.
     *
     * @returns {number} Number of entries removed
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
     * Estimate size of a value in bytes using JSON serialization.
     * Falls back to 1000 bytes for non-serializable values.
     * @private
     *
     * @param {*} value - Value to estimate
     * @returns {number} Estimated size in bytes
     */
    _estimateSize(value) {
        try {
            return JSON.stringify(value).length * 2; // UTF-16
        } catch {
            return 1000; // Default estimate
        }
    }

    /**
     * Force evict a percentage of entries (by count).
     * Used during global memory pressure events.
     *
     * @param {number} percentage - Percentage of entries to evict (0-1)
     * @returns {number} Number of entries actually evicted
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

export default CacheNamespace;
