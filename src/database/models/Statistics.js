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
            const stats = db.queryOne('SELECT * FROM guild_statistics WHERE guild_id = ?', [guildId]);
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
                const fields = Object.keys(updates)
                    .map(k => `${k} = ?`)
                    .join(', ');
                const values = [...Object.values(updates), guildId];

                db.execute(`UPDATE guild_statistics SET ${fields} WHERE guild_id = ?`, values);
            } else {
                // Insert new
                const fields = ['guild_id', ...Object.keys(updates)];
                const placeholders = fields.map(() => '?').join(', ');
                const values = [guildId, ...Object.values(updates)];

                db.execute(`INSERT INTO guild_statistics (${fields.join(', ')}) VALUES (${placeholders})`, values);
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
            db.execute(
                `
                INSERT INTO guild_statistics (guild_id, ${field})
                VALUES (?, ?)
                ON CONFLICT(guild_id) DO UPDATE SET 
                    ${field} = ${field} + excluded.${field},
                    updated_at = CURRENT_TIMESTAMP
            `,
                [guildId, amount]
            );

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

            db.execute(
                `
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
            `,
                [guildId, trackInfo.duration || 0]
            );

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
            return db.query(
                `
                SELECT * FROM guild_statistics
                ORDER BY total_tracks_played DESC
                LIMIT ?
            `,
                [limit]
            );
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
            const stats = db.queryOne('SELECT * FROM user_statistics WHERE user_id = ? AND guild_id = ?', [
                userId,
                guildId
            ]);
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
            return db.query('SELECT * FROM user_statistics WHERE user_id = ? ORDER BY tracks_played DESC', [userId]);
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
                const fields = Object.keys(updates)
                    .map(k => `${k} = ?`)
                    .join(', ');
                const values = [...Object.values(updates), userId, guildId];

                db.execute(`UPDATE user_statistics SET ${fields} WHERE user_id = ? AND guild_id = ?`, values);
            } else {
                const fields = ['user_id', 'guild_id', ...Object.keys(updates)];
                const placeholders = fields.map(() => '?').join(', ');
                const values = [userId, guildId, ...Object.values(updates)];

                db.execute(`INSERT INTO user_statistics (${fields.join(', ')}) VALUES (${placeholders})`, values);
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

            db.execute(
                `
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
            `,
                [userId, guildId, trackInfo.duration || 0]
            );

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
            return db.query(
                `
                SELECT * FROM user_statistics
                WHERE guild_id = ?
                ORDER BY tracks_played DESC
                LIMIT ?
            `,
                [guildId, limit]
            );
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
            const stats = db.queryOne(
                `
                SELECT 
                    COUNT(*) as guild_count,
                    SUM(tracks_played) as total_tracks_played,
                    SUM(listening_time) as total_listening_time,
                    MIN(first_played_at) as first_played_at,
                    MAX(last_played_at) as last_played_at
                FROM user_statistics
                WHERE user_id = ?
            `,
                [userId]
            );

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
            const stats = db.queryOne('SELECT * FROM track_statistics WHERE track_url = ?', [trackUrl]);
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
                const fields = Object.keys(updates)
                    .map(k => `${k} = ?`)
                    .join(', ');
                const values = [...Object.values(updates), trackUrl];

                db.execute(`UPDATE track_statistics SET ${fields} WHERE track_url = ?`, values);
            } else {
                const fields = ['track_url', ...Object.keys(updates)];
                const placeholders = fields.map(() => '?').join(', ');
                const values = [trackUrl, ...Object.values(updates)];

                db.execute(`INSERT INTO track_statistics (${fields.join(', ')}) VALUES (${placeholders})`, values);
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

            db.execute(
                `
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
            `,
                [trackUrl, trackInfo.title || 'Unknown', trackInfo.author || 'Unknown', trackInfo.duration || 0]
            );

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

            return db.query(
                `
                SELECT * FROM track_statistics
                WHERE 1=1 ${dateFilter.replace('played_at', 'last_played_at')}
                ORDER BY total_plays DESC
                LIMIT ?
            `,
                [limit]
            );
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
            return db.query(
                `
                SELECT * FROM track_statistics
                ORDER BY last_played_at DESC
                LIMIT ?
            `,
                [limit]
            );
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
            return db.query(
                `
                SELECT * FROM track_statistics
                WHERE track_title LIKE ? OR track_author LIKE ?
                ORDER BY total_plays DESC
                LIMIT ?
            `,
                [`%${query}%`, `%${query}%`, limit]
            );
        } catch (error) {
            logger.error('Failed to search tracks', { query, error });
            return [];
        }
    }

    /**
     * Get top tracks by time period
     * Enhanced version that supports today, week, month, all-time
     * @param {string} guildId - Guild ID (optional, null for global)
     * @param {number} limit - Maximum number of tracks
     * @param {string} period - Time period ('today', 'week', 'month', 'all')
     * @returns {Array} Top tracks for the period
     */
    static getTopTracksByPeriod(guildId = null, limit = 10, period = 'all') {
        try {
            const db = getDatabaseManager();

            let dateFilter = '';
            switch (period) {
                case 'today':
                    dateFilter = "AND played_at > datetime('now', '-1 day')";
                    break;
                case 'week':
                    dateFilter = "AND played_at > datetime('now', '-7 days')";
                    break;
                case 'month':
                    dateFilter = "AND played_at > datetime('now', '-30 days')";
                    break;
                default:
                    dateFilter = '';
            }

            const guildFilter = guildId ? 'AND guild_id = ?' : '';
            const params = guildId ? [guildId, limit] : [limit];

            return db.query(
                `
                SELECT 
                    track_title,
                    track_author,
                    track_url,
                    COUNT(*) as play_count,
                    SUM(track_duration) as total_duration,
                    COUNT(DISTINCT user_id) as unique_listeners,
                    MAX(played_at) as last_played
                FROM history
                WHERE 1=1 ${guildFilter} ${dateFilter}
                GROUP BY track_url
                ORDER BY play_count DESC
                LIMIT ?
            `,
                params
            );
        } catch (error) {
            logger.error('Failed to get top tracks by period', { guildId, period, error });
            return [];
        }
    }
}

