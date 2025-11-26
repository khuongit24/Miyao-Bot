/**
 * EventQueue with Backpressure
 * 
 * Handles high-traffic scenarios by queuing events with:
 * - Configurable concurrency limit
 * - Priority support (high/normal/low)
 * - Backpressure detection
 * - Queue overflow protection
 * - Metrics for monitoring
 */

import logger from './logger.js';
import { EventEmitter } from 'events';

// Default configuration
const DEFAULT_CONFIG = {
    concurrencyLimit: 10,      // Max concurrent executions
    maxQueueSize: 1000,        // Max queued items before rejection
    highPriorityWeight: 3,     // High priority processes 3x faster
    normalPriorityWeight: 2,   // Normal priority processes 2x faster
    lowPriorityWeight: 1,      // Low priority base rate
    warningThreshold: 0.7,     // Warn at 70% queue capacity
    criticalThreshold: 0.9     // Critical at 90% queue capacity
};

// Priority levels
export const Priority = {
    HIGH: 'high',
    NORMAL: 'normal',
    LOW: 'low'
};

/**
 * EventQueue - Manages event processing with backpressure
 */
class EventQueue extends EventEmitter {
    /**
     * @param {Object} options - Configuration options
     * @param {number} options.concurrencyLimit - Max concurrent executions
     * @param {number} options.maxQueueSize - Max items in queue
     * @param {number} options.warningThreshold - Queue % for warning
     * @param {number} options.criticalThreshold - Queue % for critical
     */
    constructor(options = {}) {
        super();
        
        this.config = { ...DEFAULT_CONFIG, ...options };
        
        // Three priority queues
        this.queues = {
            [Priority.HIGH]: [],
            [Priority.NORMAL]: [],
            [Priority.LOW]: []
        };
        
        // State tracking
        this.activeCount = 0;
        this.isProcessing = false;
        this.isPaused = false;
        
        // Metrics
        this.metrics = {
            totalEnqueued: 0,
            totalProcessed: 0,
            totalRejected: 0,
            totalErrors: 0,
            avgProcessingTime: 0,
            processingTimes: [],
            lastBackpressureEvent: null
        };
        
        logger.info('EventQueue initialized', {
            concurrencyLimit: this.config.concurrencyLimit,
            maxQueueSize: this.config.maxQueueSize
        });
    }
    
    /**
     * Get total queue size across all priorities
     * @returns {number}
     */
    get queueSize() {
        return this.queues[Priority.HIGH].length +
               this.queues[Priority.NORMAL].length +
               this.queues[Priority.LOW].length;
    }
    
    /**
     * Check if queue is experiencing backpressure
     * @returns {boolean}
     */
    get isBackpressured() {
        return this.queueSize >= this.config.maxQueueSize * this.config.warningThreshold;
    }
    
    /**
     * Check if queue is at critical capacity
     * @returns {boolean}
     */
    get isCritical() {
        return this.queueSize >= this.config.maxQueueSize * this.config.criticalThreshold;
    }
    
    /**
     * Enqueue an event for processing
     * @param {Function} handler - Async function to execute
     * @param {Object} context - Context data passed to handler
     * @param {string} priority - Priority level (high/normal/low)
     * @returns {Promise<boolean>} - Whether event was enqueued
     */
    async enqueue(handler, context = {}, priority = Priority.NORMAL) {
        // Validate priority
        if (!Object.values(Priority).includes(priority)) {
            priority = Priority.NORMAL;
        }
        
        // Check queue capacity
        if (this.queueSize >= this.config.maxQueueSize) {
            this.metrics.totalRejected++;
            logger.warn('EventQueue: Queue full, rejecting event', {
                queueSize: this.queueSize,
                maxSize: this.config.maxQueueSize,
                priority
            });
            
            this.emit('rejected', { reason: 'queue_full', context });
            return false;
        }
        
        // Emit backpressure events
        if (this.isCritical && this.metrics.lastBackpressureEvent !== 'critical') {
            this.metrics.lastBackpressureEvent = 'critical';
            this.emit('backpressure', { level: 'critical', queueSize: this.queueSize });
            logger.warn('EventQueue: CRITICAL backpressure detected', {
                queueSize: this.queueSize,
                threshold: this.config.maxQueueSize * this.config.criticalThreshold
            });
        } else if (this.isBackpressured && this.metrics.lastBackpressureEvent !== 'warning') {
            this.metrics.lastBackpressureEvent = 'warning';
            this.emit('backpressure', { level: 'warning', queueSize: this.queueSize });
            logger.debug('EventQueue: Warning backpressure detected');
        } else if (!this.isBackpressured && this.metrics.lastBackpressureEvent) {
            this.metrics.lastBackpressureEvent = null;
            this.emit('backpressure', { level: 'normal', queueSize: this.queueSize });
        }
        
        // Create queue item
        const item = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            handler,
            context,
            priority,
            enqueuedAt: Date.now()
        };
        
