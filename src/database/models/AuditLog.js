/**
 * Audit Log Model
 * Tracks admin actions and important events for security auditing
 */

import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';

export class AuditLog {
    /**
     * Initialize audit log table
     */
    static initialize(db) {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                user_id TEXT NOT NULL,
                guild_id TEXT,
                target_id TEXT,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                status TEXT DEFAULT 'success',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        
        db.prepare(createTableSQL).run();
        
        // Create indexes for faster queries
        db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id 
            ON audit_logs(user_id)
        `).run();
        
        db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_id 
            ON audit_logs(guild_id)
        `).run();
        
        db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_audit_logs_action 
            ON audit_logs(action)
        `).run();
        
        db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at 
            ON audit_logs(created_at)
        `).run();
        
        logger.info('Audit log table initialized');
    }
    
    /**
     * Log an action
     * @param {string} action - Action type (e.g., 'config_change', 'user_kick', 'filter_update')
     * @param {string} userId - User ID who performed the action
     * @param {string} guildId - Guild ID where action occurred
     * @param {Object} options - Additional options
     * @param {string} options.targetId - Target user/resource ID
     * @param {Object} options.details - Additional details (will be JSON stringified)
     * @param {string} options.ipAddress - IP address of requester
     * @param {string} options.userAgent - User agent string
     * @param {string} options.status - Action status (success/failed)
     * @returns {number} Log ID
     */
    static log(action, userId, guildId, options = {}) {
        try {
            const db = getDatabaseManager().getDatabase();
            
            const {
                targetId = null,
                details = null,
                ipAddress = null,
                userAgent = null,
                status = 'success'
            } = options;
            
            const detailsJSON = details ? JSON.stringify(details) : null;
            
            const stmt = db.prepare(`
                INSERT INTO audit_logs (action, user_id, guild_id, target_id, details, ip_address, user_agent, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            const result = stmt.run(
                action,
                userId,
                guildId,
                targetId,
                detailsJSON,
                ipAddress,
                userAgent,
                status
            );
            
            logger.info(`Audit log created: ${action}`, {
                userId,
                guildId,
                targetId,
                status
            });
            
            return result.lastInsertRowid;
        } catch (error) {
            logger.error('Failed to create audit log', error);
            return null;
        }
    }
    
    /**
     * Get audit logs with filters
     * @param {Object} filters - Filter options
     * @param {string} filters.userId - Filter by user ID
     * @param {string} filters.guildId - Filter by guild ID
     * @param {string} filters.action - Filter by action type
     * @param {number} filters.limit - Limit number of results (default: 100)
     * @param {number} filters.offset - Offset for pagination
     * @param {string} filters.since - ISO date string for filtering by date
     * @returns {Array} Array of audit log entries
     */
    static getLogs(filters = {}) {
        try {
            const db = getDatabaseManager().getDatabase();
            
            const {
                userId = null,
                guildId = null,
                action = null,
                limit = 100,
                offset = 0,
                since = null
            } = filters;
            
            let query = 'SELECT * FROM audit_logs WHERE 1=1';
            const params = [];
            
            if (userId) {
                query += ' AND user_id = ?';
                params.push(userId);
            }
            
            if (guildId) {
                query += ' AND guild_id = ?';
                params.push(guildId);
            }
            
            if (action) {
                query += ' AND action = ?';
                params.push(action);
            }
            
            if (since) {
                query += ' AND created_at >= ?';
                params.push(since);
            }
            
            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);
            
            const stmt = db.prepare(query);
            const logs = stmt.all(...params);
            
            // Parse JSON details
            return logs.map(log => ({
                ...log,
                details: log.details ? JSON.parse(log.details) : null
            }));
        } catch (error) {
            logger.error('Failed to get audit logs', error);
            return [];
        }
    }
    
    /**
     * Get audit log by ID
     * @param {number} id - Log ID
     * @returns {Object|null} Audit log entry
     */
    static getById(id) {
        try {
            const db = getDatabaseManager().getDatabase();
            
            const stmt = db.prepare('SELECT * FROM audit_logs WHERE id = ?');
            const log = stmt.get(id);
            
            if (!log) return null;
            
            return {
                ...log,
                details: log.details ? JSON.parse(log.details) : null
            };
        } catch (error) {
            logger.error('Failed to get audit log by ID', error);
            return null;
        }
    }
    
    /**
     * Get audit logs for a specific user
     * @param {string} userId - User ID
     * @param {number} limit - Limit number of results
     * @returns {Array} Array of audit log entries
     */
    static getUserLogs(userId, limit = 50) {
        return this.getLogs({ userId, limit });
    }
    
    /**
     * Get audit logs for a specific guild
     * @param {string} guildId - Guild ID
     * @param {number} limit - Limit number of results
     * @returns {Array} Array of audit log entries
     */
    static getGuildLogs(guildId, limit = 100) {
        return this.getLogs({ guildId, limit });
    }
    
    /**
     * Get recent logs (last 24 hours)
     * @param {string} guildId - Optional guild ID filter
     * @param {number} limit - Limit number of results
     * @returns {Array} Array of audit log entries
     */
    static getRecentLogs(guildId = null, limit = 50) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        return this.getLogs({ guildId, since, limit });
    }
    
    /**
     * Get logs by action type
     * @param {string} action - Action type
     * @param {string} guildId - Optional guild ID filter
     * @param {number} limit - Limit number of results
     * @returns {Array} Array of audit log entries
     */
    static getLogsByAction(action, guildId = null, limit = 50) {
        return this.getLogs({ action, guildId, limit });
    }
    
    /**
     * Count logs with filters
     * @param {Object} filters - Same filters as getLogs
     * @returns {number} Count of matching logs
     */
    static count(filters = {}) {
        try {
            const db = getDatabaseManager().getDatabase();
            
            const {
                userId = null,
                guildId = null,
                action = null,
                since = null
            } = filters;
            
            let query = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
            const params = [];
            
            if (userId) {
                query += ' AND user_id = ?';
                params.push(userId);
            }
            
            if (guildId) {
                query += ' AND guild_id = ?';
                params.push(guildId);
            }
            
            if (action) {
                query += ' AND action = ?';
                params.push(action);
            }
            
            if (since) {
                query += ' AND created_at >= ?';
                params.push(since);
            }
            
            const stmt = db.prepare(query);
            const result = stmt.get(...params);
            
            return result?.count || 0;
        } catch (error) {
            logger.error('Failed to count audit logs', error);
            return 0;
        }
    }
    
    /**
     * Clean up old logs (older than retention period)
     * @param {number} retentionDays - Number of days to retain logs (default: 90)
     * @returns {number} Number of logs deleted
     */
    static cleanup(retentionDays = 90) {
        try {
            const db = getDatabaseManager().getDatabase();
            
            const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
            
            const stmt = db.prepare('DELETE FROM audit_logs WHERE created_at < ?');
            const result = stmt.run(cutoffDate);
            
            if (result.changes > 0) {
                logger.info(`Cleaned up ${result.changes} old audit logs (older than ${retentionDays} days)`);
            }
            
            return result.changes;
        } catch (error) {
            logger.error('Failed to cleanup audit logs', error);
            return 0;
        }
    }
    
    /**
     * Get audit log statistics
     * @param {string} guildId - Optional guild ID filter
     * @returns {Object} Statistics object
     */
    static getStats(guildId = null) {
        try {
            const db = getDatabaseManager().getDatabase();
            
            let query = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(DISTINCT action) as unique_actions,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                    MIN(created_at) as oldest,
                    MAX(created_at) as newest
                FROM audit_logs
                WHERE 1=1
            `;
            
            const params = [];
            
            if (guildId) {
                query += ' AND guild_id = ?';
                params.push(guildId);
            }
            
            const stmt = db.prepare(query);
            const stats = stmt.get(...params);
            
            return stats;
        } catch (error) {
            logger.error('Failed to get audit log stats', error);
            return {
                total: 0,
                unique_users: 0,
                unique_actions: 0,
                successful: 0,
                failed: 0,
                oldest: null,
                newest: null
            };
        }
    }
}

export default AuditLog;
