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

            const info = db.execute(
                `
                INSERT INTO playlists (name, owner_id, owner_username, guild_id, description, is_public)
                VALUES (?, ?, ?, ?, ?, ?)
            `,
                [name, ownerId, ownerUsername, guildId, description, isPublic ? 1 : 0]
            );

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

            const playlist = db.queryOne(
                `
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.id = ?
                GROUP BY p.id
            `,
                [playlistId]
            );
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

            return db.query(query, [ownerId, guildId]);
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

            return (
                db.queryOne(
                    `
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.name = ? AND p.owner_id = ? AND p.guild_id = ?
                GROUP BY p.id
            `,
                    [name, ownerId, guildId]
                ) || null
            );
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
            return (
                db.queryOne(
                    `
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.name = ? AND p.guild_id = ? AND p.is_public = 1
                GROUP BY p.id
                LIMIT 1
            `,
                    [name, guildId]
                ) || null
            );
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
                const playlist = this.getById(playlistId);
                if (!playlist) {
                    throw new DatabaseError('Playlist not found');
                }
                if (playlist.owner_id !== ownerId) {
                    throw new DatabaseError('You do not have permission to modify this playlist');
                }
                return playlist;
            }

            // Combine ownership check with mutation in a single atomic statement (P2-09)
            values.push(playlistId, ownerId);

            const info = db.execute(
                `
                UPDATE playlists
                SET ${updates.join(', ')}
                WHERE id = ? AND owner_id = ?
            `,
                values
            );

            if (info.changes === 0) {
                const existing = this.getById(playlistId);
                if (!existing) {
                    throw new DatabaseError('Playlist not found');
                }
                throw new DatabaseError('You do not have permission to modify this playlist');
            }

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

            // Combine ownership check with deletion in a single atomic statement (P2-09)
            const info = db.execute('DELETE FROM playlists WHERE id = ? AND owner_id = ?', [playlistId, ownerId]);

            if (info.changes === 0) {
                const existing = this.getById(playlistId);
                if (!existing) {
                    throw new DatabaseError('Playlist not found');
                }
                throw new DatabaseError('You do not have permission to delete this playlist');
            }

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

            // Validate required fields (BUG-055)
            const trackUrl = track.url || track.uri;
            const trackTitle = track.title || track.name;
            if (!trackUrl) {
                throw new DatabaseError('Track URL is required');
            }
            if (!trackTitle) {
                throw new DatabaseError('Track title is required');
            }

            const trackAuthor = track.author || track.artist || 'Unknown';
            const trackDuration = track.duration || track.length || 0;

            // Wrap SELECT MAX + INSERT in a transaction for atomicity (BUG-D12)
            let result;
            db.transaction(() => {
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
                    trackUrl,
                    trackTitle,
                    trackAuthor,
                    trackDuration,
                    next_position,
                    addedBy
                );

                result = {
                    id: info.lastInsertRowid,
                    playlist_id: playlistId,
                    track_url: trackUrl,
                    track_title: trackTitle,
                    track_author: trackAuthor,
                    track_duration: trackDuration,
                    position: next_position,
                    added_by: addedBy
                };
            });

            logger.info('Track added to playlist', {
                playlistId,
                trackId: result.id,
                title: trackTitle
            });

            return result;
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

            // Delete and re-index positions atomically with ownership check (P2-09, BUG-056)
            db.transaction(() => {
                // Verify ownership atomically within transaction (P2-09)
                const playlist = db.db
                    .prepare('SELECT 1 FROM playlists WHERE id = ? AND owner_id = ?')
                    .get(playlistId, ownerId);
                if (!playlist) {
                    const existing = db.db.prepare('SELECT 1 FROM playlists WHERE id = ?').get(playlistId);
                    if (!existing) {
                        throw new DatabaseError('Playlist not found');
                    }
                    throw new DatabaseError('You do not have permission to modify this playlist');
                }

                // Get the position of the track being deleted
                const track = db.db
                    .prepare('SELECT position FROM playlist_tracks WHERE id = ? AND playlist_id = ?')
                    .get(trackId, playlistId);
                if (!track) {
                    throw new DatabaseError('Track not found in playlist');
                }

                const deleteStmt = db.db.prepare('DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?');
                deleteStmt.run(trackId, playlistId);

                // Re-index: close the position gap
                const reindexStmt = db.db.prepare(
                    'UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = ? AND position > ?'
                );
                reindexStmt.run(playlistId, track.position);
            });

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

            return db.query(
                `
                SELECT * FROM playlist_tracks
                WHERE playlist_id = ?
                ORDER BY position ASC
            `,
                [playlistId]
            );
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

            // Use db.transaction() for atomic operation with ownership check (P2-09)
            db.transaction(() => {
                // Verify ownership atomically within transaction (P2-09)
                const playlist = db.db
                    .prepare('SELECT 1 FROM playlists WHERE id = ? AND owner_id = ?')
                    .get(playlistId, ownerId);
                if (!playlist) {
                    const existing = db.db.prepare('SELECT 1 FROM playlists WHERE id = ?').get(playlistId);
                    if (!existing) {
                        throw new DatabaseError('Playlist not found');
                    }
                    throw new DatabaseError('You do not have permission to modify this playlist');
                }

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

                return true;
            });

            logger.info('Track moved in playlist', { playlistId, fromPosition, toPosition });
            return true;
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

            // Verify ownership and clear tracks atomically (P2-09)
            db.transaction(() => {
                const playlist = db.db
                    .prepare('SELECT 1 FROM playlists WHERE id = ? AND owner_id = ?')
                    .get(playlistId, ownerId);
                if (!playlist) {
                    const existing = db.db.prepare('SELECT 1 FROM playlists WHERE id = ?').get(playlistId);
                    if (!existing) {
                        throw new DatabaseError('Playlist not found');
                    }
                    throw new DatabaseError('You do not have permission to modify this playlist');
                }

                db.db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId);
            });

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

            return db.query(
                `
                SELECT p.*, COUNT(pt.id) as track_count
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                WHERE p.guild_id = ? AND p.is_public = 1
                GROUP BY p.id
                ORDER BY p.updated_at DESC
                LIMIT ?
            `,
                [guildId, limit]
            );
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
                WHERE p.guild_id = ? AND p.name LIKE ? ESCAPE '\\'
            `;

            if (publicOnly) {
                sql += ' AND p.is_public = 1';
            }

            sql += ' GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 25';

            const escaped = query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
            return db.query(sql, [guildId, `%${escaped}%`]);
        } catch (error) {
            logger.error('Failed to search playlists', { error: error.message, guildId, query });
            throw new DatabaseError('Failed to search playlists', error);
        }
    }
}

export default Playlist;
