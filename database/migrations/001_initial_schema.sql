-- Migration 001: Initial Database Schema
-- Created: 2025-10-03
-- Version: v1.5.0

-- Users table - Store user preferences and settings
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    default_volume INTEGER DEFAULT 50 CHECK(default_volume >= 0 AND default_volume <= 100),
    auto_resume BOOLEAN DEFAULT 0,
    notifications_enabled BOOLEAN DEFAULT 1,
    language TEXT DEFAULT 'vi',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Playlists table - Custom user playlists
CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    tracks_json TEXT NOT NULL, -- JSON array of tracks
    is_public BOOLEAN DEFAULT 0,
    play_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- History table - Play history with retention
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    track_title TEXT NOT NULL,
    track_author TEXT,
    track_url TEXT,
    track_duration INTEGER,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Statistics table - Long-term metrics
CREATE TABLE IF NOT EXISTS statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL, -- 'user', 'guild', 'track', 'system'
    metric_name TEXT NOT NULL,
    entity_id TEXT, -- user_id, guild_id, or track_id
    value REAL NOT NULL,
    metadata TEXT, -- JSON for additional data
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Blacklist table - Blocked patterns
CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL, -- 'url', 'keyword', 'user', 'domain'
    reason TEXT,
    added_by TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- Cache table - Persistent cache
CREATE TABLE IF NOT EXISTS cache (
    cache_key TEXT PRIMARY KEY,
    cache_value TEXT NOT NULL, -- JSON stringified value
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migrations table - Track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial migration record
INSERT OR IGNORE INTO migrations (version, name) VALUES ('001', 'initial_schema');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_history_guild_date ON history(guild_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_user_date ON history(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_statistics_type_entity ON statistics(metric_type, entity_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);

-- Create triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS update_playlists_timestamp 
AFTER UPDATE ON playlists
BEGIN
    UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Create trigger for automatic cache cleanup
CREATE TRIGGER IF NOT EXISTS cleanup_expired_cache
AFTER INSERT ON cache
BEGIN
    DELETE FROM cache WHERE expires_at < CURRENT_TIMESTAMP;
END;

-- Create trigger for history retention (keep only 30 days)
CREATE TRIGGER IF NOT EXISTS cleanup_old_history
AFTER INSERT ON history
BEGIN
    DELETE FROM history WHERE played_at < datetime('now', '-30 days');
END;
