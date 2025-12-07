/**
 * Guild Settings Model
 * Handle server-specific settings including DJ role, 24/7 mode, and vote skip
 */

import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';

class GuildSettings {
    /**
     * Get guild settings
     * @param {string} guildId - Discord guild ID
     * @returns {Object} Guild settings
     */
    static get(guildId) {
        try {
            const db = getDatabaseManager();
            const settings = db.queryOne('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);

            if (!settings) {
                return this.getDefaults(guildId);
            }

            return {
                guildId: settings.guild_id,
                guildName: settings.guild_name,
                djRoleId: settings.dj_role_id,
                djOnlyMode: Boolean(settings.dj_only_mode),
                voteSkipEnabled: Boolean(settings.vote_skip_enabled),
                voteSkipPercentage: settings.vote_skip_percentage,
                twentyFourSeven: Boolean(settings.twenty_four_seven),
                announceSongs: Boolean(settings.announce_songs),
                defaultVolume: settings.default_volume,
                maxQueueSize: settings.max_queue_size,
                allowDuplicates: Boolean(settings.allow_duplicates),
                createdAt: settings.created_at,
                updatedAt: settings.updated_at
            };
        } catch (error) {
            logger.error('Failed to get guild settings', { guildId, error: error.message });
            return this.getDefaults(guildId);
        }
    }

    /**
     * Set guild settings
     * @param {string} guildId - Discord guild ID
     * @param {Object} settings - Settings to update
     * @param {string} guildName - Optional guild name
     * @returns {boolean} Success
     */
    static set(guildId, settings, guildName = null) {
        try {
            const db = getDatabaseManager();

            // Check if guild exists
            const existing = db.queryOne('SELECT guild_id FROM guild_settings WHERE guild_id = ?', [guildId]);

            if (existing) {
                // Update existing settings
                const updates = [];
                const params = [];

                if (guildName) {
                    updates.push('guild_name = ?');
                    params.push(guildName);
                }
                if (settings.djRoleId !== undefined) {
                    updates.push('dj_role_id = ?');
                    params.push(settings.djRoleId);
                }
                if (settings.djOnlyMode !== undefined) {
                    updates.push('dj_only_mode = ?');
                    params.push(settings.djOnlyMode ? 1 : 0);
                }
                if (settings.voteSkipEnabled !== undefined) {
                    updates.push('vote_skip_enabled = ?');
                    params.push(settings.voteSkipEnabled ? 1 : 0);
                }
                if (settings.voteSkipPercentage !== undefined) {
                    updates.push('vote_skip_percentage = ?');
                    params.push(Math.max(10, Math.min(100, settings.voteSkipPercentage)));
                }
                if (settings.twentyFourSeven !== undefined) {
                    updates.push('twenty_four_seven = ?');
                    params.push(settings.twentyFourSeven ? 1 : 0);
                }
                if (settings.announceSongs !== undefined) {
                    updates.push('announce_songs = ?');
                    params.push(settings.announceSongs ? 1 : 0);
                }
                if (settings.defaultVolume !== undefined) {
                    updates.push('default_volume = ?');
                    params.push(Math.max(0, Math.min(100, settings.defaultVolume)));
                }
                if (settings.maxQueueSize !== undefined) {
                    updates.push('max_queue_size = ?');
                    params.push(Math.max(10, Math.min(1000, settings.maxQueueSize)));
                }
                if (settings.allowDuplicates !== undefined) {
                    updates.push('allow_duplicates = ?');
                    params.push(settings.allowDuplicates ? 1 : 0);
                }

                if (updates.length > 0) {
                    params.push(guildId);
                    db.execute(`UPDATE guild_settings SET ${updates.join(', ')} WHERE guild_id = ?`, params);
                }
            } else {
                // Insert new guild settings
                db.execute(
                    `INSERT INTO guild_settings (
                        guild_id, guild_name, dj_role_id, dj_only_mode, vote_skip_enabled,
                        vote_skip_percentage, twenty_four_seven, announce_songs,
                        default_volume, max_queue_size, allow_duplicates
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        guildId,
                        guildName,
                        settings.djRoleId || null,
                        settings.djOnlyMode ? 1 : 0,
                        settings.voteSkipEnabled ? 1 : 0,
                        settings.voteSkipPercentage || 50,
                        settings.twentyFourSeven ? 1 : 0,
                        settings.announceSongs !== false ? 1 : 0,
                        settings.defaultVolume || 50,
                        settings.maxQueueSize || 500,
                        settings.allowDuplicates !== false ? 1 : 0
                    ]
                );
            }

            logger.info('Guild settings updated', { guildId });
            return true;
        } catch (error) {
            logger.error('Failed to set guild settings', { guildId, error: error.message });
            return false;
        }
    }

    /**
     * Get default settings for a guild
     * @param {string} guildId - Discord guild ID
     * @returns {Object} Default settings
     */
    static getDefaults(guildId = null) {
        return {
            guildId,
            guildName: null,
            djRoleId: null,
            djOnlyMode: false,
            voteSkipEnabled: false,
            voteSkipPercentage: 50,
            twentyFourSeven: false,
            announceSongs: true,
            defaultVolume: 50,
            maxQueueSize: 500,
            allowDuplicates: true,
            createdAt: null,
            updatedAt: null
        };
    }

    /**
     * Check if user has DJ permissions
     * @param {Object} member - Discord guild member
     * @param {Object} guildSettings - Guild settings object
     * @returns {boolean} Whether user has DJ permissions
     */
    static hasDJPermissions(member, guildSettings) {
        // Bot owner always has DJ permissions
        if (member.user.id === process.env.OWNER_ID) {
            return true;
        }

        // Server administrators always have DJ permissions
        if (member.permissions.has('Administrator')) {
            return true;
        }

        // If no DJ role is set or DJ-only mode is disabled, everyone has permissions
        if (!guildSettings.djRoleId || !guildSettings.djOnlyMode) {
            return true;
        }

        // Check if user has the DJ role
        return member.roles.cache.has(guildSettings.djRoleId);
    }

    /**
     * Delete guild settings
     * @param {string} guildId - Discord guild ID
     * @returns {boolean} Success
     */
    static delete(guildId) {
        try {
            const db = getDatabaseManager();
            db.execute('DELETE FROM guild_settings WHERE guild_id = ?', [guildId]);
            logger.info('Guild settings deleted', { guildId });
            return true;
        } catch (error) {
            logger.error('Failed to delete guild settings', { guildId, error: error.message });
            return false;
        }
    }

    /**
     * Get all guilds with 24/7 mode enabled
     * @returns {Array} List of guild IDs with 24/7 mode
     */
    static getTwentyFourSevenGuilds() {
        try {
            const db = getDatabaseManager();
            const results = db.query('SELECT guild_id FROM guild_settings WHERE twenty_four_seven = 1');
            return results.map(r => r.guild_id);
        } catch (error) {
            logger.error('Failed to get 24/7 guilds', { error: error.message });
            return [];
        }
    }

    /**
     * Get count of all guilds with custom settings
     * @returns {number} Total guilds with settings
     */
    static count() {
        try {
            const db = getDatabaseManager();
            const result = db.queryOne('SELECT COUNT(*) as count FROM guild_settings');
            return result.count;
        } catch (error) {
            logger.error('Failed to count guild settings', { error: error.message });
            return 0;
        }
    }
}

export default GuildSettings;
