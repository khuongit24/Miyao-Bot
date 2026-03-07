import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEGACY_FEEDBACK_FILE = path.join(__dirname, '..', '..', '..', 'feedback', 'feedbacks.json');

class FeedbackSubmission {
    static _legacyMigrated = false;

    static async _migrateLegacyJsonIfNeeded() {
        if (this._legacyMigrated) {
            return;
        }

        try {
            const db = getDatabaseManager();
            let content;
            try {
                content = await fsPromises.readFile(LEGACY_FEEDBACK_FILE, 'utf8');
            } catch {
                this._legacyMigrated = true;
                return;
            }

            let entries = [];
            try {
                entries = JSON.parse(content);
                if (!Array.isArray(entries)) entries = [];
            } catch {
                entries = [];
            }

            if (entries.length === 0) {
                this._legacyMigrated = true;
                return;
            }

            const insertStmt = `
                INSERT OR IGNORE INTO feedback_submissions (
                    type, user_id, user_tag, username, guild_id, guild_name,
                    subject, content, contact, legacy_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.transaction(() => {
                for (const item of entries) {
                    db.execute(insertStmt, [
                        item.type || 'FEEDBACK',
                        item.user?.id || 'unknown',
                        item.user?.tag || null,
                        item.user?.username || null,
                        item.guild?.id || 'DM',
                        item.guild?.name || 'Direct Message',
                        item.subject || 'Không có tiêu đề',
                        item.content || '',
                        item.contact || 'Không cung cấp',
                        item.id ?? null,
                        item.timestamp || new Date().toISOString()
                    ]);
                }
            });

            this._legacyMigrated = true;
        } catch (error) {
            logger.warn('Failed to migrate legacy feedback JSON', { error: error.message });
            this._legacyMigrated = true;
        }
    }

    static async getLastByUser(userId) {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            return db.queryOne(
                `SELECT id, created_at
                 FROM feedback_submissions
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [userId]
            );
        } catch (error) {
            logger.error('Failed to fetch last feedback by user', { userId, error: error.message });
            return null;
        }
    }

    static async create(data) {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            const result = db.execute(
                `INSERT INTO feedback_submissions (
                    type, user_id, user_tag, username, guild_id, guild_name, subject, content, contact
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.type || 'FEEDBACK',
                    data.userId,
                    data.userTag || null,
                    data.username || null,
                    data.guildId || 'DM',
                    data.guildName || 'Direct Message',
                    data.subject,
                    data.content,
                    data.contact || 'Không cung cấp'
                ]
            );

            return Number(result.lastInsertRowid);
        } catch (error) {
            logger.error('Failed to create feedback submission', { error: error.message });
            return null;
        }
    }

    /**
     * Get paginated feedback submissions
     * @param {number} page - 1-based page number
     * @param {number} perPage - Items per page
     * @returns {Promise<Array>}
     */
    static async getPaginated(page = 1, perPage = 5) {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            const offset = (page - 1) * perPage;
            return db.query(
                `SELECT id, type, user_id, user_tag, username, guild_id, guild_name,
                        subject, content, contact, created_at
                 FROM feedback_submissions
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [perPage, offset]
            );
        } catch (error) {
            logger.error('Failed to fetch paginated feedbacks', { error: error.message });
            return [];
        }
    }

    /**
     * Get a feedback submission by ID
     * @param {number} id
     * @returns {Promise<Object|null>}
     */
    static async getById(id) {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            return db.queryOne(
                `SELECT id, type, user_id, user_tag, username, guild_id, guild_name,
                        subject, content, contact, created_at
                 FROM feedback_submissions
                 WHERE id = ?`,
                [id]
            );
        } catch (error) {
            logger.error('Failed to fetch feedback by id', { id, error: error.message });
            return null;
        }
    }

    /**
     * Get total feedback count
     * @returns {Promise<number>}
     */
    static async getCount() {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            const row = db.queryOne('SELECT COUNT(*) as count FROM feedback_submissions');
            return row?.count ?? 0;
        } catch (error) {
            logger.error('Failed to count feedbacks', { error: error.message });
            return 0;
        }
    }

    /**
     * Get all feedback submissions (for stats)
     * @returns {Promise<Array>}
     */
    static async getAll() {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            return db.query(
                `SELECT id, user_id, user_tag, created_at
                 FROM feedback_submissions
                 ORDER BY created_at DESC`
            );
        } catch (error) {
            logger.error('Failed to fetch all feedbacks', { error: error.message });
            return [];
        }
    }
}

export default FeedbackSubmission;
