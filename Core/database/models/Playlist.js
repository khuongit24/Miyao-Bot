/**
 * Playlist Model
 * Handle custom user playlists
 */

import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';

class Playlist {
    /**
     * Ensure user exists in database (auto-create if needed)
     * Uses INSERT OR IGNORE to avoid race conditions
     * @param {string} userId - Discord user ID
     * @param {string} username - Discord username (optional)
     * @returns {boolean} Success
     * @private
     */
    static _ensureUserExists(userId, username = null) {
        try {
            const db = getDatabaseManager();
            
            // Use INSERT OR IGNORE to handle race conditions gracefully
            // This is atomic and thread-safe in SQLite
            const result = db.execute(
                `INSERT OR IGNORE INTO users (user_id, username, default_volume, auto_resume, notifications_enabled, language)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, username, 50, 0, 1, 'vi']
            );
            
            // If changes > 0, user was created; if 0, user already existed
            if (result.changes > 0) {
                logger.info('Auto-created user record for playlist operation', { userId });
            }
            
            return true;
        } catch (error) {
            logger.error('Failed to ensure user exists', { userId, error });
            return false;
        }
    }
    /**
     * Create a new playlist
     * @param {string} userId - Discord user ID
     * @param {string} name - Playlist name
     * @param {Array} tracks - Array of tracks
     * @param {Object} options - Additional options
     * @returns {Object|null} Created playlist
     */
    static create(userId, name, tracks = [], options = {}) {
        try {
            // Ensure user exists before creating playlist
            if (!this._ensureUserExists(userId, options.username)) {
                logger.error('Cannot create playlist: user creation failed', { userId });
                return null;
            }
            
            const db = getDatabaseManager();
            
            const result = db.execute(
                `INSERT INTO playlists (user_id, name, description, tracks_json, is_public)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    userId,
                    name,
                    options.description || null,
                    JSON.stringify(tracks),
                    options.isPublic ? 1 : 0
                ]
            );
            
            logger.info('Playlist created', { userId, name, trackCount: tracks.length });
            
            return this.getById(result.lastInsertRowid);
        } catch (error) {
            logger.error('Failed to create playlist', { userId, name, error });
            return null;
        }
    }

    /**
     * Get playlist by ID
     * @param {number} playlistId - Playlist ID
     * @returns {Object|null} Playlist
     */
    static getById(playlistId) {
        try {
            const db = getDatabaseManager();
            const playlist = db.queryOne('SELECT * FROM playlists WHERE id = ?', [playlistId]);
            
            if (!playlist) return null;
            
            return this._formatPlaylist(playlist);
        } catch (error) {
            logger.error('Failed to get playlist', { playlistId, error });
            return null;
        }
    }

    /**
     * Get user's playlists
     * @param {string} userId - Discord user ID
     * @returns {Array} User's playlists
     */
    static getUserPlaylists(userId) {
        try {
            const db = getDatabaseManager();
            const playlists = db.query(
                'SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC',
                [userId]
            );
            
            return playlists.map(p => this._formatPlaylist(p));
        } catch (error) {
            logger.error('Failed to get user playlists', { userId, error });
            return [];
        }
    }

    /**
     * Get playlist by user and name
     * @param {string} userId - Discord user ID
     * @param {string} name - Playlist name
     * @returns {Object|null} Playlist
     */
    static getByName(userId, name) {
        try {
            const db = getDatabaseManager();
            const playlist = db.queryOne(
                'SELECT * FROM playlists WHERE user_id = ? AND name = ?',
                [userId, name]
            );
            
            if (!playlist) return null;
            
            return this._formatPlaylist(playlist);
        } catch (error) {
            logger.error('Failed to get playlist by name', { userId, name, error });
            return null;
        }
    }

    /**
     * Update playlist
     * @param {number} playlistId - Playlist ID
     * @param {Object} updates - Updates to apply
     * @returns {boolean} Success
     */
    static update(playlistId, updates) {
        try {
            const db = getDatabaseManager();
            
            const updateFields = [];
            const params = [];
            
            if (updates.name) {
                updateFields.push('name = ?');
                params.push(updates.name);
            }
            if (updates.description !== undefined) {
                updateFields.push('description = ?');
                params.push(updates.description);
            }
            if (updates.tracks) {
                updateFields.push('tracks_json = ?');
                params.push(JSON.stringify(updates.tracks));
            }
            if (updates.isPublic !== undefined) {
                updateFields.push('is_public = ?');
                params.push(updates.isPublic ? 1 : 0);
            }
            
            if (updateFields.length === 0) return false;
            
            params.push(playlistId);
            db.execute(
                `UPDATE playlists SET ${updateFields.join(', ')} WHERE id = ?`,
                params
            );
            
            logger.info('Playlist updated', { playlistId });
            return true;
        } catch (error) {
            logger.error('Failed to update playlist', { playlistId, error });
            return false;
        }
    }

    /**
     * Delete playlist
     * @param {number} playlistId - Playlist ID
     * @returns {boolean} Success
     */
    static delete(playlistId) {
        try {
            const db = getDatabaseManager();
            db.execute('DELETE FROM playlists WHERE id = ?', [playlistId]);
            logger.info('Playlist deleted', { playlistId });
            return true;
        } catch (error) {
            logger.error('Failed to delete playlist', { playlistId, error });
            return false;
        }
    }

    /**
     * Add track to playlist
     * @param {number} playlistId - Playlist ID
     * @param {Object} track - Track to add
     * @returns {boolean} Success
     */
    static addTrack(playlistId, track) {
        try {
            const playlist = this.getById(playlistId);
            if (!playlist) return false;
            
            playlist.tracks.push(track);
            return this.update(playlistId, { tracks: playlist.tracks });
        } catch (error) {
            logger.error('Failed to add track to playlist', { playlistId, error });
            return false;
        }
    }

    /**
     * Remove track from playlist
     * @param {number} playlistId - Playlist ID
     * @param {number} trackIndex - Track index to remove
     * @returns {boolean} Success
     */
    static removeTrack(playlistId, trackIndex) {
        try {
            const playlist = this.getById(playlistId);
            if (!playlist || trackIndex < 0 || trackIndex >= playlist.tracks.length) return false;
            
            playlist.tracks.splice(trackIndex, 1);
            return this.update(playlistId, { tracks: playlist.tracks });
        } catch (error) {
            logger.error('Failed to remove track from playlist', { playlistId, trackIndex, error });
            return false;
        }
    }

    /**
     * Increment play count
     * @param {number} playlistId - Playlist ID
     * @returns {boolean} Success
     */
    static incrementPlayCount(playlistId) {
        try {
            const db = getDatabaseManager();
            db.execute('UPDATE playlists SET play_count = play_count + 1 WHERE id = ?', [playlistId]);
            return true;
        } catch (error) {
            logger.error('Failed to increment play count', { playlistId, error });
            return false;
        }
    }

    /**
     * Format playlist from database row
     * @private
     */
    static _formatPlaylist(playlist) {
        return {
            id: playlist.id,
            userId: playlist.user_id,
            name: playlist.name,
            description: playlist.description,
            tracks: JSON.parse(playlist.tracks_json || '[]'),
            isPublic: Boolean(playlist.is_public),
            playCount: playlist.play_count,
            createdAt: playlist.created_at,
            updatedAt: playlist.updated_at
        };
    }
}

export default Playlist;
