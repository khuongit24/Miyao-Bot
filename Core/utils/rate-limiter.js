/**
 * Command Rate Limiter
 * Prevents spam and abuse by limiting command usage per user and per guild
 */

import logger from './logger.js';

/**
 * Per-user command rate limiter
 * Prevents individual users from spamming commands
 */
export class CommandRateLimiter {
    constructor(maxCommands = 5, windowMs = 10000) {
        this.maxCommands = maxCommands;
        this.windowMs = windowMs;
        this.userCooldowns = new Map(); // userId -> { count, resetAt, warnings }
        
        // Cleanup expired entries every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
        
        logger.info(`CommandRateLimiter initialized: ${maxCommands} commands per ${windowMs}ms`);
    }
    
    /**
     * Check if user can execute command
     * @param {string} userId - Discord user ID
     * @param {boolean} isAdmin - Whether user is admin (admins bypass limits)
     * @returns {Object} { allowed: boolean, remaining: number, resetIn: number, reason?: string }
     */
    check(userId, isAdmin = false) {
        // Admins bypass rate limits
        if (isAdmin) {
            return { allowed: true, remaining: Infinity, resetIn: 0 };
        }
        
        const now = Date.now();
        const userData = this.userCooldowns.get(userId);
        
        // First command or cooldown expired
        if (!userData || now >= userData.resetAt) {
            this.userCooldowns.set(userId, {
                count: 1,
                resetAt: now + this.windowMs,
                warnings: 0
            });
            return { 
                allowed: true, 
                remaining: this.maxCommands - 1, 
                resetIn: this.windowMs 
            };
        }
        
        // Within cooldown window
        if (userData.count < this.maxCommands) {
            userData.count++;
            const remaining = this.maxCommands - userData.count;
            const resetIn = userData.resetAt - now;
            
            return { 
                allowed: true, 
                remaining, 
                resetIn 
            };
        }
        
        // Rate limit exceeded
        userData.warnings++;
        const resetIn = userData.resetAt - now;
        
        logger.warn(`Rate limit exceeded for user ${userId}`, {
            count: userData.count,
            maxCommands: this.maxCommands,
            warnings: userData.warnings,
            resetIn
        });
        
        return { 
            allowed: false, 
            remaining: 0, 
            resetIn,
            reason: `Bạn đang sử dụng lệnh quá nhanh! Vui lòng đợi ${Math.ceil(resetIn / 1000)} giây.`
        };
    }
    
    /**
     * Reset rate limit for a user (admin action)
     * @param {string} userId - Discord user ID
     */
    reset(userId) {
        this.userCooldowns.delete(userId);
        logger.info(`Rate limit reset for user ${userId}`);
    }
    