/**
 * Enhanced Statistics Service
 * Advanced aggregations and analytics
 */
export class EnhancedStatisticsService {
    /**
     * Get listening time per user in a guild
     * @param {string} guildId - Guild ID
     * @param {string} period - Time period ('today', 'week', 'month', 'all')
     * @param {number} limit - Maximum number of users
     * @returns {Array} Users sorted by listening time
     */
    static getListeningTimePerUser(guildId, period = 'all', limit = 10) {
        try {
            const db = getDatabaseManager();

            let dateFilter = '';
            switch (period) {
                case 'today':
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
                `
                SELECT 
                    user_id,
                    COUNT(*) as tracks_played,
                    SUM(COALESCE(track_duration, 0)) as total_listening_time_ms,
                    COUNT(DISTINCT track_url) as unique_tracks,
                    MIN(played_at) as first_play,
                    MAX(played_at) as last_play,
                    ROUND(SUM(COALESCE(track_duration, 0)) / 1000.0 / 60.0, 1) as minutes_listened
                FROM history
                WHERE guild_id = ? ${dateFilter}
                GROUP BY user_id
                ORDER BY total_listening_time_ms DESC
                LIMIT ?
            `,
                [guildId, limit]
            );
        } catch (error) {
            logger.error('Failed to get listening time per user', { guildId, period, error });
            return [];
        }
    }

