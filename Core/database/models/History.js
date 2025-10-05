/**
 * History Model
 * Track play history with automatic retention
 */

import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';

class History {
    /**
     * Add track to history
     * @param {string} guildId - Discord guild ID
     * @param {string} userId - Discord user ID
     * @param {Object} track - Track information
     * @returns {boolean} Success
     */
    static add(guildId, userId, track) {
        try {
            const db = getDatabaseManager();
            
            db.execute(
                `INSERT INTO history (guild_id, user_id, track_title, track_author, track_url, track_duration)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    guildId,
                    userId,
                    track.info?.title || 'Unknown',
                    track.info?.author || 'Unknown',
                    track.info?.uri || null,
                    track.info?.length || 0
                ]
            );
            
            return true;
        } catch (error) {
            logger.error('Failed to add history', { guildId, userId, error });
            return false;
        }
    }

    /**
     * Get recent history for guild
     * @param {string} guildId - Discord guild ID
     * @param {number} limit - Maximum number of records
     * @returns {Array} History records
     */
    static getGuildHistory(guildId, limit = 10) {
        try {
            const db = getDatabaseManager();
            return db.query(
                'SELECT * FROM history WHERE guild_id = ? ORDER BY played_at DESC LIMIT ?',
                [guildId, limit]
            );
        } catch (error) {
            logger.error('Failed to get guild history', { guildId, error });
            return [];
        }
    }

    /**
     * Get user's history
     * @param {string} userId - Discord user ID
     * @param {number} limit - Maximum number of records
     * @returns {Array} History records
     */
    static getUserHistory(userId, limit = 10) {
        try {
            const db = getDatabaseManager();
            return db.query(
                'SELECT * FROM history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?',
                [userId, limit]
            );
        } catch (error) {
            logger.error('Failed to get user history', { userId, error });
            return [];
        }
    }

    /**
     * Get most played tracks for guild
     * @param {string} guildId - Discord guild ID
     * @param {number} limit - Maximum number of tracks
     * @param {string} period - Time period ('day', 'week', 'month', 'all')
     * @returns {Array} Most played tracks
     */
    static getMostPlayed(guildId, limit = 10, period = 'all') {
        try {
            const db = getDatabaseManager();
            
            let dateFilter = '';
            switch (period) {
                case 'day':
                    dateFilter = "AND played_at > datetime('now', '-1 day')";
                    break;
                case 'week':
                    dateFilter = "AND played_at > datetime('now', '-7 days')";
                    break;
                case 'month':
                    dateFilter = "AND played_at > datetime('now', '-30 days')";
                    break;
            }
            
            return db.query(
                `SELECT track_title, track_author, track_url,
                        COUNT(*) as play_count,
                        MAX(played_at) as last_played
                 FROM history
                 WHERE guild_id = ? ${dateFilter}
                 GROUP BY track_url
                 ORDER BY play_count DESC
                 LIMIT ?`,
                [guildId, limit]
            );
        } catch (error) {
            logger.error('Failed to get most played tracks', { guildId, error });
            return [];
        }
    }

    /**
     * Get listening statistics for user
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Discord guild ID (optional)
     * @returns {Object} Statistics
     */
    static getUserStats(userId, guildId = null) {
        try {
            const db = getDatabaseManager();
            
            const guildFilter = guildId ? 'AND guild_id = ?' : '';
            const params = guildId ? [userId, guildId] : [userId];
            
            const stats = db.queryOne(
                `SELECT 
                    COUNT(*) as total_plays,
                    SUM(track_duration) as total_listening_time,
                    MIN(played_at) as first_played_at,
                    MAX(played_at) as last_played_at
                 FROM history 
                 WHERE user_id = ? ${guildFilter}`,
                params
            );
            
            if (!stats || stats.total_plays === 0) {
                return null;
            }
            
            return {
                totalPlays: stats.total_plays,
                totalListeningTime: stats.total_listening_time || 0,
                firstPlayedAt: stats.first_played_at,
                lastPlayedAt: stats.last_played_at
            };
        } catch (error) {
            logger.error('Failed to get user stats', { userId, error });
            return null;
        }
    }

    /**
     * Get user's top tracks
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Discord guild ID (optional)
     * @param {number} limit - Maximum number of tracks
     * @returns {Array} Top tracks
     */
    static getTopTracks(userId, guildId = null, limit = 10) {
        try {
            const db = getDatabaseManager();
            
            const guildFilter = guildId ? 'AND guild_id = ?' : '';
            const params = guildId ? [userId, guildId, limit] : [userId, limit];
            
            return db.query(
                `SELECT 
                    track_title as track_name,
                    track_author,
                    track_url,
                    COUNT(*) as play_count,
                    MAX(played_at) as last_played
                 FROM history
                 WHERE user_id = ? ${guildFilter}
                 GROUP BY track_url
                 ORDER BY play_count DESC
                 LIMIT ?`,
                params
            );
        } catch (error) {
            logger.error('Failed to get top tracks', { userId, error });
            return [];
        }
    }

    /**
     * Get listening patterns (by hour of day)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Discord guild ID (optional)
     * @returns {Array} Hourly statistics
     */
    static getListeningPatterns(userId, guildId = null) {
        try {
            const db = getDatabaseManager();
            
            const guildFilter = guildId ? 'AND guild_id = ?' : '';
            const params = guildId ? [userId, guildId] : [userId];
            
            return db.query(
                `SELECT 
                    CAST(strftime('%H', played_at) AS INTEGER) as hour_of_day,
                    COUNT(*) as play_count
                 FROM history
                 WHERE user_id = ? ${guildFilter}
                 GROUP BY hour_of_day
                 ORDER BY hour_of_day`,
                params
            );
        } catch (error) {
            logger.error('Failed to get listening patterns', { userId, error });
            return [];
        }
    }

    /**
     * Get server-wide statistics
     * @param {string} guildId - Discord guild ID
     * @param {string} period - Time period ('day', 'week', 'month', 'all')
     * @returns {Object} Server statistics
     */
    static getServerStats(guildId, period = 'all') {
        try {
            const db = getDatabaseManager();
            
            let dateFilter = '';
            switch (period) {
                case 'day':
                    dateFilter = "AND played_at > datetime('now', '-1 day')";
                    break;
                case 'week':
                    dateFilter = "AND played_at > datetime('now', '-7 days')";
                    break;
                case 'month':
                    dateFilter = "AND played_at > datetime('now', '-30 days')";
                    break;
            }
            
            const stats = db.queryOne(
                `SELECT 
                    COUNT(*) as total_plays,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(DISTINCT track_url) as unique_tracks,
                    SUM(track_duration) as total_duration
                 FROM history
                 WHERE guild_id = ? ${dateFilter}`,
                [guildId]
            );
            
            if (!stats || stats.total_plays === 0) {
                return null;
            }
            
            return {
                totalPlays: stats.total_plays,
                uniqueUsers: stats.unique_users,
                uniqueTracks: stats.unique_tracks,
                totalDuration: stats.total_duration || 0
            };
        } catch (error) {
            logger.error('Failed to get server stats', { guildId, error });
            return null;
        }
    }

    /**
     * Get most active users in server
     * @param {string} guildId - Discord guild ID
     * @param {number} limit - Maximum number of users
     * @param {string} period - Time period ('day', 'week', 'month', 'all')
     * @returns {Array} Most active users
     */
    static getMostActiveUsers(guildId, limit = 10, period = 'all') {
        try {
            const db = getDatabaseManager();
            
            let dateFilter = '';
            switch (period) {
                case 'day':
                    dateFilter = "AND played_at > datetime('now', '-1 day')";
                    break;
                case 'week':
                    dateFilter = "AND played_at > datetime('now', '-7 days')";
                    break;
                case 'month':
                    dateFilter = "AND played_at > datetime('now', '-30 days')";
                    break;
            }
            
            return db.query(
                `SELECT 
                    user_id,
                    COUNT(*) as play_count,
                    SUM(track_duration) as total_listening_time
                 FROM history
                 WHERE guild_id = ? ${dateFilter}
                 GROUP BY user_id
                 ORDER BY play_count DESC
                 LIMIT ?`,
                [guildId, limit]
            );
        } catch (error) {
            logger.error('Failed to get most active users', { guildId, error });
            return [];
        }
    }

    /**
     * Get peak listening hours for server
     * @param {string} guildId - Discord guild ID
     * @returns {Array} Hourly statistics
     */
    static getServerPeakHours(guildId) {
        try {
            const db = getDatabaseManager();
            
            return db.query(
                `SELECT 
                    CAST(strftime('%H', played_at) AS INTEGER) as hour_of_day,
                    COUNT(*) as play_count
                 FROM history
                 WHERE guild_id = ?
                 GROUP BY hour_of_day
                 ORDER BY play_count DESC
                 LIMIT 5`,
                [guildId]
            );
        } catch (error) {
            logger.error('Failed to get server peak hours', { guildId, error });
            return [];
        }
    }

    /**
     * Clear old history (manual cleanup trigger)
     * @param {number} days - Number of days to keep
     * @returns {number} Number of records deleted
     */
    static cleanup(days = 30) {
        try {
            const db = getDatabaseManager();
            const result = db.execute(
                "DELETE FROM history WHERE played_at < datetime('now', ?)",
                [`-${days} days`]
            );
            
            if (result.changes > 0) {
                logger.info(`Cleaned up ${result.changes} history records older than ${days} days`);
            }
            
            return result.changes;
        } catch (error) {
            logger.error('Failed to cleanup history', error);
            return 0;
        }
    }
}

export default History;
