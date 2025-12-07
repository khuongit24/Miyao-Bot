/**
 * Circuit Breaker Pattern Implementation
 * Protects against cascading failures by preventing calls to failing services
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 *
 * @since v1.5.1
 */

import logger from './logger.js';

/**
 * Circuit breaker states
 * @enum {string}
 */
export const CircuitState = {
    CLOSED: 'CLOSED', // Normal operation
    OPEN: 'OPEN', // Failing, reject requests
    HALF_OPEN: 'HALF_OPEN' // Testing recovery
};

/**
 * Circuit breaker error thrown when circuit is open
 */
export class CircuitBreakerError extends Error {
    constructor(message = 'Circuit breaker is OPEN') {
        super(message);
        this.name = 'CircuitBreakerError';
        this.code = 'CIRCUIT_OPEN';
        this.isOperational = true;
    }
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
    /**
     * Create a circuit breaker
     * @param {Object} options - Configuration options
     * @param {string} options.name - Circuit breaker name for logging
     * @param {number} [options.failureThreshold=5] - Failures before opening circuit
     * @param {number} [options.successThreshold=2] - Successes needed to close from half-open
     * @param {number} [options.timeout=60000] - Time in ms before trying half-open (default: 60s)
     * @param {number} [options.resetTimeout=30000] - Time in ms to reset failure count (default: 30s)
     * @param {Function} [options.onStateChange] - Callback when state changes
     */
    constructor(options = {}) {
        this.name = options.name || 'CircuitBreaker';
        this.failureThreshold = options.failureThreshold || 5;
        this.successThreshold = options.successThreshold || 2;
        this.timeout = options.timeout || 60000; // 60 seconds
        this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
        this.onStateChange = options.onStateChange || (() => {});

        // State tracking
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.nextAttempt = Date.now();
        this.lastFailureTime = null;

        // Metrics
        this.stats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            rejectedCalls: 0,
            lastStateChange: Date.now(),
            stateChanges: 0
        };

        logger.info(`CircuitBreaker [${this.name}] initialized`, {
            failureThreshold: this.failureThreshold,
            successThreshold: this.successThreshold,
            timeout: this.timeout
        });
    }

    /**
     * Execute a function through the circuit breaker
     * @template T
     * @param {Function} fn - Async function to execute
     * @returns {Promise<T>} Result of the function
     * @throws {CircuitBreakerError} If circuit is open
     */
    async execute(fn) {
        this.stats.totalCalls++;

        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            // Check if timeout expired, transition to half-open
            if (Date.now() >= this.nextAttempt) {
                this.transitionTo(CircuitState.HALF_OPEN);
            } else {
                this.stats.rejectedCalls++;
                throw new CircuitBreakerError(
                    `Circuit breaker [${this.name}] is OPEN. Next attempt in ${Math.ceil((this.nextAttempt - Date.now()) / 1000)}s`
                );
            }
        }

        try {
            // Execute the function
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            throw error;
        }
    }

    /**
     * Handle successful execution
     * @private
     */
    onSuccess() {
        this.stats.successfulCalls++;
        this.failures = 0; // Reset failure count

        if (this.state === CircuitState.HALF_OPEN) {
            this.successes++;

            if (this.successes >= this.successThreshold) {
                // Enough successes, close the circuit
                this.transitionTo(CircuitState.CLOSED);
                this.successes = 0;
                logger.info(`CircuitBreaker [${this.name}] recovered and closed`);
            }
        }
    }

    /**
     * Handle failed execution
     * @private
     * @param {Error} error - The error that occurred
     */
    onFailure(error) {
        this.stats.failedCalls++;
        this.failures++;
        this.lastFailureTime = Date.now();
        this.successes = 0; // Reset success count in half-open

        logger.warn(`CircuitBreaker [${this.name}] failure`, {
            error: error.message,
            failures: this.failures,
            threshold: this.failureThreshold,
            state: this.state
        });

        // Check if failure threshold exceeded
        if (this.failures >= this.failureThreshold) {
            this.transitionTo(CircuitState.OPEN);
            this.nextAttempt = Date.now() + this.timeout;

            logger.error(`CircuitBreaker [${this.name}] opened due to repeated failures`, {
                failures: this.failures,
                nextAttempt: new Date(this.nextAttempt).toISOString()
            });
        }
    }

    /**
     * Transition to a new state
     * @private
     * @param {CircuitState} newState - New circuit state
     */
    transitionTo(newState) {
        const oldState = this.state;

        if (oldState !== newState) {
            this.state = newState;
            this.stats.lastStateChange = Date.now();
            this.stats.stateChanges++;

            logger.info(`CircuitBreaker [${this.name}] state change: ${oldState} → ${newState}`);

            // Call the state change callback
            this.onStateChange(oldState, newState, this.stats);
        }
    }

    /**
     * Manually reset the circuit breaker to closed state
     */
    reset() {
        this.transitionTo(CircuitState.CLOSED);
        this.failures = 0;
        this.successes = 0;
        this.nextAttempt = Date.now();
        logger.info(`CircuitBreaker [${this.name}] manually reset`);
    }

    /**
     * Get current state and statistics
     * @returns {Object} Circuit breaker status
     */
    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            nextAttempt: this.state === CircuitState.OPEN ? new Date(this.nextAttempt).toISOString() : null,
            stats: {
                ...this.stats,
                successRate:
                    this.stats.totalCalls > 0
                        ? ((this.stats.successfulCalls / this.stats.totalCalls) * 100).toFixed(2) + '%'
                        : 'N/A',
                rejectionRate:
                    this.stats.totalCalls > 0
                        ? ((this.stats.rejectedCalls / this.stats.totalCalls) * 100).toFixed(2) + '%'
                        : 'N/A'
            }
        };
    }

    /**
     * Check if circuit is currently allowing requests
     * @returns {boolean} True if circuit is closed or half-open
     */
    isAvailable() {
        if (this.state === CircuitState.CLOSED) {
            return true;
        }

        if (this.state === CircuitState.HALF_OPEN) {
            return true;
        }

        if (this.state === CircuitState.OPEN && Date.now() >= this.nextAttempt) {
            return true; // Will transition to half-open on next call
        }

        return false;
    }
}

/**
 * Create a circuit breaker wrapper for a function
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Circuit breaker options
 * @returns {Function} Wrapped function with circuit breaker
 */
export function withCircuitBreaker(fn, options = {}) {
    const breaker = new CircuitBreaker(options);

    return async function (...args) {
        return breaker.execute(() => fn(...args));
    };
}

export default CircuitBreaker;
