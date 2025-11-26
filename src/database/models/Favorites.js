/**
 * Favorites Model
 * Handle user liked/favorited songs
 */

import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';

class Favorites {
    /**
     * Add a track to user's favorites
     * @param {string} userId - Discord user ID
     * @param {Object} track - Track object with info
     * @returns {Object} Result { success, message, isNew }
     */
    static add(userId, track) {
        try {
            const db = getDatabaseManager();
            const info = track.info || track;
            
            // Check if already favorited
            const existing = db.queryOne(
                'SELECT id FROM favorites WHERE user_id = ? AND track_url = ?',
                [userId, info.uri || info.url]
            );
            
            if (existing) {
                return { success: false, message: 'Bài hát đã có trong danh sách yêu thích!', isNew: false };
            }
            
            // Add to favorites
            db.execute(
                `INSERT INTO favorites (user_id, track_url, track_title, track_author, track_duration, track_artwork, source_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    info.uri || info.url,
                    info.title,
                    info.author,
                    info.length || info.duration || 0,
                    info.artworkUrl || info.thumbnail || null,
                    info.sourceName || 'unknown'
                ]
            );
            
            logger.info('Track added to favorites', { userId, track: info.title });
            return { success: true, message: 'Đã thêm vào danh sách yêu thích!', isNew: true };
        } catch (error) {
            logger.error('Failed to add to favorites', { userId, error: error.message });
            return { success: false, message: 'Không thể thêm vào danh sách yêu thích!', isNew: false };
        }
    }

    /**
     * Remove a track from user's favorites
     * @param {string} userId - Discord user ID
     * @param {string} trackUrl - Track URL to remove
     * @returns {boolean} Success
     */
    static remove(userId, trackUrl) {
        try {
            const db = getDatabaseManager();
            const result = db.execute(
                'DELETE FROM favorites WHERE user_id = ? AND track_url = ?',
                [userId, trackUrl]
            );
            
            if (result.changes > 0) {
                logger.info('Track removed from favorites', { userId });
                return true;
            }
            return false;
        } catch (error) {
            logger.error('Failed to remove from favorites', { userId, error: error.message });
            return false;
        }
    }

    /**
     * Remove a track by ID
     * @param {string} userId - Discord user ID
     * @param {number} favoriteId - Favorite entry ID
     * @returns {boolean} Success
     */
    static removeById(userId, favoriteId) {
        try {
            const db = getDatabaseManager();
            const result = db.execute(
                'DELETE FROM favorites WHERE id = ? AND user_id = ?',
                [favoriteId, userId]
            );
            
            return result.changes > 0;
        } catch (error) {
            logger.error('Failed to remove favorite by ID', { userId, favoriteId, error: error.message });
            return false;
        }
    }

/**
 * Get all favorites for a user
 * @param {string} userId - Discord user ID
 * @param {number} limit - Max results (default 100)
 * @param {number} offset - Offset for pagination
 * @returns {Array} List of favorites
 */
static getAll(userId, limit = 100, offset = 0) {
    try {
        const db = getDatabaseManager();
        const favorites = db.query(
            `SELECT * FROM favorites WHERE user_id = ? ORDER BY added_at DESC LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );
        
        return favorites.map(f => ({
            id: f.id,
            userId: f.user_id,
            url: f.track_url,
            title: f.track_title,
            author: f.track_author,
            duration: f.track_duration,
            artwork: f.track_artwork,
            sourceName: f.source_name,
            addedAt: f.added_at,
            // Also include raw field names for backward compatibility
            track_url: f.track_url,
            track_title: f.track_title,
            track_author: f.track_author,
            track_duration: f.track_duration,
            track_artwork: f.track_artwork,
            added_at: f.added_at
        }));
    } catch (error) {
        logger.error('Failed to get favorites', { userId, error: error.message });
        return [];
    }
}

/**
 * Alias for getAll (backward compatibility)
 * @param {string} userId - Discord user ID
 * @param {number} limit - Max results (default 100)
 * @param {number} offset - Offset for pagination
 * @returns {Array} List of favorites
 */
static getByUser(userId, limit = 100, offset = 0) {
    return this.getAll(userId, limit, offset);
}    /**
     * Get favorites count for a user
     * @param {string} userId - Discord user ID
     * @returns {number} Count
     */
    static count(userId) {
        try {
            const db = getDatabaseManager();
            const result = db.queryOne(
                'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?',
                [userId]
            );
            return result.count;
        } catch (error) {
            logger.error('Failed to count favorites', { userId, error: error.message });
            return 0;
        }
    }

/**
 * Check if a track is in user's favorites
 * @param {string} userId - Discord user ID
 * @param {string} trackUrl - Track URL to check
 * @returns {boolean} Is favorited
 */
static isFavorited(userId, trackUrl) {
    try {
        const db = getDatabaseManager();
        const result = db.queryOne(
            'SELECT id FROM favorites WHERE user_id = ? AND track_url = ?',
            [userId, trackUrl]
        );
        return !!result;
    } catch (error) {
        logger.error('Failed to check favorite status', { userId, error: error.message });
        return false;
    }
}

/**
 * Alias for isFavorited (backward compatibility)
 * @param {string} userId - Discord user ID
 * @param {string} trackUrl - Track URL to check
 * @returns {boolean} Is favorited
 */
static isFavorite(userId, trackUrl) {
    return this.isFavorited(userId, trackUrl);
}    /**
     * Toggle favorite status for a track
     * @param {string} userId - Discord user ID
     * @param {Object} track - Track object
     * @returns {Object} Result { success, isFavorited, message }
     */
    static toggle(userId, track) {
        try {
            const info = track.info || track;
            const trackUrl = info.uri || info.url;
            
            if (this.isFavorited(userId, trackUrl)) {
                const success = this.remove(userId, trackUrl);
                return { 
                    success, 
                    isFavorited: false, 
                    message: success ? 'Đã xóa khỏi danh sách yêu thích!' : 'Không thể xóa khỏi danh sách yêu thích!'
                };
            } else {
                const result = this.add(userId, track);
                return { 
                    success: result.success, 
                    isFavorited: result.success,
                    message: result.message
                };
            }
        } catch (error) {
            logger.error('Failed to toggle favorite', { userId, error: error.message });
            return { success: false, isFavorited: false, message: 'Đã xảy ra lỗi!' };
        }
    }

/**
 * Clear all favorites for a user
 * @param {string} userId - Discord user ID
 * @returns {number} Number of deleted entries
 */
static clear(userId) {
    try {
        const db = getDatabaseManager();
        const result = db.execute('DELETE FROM favorites WHERE user_id = ?', [userId]);
        logger.info('Cleared all favorites', { userId, count: result.changes });
        return result.changes;
    } catch (error) {
        logger.error('Failed to clear favorites', { userId, error: error.message });
        return 0;
    }
}

/**
 * Alias for clear (backward compatibility)
 * @param {string} userId - Discord user ID
 * @returns {boolean} Success (true if any entries were deleted)
 */
static clearAll(userId) {
    const deleted = this.clear(userId);
    return deleted > 0;
}    /**
     * Get random favorites for shuffle play
     * @param {string} userId - Discord user ID
     * @param {number} limit - Max results
     * @returns {Array} Randomized list of favorites
     */
    static getRandom(userId, limit = 25) {
        try {
            const db = getDatabaseManager();
            const favorites = db.query(
                `SELECT * FROM favorites WHERE user_id = ? ORDER BY RANDOM() LIMIT ?`,
                [userId, limit]
            );
            
            return favorites.map(f => ({
                id: f.id,
                userId: f.user_id,
                url: f.track_url,
                title: f.track_title,
                author: f.track_author,
                duration: f.track_duration,
                artwork: f.track_artwork,
                sourceName: f.source_name,
                addedAt: f.added_at
            }));
        } catch (error) {
            logger.error('Failed to get random favorites', { userId, error: error.message });
            return [];
        }
    }

    /**
     * Search favorites by title or author
     * @param {string} userId - Discord user ID
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Array} Matching favorites
     */
    static search(userId, query, limit = 10) {
        try {
            const db = getDatabaseManager();
            const searchTerm = `%${query}%`;
            const favorites = db.query(
                `SELECT * FROM favorites 
                 WHERE user_id = ? AND (track_title LIKE ? OR track_author LIKE ?)
                 ORDER BY added_at DESC LIMIT ?`,
                [userId, searchTerm, searchTerm, limit]
            );
            
            return favorites.map(f => ({
                id: f.id,
                userId: f.user_id,
                url: f.track_url,
                title: f.track_title,
                author: f.track_author,
                duration: f.track_duration,
                artwork: f.track_artwork,
                sourceName: f.source_name,
                addedAt: f.added_at
            }));
        } catch (error) {
            logger.error('Failed to search favorites', { userId, query, error: error.message });
            return [];
        }
    }
}

export default Favorites;
