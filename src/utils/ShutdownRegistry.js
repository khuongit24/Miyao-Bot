/**
 * ShutdownRegistry — Centralized resource disposal lifecycle
 *
 * Manages registration and orderly teardown of all disposable resources
 * (intervals, timeouts, event listeners, connections, etc.)
 *
 * Resources are disposed in LIFO order (last registered = first disposed)
 * to respect dependency ordering (e.g., close music before database).
 *
 * @module ShutdownRegistry
 * @version 1.10.2
 * @fix XC-C01 — Centralized disposal lifecycle for 15+ resources
 */

import logger from './logger.js';

class ShutdownRegistry {
    constructor() {
        /** @type {Array<{name: string, dispose: Function, priority: number, timeout: number|null}>} */
        this._resources = [];
        this._isShuttingDown = false;
        this._shutdownComplete = false;
    }

    /**
     * Register a resource for cleanup during shutdown
     * @param {string} name - Human-readable name for logging
     * @param {Function} disposeFn - Cleanup function (sync or async)
     * @param {number} [priority=0] - Higher priority = disposed first (default 0)
     * @param {number|null} [timeout=null] - Per-resource timeout in ms (default: null = use 3000ms)
     */
    register(name, disposeFn, priority = 0, timeout = null) {
        if (this._isShuttingDown) {
            logger.warn(`[ShutdownRegistry] Cannot register "${name}" during shutdown`);
            return;
        }

        if (typeof disposeFn !== 'function') {
            logger.warn(`[ShutdownRegistry] Invalid dispose function for "${name}"`);
            return;
        }

        this._resources.push({ name, dispose: disposeFn, priority, timeout });
        logger.debug(`[ShutdownRegistry] Registered: "${name}" (priority: ${priority})`);
    }

    /**
     * Unregister a resource by name (e.g., when a resource is destroyed early)
     * @param {string} name - Name of the resource to unregister
     * @returns {boolean} Whether the resource was found and removed
     */
    unregister(name) {
        const idx = this._resources.findIndex(r => r.name === name);
        if (idx !== -1) {
            this._resources.splice(idx, 1);
            logger.debug(`[ShutdownRegistry] Unregistered: "${name}"`);
            return true;
        }
        return false;
    }

    /**
     * Dispose all registered resources in priority order (highest first),
     * then LIFO within same priority
     * @returns {Promise<{success: number, failed: number, errors: Array}>}
     */
    async shutdownAll() {
        if (this._isShuttingDown) {
            logger.warn('[ShutdownRegistry] Shutdown already in progress');
            return { success: 0, failed: 0, errors: [] };
        }

        this._isShuttingDown = true;
        const totalResources = this._resources.length;
        logger.info(`[ShutdownRegistry] Starting shutdown of ${totalResources} resources...`);

        // Sort: highest priority first, then LIFO within same priority
        const sorted = [...this._resources].sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return this._resources.indexOf(b) - this._resources.indexOf(a);
        });

        let success = 0;
        let failed = 0;
        const errors = [];

        for (const { name, dispose, timeout: resourceTimeout } of sorted) {
            try {
                let timeoutId;
                const timeoutMs = resourceTimeout || 3000;
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(
                        () => reject(new Error(`Timeout: "${name}" took longer than ${timeoutMs}ms`)),
                        timeoutMs
                    );
                });
                try {
                    await Promise.race([dispose(), timeoutPromise]);
                    success++;
                    logger.info(`[ShutdownRegistry] Disposed: "${name}"`);
                } finally {
                    clearTimeout(timeoutId);
                }
            } catch (err) {
                failed++;
                errors.push({ name, error: err.message });
                logger.error(`[ShutdownRegistry] Failed to dispose "${name}":`, err);
            }
        }

        this._resources = [];
        this._shutdownComplete = true;

        logger.info(
            `[ShutdownRegistry] Shutdown complete: ${success} disposed, ${failed} failed (of ${totalResources})`
        );
        return { success, failed, errors };
    }

    /**
     * Get the number of registered resources
     * @returns {number}
     */
    get size() {
        return this._resources.length;
    }

    /**
     * Get list of registered resource names
     * @returns {string[]}
     */
    getRegisteredNames() {
        return this._resources.map(r => r.name);
    }

    /**
     * Check if shutdown has been initiated
     * @returns {boolean}
     */
    get isShuttingDown() {
        return this._isShuttingDown;
    }

    /**
     * Check if shutdown is complete
     * @returns {boolean}
     */
    get isComplete() {
        return this._shutdownComplete;
    }
}

// Singleton instance
let _instance = null;

/**
 * Get the singleton ShutdownRegistry instance
 * @returns {ShutdownRegistry}
 */
export function getShutdownRegistry() {
    if (!_instance) {
        _instance = new ShutdownRegistry();
    }
    return _instance;
}

/**
 * Reset the registry (for testing only)
 */
export function _resetShutdownRegistry() {
    _instance = null;
}

export default ShutdownRegistry;
