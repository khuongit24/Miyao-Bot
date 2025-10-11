/**
 * Statistics Models
 * Specialized models for guild, user, and track statistics
 * Replaces the generic EAV statistics table for better performance
 * @module Statistics
 */

import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';
import { getDateFilter } from '../helpers.js';

/**
 * Guild Statistics Model
 * Server-wide metrics and activity tracking
 */
export class GuildStatistics {
    /**
     * Get statistics for a guild
     * @param {string} guildId - Discord guild ID
     * @returns {Object|null} Guild statistics
     */
    static get(guildId) {
        try {
            const db = getDatabaseManager();
            const stats = db.queryOne(
                'SELECT * FROM guild_statistics WHERE guild_id = ?',
                [guildId]
            );
            return stats || null;
        } catch (error) {
            logger.error('Failed to get guild statistics', { guildId, error });
            return null;
        }
    }
    
    /**
     * Update guild statistics (upsert)
     * @param {string} guildId - Discord guild ID
     * @param {Object} updates - Statistics to update
     * @returns {boolean} Success
     */
    static update(guildId, updates) {
        try {
            const db = getDatabaseManager();
            
            // Check if exists
            const existing = this.get(guildId);
            
            if (existing) {
                // Update existing
                const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
                const values = [...Object.values(updates), guildId];
                
                db.execute(
                    `UPDATE guild_statistics SET ${fields} WHERE guild_id = ?`,
                    values
                );
            } else {
                // Insert new
                const fields = ['guild_id', ...Object.keys(updates)];
                const placeholders = fields.map(() => '?').join(', ');
                const values = [guildId, ...Object.values(updates)];
                
                db.execute(
                    `INSERT INTO guild_statistics (${fields.join(', ')}) VALUES (${placeholders})`,
                    values
                );
            }
            
            return true;
        } catch (error) {
            logger.error('Failed to update guild statistics', { guildId, error });
            return false;
        }
    }
    
    /**
     * Increment a counter field
     * @param {string} guildId - Discord guild ID
     * @param {string} field - Field name to increment
     * @param {number} amount - Amount to increment (default: 1)
     * @returns {boolean} Success
     */
    static increment(guildId, field, amount = 1) {
        try {
            const db = getDatabaseManager();
            
            // Upsert with increment
            db.execute(`
                INSERT INTO guild_statistics (guild_id, ${field})
                VALUES (?, ?)
                ON CONFLICT(guild_id) DO UPDATE SET 
                    ${field} = ${field} + excluded.${field},
                    updated_at = CURRENT_TIMESTAMP
            `, [guildId, amount]);
            
            return true;
        } catch (error) {
            logger.error('Failed to increment guild statistic', { guildId, field, error });
            return false;
        }
    }
    
    /**
     * Record track play (updates multiple fields)
     * @param {string} guildId - Discord guild ID
     * @param {Object} trackInfo - Track information
     * @returns {boolean} Success
     */
    static recordTrackPlay(guildId, trackInfo) {
        try {
            const db = getDatabaseManager();
            
            db.execute(`
                INSERT INTO guild_statistics (
                    guild_id, 
                    total_tracks_played, 
                    total_listening_time,
                    last_activity_at
                )
                VALUES (?, 1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(guild_id) DO UPDATE SET
                    total_tracks_played = total_tracks_played + 1,
                    total_listening_time = total_listening_time + excluded.total_listening_time,
                    last_activity_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
            `, [guildId, trackInfo.duration || 0]);
            
            return true;
        } catch (error) {
            logger.error('Failed to record track play', { guildId, error });
            return false;
        }
    }
    
    /**
     * Get top guilds by activity
     * @param {number} limit - Maximum number of guilds
     * @returns {Array} Top guilds
     */
    static getTopGuilds(limit = 10) {
        try {
            const db = getDatabaseManager();
            return db.query(`
                SELECT * FROM guild_statistics
                ORDER BY total_tracks_played DESC
                LIMIT ?
            `, [limit]);
        } catch (error) {
            logger.error('Failed to get top guilds', error);
            return [];
        }
    }
}

/**
 * User Statistics Model
 * Per-user, per-guild metrics
 */
export class UserStatistics {
    /**
     * Get statistics for a user in a guild
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Discord guild ID
     * @returns {Object|null} User statistics
     */
    static get(userId, guildId) {
        try {
            const db = getDatabaseManager();
            const stats = db.queryOne(
                'SELECT * FROM user_statistics WHERE user_id = ? AND guild_id = ?',
                [userId, guildId]
            );
            return stats || null;
        } catch (error) {
            logger.error('Failed to get user statistics', { userId, guildId, error });
            return null;
        }
    }
    
