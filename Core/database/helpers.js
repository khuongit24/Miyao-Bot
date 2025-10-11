/**
 * Database Helper Utilities
 * Common query patterns and constants for database operations
 * @module database-helpers
 */

/**
 * Database constants
 */
export const DatabaseConstants = {
    // Data retention periods (days)
    HISTORY_HOT_DATA_DAYS: 30,      // Keep in main history table
    HISTORY_WARM_DATA_DAYS: 365,    // Keep in archive table
    AUDIT_LOG_TTL_DAYS: 90,         // Audit log retention
    CACHE_DEFAULT_TTL_SECONDS: 3600, // 1 hour
    
    // Query limits
    QUERY_LIMITS: {
        HISTORY: 50,
        HISTORY_RECENT: 10,
        PLAYLISTS: 25,
        PLAYLIST_TRACKS: 100,
        LEADERBOARD: 20,
        MOST_PLAYED: 10,
        SEARCH_RESULTS: 25,
    },
    
    // Performance thresholds
    SLOW_QUERY_THRESHOLD_MS: 100,
    VERY_SLOW_QUERY_THRESHOLD_MS: 500,
    
    // Backup retention
    BACKUP_RETENTION: {
        HOURLY: 24,  // Keep 24 hourly backups
        DAILY: 7,    // Keep 7 daily backups
        WEEKLY: 4,   // Keep 4 weekly backups
    },
    
    // Maintenance schedules (milliseconds)
    MAINTENANCE_INTERVALS: {
        HISTORY_ARCHIVE: 24 * 60 * 60 * 1000,      // 1 day
        AUDIT_LOG_CLEANUP: 24 * 60 * 60 * 1000,    // 1 day
        CACHE_CLEANUP: 60 * 60 * 1000,              // 1 hour
        BACKUP_HOURLY: 60 * 60 * 1000,              // 1 hour
        ANALYZE: 7 * 24 * 60 * 60 * 1000,           // 1 week
        VACUUM: 30 * 24 * 60 * 60 * 1000,           // 1 month
    },
};

/**
 * SQL date filter templates
 */
export const DateFilters = {
    HOUR:  "AND played_at > datetime('now', '-1 hour')",
    DAY:   "AND played_at > datetime('now', '-1 day')",
    WEEK:  "AND played_at > datetime('now', '-7 days')",
    MONTH: "AND played_at > datetime('now', '-30 days')",
    YEAR:  "AND played_at > datetime('now', '-365 days')",
};

/**
 * Get SQL date filter for a given period
 * @param {string} period - Time period ('hour', 'day', 'week', 'month', 'year', 'all')
 * @returns {string} SQL date filter clause
 */
export function getDateFilter(period) {
    if (!period || period === 'all') return '';
    return DateFilters[period.toUpperCase()] || '';
}

/**
 * Get SQL date range for archiving
 * @param {number} daysAgo - Number of days ago
 * @returns {string} SQL datetime expression
 */
export function getArchiveDateRange(daysAgo) {
    return `datetime('now', '-${daysAgo} days')`;
}

/**
 * SQL injection protection - escape SQL LIKE pattern
 * @param {string} pattern - User input pattern
 * @returns {string} Escaped pattern
 */
export function escapeLikePattern(pattern) {
    return pattern
        .replace(/\\/g, '\\\\')  // Escape backslash
        .replace(/%/g, '\\%')    // Escape %
        .replace(/_/g, '\\_');   // Escape _
}

/**
 * Build pagination SQL
 * @param {number} limit - Maximum rows to return
 * @param {number} offset - Number of rows to skip
 * @returns {string} SQL LIMIT/OFFSET clause
 */
export function buildPagination(limit, offset = 0) {
    const safeLimit = Math.max(1, Math.min(limit, 1000)); // Cap at 1000
    const safeOffset = Math.max(0, offset);
    return `LIMIT ${safeLimit} OFFSET ${safeOffset}`;
}

/**
 * Build ORDER BY clause with validation
 * @param {string} column - Column name
 * @param {string} direction - Sort direction ('ASC' or 'DESC')
 * @param {string[]} allowedColumns - List of allowed column names
 * @returns {string} SQL ORDER BY clause
 * @throws {Error} If column is not in allowed list
 */
export function buildOrderBy(column, direction = 'DESC', allowedColumns = []) {
    if (allowedColumns.length > 0 && !allowedColumns.includes(column)) {
        throw new Error(`Invalid ORDER BY column: ${column}`);
    }
    
    const safeDirection = direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return `ORDER BY ${column} ${safeDirection}`;
}

/**
 * Common query patterns for statistics
 */
export const StatisticsQueries = {
    /**
     * Get total plays count
     */
    totalPlays: (guildId, period = 'all') => ({
        sql: `
            SELECT COUNT(*) as total_plays
            FROM history
            WHERE guild_id = ? ${getDateFilter(period)}
        `,
        params: [guildId],
    }),
    
    /**
     * Get unique users count
     */
    uniqueUsers: (guildId, period = 'all') => ({
        sql: `
            SELECT COUNT(DISTINCT user_id) as unique_users
            FROM history
            WHERE guild_id = ? ${getDateFilter(period)}
        `,
        params: [guildId],
    }),
    
    /**
     * Get unique tracks count
     */
    uniqueTracks: (guildId, period = 'all') => ({
        sql: `
            SELECT COUNT(DISTINCT track_url) as unique_tracks
            FROM history
            WHERE guild_id = ? ${getDateFilter(period)}
        `,
        params: [guildId],
    }),
    
    /**
     * Get total listening time
     */
    totalListeningTime: (guildId, period = 'all') => ({
        sql: `
            SELECT SUM(COALESCE(track_duration, 0)) as total_duration
            FROM history
            WHERE guild_id = ? ${getDateFilter(period)}
        `,
        params: [guildId],
    }),
};