    /**
     * Get current rate limit status for user
     * @param {string} userId - Discord user ID
     * @returns {Object} Current status
     */
    getStatus(userId) {
        const userData = this.userCooldowns.get(userId);
        if (!userData) {
            return { count: 0, remaining: this.maxCommands, active: false };
        }
        
        const now = Date.now();
        if (now >= userData.resetAt) {
            return { count: 0, remaining: this.maxCommands, active: false };
        }
        
        return {
            count: userData.count,
            remaining: Math.max(0, this.maxCommands - userData.count),
            resetIn: userData.resetAt - now,
            warnings: userData.warnings,
            active: true
        };
    }
    
    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [userId, userData] of this.userCooldowns.entries()) {
            if (now >= userData.resetAt) {
                this.userCooldowns.delete(userId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.debug(`Cleaned ${cleaned} expired rate limit entries`);
        }
    }
    
    /**
     * Get statistics
     * @returns {Object} Current statistics
     */
    getStats() {
        return {
            activeUsers: this.userCooldowns.size,
            maxCommands: this.maxCommands,
            windowMs: this.windowMs
        };
    }
    
    /**
     * Cleanup and stop background tasks
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.userCooldowns.clear();
        logger.info('CommandRateLimiter destroyed');
    }
}

/**
 * Per-guild rate limiter
 * Prevents guild-wide spam of expensive operations
 */
export class GuildRateLimiter {
    constructor() {
        // Different limits for different operation types
        this.limits = {
            queueOperations: { max: 20, window: 60000 }, // 20 per minute
            searches: { max: 10, window: 60000 }, // 10 per minute
            playlistOperations: { max: 15, window: 60000 }, // 15 per minute
            filterChanges: { max: 5, window: 30000 } // 5 per 30 seconds
        };
        
        // guildId -> operationType -> { count, resetAt }
        this.guildData = new Map();
        
        // Cleanup expired entries every 2 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 120000);
        
        logger.info('GuildRateLimiter initialized');
    }
    
    /**
     * Check if guild can perform operation
     * @param {string} guildId - Discord guild ID
     * @param {string} operationType - Type of operation (queueOperations, searches, etc.)
     * @param {boolean} isPremium - Whether guild has premium status
     * @returns {Object} { allowed: boolean, remaining: number, resetIn: number, reason?: string }
     */
    check(guildId, operationType, isPremium = false) {
        const limit = this.limits[operationType];
        if (!limit) {
            logger.warn(`Unknown operation type: ${operationType}`);
            return { allowed: true, remaining: Infinity, resetIn: 0 };
        }
        
        // Premium guilds get 2x limits
        const maxOps = isPremium ? limit.max * 2 : limit.max;
        const now = Date.now();
        
        // Get or create guild data
        if (!this.guildData.has(guildId)) {
            this.guildData.set(guildId, new Map());
        }
        
        const guildOps = this.guildData.get(guildId);
        const opData = guildOps.get(operationType);
        
        // First operation or cooldown expired
        if (!opData || now >= opData.resetAt) {
            guildOps.set(operationType, {
                count: 1,
                resetAt: now + limit.window
            });
            return { 
                allowed: true, 
                remaining: maxOps - 1, 
                resetIn: limit.window 
            };
        }
        
        // Within cooldown window
        if (opData.count < maxOps) {
            opData.count++;
            const remaining = maxOps - opData.count;
            const resetIn = opData.resetAt - now;
            
            return { 
                allowed: true, 
                remaining, 
                resetIn 
            };
        }
        
        // Rate limit exceeded
        const resetIn = opData.resetAt - now;
        
        logger.warn(`Guild rate limit exceeded`, {
            guildId,
            operationType,
            count: opData.count,
            maxOps,
            resetIn
        });
        
        return { 
            allowed: false, 
            remaining: 0, 
            resetIn,
            reason: `Server đang thực hiện quá nhiều thao tác ${this.getOperationName(operationType)}. Vui lòng đợi ${Math.ceil(resetIn / 1000)} giây.`
        };
    }
    
    /**
     * Get friendly operation name
     * @param {string} operationType - Operation type
     * @returns {string} Friendly name
     */
    getOperationName(operationType) {
        const names = {
            queueOperations: 'hàng đợi',
            searches: 'tìm kiếm',
            playlistOperations: 'playlist',
            filterChanges: 'thay đổi filter'
        };
        return names[operationType] || operationType;
    }
    
    /**
     * Reset rate limit for a guild (admin action)
     * @param {string} guildId - Discord guild ID
     * @param {string} operationType - Optional: specific operation type to reset
     */
    reset(guildId, operationType = null) {
        if (operationType) {
            const guildOps = this.guildData.get(guildId);
            if (guildOps) {
                guildOps.delete(operationType);
                logger.info(`Guild rate limit reset for ${guildId} - ${operationType}`);
            }
        } else {
            this.guildData.delete(guildId);
            logger.info(`All guild rate limits reset for ${guildId}`);
        }
    }
    
    /**
     * Get current rate limit status for guild
     * @param {string} guildId - Discord guild ID
     * @param {string} operationType - Operation type
     * @returns {Object} Current status
     */
    getStatus(guildId, operationType) {
        const limit = this.limits[operationType];
        if (!limit) return { count: 0, remaining: limit?.max || 0, active: false };
        
        const guildOps = this.guildData.get(guildId);
        if (!guildOps) {
            return { count: 0, remaining: limit.max, active: false };
        }
        
        const opData = guildOps.get(operationType);
        if (!opData) {
            return { count: 0, remaining: limit.max, active: false };
        }
        
        const now = Date.now();
        if (now >= opData.resetAt) {
            return { count: 0, remaining: limit.max, active: false };
        }
        
        return {
            count: opData.count,
            remaining: Math.max(0, limit.max - opData.count),
            resetIn: opData.resetAt - now,
            active: true
        };
    }
    
    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [guildId, guildOps] of this.guildData.entries()) {
            for (const [operationType, opData] of guildOps.entries()) {
                if (now >= opData.resetAt) {
                    guildOps.delete(operationType);
                    cleaned++;
                }
            }
            
            // Remove guild if no operations tracked
            if (guildOps.size === 0) {
                this.guildData.delete(guildId);
            }
        }
        
        if (cleaned > 0) {
            logger.debug(`Cleaned ${cleaned} expired guild rate limit entries`);
        }
    }
    
    /**
     * Get statistics
     * @returns {Object} Current statistics
     */
    getStats() {
        let totalOperations = 0;
        for (const guildOps of this.guildData.values()) {
            totalOperations += guildOps.size;
        }
        
        return {
            activeGuilds: this.guildData.size,
            totalOperations,
            limits: this.limits
        };
    }
    
    /**
     * Cleanup and stop background tasks
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.guildData.clear();
        logger.info('GuildRateLimiter destroyed');
    }
}

// Export singleton instances
export const commandRateLimiter = new CommandRateLimiter(5, 10000); // 5 commands per 10 seconds
export const guildRateLimiter = new GuildRateLimiter();

export default {
    CommandRateLimiter,
    GuildRateLimiter,
    commandRateLimiter,
    guildRateLimiter
};
