/**
 * Guild Settings Model
 * Handle server-specific settings including DJ role, 24/7 mode, and vote skip
 */

import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';

// In-memory LRU cache with 60s TTL for guild settings
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_SIZE = 500;
const _settingsCache = new Map(); // guildId -> { data, expiresAt }

/**
 * Evict expired entries and trim to max size
 */
function _pruneCache() {
    const now = Date.now();
    for (const [key, entry] of _settingsCache) {
        if (now >= entry.expiresAt) _settingsCache.delete(key);
    }
    // LRU eviction: Map iterates in insertion order, so first entries are oldest
    while (_settingsCache.size > CACHE_MAX_SIZE) {
        const oldestKey = _settingsCache.keys().next().value;
        _settingsCache.delete(oldestKey);
    }
}

// Periodic cache cleanup (every 5 minutes)
const _cacheCleanupInterval = setInterval(_pruneCache, 300_000);
_cacheCleanupInterval.unref();

class GuildSettings {
    /**
     * Get guild settings
     * @param {string} guildId - Discord guild ID
     * @returns {Object} Guild settings
     */
    static get(guildId) {
        // Check cache first
        const cached = _settingsCache.get(guildId);
        if (cached && Date.now() < cached.expiresAt) {
            // Move to end for LRU ordering
            _settingsCache.delete(guildId);
            _settingsCache.set(guildId, cached);
            return cached.data;
        }

        try {
            const db = getDatabaseManager();
            const settings = db.queryOne('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);

            let result;
            if (!settings) {
                result = this.getDefaults(guildId);
            } else {
                result = {
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
            }

            // Store in cache
            _settingsCache.set(guildId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
            return result;
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

            const insertColumns = ['guild_id'];
            const insertValues = [guildId];
            const updateSets = [];

            const addField = (column, value) => {
                insertColumns.push(column);
                insertValues.push(value);
                updateSets.push(`${column} = excluded.${column}`);
            };

            if (guildName !== null && guildName !== undefined) {
                addField('guild_name', guildName);
            }
            if (settings.djRoleId !== undefined) {
                addField('dj_role_id', settings.djRoleId);
            }
            if (settings.djOnlyMode !== undefined) {
                addField('dj_only_mode', settings.djOnlyMode ? 1 : 0);
            }
            if (settings.voteSkipEnabled !== undefined) {
                addField('vote_skip_enabled', settings.voteSkipEnabled ? 1 : 0);
            }
            if (settings.voteSkipPercentage !== undefined) {
                addField('vote_skip_percentage', Math.max(10, Math.min(100, settings.voteSkipPercentage)));
            }
            if (settings.twentyFourSeven !== undefined) {
                addField('twenty_four_seven', settings.twentyFourSeven ? 1 : 0);
            }
            if (settings.announceSongs !== undefined) {
                addField('announce_songs', settings.announceSongs ? 1 : 0);
            }
            if (settings.defaultVolume !== undefined) {
                addField('default_volume', Math.max(0, Math.min(100, settings.defaultVolume)));
            }
            if (settings.maxQueueSize !== undefined) {
                addField('max_queue_size', Math.max(10, Math.min(1000, settings.maxQueueSize)));
            }
            if (settings.allowDuplicates !== undefined) {
                addField('allow_duplicates', settings.allowDuplicates ? 1 : 0);
            }

            const placeholders = insertColumns.map(() => '?').join(', ');
            if (updateSets.length === 0) {
                db.execute(
                    `INSERT OR IGNORE INTO guild_settings (${insertColumns.join(', ')}) VALUES (${placeholders})`,
                    insertValues
                );
            } else {
                db.execute(
                    `INSERT INTO guild_settings (${insertColumns.join(', ')}) VALUES (${placeholders})
                     ON CONFLICT(guild_id) DO UPDATE SET ${updateSets.join(', ')}`,
                    insertValues
                );
            }

            // Invalidate cache on write
            _settingsCache.delete(guildId);
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
            // Invalidate cache on delete
            _settingsCache.delete(guildId);
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