/**
 * Batch query executor with transaction
 * @param {Object} db - Database instance
 * @param {Array<{sql: string, params: Array}>} queries - Array of query objects
 * @returns {Array} Array of results
 */
export function executeTransaction(db, queries) {
    const results = [];
    
    db.transaction(() => {
        for (const { sql, params } of queries) {
            const stmt = db.prepare(sql);
            const result = stmt.all(...(params || []));
            results.push(result);
        }
    })();
    
    return results;
}

/**
 * Upsert helper (INSERT OR REPLACE)
 * @param {string} table - Table name
 * @param {Object} data - Data object with column: value pairs
 * @param {string[]} primaryKeys - Primary key column names
 * @returns {{sql: string, params: Array}} Query object
 */
export function buildUpsert(table, data, primaryKeys = ['id']) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    const sql = `
        INSERT INTO ${table} (${columns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT(${primaryKeys.join(', ')}) 
        DO UPDATE SET ${columns.map(col => `${col} = excluded.${col}`).join(', ')}
    `;
    
    return { sql, params: values };
}

/**
 * Bulk insert helper with transaction
 * @param {Object} db - Database instance
 * @param {string} table - Table name
 * @param {Array<Object>} rows - Array of data objects
 * @returns {number} Number of rows inserted
 */
export function bulkInsert(db, table, rows) {
    if (!rows || rows.length === 0) return 0;
    
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    let insertedCount = 0;
    
    db.transaction(() => {
        const stmt = db.prepare(sql);
        for (const row of rows) {
            const values = columns.map(col => row[col]);
            stmt.run(...values);
            insertedCount++;
        }
    })();
    
    return insertedCount;
}

/**
 * Get database health metrics
 * @param {Object} db - Database instance
 * @returns {Object} Health metrics
 */
export function getDatabaseHealth(db) {
    try {
        const pragmaJournalMode = db.pragma('journal_mode', { simple: true });
        const pragmaPageCount = db.pragma('page_count', { simple: true });
        const pragmaPageSize = db.pragma('page_size', { simple: true });
        const pragmaFreelistCount = db.pragma('freelist_count', { simple: true });
        
        const sizeBytes = pragmaPageCount * pragmaPageSize;
        const freeSizeBytes = pragmaFreelistCount * pragmaPageSize;
        
        return {
            journalMode: pragmaJournalMode,
            totalSizeBytes: sizeBytes,
            totalSizeMB: (sizeBytes / 1024 / 1024).toFixed(2),
            freeSizeBytes: freeSizeBytes,
            freeSizeMB: (freeSizeBytes / 1024 / 1024).toFixed(2),
            pageCount: pragmaPageCount,
            pageSize: pragmaPageSize,
            fragmentationRatio: ((freeSizeBytes / sizeBytes) * 100).toFixed(2),
            healthy: freeSizeBytes / sizeBytes < 0.3, // < 30% fragmentation
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.message,
        };
    }
}

/**
 * Format duration from milliseconds to human readable
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
    if (!ms || ms < 0) return '0s';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Format bytes to human readable
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Validate table name (prevent SQL injection in dynamic table names)
 * @param {string} tableName - Table name to validate
 * @param {string[]} allowedTables - List of allowed table names
 * @returns {boolean} True if valid
 * @throws {Error} If table name is invalid
 */
export function validateTableName(tableName, allowedTables = []) {
    // Only allow alphanumeric and underscore
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        throw new Error(`Invalid table name: ${tableName}`);
    }
    
    // Check against whitelist if provided
    if (allowedTables.length > 0 && !allowedTables.includes(tableName)) {
        throw new Error(`Table not allowed: ${tableName}`);
    }
    
    return true;
}

/**
 * Query builder for complex WHERE clauses
 */
export class QueryBuilder {
    constructor(baseQuery) {
        this.query = baseQuery;
        this.params = [];
        this.conditions = [];
    }
    
    where(column, operator, value) {
        this.conditions.push(`${column} ${operator} ?`);
        this.params.push(value);
        return this;
    }
    
    whereIn(column, values) {
        if (!values || values.length === 0) return this;
        const placeholders = values.map(() => '?').join(', ');
        this.conditions.push(`${column} IN (${placeholders})`);
        this.params.push(...values);
        return this;
    }
    
    whereLike(column, pattern) {
        this.conditions.push(`${column} LIKE ?`);
        this.params.push(`%${escapeLikePattern(pattern)}%`);
        return this;
    }
    
    orderBy(column, direction = 'DESC') {
        this.query += ` ORDER BY ${column} ${direction}`;
        return this;
    }
    
    limit(limit, offset = 0) {
        this.query += ` LIMIT ${limit}`;
        if (offset > 0) {
            this.query += ` OFFSET ${offset}`;
        }
        return this;
    }
    
    build() {
        if (this.conditions.length > 0) {
            this.query += ' WHERE ' + this.conditions.join(' AND ');
        }
        return {
            sql: this.query,
            params: this.params,
        };
    }
}

export default {
    DatabaseConstants,
    DateFilters,
    getDateFilter,
    getArchiveDateRange,
    escapeLikePattern,
    buildPagination,
    buildOrderBy,
    StatisticsQueries,
    executeTransaction,
    buildUpsert,
    bulkInsert,
    getDatabaseHealth,
    formatDuration,
    formatBytes,
    validateTableName,
    QueryBuilder,
};
