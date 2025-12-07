/**
 * User Preferences Model
 * Handle user settings and preferences
 */

import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';

class UserPreferences {
    /**
     * Get user preferences
     * @param {string} userId - Discord user ID
     * @returns {Object|null} User preferences
     */
    static get(userId) {
        try {
            const db = getDatabaseManager();
            const user = db.queryOne('SELECT * FROM users WHERE user_id = ?', [userId]);

            if (!user) {
                return this.getDefaults();
            }

            return {
                userId: user.user_id,
                username: user.username,
                defaultVolume: user.default_volume,
                autoResume: Boolean(user.auto_resume),
                notificationsEnabled: Boolean(user.notifications_enabled),
                language: user.language,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            };
        } catch (error) {
            logger.error('Failed to get user preferences', { userId, error });
            return this.getDefaults();
        }
    }

    /**
     * Set user preferences
     * @param {string} userId - Discord user ID
     * @param {Object} preferences - Preferences to set
     * @param {string} username - Discord username
     * @returns {boolean} Success
     */
    static set(userId, preferences, username = null) {
        try {
            const db = getDatabaseManager();

            // Check if user exists
            const existing = db.queryOne('SELECT user_id FROM users WHERE user_id = ?', [userId]);

            if (existing) {
                // Update existing user
                const updates = [];
                const params = [];

                if (username) {
                    updates.push('username = ?');
                    params.push(username);
                }
                if (preferences.defaultVolume !== undefined) {
                    updates.push('default_volume = ?');
                    params.push(preferences.defaultVolume);
                }
                if (preferences.autoResume !== undefined) {
                    updates.push('auto_resume = ?');
                    params.push(preferences.autoResume ? 1 : 0);
                }
                if (preferences.notificationsEnabled !== undefined) {
                    updates.push('notifications_enabled = ?');
                    params.push(preferences.notificationsEnabled ? 1 : 0);
                }
                if (preferences.language !== undefined) {
                    updates.push('language = ?');
                    params.push(preferences.language);
                }

                if (updates.length > 0) {
                    params.push(userId);
                    db.execute(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, params);
                }
            } else {
                // Insert new user
                db.execute(
                    `INSERT INTO users (user_id, username, default_volume, auto_resume, notifications_enabled, language)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        userId,
                        username,
                        preferences.defaultVolume || 50,
                        preferences.autoResume ? 1 : 0,
                        preferences.notificationsEnabled !== false ? 1 : 0,
                        preferences.language || 'vi'
                    ]
                );
            }

            logger.info('User preferences updated', { userId });
            return true;
        } catch (error) {
            logger.error('Failed to set user preferences', { userId, error });
            return false;
        }
    }

    /**
     * Get default preferences
     * @returns {Object} Default preferences
     */
    static getDefaults() {
        return {
            userId: null,
            username: null,
            defaultVolume: 50,
            autoResume: false,
            notificationsEnabled: true,
            language: 'vi',
            createdAt: null,
            updatedAt: null
        };
    }

    /**
     * Delete user preferences
     * @param {string} userId - Discord user ID
     * @returns {boolean} Success
     */
    static delete(userId) {
        try {
            const db = getDatabaseManager();
            db.execute('DELETE FROM users WHERE user_id = ?', [userId]);
            logger.info('User preferences deleted', { userId });
            return true;
        } catch (error) {
            logger.error('Failed to delete user preferences', { userId, error });
            return false;
        }
    }

    /**
     * Get all users count
     * @returns {number} Total users
     */
    static count() {
        try {
            const db = getDatabaseManager();
            const result = db.queryOne('SELECT COUNT(*) as count FROM users');
            return result.count;
        } catch (error) {
            logger.error('Failed to count users', error);
            return 0;
        }
    }
}

export default UserPreferences;
