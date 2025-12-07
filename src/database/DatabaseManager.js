/**
 * Database Manager - SQLite with better-sqlite3
 * High-performance synchronous database operations
 * @module DatabaseManager
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseManager {
    constructor(dbPath = './data/miyao.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.isReady = false;
    }

    /**
     * Initialize database connection and run migrations
     */
    async initialize() {
        try {
            logger.info('Initializing database...');

            // Create database connection
            this.db = new Database(this.dbPath, {
                verbose: process.env.NODE_ENV === 'development' ? logger.debug : null
            });

            // Enable WAL mode for better concurrency
            this.db.pragma('journal_mode = WAL');

            // Enable foreign keys
            this.db.pragma('foreign_keys = ON');

            // Run migrations
            await this.runMigrations();

            // Initialize audit log table
            const { AuditLog } = await import('./models/AuditLog.js');
            AuditLog.initialize(this.db);

            this.isReady = true;
            logger.info('Database initialized successfully');

            return this;
        } catch (error) {
            logger.error('Failed to initialize database', error);
            throw error;
        }
    }

    /**
     * Run pending migrations
     */
    async runMigrations() {
        try {
            logger.info('Running database migrations...');

            const migrationsDir = join(__dirname, 'migrations');

            // List of migrations in order
            // Naming convention: <version>_<descriptive_name>.sql
            const migrations = [
                '001_initial_schema.sql', // Core tables: history, users, playlists, statistics, migrations
                '002_add_composite_indexes.sql', // Composite indexes for query optimization
                '003_statistics_indexes.sql', // Statistics-specific indexes
                '004_playlists.sql', // Playlist tracks table
                '005_guild_settings_and_favorites.sql', // Guild settings (DJ, 24/7) and favorites
                '006_statistics_tables_and_archiving.sql', // Specialized stats tables, history archiving
                '007_playlist_track_indexes.sql' // Additional playlist track indexes
            ];

            // Check if migrations table exists
            const tablesResult = this.db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
                .get();
            const migrationsTableExists = !!tablesResult;

            for (const migrationFile of migrations) {
                const migrationPath = join(migrationsDir, migrationFile);

                if (existsSync(migrationPath)) {
                    const version = migrationFile.split('_')[0];

                    // Check if migration already applied (only if migrations table exists)
                    let existing = false;
                    if (migrationsTableExists) {
                        try {
                            const result = this.db.prepare('SELECT 1 FROM migrations WHERE version = ?').get(version);
                            existing = !!result;
                        } catch (error) {
                            // Table might have been created just now, ignore and proceed
                            logger.debug('Could not check migration status (table might be new)', { version });
                        }
                    }

                    if (!existing) {
                        logger.info(`Applying migration: ${migrationFile}`);
                        const sql = readFileSync(migrationPath, 'utf8');
                        this.db.exec(sql);
                        logger.info(`Migration ${migrationFile} completed`);
                    } else {
                        logger.debug(`Migration ${migrationFile} already applied, skipping`);
                    }
                } else {
                    logger.warn(`Migration file not found: ${migrationFile}`);
                }
            }

            logger.info('All migrations completed');
        } catch (error) {
            logger.error('Migration failed', error);
            throw error;
        }
    }

    /**
     * Check if database is ready
     * @private
     */
    _checkReady() {
        if (!this.isReady || !this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
    }

    /**
     * Get raw database connection
     * @returns {Database} better-sqlite3 database instance
     */
    getDatabase() {
        this._checkReady();
        return this.db;
    }

    /**
     * Execute a query with parameters
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Object} Result
     */
    query(sql, params = []) {
        this._checkReady();
        try {
            const stmt = this.db.prepare(sql);
            return stmt.all(...params);
        } catch (error) {
            logger.error('Query failed', { sql, error });
            throw error;
        }
    }

    /**
     * Execute a query and return first row
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Object|null} First row or null
     */
    queryOne(sql, params = []) {
        this._checkReady();
        try {
            const stmt = this.db.prepare(sql);
            const result = stmt.get(...params);
            return result === undefined ? null : result;
        } catch (error) {
            logger.error('Query failed', { sql, error });
            throw error;
        }
    }

    /**
     * Execute an insert/update/delete query
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Object} Changes info
     */
    execute(sql, params = []) {
        this._checkReady();
        try {
            const stmt = this.db.prepare(sql);
            return stmt.run(...params);
        } catch (error) {
            logger.error('Execute failed', { sql, error });
            throw error;
        }
    }

    /**
     * Execute multiple queries in a transaction
     * Note: better-sqlite3 transactions are synchronous only
     * @param {Function} callback - Transaction callback (must be synchronous)
     * @returns {*} Callback return value
     */
    transaction(callback) {
        this._checkReady();
        if (typeof callback !== 'function') {
            throw new TypeError('Transaction callback must be a function');
        }
        try {
            const fn = this.db.transaction(callback);
            return fn();
        } catch (error) {
            logger.error('Transaction failed', error);
            throw error;
        }
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.isReady = false;
            logger.info('Database connection closed');
        }
    }

    /**
     * Backup database
     * @param {string} backupPath - Path to backup file
     */
    backup(backupPath) {
        try {
            // Check if database is open
            if (!this.db || !this.db.open) {
                throw new Error('Database connection is not open');
            }

            // Use better-sqlite3 backup method with string path
            // The backup() method expects a filename string, not a Database object
            this.db.backup(backupPath);

            logger.info(`Database backed up to ${backupPath}`);
        } catch (error) {
            logger.error('Backup failed', error);
            throw error;
        }
    }

    /**
     * Get database statistics
     * @returns {Object} Statistics
     */
    getStats() {
        try {
            const tables = this.query(`
                SELECT name, 
                       (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name=m.name) as index_count
                FROM sqlite_master m
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
            `);

            const stats = {};
            for (const table of tables) {
                const count = this.queryOne(`SELECT COUNT(*) as count FROM ${table.name}`);
                stats[table.name] = {
                    rows: count.count,
                    indexes: table.index_count
                };
            }

            return {
                tables: stats,
                size: this.db.pragma('page_count')[0].page_count * this.db.pragma('page_size')[0].page_size,
                wal_mode: this.db.pragma('journal_mode')[0].journal_mode
            };
        } catch (error) {
            logger.error('Failed to get database stats', error);
            throw error;
        }
    }

    /**
     * Vacuum database (optimize)
     */
    vacuum() {
        try {
            logger.info('Vacuuming database...');
            this.db.exec('VACUUM');
            logger.info('Database vacuumed successfully');
        } catch (error) {
            logger.error('Vacuum failed', error);
            throw error;
        }
    }

    /**
     * Check database integrity
     * @returns {Object} Integrity check result
     */
    checkIntegrity() {
        try {
            logger.info('Checking database integrity...');

            const integrityResult = this.db.pragma('integrity_check');
            const foreignKeyResult = this.db.pragma('foreign_key_check');

            const isHealthy = integrityResult[0]?.integrity_check === 'ok' && foreignKeyResult.length === 0;

            const result = {
                healthy: isHealthy,
                integrityCheck: integrityResult,
                foreignKeyIssues: foreignKeyResult
            };

            if (isHealthy) {
                logger.info('Database integrity check passed');
            } else {
                logger.warn('Database integrity issues found', result);
            }

            return result;
        } catch (error) {
            logger.error('Integrity check failed', error);
            throw error;
        }
    }

    /**
     * Analyze database for query optimization
     */
    analyze() {
        try {
            logger.info('Analyzing database...');
            this.db.exec('ANALYZE');
            logger.info('Database analyzed successfully');
        } catch (error) {
            logger.error('Analyze failed', error);
            throw error;
        }
    }

    /**
     * Cleanup expired cache entries
     */
    cleanupCache() {
        try {
            const result = this.execute("DELETE FROM cache WHERE expires_at < datetime('now')");
            if (result.changes > 0) {
                logger.info(`Cleaned up ${result.changes} expired cache entries`);
            }
            return result.changes;
        } catch (error) {
            logger.error('Cache cleanup failed', error);
            throw error;
        }
    }

    /**
     * Cleanup old history entries (older than 30 days)
     */
    cleanupHistory() {
        try {
            const result = this.execute("DELETE FROM history WHERE played_at < datetime('now', '-30 days')");
            if (result.changes > 0) {
                logger.info(`Cleaned up ${result.changes} old history entries`);
            }
            return result.changes;
        } catch (error) {
            logger.error('History cleanup failed', error);
            throw error;
        }
    }
}

// Export singleton instance
let instance = null;

export function getDatabaseManager(dbPath) {
    if (!instance) {
        instance = new DatabaseManager(dbPath);
    }
    return instance;
}

export default DatabaseManager;
