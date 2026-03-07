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

            const insertColumns = ['user_id'];
            const insertValues = [userId];
            const updateSets = [];

            const addField = (column, value, includeInUpdate = true) => {
                insertColumns.push(column);
                insertValues.push(value);
                if (includeInUpdate) {
                    updateSets.push(`${column} = excluded.${column}`);
                }
            };

            if (username !== null && username !== undefined) {
                addField('username', username);
            }
            if (preferences.defaultVolume !== undefined) {
                addField('default_volume', preferences.defaultVolume);
            }
            if (preferences.autoResume !== undefined) {
                addField('auto_resume', preferences.autoResume ? 1 : 0);
            }
            if (preferences.notificationsEnabled !== undefined) {
                addField('notifications_enabled', preferences.notificationsEnabled ? 1 : 0);
            }
            if (preferences.language !== undefined) {
                addField('language', preferences.language);
            }

            // Preserve existing insert defaults while allowing explicit 0 for defaultVolume
            if (!insertColumns.includes('default_volume')) {
                addField('default_volume', preferences.defaultVolume ?? 50, false);
            }
            if (!insertColumns.includes('auto_resume')) {
                addField('auto_resume', preferences.autoResume ? 1 : 0, false);
            }
            if (!insertColumns.includes('notifications_enabled')) {
                addField('notifications_enabled', preferences.notificationsEnabled !== false ? 1 : 0, false);
            }
            if (!insertColumns.includes('language')) {
                addField('language', preferences.language || 'vi', false);
            }

            const placeholders = insertColumns.map(() => '?').join(', ');
            if (updateSets.length === 0) {
                db.execute(
                    `INSERT OR IGNORE INTO users (${insertColumns.join(', ')}) VALUES (${placeholders})`,
                    insertValues
                );
            } else {
                db.execute(
                    `INSERT INTO users (${insertColumns.join(', ')}) VALUES (${placeholders})
                     ON CONFLICT(user_id) DO UPDATE SET ${updateSets.join(', ')}`,
                    insertValues
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