    /**
     * Get peak usage hours for a guild
     * Returns hourly breakdown of listening activity
     * @param {string} guildId - Guild ID
     * @param {string} period - Time period ('week', 'month', 'all')
     * @returns {Array} Hourly statistics (0-23)
     */
    static getPeakUsageHours(guildId, period = 'month') {
        try {
            const db = getDatabaseManager();

            let dateFilter = '';
            switch (period) {
                case 'week':
                    dateFilter = "AND played_at > datetime('now', '-7 days')";
                    break;
                case 'month':
                    dateFilter = "AND played_at > datetime('now', '-30 days')";
                    break;
            }

            const rawData = db.query(
                `
                SELECT 
                    CAST(strftime('%H', played_at) AS INTEGER) as hour,
                    COUNT(*) as play_count,
                    COUNT(DISTINCT user_id) as unique_users,
                    SUM(track_duration) as total_duration
                FROM history
                WHERE guild_id = ? ${dateFilter}
                GROUP BY hour
                ORDER BY hour
            `,
                [guildId]
            );

            // Fill in missing hours with zeros
            const hourlyData = [];
            for (let h = 0; h < 24; h++) {
                const found = rawData.find(d => d.hour === h);
                hourlyData.push({
                    hour: h,
                    play_count: found?.play_count || 0,
                    unique_users: found?.unique_users || 0,
                    total_duration: found?.total_duration || 0
                });
            }

            return hourlyData;
        } catch (error) {
            logger.error('Failed to get peak usage hours', { guildId, period, error });
            return [];
        }
    }

    /**
     * Get daily activity breakdown for the past week
     * @param {string} guildId - Guild ID
     * @returns {Array} Daily statistics
     */
    static getDailyActivity(guildId) {
        try {
            const db = getDatabaseManager();

            return db.query(
                `
                SELECT 
                    DATE(played_at) as date,
                    strftime('%w', played_at) as day_of_week,
                    COUNT(*) as play_count,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(DISTINCT track_url) as unique_tracks,
                    SUM(track_duration) as total_duration
                FROM history
                WHERE guild_id = ? 
                AND played_at > datetime('now', '-7 days')
                GROUP BY DATE(played_at)
                ORDER BY date DESC
            `,
                [guildId]
            );
        } catch (error) {
            logger.error('Failed to get daily activity', { guildId, error });
            return [];
        }
    }

    /**
     * Get genre/artist breakdown (based on most common authors)
     * @param {string} guildId - Guild ID
     * @param {string} period - Time period
     * @param {number} limit - Maximum artists
     * @returns {Array} Artist breakdown
     */
    static getArtistBreakdown(guildId, period = 'month', limit = 10) {
        try {
            const db = getDatabaseManager();

            let dateFilter = '';
            switch (period) {
                case 'week':
                    dateFilter = "AND played_at > datetime('now', '-7 days')";
                    break;
                case 'month':
                    dateFilter = "AND played_at > datetime('now', '-30 days')";
                    break;
            }

            return db.query(
                `
                SELECT 
                    track_author as artist,
                    COUNT(*) as play_count,
                    COUNT(DISTINCT track_url) as unique_tracks,
                    COUNT(DISTINCT user_id) as listeners,
                    SUM(track_duration) as total_duration
                FROM history
                WHERE guild_id = ? 
                AND track_author IS NOT NULL 
                AND track_author != '' 
                AND track_author != 'Unknown'
                ${dateFilter}
                GROUP BY track_author
                ORDER BY play_count DESC
                LIMIT ?
            `,
                [guildId, limit]
            );
        } catch (error) {
            logger.error('Failed to get artist breakdown', { guildId, period, error });
            return [];
        }
    }

    /**
     * Generate a text-based activity chart
     * @param {Array} hourlyData - Array of hourly statistics
     * @param {number} maxWidth - Maximum chart width in characters
     * @returns {string} Text-based chart
     */
    static generateActivityChart(hourlyData, maxWidth = 24) {
        if (!hourlyData || hourlyData.length === 0) {
            return 'Không có dữ liệu để hiển thị biểu đồ';
        }

        const maxCount = Math.max(...hourlyData.map(h => h.play_count));
        if (maxCount === 0) return 'Không có hoạt động';

        // Find peak hours
        const peakHours = hourlyData
            .filter(h => h.play_count > 0)
            .sort((a, b) => b.play_count - a.play_count)
            .slice(0, 3);

        // Generate simple text chart
        const chartLines = [];

        // Group hours into 4-hour blocks for cleaner display
        const blocks = [
            { label: '🌙 00-06h', hours: [0, 1, 2, 3, 4, 5] },
            { label: '🌅 06-12h', hours: [6, 7, 8, 9, 10, 11] },
            { label: '☀️ 12-18h', hours: [12, 13, 14, 15, 16, 17] },
            { label: '🌆 18-24h', hours: [18, 19, 20, 21, 22, 23] }
        ];

        for (const block of blocks) {
            const blockCount = hourlyData
                .filter(h => block.hours.includes(h.hour))
                .reduce((sum, h) => sum + h.play_count, 0);

            const barLength = Math.ceil((blockCount / maxCount) * maxWidth);
            const bar = '█'.repeat(barLength) + '░'.repeat(maxWidth - barLength);

            chartLines.push(`${block.label} ${bar} ${blockCount}`);
        }

        // Add peak info
        if (peakHours.length > 0) {
            chartLines.push('');
            chartLines.push(`⏰ Giờ cao điểm: ${peakHours.map(p => `${p.hour}h (${p.play_count})`).join(', ')}`);
        }

        return chartLines.join('\n');
    }