    /**
     * Get all statistics for a user across all guilds
     * @param {string} userId - Discord user ID
     * @returns {Array} User statistics
     */
    static getAllForUser(userId) {
        try {
            const db = getDatabaseManager();
            return db.query(
                'SELECT * FROM user_statistics WHERE user_id = ? ORDER BY tracks_played DESC',
                [userId]
            );
        } catch (error) {
            logger.error('Failed to get user statistics', { userId, error });
            return [];
        }
    }
    
    /**
     * Update user statistics
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Discord guild ID
     * @param {Object} updates - Statistics to update
     * @returns {boolean} Success
     */
    static update(userId, guildId, updates) {
        try {
            const db = getDatabaseManager();
            
            const existing = this.get(userId, guildId);
            
            if (existing) {
                const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
                const values = [...Object.values(updates), userId, guildId];
                
                db.execute(
                    `UPDATE user_statistics SET ${fields} WHERE user_id = ? AND guild_id = ?`,
                    values
                );
            } else {
                const fields = ['user_id', 'guild_id', ...Object.keys(updates)];
                const placeholders = fields.map(() => '?').join(', ');
                const values = [userId, guildId, ...Object.values(updates)];
                
                db.execute(
                    `INSERT INTO user_statistics (${fields.join(', ')}) VALUES (${placeholders})`,
                    values
                );
            }
            
            return true;
        } catch (error) {
            logger.error('Failed to update user statistics', { userId, guildId, error });
            return false;
        }
    }
    
    /**
     * Record track play for user
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Discord guild ID
     * @param {Object} trackInfo - Track information
     * @returns {boolean} Success
     */
    static recordTrackPlay(userId, guildId, trackInfo) {
        try {
            const db = getDatabaseManager();
            
            db.execute(`
                INSERT INTO user_statistics (
                    user_id,
                    guild_id,
                    tracks_played,
                    listening_time,
                    last_played_at
                )
                VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, guild_id) DO UPDATE SET
                    tracks_played = tracks_played + 1,
                    listening_time = listening_time + excluded.listening_time,
                    last_played_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, guildId, trackInfo.duration || 0]);
            
            return true;
        } catch (error) {
            logger.error('Failed to record user track play', { userId, guildId, error });
            return false;
        }
    }
    
    /**
     * Get top users in a guild
     * @param {string} guildId - Discord guild ID
     * @param {number} limit - Maximum number of users
     * @returns {Array} Top users
     */
    static getTopUsersInGuild(guildId, limit = 10) {
        try {
            const db = getDatabaseManager();
            return db.query(`
                SELECT * FROM user_statistics
                WHERE guild_id = ?
                ORDER BY tracks_played DESC
                LIMIT ?
            `, [guildId, limit]);
        } catch (error) {
            logger.error('Failed to get top users', { guildId, error });
            return [];
        }
    }
    
    /**
     * Get total statistics for a user (across all guilds)
     * @param {string} userId - Discord user ID
     * @returns {Object} Aggregated statistics
     */
    static getTotalForUser(userId) {
        try {
            const db = getDatabaseManager();
            const stats = db.queryOne(`
                SELECT 
                    COUNT(*) as guild_count,
                    SUM(tracks_played) as total_tracks_played,
                    SUM(listening_time) as total_listening_time,
                    MIN(first_played_at) as first_played_at,
                    MAX(last_played_at) as last_played_at
                FROM user_statistics
                WHERE user_id = ?
            `, [userId]);
            
            return stats || null;
        } catch (error) {
            logger.error('Failed to get total user statistics', { userId, error });
            return null;
        }
    }
}

/**
 * Track Statistics Model
 * Track popularity and play metrics
 */
export class TrackStatistics {
    /**
     * Get statistics for a track
     * @param {string} trackUrl - Track URL
     * @returns {Object|null} Track statistics
     */
    static get(trackUrl) {
        try {
            const db = getDatabaseManager();
            const stats = db.queryOne(
                'SELECT * FROM track_statistics WHERE track_url = ?',
                [trackUrl]
            );
            return stats || null;
        } catch (error) {
            logger.error('Failed to get track statistics', { trackUrl, error });
            return null;
        }
    }
    
    /**
     * Update track statistics
     * @param {string} trackUrl - Track URL
     * @param {Object} updates - Statistics to update
     * @returns {boolean} Success
     */
    static update(trackUrl, updates) {
        try {
            const db = getDatabaseManager();
            
            const existing = this.get(trackUrl);
            
            if (existing) {
                const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
                const values = [...Object.values(updates), trackUrl];
                
                db.execute(
                    `UPDATE track_statistics SET ${fields} WHERE track_url = ?`,
                    values
                );
            } else {
                const fields = ['track_url', ...Object.keys(updates)];
                const placeholders = fields.map(() => '?').join(', ');
                const values = [trackUrl, ...Object.values(updates)];
                
                db.execute(
                    `INSERT INTO track_statistics (${fields.join(', ')}) VALUES (${placeholders})`,
                    values
                );
            }
            
            return true;
        } catch (error) {
            logger.error('Failed to update track statistics', { trackUrl, error });
            return false;
        }
    }
    
    /**
     * Record track play
     * @param {string} trackUrl - Track URL
     * @param {Object} trackInfo - Track information
     * @param {string} userId - User who played the track
     * @returns {boolean} Success
     */
    static recordPlay(trackUrl, trackInfo, userId) {
        try {
            const db = getDatabaseManager();
            
            db.execute(`
                INSERT INTO track_statistics (
                    track_url,
                    track_title,
                    track_author,
                    track_duration,
                    total_plays,
                    last_played_at
                )
                VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
                ON CONFLICT(track_url) DO UPDATE SET
                    total_plays = total_plays + 1,
                    last_played_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                trackUrl,
                trackInfo.title || 'Unknown',
                trackInfo.author || 'Unknown',
                trackInfo.duration || 0
            ]);
            
            return true;
        } catch (error) {
            logger.error('Failed to record track play', { trackUrl, error });
            return false;
        }
    }
    
    /**
     * Get most played tracks
     * @param {number} limit - Maximum number of tracks
     * @param {string} period - Time period filter ('day', 'week', 'month', 'all')
     * @returns {Array} Most played tracks
     */
    static getMostPlayed(limit = 10, period = 'all') {
        try {
            const db = getDatabaseManager();
            const dateFilter = getDateFilter(period);
            
            return db.query(`
                SELECT * FROM track_statistics
                WHERE 1=1 ${dateFilter.replace('played_at', 'last_played_at')}
                ORDER BY total_plays DESC
                LIMIT ?
            `, [limit]);
        } catch (error) {
            logger.error('Failed to get most played tracks', error);
            return [];
        }
    }
    
    /**
     * Get recently played tracks
     * @param {number} limit - Maximum number of tracks
     * @returns {Array} Recently played tracks
     */
    static getRecentlyPlayed(limit = 10) {
        try {
            const db = getDatabaseManager();
            return db.query(`
                SELECT * FROM track_statistics
                ORDER BY last_played_at DESC
                LIMIT ?
            `, [limit]);
        } catch (error) {
            logger.error('Failed to get recently played tracks', error);
            return [];
        }
    }
    
    /**
     * Search tracks by title or author
     * @param {string} query - Search query
     * @param {number} limit - Maximum number of results
     * @returns {Array} Matching tracks
     */
    static search(query, limit = 25) {
        try {
            const db = getDatabaseManager();
            return db.query(`
                SELECT * FROM track_statistics
                WHERE track_title LIKE ? OR track_author LIKE ?
                ORDER BY total_plays DESC
                LIMIT ?
            `, [`%${query}%`, `%${query}%`, limit]);
        } catch (error) {
            logger.error('Failed to search tracks', { query, error });
            return [];
        }
    }
}