        // Add to appropriate queue
        this.queues[priority].push(item);
        this.metrics.totalEnqueued++;
        
        logger.debug(`EventQueue: Enqueued event`, {
            id: item.id,
            priority,
            queueSize: this.queueSize
        });
        
        // Start processing if not already running
        this.processQueue();
        
        return true;
    }
    
    /**
     * Process queued events with weighted priority
     * @private
     */
    async processQueue() {
        // Prevent multiple processing loops
        if (this.isProcessing || this.isPaused) return;
        
        this.isProcessing = true;
        
        while (this.queueSize > 0 && !this.isPaused) {
            // Check concurrency limit
            if (this.activeCount >= this.config.concurrencyLimit) {
                // Wait a bit before checking again
                await new Promise(resolve => setTimeout(resolve, 10));
                continue;
            }
            
            // Get next item based on weighted priority
            const item = this.getNextItem();
            if (!item) break;
            
            // Process the item
            this.activeCount++;
            this.processItem(item).finally(() => {
                this.activeCount--;
            });
        }
        
        this.isProcessing = false;
    }
    
    /**
     * Get next item based on weighted priority
     * Uses weighted round-robin: high priority gets more slots
     * @private
     * @returns {Object|null}
     */
    getNextItem() {
        // Calculate total weight of non-empty queues
        const weights = {
            [Priority.HIGH]: this.queues[Priority.HIGH].length > 0 ? this.config.highPriorityWeight : 0,
            [Priority.NORMAL]: this.queues[Priority.NORMAL].length > 0 ? this.config.normalPriorityWeight : 0,
            [Priority.LOW]: this.queues[Priority.LOW].length > 0 ? this.config.lowPriorityWeight : 0
        };
        
        const totalWeight = weights[Priority.HIGH] + weights[Priority.NORMAL] + weights[Priority.LOW];
        if (totalWeight === 0) return null;
        
        // Random selection based on weights
        const random = Math.random() * totalWeight;
        let cumulative = 0;
        
        for (const priority of [Priority.HIGH, Priority.NORMAL, Priority.LOW]) {
            cumulative += weights[priority];
            if (random < cumulative && this.queues[priority].length > 0) {
                return this.queues[priority].shift();
            }
        }
        
        // Fallback: return from any non-empty queue
        for (const priority of [Priority.HIGH, Priority.NORMAL, Priority.LOW]) {
            if (this.queues[priority].length > 0) {
                return this.queues[priority].shift();
            }
        }
        
        return null;
    }
    
    /**
     * Process a single queue item
     * @private
     * @param {Object} item - Queue item
     */
    async processItem(item) {
        const startTime = Date.now();
        
        try {
            await item.handler(item.context);
            
            // Update metrics
            const processingTime = Date.now() - startTime;
            this.metrics.totalProcessed++;
            this.updateAvgProcessingTime(processingTime);
            
            logger.debug(`EventQueue: Processed event`, {
                id: item.id,
                priority: item.priority,
                processingTime,
                waitTime: startTime - item.enqueuedAt
            });
            
            this.emit('processed', {
                id: item.id,
                priority: item.priority,
                processingTime,
                waitTime: startTime - item.enqueuedAt
            });
            
        } catch (error) {
            this.metrics.totalErrors++;
            
            logger.error('EventQueue: Error processing event', {
                id: item.id,
                priority: item.priority,
                error: error.message
            });
            
            this.emit('error', {
                id: item.id,
                context: item.context,
                error
            });
        }
    }
    
    /**
     * Update rolling average processing time
     * @private
     * @param {number} time - Processing time in ms
     */
    updateAvgProcessingTime(time) {
        this.metrics.processingTimes.push(time);
        
        // Keep only last 100 samples
        if (this.metrics.processingTimes.length > 100) {
            this.metrics.processingTimes.shift();
        }
        
        // Calculate average
        const sum = this.metrics.processingTimes.reduce((a, b) => a + b, 0);
        this.metrics.avgProcessingTime = Math.round(sum / this.metrics.processingTimes.length);
    }
    
    /**
     * Pause queue processing
     */
    pause() {
        this.isPaused = true;
        logger.info('EventQueue: Processing paused');
        this.emit('paused');
    }
    
    /**
     * Resume queue processing
     */
    resume() {
        this.isPaused = false;
        logger.info('EventQueue: Processing resumed');
        this.emit('resumed');
        this.processQueue();
    }
    
    /**
     * Clear all queued items
     * @param {string} priority - Optional: only clear specific priority
     * @returns {number} - Number of items cleared
     */
    clear(priority = null) {
        let cleared = 0;
        
        if (priority && this.queues[priority]) {
            cleared = this.queues[priority].length;
            this.queues[priority] = [];
        } else {
            cleared = this.queueSize;
            this.queues[Priority.HIGH] = [];
            this.queues[Priority.NORMAL] = [];
            this.queues[Priority.LOW] = [];
        }
        
        logger.info(`EventQueue: Cleared ${cleared} items`, { priority });
        this.emit('cleared', { count: cleared, priority });
        
        return cleared;
    }
    
    /**
     * Get current queue statistics
     * @returns {Object}
     */
    getStats() {
        return {
            queueSize: this.queueSize,
            queueByPriority: {
                high: this.queues[Priority.HIGH].length,
                normal: this.queues[Priority.NORMAL].length,
                low: this.queues[Priority.LOW].length
            },
            activeCount: this.activeCount,
            concurrencyLimit: this.config.concurrencyLimit,
            isBackpressured: this.isBackpressured,
            isCritical: this.isCritical,
            isPaused: this.isPaused,
            metrics: {
                totalEnqueued: this.metrics.totalEnqueued,
                totalProcessed: this.metrics.totalProcessed,
                totalRejected: this.metrics.totalRejected,
                totalErrors: this.metrics.totalErrors,
                avgProcessingTime: this.metrics.avgProcessingTime,
                successRate: this.metrics.totalProcessed > 0 
                    ? ((this.metrics.totalProcessed / this.metrics.totalEnqueued) * 100).toFixed(2) + '%'
                    : '100%'
            }
        };
    }
    
    /**
     * Graceful shutdown - wait for active items to complete
     * @param {number} timeout - Max wait time in ms
     * @returns {Promise<void>}
     */
    async shutdown(timeout = 5000) {
        logger.info('EventQueue: Shutting down...');
        
        // Pause to prevent new processing
        this.pause();
        
        // Clear pending items
        const pendingCount = this.queueSize;
        this.clear();
        
        // Wait for active items to complete
        const startTime = Date.now();
        while (this.activeCount > 0 && (Date.now() - startTime) < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (this.activeCount > 0) {
            logger.warn(`EventQueue: Shutdown timeout, ${this.activeCount} items still active`);
        } else {
            logger.info(`EventQueue: Shutdown complete, cleared ${pendingCount} pending items`);
        }
        
        this.emit('shutdown', { pendingCleared: pendingCount, activeAtShutdown: this.activeCount });
    }
}

// Singleton instance for global use
let eventQueueInstance = null;

/**
 * Get or create the global EventQueue instance
 * @param {Object} options - Options (only used on first call)
 * @returns {EventQueue}
 */
export function getEventQueue(options = {}) {
    if (!eventQueueInstance) {
        eventQueueInstance = new EventQueue(options);
    }
    return eventQueueInstance;
}

/**
 * Reset the global instance (for testing)
 */
export function resetEventQueue() {
    if (eventQueueInstance) {
        eventQueueInstance.clear();
    }
    eventQueueInstance = null;
}

export default EventQueue;
