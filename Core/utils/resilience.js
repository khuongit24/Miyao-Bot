/**
 * Resilience Utilities
 * Provides graceful degradation, retry logic, and fallback strategies
 * 
 * @since v1.5.1
 */

import logger from './logger.js';

/**
 * Retry configuration
 * @typedef {Object} RetryOptions
 * @property {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @property {number} initialDelay - Initial delay in ms (default: 1000)
 * @property {number} maxDelay - Maximum delay in ms (default: 8000)
 * @property {number} factor - Backoff multiplier (default: 2)
 * @property {Function} shouldRetry - Function to determine if error should be retried
 */

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_OPTIONS = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 8000,
    factor: 2,
    shouldRetry: (error) => {
        // Retry on network errors and 5xx errors, not 4xx (client errors)
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return true;
        }
        if (error.statusCode && error.statusCode >= 500) {
            return true;
        }
        return false;
    }
};

/**
 * Execute a function with exponential backoff retry
 * @template T
 * @param {Function} fn - Async function to execute
 * @param {RetryOptions} options - Retry options
 * @returns {Promise<T>} Result of the function
 * @throws {Error} If all retries exhausted
 * 
 * @example
 * const result = await retryWithBackoff(
 *   async () => fetchDataFromAPI(),
 *   { maxRetries: 3, initialDelay: 1000 }
 * );
 */
export async function retryWithBackoff(fn, options = {}) {
    const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            const result = await fn();
            
            if (attempt > 0) {
                logger.info(`Retry succeeded on attempt ${attempt + 1}`);
            }
            
            return result;
        } catch (error) {
            lastError = error;
            
            // Check if we should retry
            const shouldRetry = config.shouldRetry(error);
            const isLastAttempt = attempt === config.maxRetries;
            
            if (!shouldRetry || isLastAttempt) {
                logger.error(`Operation failed ${shouldRetry ? 'after all retries' : '(not retryable)'}`, {
                    attempt: attempt + 1,
                    maxRetries: config.maxRetries,
                    error: error.message
                });
                throw error;
            }
            
            // Calculate delay with exponential backoff
            const delay = Math.min(
                config.initialDelay * Math.pow(config.factor, attempt),
                config.maxDelay
            );
            
            logger.warn(`Retry attempt ${attempt + 1}/${config.maxRetries} after ${delay}ms`, {
                error: error.message,
                nextDelay: delay
            });
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

/**
 * Execute a function with a fallback if it fails
 * @template T
 * @param {Function} primaryFn - Primary function to execute
 * @param {Function} fallbackFn - Fallback function if primary fails
 * @param {Object} options - Options
 * @param {string} options.name - Operation name for logging
 * @returns {Promise<T>} Result from primary or fallback
 * 
 * @example
 * const data = await withFallback(
 *   async () => fetchFromPrimaryAPI(),
 *   async () => fetchFromCache(),
 *   { name: 'API fetch' }
 * );
 */
export async function withFallback(primaryFn, fallbackFn, options = {}) {
    const { name = 'Operation' } = options;
    
    try {
        return await primaryFn();
    } catch (error) {
        logger.warn(`${name} failed, using fallback`, {
            error: error.message
        });
        
        try {
            const result = await fallbackFn();
            logger.info(`${name} fallback succeeded`);
            return result;
        } catch (fallbackError) {
            logger.error(`${name} fallback also failed`, {
                primaryError: error.message,
                fallbackError: fallbackError.message
            });
            throw fallbackError;
        }
    }
}

/**
 * Execute multiple functions in parallel and return first successful result
 * @template T
 * @param {Array<Function>} fns - Array of async functions to execute
 * @param {Object} options - Options
 * @param {string} options.name - Operation name for logging
 * @returns {Promise<T>} First successful result
 * @throws {Error} If all functions fail
 * 
 * @example
 * const result = await raceToSuccess([
 *   async () => fetchFromNode1(),
 *   async () => fetchFromNode2(),
 *   async () => fetchFromNode3()
 * ], { name: 'Lavalink search' });
 */
export async function raceToSuccess(fns, options = {}) {
    const { name = 'Operation' } = options;
    const errors = [];
    
    return new Promise((resolve, reject) => {
        let completed = 0;
        const total = fns.length;
        
        if (total === 0) {
            reject(new Error('No functions provided'));
            return;
        }
        
        fns.forEach((fn, index) => {
            fn()
                .then(result => {
                    logger.debug(`${name} succeeded via option ${index + 1}`);
                    resolve(result);
                })
                .catch(error => {
                    errors.push({ index, error });
                    completed++;
                    
                    if (completed === total) {
                        logger.error(`${name} failed on all ${total} attempts`, {
                            errors: errors.map(e => e.error.message)
                        });
                        reject(new Error(`All ${name} attempts failed`));
                    }
                });
        });
    });
}

/**
 * Execute a function with a timeout
 * @template T
 * @param {Function} fn - Async function to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} message - Timeout error message
 * @returns {Promise<T>} Result of the function
 * @throws {Error} If timeout is exceeded
 * 
 * @example
 * const result = await withTimeout(
 *   async () => slowOperation(),
 *   5000,
 *   'Operation timed out'
 * );
 */
export async function withTimeout(fn, timeoutMs, message = 'Operation timed out') {
    return Promise.race([
        fn(),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(message)), timeoutMs)
        )
    ]);
}

