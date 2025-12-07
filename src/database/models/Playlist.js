/**
 * @file Playlist.js
 * @description Playlist model for managing user playlists
 * @version 1.6.0
 */

import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';
import { DatabaseError } from '../../utils/errors.js';

class Playlist {
    /**
     * Create a new playlist
     * @param {string} name - Playlist name
     * @param {string} ownerId - Discord user ID
     * @param {string} ownerUsername - Discord username
     * @param {string} guildId - Discord guild ID
     * @param {string} [description] - Playlist description
     * @param {boolean} [isPublic=false] - Whether playlist is public
     * @returns {Object} Created playlist
     */
    static create(name, ownerId, ownerUsername, guildId, description = null, isPublic = false) {
        try {
            const db = getDatabaseManager();

            const stmt = db.db.prepare(`
                INSERT INTO playlists (name, owner_id, owner_username, guild_id, description, is_public)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            const info = stmt.run(name, ownerId, ownerUsername, guildId, description, isPublic ? 1 : 0);

            logger.info('Playlist created', {
                playlistId: info.lastInsertRowid,
                name,
                ownerId,
                guildId
            });

            return this.getById(info.lastInsertRowid);
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                throw new DatabaseError(`Playlist "${name}" already exists for this user in this server`);
            }
            logger.error('Failed to create playlist', { error: error.message, name, ownerId, guildId });
            throw new DatabaseError('Failed to create playlist', error);
        }
    }

    /**
     * Get playlist by ID
     * @param {number} playlistId - Playlist ID
     * @returns {Object|null} Playlist object or null
     */
    static getById(playlistId) {
        try {
            const db = getDatabaseManager();

            const stmt = db.db.prepare(`
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.id = ?
                GROUP BY p.id
            `);

            const playlist = stmt.get(playlistId);
            return playlist || null;
        } catch (error) {
            logger.error('Failed to get playlist by ID', { error: error.message, playlistId });
            throw new DatabaseError('Failed to get playlist', error);
        }
    }

    /**
     * Get all playlists for a user in a guild
     * @param {string} ownerId - Owner user ID
     * @param {string} guildId - Guild ID
     * @param {boolean} [publicOnly=false] - Only return public playlists
     * @returns {Array} Array of playlists
     */
    static getByOwner(ownerId, guildId, publicOnly = false) {
        try {
            const db = getDatabaseManager();

            let query = `
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.owner_id = ? AND p.guild_id = ?
            `;

            if (publicOnly) {
                query += ' AND p.is_public = 1';
            }

            query += ' GROUP BY p.id ORDER BY p.updated_at DESC';

            const stmt = db.db.prepare(query);
            return stmt.all(ownerId, guildId);
        } catch (error) {
            logger.error('Failed to get playlists by owner', { error: error.message, ownerId, guildId });
            throw new DatabaseError('Failed to get playlists', error);
        }
    }

    /**
     * Get playlist by name, owner, and guild
     * @param {string} name - Playlist name
     * @param {string} ownerId - Owner user ID
     * @param {string} guildId - Guild ID
     * @returns {Object|null} Playlist object or null
     */
    static getByName(name, ownerId, guildId) {
        try {
            const db = getDatabaseManager();

            const stmt = db.db.prepare(`
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.name = ? AND p.owner_id = ? AND p.guild_id = ?
                GROUP BY p.id
            `);

            return stmt.get(name, ownerId, guildId) || null;
        } catch (error) {
            logger.error('Failed to get playlist by name', { error: error.message, name, ownerId, guildId });
            throw new DatabaseError('Failed to get playlist', error);
        }
    }

    /**
     * Get playlist by name in a guild - searches user's own playlists first, then public playlists
     * @param {string} name - Playlist name
     * @param {string} userId - User ID (to check ownership first)
     * @param {string} guildId - Guild ID
     * @returns {Object|null} Playlist object or null
     */
    static findByNameInGuild(name, userId, guildId) {
        try {
            const db = getDatabaseManager();

            // First, try to find user's own playlist
            const ownPlaylist = this.getByName(name, userId, guildId);
            if (ownPlaylist) {
                return ownPlaylist;
            }

            // If not found, search for public playlist with that name in the guild
            const stmt = db.db.prepare(`
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.name = ? AND p.guild_id = ? AND p.is_public = 1
                GROUP BY p.id
                LIMIT 1
            `);

            return stmt.get(name, guildId) || null;
        } catch (error) {
            logger.error('Failed to find playlist by name in guild', { error: error.message, name, userId, guildId });
            throw new DatabaseError('Failed to find playlist', error);
        }
    }

    /**
     * Update playlist
     * @param {number} playlistId - Playlist ID
     * @param {string} ownerId - Owner user ID (for permission check)
     * @param {Object} changes - Object with fields to update
     * @returns {Object} Updated playlist
     */
    static update(playlistId, ownerId, changes) {
        try {
            const db = getDatabaseManager();

            // Verify ownership
            const playlist = this.getById(playlistId);
            if (!playlist) {
                throw new DatabaseError('Playlist not found');
            }
            if (playlist.owner_id !== ownerId) {
                throw new DatabaseError('You do not have permission to modify this playlist');
            }

            // Build update query
            const allowedFields = ['name', 'description', 'thumbnail', 'is_public'];
            const updates = [];
            const values = [];

            for (const [key, value] of Object.entries(changes)) {
                if (allowedFields.includes(key)) {
                    updates.push(`${key} = ?`);
                    values.push(key === 'is_public' ? (value ? 1 : 0) : value);
                }
            }

            if (updates.length === 0) {
                return playlist;
            }

            values.push(playlistId);

            const stmt = db.db.prepare(`
                UPDATE playlists
                SET ${updates.join(', ')}
                WHERE id = ?
            `);

            stmt.run(...values);

            logger.info('Playlist updated', { playlistId, changes: Object.keys(changes) });
            return this.getById(playlistId);
        } catch (error) {
            logger.error('Failed to update playlist', { error: error.message, playlistId });
            throw new DatabaseError('Failed to update playlist', error);
        }
    }

    /**
     * Delete playlist
     * @param {number} playlistId - Playlist ID
     * @param {string} ownerId - Owner user ID (for permission check)
     * @returns {boolean} Success
     */
    static delete(playlistId, ownerId) {
        try {
            const db = getDatabaseManager();

            // Verify ownership
            const playlist = this.getById(playlistId);
            if (!playlist) {
                throw new DatabaseError('Playlist not found');
            }
            if (playlist.owner_id !== ownerId) {
                throw new DatabaseError('You do not have permission to delete this playlist');
            }

            const stmt = db.db.prepare('DELETE FROM playlists WHERE id = ?');
            stmt.run(playlistId);

            logger.info('Playlist deleted', { playlistId, ownerId });
            return true;
        } catch (error) {
            logger.error('Failed to delete playlist', { error: error.message, playlistId });
            throw new DatabaseError('Failed to delete playlist', error);
        }
    }

    /**
     * Add track to playlist
     * @param {number} playlistId - Playlist ID
     * @param {Object} track - Track object
     * @param {string} addedBy - User ID who added the track
     * @returns {Object} Added track
     */
    static addTrack(playlistId, track, addedBy) {
        try {
            const db = getDatabaseManager();

            // Get next position
            const posStmt = db.db.prepare(`
                SELECT COALESCE(MAX(position), 0) + 1 as next_position
                FROM playlist_tracks
                WHERE playlist_id = ?
            `);
            const { next_position } = posStmt.get(playlistId);

            const stmt = db.db.prepare(`
                INSERT INTO playlist_tracks (playlist_id, track_url, track_title, track_author, track_duration, position, added_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            const info = stmt.run(
                playlistId,
                track.url || track.uri,
                track.title || track.name,
                track.author || track.artist,
                track.duration || track.length,
                next_position,
                addedBy
            );

            logger.info('Track added to playlist', {
                playlistId,
                trackId: info.lastInsertRowid,
                title: track.title
            });

            return {
                id: info.lastInsertRowid,
                playlist_id: playlistId,
                track_url: track.url || track.uri,
                track_title: track.title || track.name,
                track_author: track.author || track.artist,
                track_duration: track.duration || track.length,
                position: next_position,
                added_by: addedBy
            };
        } catch (error) {
            logger.error('Failed to add track to playlist', { error: error.message, playlistId });
            throw new DatabaseError('Failed to add track to playlist', error);
        }
    }

    /**
     * Remove track from playlist
     * @param {number} playlistId - Playlist ID
     * @param {number} trackId - Track ID
     * @param {string} ownerId - Owner user ID (for permission check)
     * @returns {boolean} Success
     */
    static removeTrack(playlistId, trackId, ownerId) {
        try {
            const db = getDatabaseManager();

            // Verify ownership
            const playlist = this.getById(playlistId);
            if (!playlist) {
                throw new DatabaseError('Playlist not found');
            }
            if (playlist.owner_id !== ownerId) {
                throw new DatabaseError('You do not have permission to modify this playlist');
            }

            const stmt = db.db.prepare('DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?');
            const info = stmt.run(trackId, playlistId);

            if (info.changes === 0) {
                throw new DatabaseError('Track not found in playlist');
            }

            logger.info('Track removed from playlist', { playlistId, trackId });
            return true;
        } catch (error) {
            logger.error('Failed to remove track from playlist', { error: error.message, playlistId, trackId });
            throw new DatabaseError('Failed to remove track from playlist', error);
        }
    }

    /**
     * Get all tracks in a playlist
     * @param {number} playlistId - Playlist ID
     * @returns {Array} Array of tracks
     */
    static getTracks(playlistId) {
        try {
            const db = getDatabaseManager();

            const stmt = db.db.prepare(`
                SELECT * FROM playlist_tracks
                WHERE playlist_id = ?
                ORDER BY position ASC
            `);

            return stmt.all(playlistId);
        } catch (error) {
            logger.error('Failed to get playlist tracks', { error: error.message, playlistId });
            throw new DatabaseError('Failed to get playlist tracks', error);
        }
    }

    /**
     * Move track to new position
     * @param {number} playlistId - Playlist ID
     * @param {number} fromPosition - Current position (1-indexed)
     * @param {number} toPosition - New position (1-indexed)
     * @param {string} ownerId - Owner user ID (for permission check)
     * @returns {boolean} Success
     */
    static moveTrack(playlistId, fromPosition, toPosition, ownerId) {
        try {
            const db = getDatabaseManager();

            // Verify ownership
            const playlist = this.getById(playlistId);
            if (!playlist) {
                throw new DatabaseError('Playlist not found');
            }
            if (playlist.owner_id !== ownerId) {
                throw new DatabaseError('You do not have permission to modify this playlist');
            }

            // Use transaction for atomic operation
            db.db.prepare('BEGIN').run();

            try {
                // Get track at fromPosition
                const getStmt = db.db.prepare(`
                    SELECT id FROM playlist_tracks
                    WHERE playlist_id = ? AND position = ?
                `);
                const track = getStmt.get(playlistId, fromPosition);

                if (!track) {
                    throw new DatabaseError('Track not found at specified position');
                }

                if (fromPosition === toPosition) {
                    db.db.prepare('COMMIT').run();
                    return true;
                }

                // Shift positions
                if (fromPosition < toPosition) {
                    // Moving down: shift tracks between from and to up by 1
                    db.db
                        .prepare(
                            `
                        UPDATE playlist_tracks
                        SET position = position - 1
                        WHERE playlist_id = ? AND position > ? AND position <= ?
                    `
                        )
                        .run(playlistId, fromPosition, toPosition);
                } else {
                    // Moving up: shift tracks between to and from down by 1
                    db.db
                        .prepare(
                            `
                        UPDATE playlist_tracks
                        SET position = position + 1
                        WHERE playlist_id = ? AND position >= ? AND position < ?
                    `
                        )
                        .run(playlistId, toPosition, fromPosition);
                }

                // Update moved track's position
                db.db
                    .prepare(
                        `
                    UPDATE playlist_tracks
                    SET position = ?
                    WHERE id = ?
                `
                    )
                    .run(toPosition, track.id);

                db.db.prepare('COMMIT').run();

                logger.info('Track moved in playlist', { playlistId, fromPosition, toPosition });
                return true;
            } catch (error) {
                db.db.prepare('ROLLBACK').run();
                throw error;
            }
        } catch (error) {
            logger.error('Failed to move track in playlist', { error: error.message, playlistId });
            throw new DatabaseError('Failed to move track in playlist', error);
        }
    }

    /**
     * Clear all tracks from playlist
     * @param {number} playlistId - Playlist ID
     * @param {string} ownerId - Owner user ID (for permission check)
     * @returns {boolean} Success
     */
    static clearTracks(playlistId, ownerId) {
        try {
            const db = getDatabaseManager();

            // Verify ownership
            const playlist = this.getById(playlistId);
            if (!playlist) {
                throw new DatabaseError('Playlist not found');
            }
            if (playlist.owner_id !== ownerId) {
                throw new DatabaseError('You do not have permission to modify this playlist');
            }

            const stmt = db.db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?');
            stmt.run(playlistId);

            logger.info('Playlist tracks cleared', { playlistId });
            return true;
        } catch (error) {
            logger.error('Failed to clear playlist tracks', { error: error.message, playlistId });
            throw new DatabaseError('Failed to clear playlist tracks', error);
        }
    }

    /**
     * Get all public playlists in a guild
     * @param {string} guildId - Guild ID
     * @param {number} [limit=50] - Maximum number of playlists to return
     * @returns {Array} Array of public playlists
     */
    static getPublic(guildId, limit = 50) {
        try {
            const db = getDatabaseManager();

            const stmt = db.db.prepare(`
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.guild_id = ? AND p.is_public = 1
                GROUP BY p.id
                ORDER BY p.updated_at DESC
                LIMIT ?
            `);

            return stmt.all(guildId, limit);
        } catch (error) {
            logger.error('Failed to get public playlists', { error: error.message, guildId });
            throw new DatabaseError('Failed to get public playlists', error);
        }
    }

    /**
     * Search playlists by name
     * @param {string} guildId - Guild ID
     * @param {string} query - Search query
     * @param {boolean} [publicOnly=false] - Only search public playlists
     * @returns {Array} Array of matching playlists
     */
    static search(guildId, query, publicOnly = false) {
        try {
            const db = getDatabaseManager();

            let sql = `
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.guild_id = ? AND p.name LIKE ?
            `;

            if (publicOnly) {
                sql += ' AND p.is_public = 1';
            }

            sql += ' GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 25';

            const stmt = db.db.prepare(sql);
            return stmt.all(guildId, `%${query}%`);
        } catch (error) {
            logger.error('Failed to search playlists', { error: error.message, guildId, query });
            throw new DatabaseError('Failed to search playlists', error);
        }
    }
}

export default Playlist;