/**
 * Unified Statistics Service
 * Convenience methods for recording plays across all statistics tables
 */
export class StatisticsService {
    /**
     * Record a track play (updates all statistics tables)
     * @param {string} guildId - Discord guild ID
     * @param {string} userId - Discord user ID
     * @param {Object} trackInfo - Track information
     * @returns {boolean} Success
     */
    static recordPlay(guildId, userId, trackInfo) {
        try {
            // Update all statistics atomically
            const db = getDatabaseManager();
            
            db.transaction(() => {
                GuildStatistics.recordTrackPlay(guildId, trackInfo);
                UserStatistics.recordTrackPlay(userId, guildId, trackInfo);
                TrackStatistics.recordPlay(trackInfo.url || trackInfo.uri, trackInfo, userId);
            })();
            
            return true;
        } catch (error) {
            logger.error('Failed to record play statistics', { guildId, userId, error });
            return false;
        }
    }
    
    /**
     * Get comprehensive statistics for a guild
     * @param {string} guildId - Discord guild ID
     * @returns {Object} Complete guild statistics
     */
    static getGuildStats(guildId) {
        try {
            return {
                guild: GuildStatistics.get(guildId),
                topUsers: UserStatistics.getTopUsersInGuild(guildId, 5),
                mostPlayed: TrackStatistics.getMostPlayed(5),
            };
        } catch (error) {
            logger.error('Failed to get guild statistics', { guildId, error });
            return null;
        }
    }
    
    /**
     * Get comprehensive statistics for a user
     * @param {string} userId - Discord user ID
     * @returns {Object} Complete user statistics
     */
    static getUserStats(userId) {
        try {
            return {
                total: UserStatistics.getTotalForUser(userId),
                byGuild: UserStatistics.getAllForUser(userId),
            };
        } catch (error) {
            logger.error('Failed to get user statistics', { userId, error });
            return null;
        }
    }
}

export default {
    GuildStatistics,
    UserStatistics,
    TrackStatistics,
    StatisticsService,
};
