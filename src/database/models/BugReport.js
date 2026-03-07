/**
 * BugReport Model
 * Database-backed bug report storage replacing JSON file approach
 *
 * FIX-EV-C01: Eliminates read/write race condition from concurrent JSON file access
 * Uses SQLite transactions for atomicity.
 *
 * @module BugReport
 * @version 1.10.2
 */

import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabaseManager } from '../DatabaseManager.js';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEGACY_BUG_REPORT_FILE = path.join(__dirname, '..', '..', '..', 'feedback', 'bug-reports.json');

class BugReport {
    static _legacyMigrated = false;

    /**
     * Migrate legacy bug-reports.json to database (one-time, idempotent)
     */
    static async _migrateLegacyJsonIfNeeded() {
        if (this._legacyMigrated) {
            return;
        }

        try {
            const db = getDatabaseManager();
            let content;
            try {
                content = await fsPromises.readFile(LEGACY_BUG_REPORT_FILE, 'utf8');
            } catch {
                // File doesn't exist — nothing to migrate
                this._legacyMigrated = true;
                return;
            }

            let entries = [];
            try {
                entries = JSON.parse(content);
                if (!Array.isArray(entries)) entries = [];
            } catch {
                logger.warn('Legacy bug-reports.json is malformed, skipping migration');
                entries = [];
            }

            if (entries.length === 0) {
                this._legacyMigrated = true;
                return;
            }

            const insertStmt = `
                INSERT OR IGNORE INTO bug_reports (
                    user_id, user_tag, username, guild_id, guild_name,
                    title, steps, expected, actual, contact,
                    status, severity, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.transaction(() => {
                for (const item of entries) {
                    db.execute(insertStmt, [
                        item.user?.id || 'unknown',
                        item.user?.tag || null,
                        item.user?.username || null,
                        item.guild?.id || 'DM',
                        item.guild?.name || 'Direct Message',
                        item.title || 'Không có tiêu đề',
                        item.steps || '',
                        item.expected || '',
                        item.actual || '',
                        item.contact || 'Không cung cấp',
                        item.status || 'OPEN',
                        item.severity || 'MEDIUM',
                        item.timestamp || new Date().toISOString()
                    ]);
                }
            });

            logger.info(`Migrated ${entries.length} legacy bug reports to database`);
            this._legacyMigrated = true;
        } catch (error) {
            logger.warn('Failed to migrate legacy bug reports JSON', { error: error.message });
            this._legacyMigrated = true;
        }
    }

    /**
     * Get recent bug reports from a user (for duplicate/rate limit checks)
     * @param {string} userId - Discord user ID
     * @param {number} withinMs - Time window in milliseconds
     * @returns {Promise<Array>}
     */
    static async getRecentByUser(userId, withinMs = 300000) {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            const cutoff = new Date(Date.now() - withinMs).toISOString();
            return db.query(
                `SELECT id, title, created_at
                 FROM bug_reports
                 WHERE user_id = ? AND created_at > ?
                 ORDER BY created_at DESC`,
                [userId, cutoff]
            );
        } catch (error) {
            logger.error('Failed to fetch recent bug reports', { userId, error: error.message });
            return [];
        }
    }

    /**
     * Get the last bug report from a user (for rate limiting)
     * @param {string} userId - Discord user ID
     * @returns {Promise<Object|null>}
     */
    static async getLastByUser(userId) {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            return db.queryOne(
                `SELECT id, created_at
                 FROM bug_reports
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [userId]
            );
        } catch (error) {
            logger.error('Failed to fetch last bug report', { userId, error: error.message });
            return null;
        }
    }

    /**
     * Create a new bug report
     * @param {Object} data - Bug report data
     * @returns {Promise<number|null>} The new bug report ID, or null on failure
     */
    static async create(data) {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            const result = db.execute(
                `INSERT INTO bug_reports (
                    user_id, user_tag, username, guild_id, guild_name,
                    title, steps, expected, actual, contact,
                    status, severity
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.userId,
                    data.userTag || null,
                    data.username || null,
                    data.guildId || 'DM',
                    data.guildName || 'Direct Message',
                    data.title,
                    data.steps,
                    data.expected,
                    data.actual,
                    data.contact || 'Không cung cấp',
                    data.status || 'OPEN',
                    data.severity || 'MEDIUM'
                ]
            );

            return Number(result.lastInsertRowid);
        } catch (error) {
            logger.error('Failed to create bug report', { error: error.message });
            return null;
        }
    }

    /**
     * Get paginated bug reports
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
                `SELECT id, user_id, user_tag, username, guild_id, guild_name,
                        title, steps, expected, actual, contact,
                        status, severity, created_at
                 FROM bug_reports
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [perPage, offset]
            );
        } catch (error) {
            logger.error('Failed to fetch paginated bug reports', { error: error.message });
            return [];
        }
    }

    /**
     * Get a bug report by ID
     * @param {number} id
     * @returns {Promise<Object|null>}
     */
    static async getById(id) {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            return db.queryOne(
                `SELECT id, user_id, user_tag, username, guild_id, guild_name,
                        title, steps, expected, actual, contact,
                        status, severity, created_at
                 FROM bug_reports
                 WHERE id = ?`,
                [id]
            );
        } catch (error) {
            logger.error('Failed to fetch bug report by id', { id, error: error.message });
            return null;
        }
    }

    /**
     * Get total bug report count
     * @returns {Promise<number>}
     */
    static async getCount() {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            const row = db.queryOne('SELECT COUNT(*) as count FROM bug_reports');
            return row?.count ?? 0;
        } catch (error) {
            logger.error('Failed to count bug reports', { error: error.message });
            return 0;
        }
    }

    /**
     * Resolve a bug report
     * @param {number} id - Bug report ID
     * @param {string} resolvedBy - Tag of the user who resolved it
     * @returns {Promise<boolean>} true if updated, false otherwise
     */
    static async resolve(id, resolvedBy) {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            const result = db.execute(
                `UPDATE bug_reports SET status = 'RESOLVED' WHERE id = ? AND status != 'RESOLVED'`,
                [id]
            );
            return result.changes > 0;
        } catch (error) {
            logger.error('Failed to resolve bug report', { id, error: error.message });
            return false;
        }
    }

    /**
     * Get bug report stats (counts by status)
     * @returns {Promise<{total: number, open: number, resolved: number}>}
     */
    static async getStats() {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            const rows = db.query(`SELECT status, COUNT(*) as count FROM bug_reports GROUP BY status`);
            const stats = { total: 0, open: 0, resolved: 0 };
            for (const row of rows) {
                stats.total += row.count;
                if (row.status === 'OPEN') stats.open = row.count;
                else if (row.status === 'RESOLVED') stats.resolved = row.count;
            }
            return stats;
        } catch (error) {
            logger.error('Failed to get bug report stats', { error: error.message });
            return { total: 0, open: 0, resolved: 0 };
        }
    }

    /**
     * Get all bug reports (lightweight, for stats)
     * @returns {Promise<Array>}
     */
    static async getAll() {
        await this._migrateLegacyJsonIfNeeded();

        try {
            const db = getDatabaseManager();
            return db.query(
                `SELECT id, user_id, user_tag, status, created_at
                 FROM bug_reports
                 ORDER BY created_at DESC`
            );
        } catch (error) {
            logger.error('Failed to fetch all bug reports', { error: error.message });
            return [];
        }
    }
}

export default BugReport;
