/**
 * Database Manager - SQLite with better-sqlite3
 * High-performance synchronous database operations
 * @module DatabaseManager
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { DatabaseConstants } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseManager {
    constructor(dbPath = './data/miyao.db') {
        this.dbPath = dbPath === ':memory:' ? ':memory:' : resolve(dbPath);
        this.db = null;
        this.isReady = false;
    }

    /**
     * Initialize database connection and run migrations
     */
    async initialize() {
        try {
            logger.info('Initializing database...');

            if (this.dbPath !== ':memory:') {
                const dbDirectory = dirname(this.dbPath);
                if (!existsSync(dbDirectory)) {
                    mkdirSync(dbDirectory, { recursive: true });
                    logger.info('Created database directory', { dbDirectory });
                }
            }

            logger.info('Opening SQLite database', { dbPath: this.dbPath });

            // Create database connection
            this.db = new Database(this.dbPath, {
                verbose: process.env.NODE_ENV === 'development' ? logger.debug : null
            });

            // Enable WAL mode for better concurrency
            this.db.pragma('journal_mode = WAL');

            // Enable foreign keys
            this.db.pragma('foreign_keys = ON');

            // Run migrations
            this.runMigrations();

            // Self-heal critical schema drift (e.g. missing table but migration row exists)
            this.ensureCriticalSchema();

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

    ensureCriticalSchema() {
        const criticalTables = [
            { name: 'guild_settings', migration: '005_guild_settings_and_favorites.sql' },
            { name: 'favorites', migration: '005_guild_settings_and_favorites.sql' }
        ];

        const missingTables = criticalTables.filter(({ name }) => {
            const row = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
            return !row;
        });

        if (missingTables.length === 0) {
            return;
        }

        logger.warn('Detected missing critical database tables, attempting schema self-heal', {
            missingTables: missingTables.map(t => t.name)
        });

        const migrationsDir = join(__dirname, 'migrations');
        const repairMigrations = [...new Set(missingTables.map(t => t.migration))];

        for (const migrationFile of repairMigrations) {
            const migrationPath = join(migrationsDir, migrationFile);
            if (!existsSync(migrationPath)) {
                throw new Error(`Critical schema repair migration not found: ${migrationFile}`);
            }

            const sql = readFileSync(migrationPath, 'utf8');
            this.db.exec(sql);
            logger.info('Applied schema repair migration', { migrationFile });
        }

        const unresolvedTables = missingTables.filter(({ name }) => {
            const row = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
            return !row;
        });

        if (unresolvedTables.length > 0) {
            throw new Error(
                `Critical database tables still missing after repair: ${unresolvedTables.map(t => t.name).join(', ')}`
            );
        }

        logger.info('Critical schema self-heal completed', {
            repairedTables: missingTables.map(t => t.name)
        });
    }

    /**
     * Run pending migrations
     */
    runMigrations() {
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
                '007_phase_0_optimizations.sql', // Phase 0 performance optimizations
                '008_playlist_track_indexes.sql', // Additional playlist track indexes
                '009_autoplay_preferences.sql', // Auto-play preference tracking
                '010_feedback_storage.sql', // Feedback storage in database
                '011_bug_report_storage.sql' // FIX-EV-C01: Bug report storage in database
            ];

            // Check if migrations table exists
            const tablesResult = this.db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
                .get();
            const migrationsTableExists = !!tablesResult;

            for (const migrationFile of migrations) {
                const migrationPath = join(migrationsDir, migrationFile);

                if (!existsSync(migrationPath)) {
                    const errorMessage = `Migration file not found: ${migrationFile}`;
                    if (process.env.NODE_ENV === 'production') {
                        logger.error(errorMessage);
                        throw new Error(errorMessage);
                    }
                    logger.warn(errorMessage);
                    continue;
                }

                const version = migrationFile.split('_')[0];

                // Check if migration already applied (only if migrations table exists)
                let existing = false;
                if (migrationsTableExists) {
                    try {
                        const result = this.db.prepare('SELECT 1 FROM migrations WHERE version = ?').get(version);
                        existing = !!result;
                    } catch {
                        // Table might have been created just now, ignore and proceed
                        logger.debug('Could not check migration status (table might be new)', { version });
                    }
                }

                if (existing) {
                    logger.debug(`Migration ${migrationFile} already applied, skipping`);
                    continue;
                }

                logger.info(`Applying migration: ${migrationFile}`);
                const sql = readFileSync(migrationPath, 'utf8');

                // FIX-DB-H02: Wrap individual migration exec in try/catch.
                // In production, re-throw so the bot does not run with an old schema.
                // In development, log and continue to allow partial migration debugging.
                try {
                    this.db.exec(sql);
                    logger.info(`Migration ${migrationFile} completed`);
                } catch (migrationExecError) {
                    if (process.env.NODE_ENV === 'production') {
                        logger.error(`Migration ${migrationFile} failed in production — aborting`, {
                            error: migrationExecError.message
                        });
                        throw migrationExecError;
                    } else {
                        logger.warn(`Migration ${migrationFile} failed (non-production, continuing)`, {
                            error: migrationExecError.message
                        });
                    }
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
     * Log a deprecation warning when queries appear to use non-parameterized input.
     * FIX-DB-H01: Encourage parameterized queries to prevent SQL injection.
     * @private
     */
    _warnNonParameterized(sql, params, methodName) {
        if (
            params.length === 0 &&
            /\bWHERE\b|\bVALUES\b|\bSET\b/i.test(sql) &&
            !/^\s*(PRAGMA|CREATE|DROP|ALTER|ANALYZE|VACUUM|BEGIN|COMMIT|ROLLBACK|DELETE\s+FROM\s+\w+\s+WHERE\s+\w+\s*<\s*datetime)/i.test(
                sql
            )
        ) {
            logger.warn(
                `[DEPRECATION] ${methodName}() called without parameters on a query with WHERE/VALUES/SET clauses. ` +
                    'Use parameterized queries to prevent SQL injection. This will be enforced in a future version.',
                { sqlPreview: sql.substring(0, 200) }
            );
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
        this._warnNonParameterized(sql, params, 'query');
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
        this._warnNonParameterized(sql, params, 'queryOne');
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
        this._warnNonParameterized(sql, params, 'execute');
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
     * Perform WAL checkpoint (passive mode - doesn't block writers)
     * Use this for periodic checkpoints during runtime
     * @returns {Object} Checkpoint result { busy, log, checkpointed }
     */
    checkpoint() {
        this._checkReady();
        try {
            const result = this.db.pragma('wal_checkpoint(PASSIVE)');
            const info = result[0] || { busy: 0, log: 0, checkpointed: 0 };
            logger.debug('WAL checkpoint (PASSIVE) completed', info);
            return info;
        } catch (error) {
            logger.error('WAL checkpoint failed', error);
            throw error;
        }
    }

    /**
     * Force WAL checkpoint (TRUNCATE mode - waits for all readers, then truncates WAL)
     * Use this before shutdown to ensure all data is written to main database
     * @returns {Object} Checkpoint result { busy, log, checkpointed }
     */
    forceCheckpoint() {
        this._checkReady();
        try {
            const result = this.db.pragma('wal_checkpoint(TRUNCATE)');
            const info = result[0] || { busy: 0, log: 0, checkpointed: 0 };
            logger.info('WAL checkpoint (TRUNCATE) completed', info);
            return info;
        } catch (error) {
            logger.error('Forced WAL checkpoint failed', error);
            throw error;
        }
    }

    /**
     * Close database connection
     * Performs WAL checkpoint before closing to ensure data integrity
     */
    close() {
        if (this.db) {
            try {
                // Force WAL checkpoint to merge all data into main database
                // This prevents data loss when bot is restarted
                this.db.pragma('wal_checkpoint(TRUNCATE)');
                logger.info('Pre-close WAL checkpoint completed');
            } catch (error) {
                logger.error('Pre-close WAL checkpoint failed', { error: error.message });
                // Continue with close even if checkpoint fails
            }

            this.db.close();
            this.isReady = false;
            logger.info('Database connection closed');
        }
    }

    /**
     * Backup database
     * @param {string} backupPath - Path to backup file
     */
    async backup(backupPath) {
        try {
            // Check if database is open
            if (!this.db || !this.db.open) {
                throw new Error('Database connection is not open');
            }

            // Use better-sqlite3 backup method with string path
            // The backup() method expects a filename string, not a Database object
            await this.db.backup(backupPath);

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
            // Get table names and index counts in a single query
            const tables = this.query(`
                SELECT name, 
                       (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name=m.name) as index_count
                FROM sqlite_master m
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
            `);

            // Build a single UNION ALL query to count all tables at once
            // instead of N individual COUNT(*) queries (N+1 pattern)
            const stats = {};
            if (tables.length > 0) {
                const unionParts = tables.map(t => {
                    const safeName = t.name.replace(/"/g, '""');
                    return `SELECT '${t.name.replace(/'/g, "''")}' as tbl, COUNT(*) as cnt FROM "${safeName}"`;
                });
                const unionQuery = unionParts.join(' UNION ALL ');
                const counts = this.query(unionQuery);

                // Build index count lookup
                const indexMap = Object.fromEntries(tables.map(t => [t.name, t.index_count]));

                for (const row of counts) {
                    stats[row.tbl] = {
                        rows: row.cnt,
                        indexes: indexMap[row.tbl] || 0
                    };
                }
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

            // Parse integrity_check result — the column name varies between SQLite versions
            const firstRow = integrityResult[0] || {};
            const integrityValue = firstRow.integrity_check ?? firstRow[Object.keys(firstRow)[0]];
            const integrityOk = String(integrityValue).toLowerCase() === 'ok';
            const isHealthy = integrityOk && foreignKeyResult.length === 0;

            const result = {
                healthy: isHealthy,
                integrityOk,
                foreignKeyOk: foreignKeyResult.length === 0,
                integrityCheck: integrityResult,
                foreignKeyIssues: foreignKeyResult,
                issues: integrityOk ? [] : integrityResult.map(r => Object.values(r)[0]).filter(v => v !== 'ok')
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
     *
     * NOTE (FIX-LB01): Migration 006 created a `history_archive` table intended for
     * moving old records before deletion, but the archiving step was never implemented.
     * This method simply deletes rows older than 30 days. The `history_archive` table
     * remains as unused dead schema.
     */
    cleanupHistory() {
        try {
            const result = this.execute("DELETE FROM history WHERE played_at < datetime('now', ?)", [
                `-${DatabaseConstants.HISTORY_HOT_DATA_DAYS} days`
            ]);
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

export function getDatabaseManager(dbPath = process.env.DATABASE_PATH || './data/miyao.db') {
    const normalizedPath = dbPath === ':memory:' ? ':memory:' : resolve(dbPath);
    if (!instance) {
        instance = new DatabaseManager(normalizedPath);
    } else if (dbPath && instance.dbPath !== normalizedPath) {
        if (process.env.NODE_ENV === 'test') {
            logger.debug('Ignoring DatabaseManager path mismatch in test environment', {
                existingPath: instance.dbPath,
                requestedPath: normalizedPath
            });
            return instance;
        }
        throw new Error(
            `DatabaseManager path mismatch: existing instance uses "${instance.dbPath}" but requested "${normalizedPath}"`
        );
    }
    return instance;
}

export function resetDatabaseManager() {
    if (instance && instance.isReady) {
        instance.close();
    }
    instance = null;
}

export default DatabaseManager;