/**
 * Graceful degradation helper - return stale data if fresh fetch fails
 * @template T
 * @param {Function} fetchFn - Function to fetch fresh data
 * @param {Function} getStaleFn - Function to get stale data
 * @param {Object} options - Options
 * @param {number} options.maxStaleAge - Maximum age of stale data in ms (default: 5 min)
 * @param {string} options.name - Operation name for logging
 * @returns {Promise<{data: T, isStale: boolean}>} Data with staleness flag
 * 
 * @example
 * const { data, isStale } = await staleWhileRevalidate(
 *   async () => fetchLatestStats(),
 *   async () => getCachedStats(),
 *   { maxStaleAge: 300000, name: 'Stats fetch' }
 * );
 */
export async function staleWhileRevalidate(fetchFn, getStaleFn, options = {}) {
    const { maxStaleAge = 300000, name = 'Operation' } = options;
    
    try {
        const data = await fetchFn();
        return { data, isStale: false };
    } catch (error) {
        logger.warn(`${name} failed, attempting to use stale data`, {
            error: error.message
        });
        
        try {
            const staleData = await getStaleFn();
            
            // Check if stale data is too old
            if (staleData && staleData.timestamp) {
                const age = Date.now() - staleData.timestamp;
                
                if (age > maxStaleAge) {
                    logger.error(`${name} stale data too old (${Math.round(age / 1000)}s)`, {
                        maxAge: Math.round(maxStaleAge / 1000) + 's'
                    });
                    throw new Error('Stale data expired');
                }
            }
            
            logger.info(`${name} using stale data`, {
                age: staleData.timestamp 
                    ? Math.round((Date.now() - staleData.timestamp) / 1000) + 's'
                    : 'unknown'
            });
            
            return { data: staleData, isStale: true };
        } catch (staleError) {
            logger.error(`${name} stale data also unavailable`, {
                fetchError: error.message,
                staleError: staleError.message
            });
            throw error; // Throw original error
        }
    }
}

/**
 * Check if music system is available (has healthy Lavalink nodes)
 * @param {MusicManager} musicManager - Music manager instance
 * @returns {boolean} True if at least one healthy node exists
 */
export function isMusicSystemAvailable(musicManager) {
    if (!musicManager || !musicManager.shoukaku) {
        return false;
    }
    
    // Check if circuit breaker is open
    if (musicManager.circuitBreaker && !musicManager.circuitBreaker.isAvailable()) {
        return false;
    }
    
    // Check for at least one connected node
    for (const [, node] of musicManager.shoukaku.nodes) {
        if (node.state === 2) { // CONNECTED state in Shoukaku v4
            return true;
        }
    }
    
    return false;
}

/**
 * Get degraded mode message for users
 * @param {string} feature - Feature that's unavailable
 * @returns {Object} Embed-ready message
 */
export function getDegradedModeMessage(feature = 'music playback') {
    return {
        title: '🔴 Chế Độ Bảo Trì',
        description: `Hệ thống ${feature} tạm thời không khả dụng.\n\n` +
            '**Chúng tôi đang khắc phục vấn đề.**\n' +
            'Vui lòng thử lại sau vài phút.',
        fields: [
            {
                name: '🔧 Thông tin kỹ thuật',
                value: 'Service unavailable - automatic recovery in progress',
                inline: false
            },
            {
                name: '⏰ Dự kiến',
                value: 'Hệ thống sẽ tự động phục hồi trong vài phút',
                inline: false
            }
        ],
        color: 0xff0000,
        timestamp: new Date()
    };
}

/**
 * Bulkhead pattern - limit concurrent executions
 */
export class Bulkhead {
    /**
     * Create a bulkhead
     * @param {number} maxConcurrent - Maximum concurrent executions
     * @param {number} maxQueue - Maximum queued requests (default: Infinity)
     */
    constructor(maxConcurrent, maxQueue = Infinity) {
        this.maxConcurrent = maxConcurrent;
        this.maxQueue = maxQueue;
        this.running = 0;
        this.queue = [];
    }
    
    /**
     * Execute function with concurrency limit
     * @template T
     * @param {Function} fn - Function to execute
     * @returns {Promise<T>} Result of function
     */
    async execute(fn) {
        if (this.running >= this.maxConcurrent) {
            if (this.queue.length >= this.maxQueue) {
                throw new Error('Bulkhead queue full');
            }
            
            // Queue the request
            await new Promise((resolve) => {
                this.queue.push(resolve);
            });
        }
        
        this.running++;
        
        try {
            return await fn();
        } finally {
            this.running--;
            
            // Process next in queue
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next();
            }
        }
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            running: this.running,
            queued: this.queue.length,
            maxConcurrent: this.maxConcurrent,
            available: this.maxConcurrent - this.running
        };
    }
}

export default {
    retryWithBackoff,
    withFallback,
    raceToSuccess,
    withTimeout,
    staleWhileRevalidate,
    isMusicSystemAvailable,
    getDegradedModeMessage,
    Bulkhead
};