    /**
     * Generate a listening streak report for a user
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {Object} Streak information
     */
    static getUserStreak(userId, guildId) {
        try {
            const db = getDatabaseManager();

            // Get all unique play dates for the user
            const playDates = db.query(
                `
                SELECT DISTINCT DATE(played_at) as play_date
                FROM history
                WHERE user_id = ? AND guild_id = ?
                ORDER BY play_date DESC
                LIMIT 365
            `,
                [userId, guildId]
            );

            if (playDates.length === 0) {
                return { currentStreak: 0, longestStreak: 0, totalDays: 0 };
            }

            // Calculate streaks
            let currentStreak = 0;
            let longestStreak = 0;
            let tempStreak = 1;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const lastPlayDate = new Date(playDates[0].play_date);
            lastPlayDate.setHours(0, 0, 0, 0);

            // Check if last play was today or yesterday
            const daysSinceLastPlay = Math.floor((today - lastPlayDate) / (1000 * 60 * 60 * 24));

            if (daysSinceLastPlay <= 1) {
                currentStreak = 1;

                // Count consecutive days
                for (let i = 1; i < playDates.length; i++) {
                    const prevDate = new Date(playDates[i - 1].play_date);
                    const currDate = new Date(playDates[i].play_date);
                    const diff = Math.floor((prevDate - currDate) / (1000 * 60 * 60 * 24));

                    if (diff === 1) {
                        tempStreak++;
                        currentStreak = tempStreak;
                    } else {
                        longestStreak = Math.max(longestStreak, tempStreak);
                        tempStreak = 1;
                    }
                }
            }

            longestStreak = Math.max(longestStreak, tempStreak);

            return {
                currentStreak: daysSinceLastPlay <= 1 ? currentStreak : 0,
                longestStreak,
                totalDays: playDates.length,
                lastPlayed: playDates[0].play_date
            };
        } catch (error) {
            logger.error('Failed to get user streak', { userId, guildId, error });
            return { currentStreak: 0, longestStreak: 0, totalDays: 0 };
        }
    }

    /**
     * Get comprehensive server analytics
     * @param {string} guildId - Guild ID
     * @returns {Object} Complete analytics data
     */
    static getServerAnalytics(guildId) {
        try {
            const analytics = {
                overview: GuildStatistics.get(guildId),
                topTracks: {
                    today: TrackStatistics.getTopTracksByPeriod(guildId, 5, 'today'),
                    week: TrackStatistics.getTopTracksByPeriod(guildId, 5, 'week'),
                    month: TrackStatistics.getTopTracksByPeriod(guildId, 5, 'month'),
                    allTime: TrackStatistics.getTopTracksByPeriod(guildId, 5, 'all')
                },
                topListeners: this.getListeningTimePerUser(guildId, 'month', 5),
                peakHours: this.getPeakUsageHours(guildId, 'month'),
                dailyActivity: this.getDailyActivity(guildId),
                topArtists: this.getArtistBreakdown(guildId, 'month', 5)
            };

            // Generate chart
            analytics.activityChart = this.generateActivityChart(analytics.peakHours);

            return analytics;
        } catch (error) {
            logger.error('Failed to get server analytics', { guildId, error });
            return null;
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
                mostPlayed: TrackStatistics.getMostPlayed(5)
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
                byGuild: UserStatistics.getAllForUser(userId)
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
    EnhancedStatisticsService
};
