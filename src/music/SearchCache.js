/**
 * @file SearchCache.js
 * @description Enhanced Search Cache with TTL, TRUE LRU eviction, compression, and warming
 * @version 1.8.0 - Extracted from MusicManagerEnhanced.js
 * 
 * Implementation: Uses Map's insertion order property for LRU tracking.
 * On access, we delete and re-insert the entry to move it to the end (most recently used).
 * On eviction, we remove the first entry (least recently used).
 * 
 * This is a proper O(1) LRU implementation using ES6 Map.
 */

import logger from '../utils/logger.js';
import { TIME, CACHE } from '../utils/constants.js';

export class SearchCache {
    /**
     * Create a new SearchCache
     * @param {number} maxSize - Maximum number of entries (default: 100)
     * @param {number} ttlMs - Time to live in milliseconds (default: 5 minutes)
     */
    constructor(maxSize = CACHE.MAX_SIZE, ttlMs = TIME.SEARCH_CACHE_TTL) {
        this.cache = new Map(); // Map maintains insertion order
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            compressionSavings: 0
        };
    }

    /**
     * Set a value in the cache
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {boolean} compress - Whether to compress the value
     */
    set(key, value, compress = false) {
        // If key already exists, delete it first (to update position to end)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        
        // Evict LRU item if at capacity
        while (this.cache.size >= this.maxSize) {
            this._evictLRU();
        }

        const entry = {
            value,
            timestamp: Date.now(),
            compressed: compress,
            size: this._estimateSize(value)
        };

        // Compress large objects if requested
        if (compress && entry.size > 10000) {
            entry.value = this._compress(value);
            const newSize = this._estimateSize(entry.value);
            this.stats.compressionSavings += (entry.size - newSize);
            entry.size = newSize;
        }

        this.cache.set(key, entry);
    }

    /**
     * Get a value from the cache
     * Moves the accessed entry to the end (most recently used)
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
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        // TRUE LRU: Move to end by deleting and re-inserting
        // This makes the entry the "most recently used"
        this.cache.delete(key);
        this.cache.set(key, entry);
        
        this.stats.hits++;

        // Decompress if needed
        return entry.compressed ? this._decompress(entry.value) : entry.value;
    }

    /**
     * Check if a key exists in cache (without affecting LRU order)
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;
        
        // Check if expired
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }

    /**
     * Delete a specific key from cache
     * @param {string} key - Cache key
     * @returns {boolean} Whether the key existed
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Evict the least recently used entry (first entry in Map)
     * @returns {boolean} Whether an entry was evicted
     * @private
     */
    _evictLRU() {
        // Map.keys().next().value returns the first (oldest) key
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
            this.cache.delete(firstKey);
            this.stats.evictions++;
            logger.debug(`LRU eviction: removed key "${firstKey}"`);
            return true;
        }
        return false;
    }

    /**
     * Public method to manually evict LRU entry
     * Used by memory cleanup routines
     * @returns {boolean} Whether an entry was evicted
     */
    evictLRU() {
        return this._evictLRU();
    }

    /**
     * Compress a value using JSON stringify
     * @private
     */
    _compress(value) {
        // TODO: For production, consider using zlib compression
        // const zlib = require('zlib');
        // return zlib.deflateSync(JSON.stringify(value));
        return JSON.stringify(value);
    }

    /**
     * Decompress a value
     * @private
     */
    _decompress(value) {
        // TODO: For production with zlib compression
        // return JSON.parse(zlib.inflateSync(value).toString());
        return JSON.parse(value);
    }

    /**
     * Estimate the size of an object in bytes
     * @private
     */
    _estimateSize(obj) {
        try {
            return JSON.stringify(obj).length * 2; // UTF-16 characters
        } catch {
            return 1000; // Default estimate
        }
    }

    /**
     * Clear all entries from the cache
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        logger.debug(`SearchCache cleared: ${size} entries removed`);
    }

    /**
     * Get the current size of the cache
     * @returns {number}
     */
    size() {
        return this.cache.size;
    }

    /**
     * Get cache statistics
     * @returns {Object}
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0;

        // Calculate total memory usage
        let totalSize = 0;
        for (const entry of this.cache.values()) {
            totalSize += entry.size || 0;
        }

        return {
            ...this.stats,
            hitRate: hitRate + '%',
            size: this.cache.size,
            maxSize: this.maxSize,
            totalMemoryBytes: totalSize,
            totalMemoryMB: (totalSize / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Prune expired entries from the cache
     * Called periodically or manually to clean up
     * @returns {number} Number of entries pruned
     */
    pruneExpired() {
        const now = Date.now();
        let pruned = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.ttlMs) {
                this.cache.delete(key);
                pruned++;
            }
        }
        
        if (pruned > 0) {
            logger.debug(`SearchCache pruned: ${pruned} expired entries removed`);
        }
        
        return pruned;
    }

    /**
     * Pre-warm cache with popular searches
     * @param {string[]} searches - Array of search queries to warm
     * @param {Function} searchFn - Function to execute searches
     * @returns {Promise<{warmed: number, skipped: number, total: number}>}
     */
    async warmCache(searches, searchFn) {
        logger.info(`Warming cache with ${searches.length} popular searches...`);
        
        let warmed = 0;
        let skipped = 0;
        
        for (const query of searches) {
            if (this.has(query)) {
                skipped++;
                continue;
            }
            
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

        logger.info(`Cache warmed: ${warmed} new entries, ${skipped} skipped (already cached)`);
        return { warmed, skipped, total: searches.length };
    }
}

export default SearchCache;
