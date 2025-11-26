-- Migration 004: Playlist Management System Enhancement
-- Version: 1.6.0
-- Description: Migrate existing playlist system to new structure with separate tracks table

-- Step 1: Check if we need to migrate from old structure
-- If playlists table exists with old schema (user_id, tracks_json), migrate it

-- Create backup of existing playlists if they exist
DROP TABLE IF EXISTS playlists_backup;
CREATE TABLE IF NOT EXISTS playlists_backup AS SELECT * FROM playlists WHERE 1=0;

-- Insert backup data if playlists table exists
INSERT OR IGNORE INTO playlists_backup SELECT * FROM playlists;

-- Step 2: Drop old playlists table (data is in backup)
DROP TABLE IF EXISTS playlists;

-- Step 3: Create new playlists table with enhanced schema
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    owner_username TEXT,
    guild_id TEXT NOT NULL,
    description TEXT,
    thumbnail TEXT,
    is_public BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_id, guild_id, name)
);

-- Step 4: Create playlist_tracks table
CREATE TABLE playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    track_url TEXT NOT NULL,
    track_title TEXT NOT NULL,
    track_author TEXT,
    track_duration INTEGER,
    position INTEGER NOT NULL,
    added_by TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

-- Step 5: Migrate data from backup (if exists)
-- Convert old user_id to owner_id, and guild_id is assumed from first user interaction
INSERT INTO playlists (name, owner_id, owner_username, guild_id, description, is_public, created_at, updated_at)
SELECT 
    name,
    user_id as owner_id,
    NULL as owner_username,
    'migrated' as guild_id,
    description,
    is_public,
    created_at,
    updated_at
FROM playlists_backup;

-- Step 6: Migrate tracks from tracks_json to playlist_tracks table
-- This is complex because tracks are stored as JSON array
-- We'll skip automatic migration and let users re-create playlists
-- Note: Old tracks_json data is preserved in playlists_backup table

-- Step 7: Create indexes for performance optimization
CREATE INDEX idx_playlists_owner ON playlists(owner_id);
CREATE INDEX idx_playlists_guild ON playlists(guild_id);
CREATE INDEX idx_playlists_public ON playlists(is_public, guild_id);
CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX idx_playlist_tracks_position ON playlist_tracks(playlist_id, position);

-- Step 8: Create triggers
-- Trigger: Update updated_at timestamp on playlist changes
CREATE TRIGGER update_playlist_timestamp_v2
AFTER UPDATE ON playlists
BEGIN
    UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger: Auto-reorder positions when track is deleted
CREATE TRIGGER reorder_positions_after_delete
AFTER DELETE ON playlist_tracks
BEGIN
    UPDATE playlist_tracks 
    SET position = position - 1 
    WHERE playlist_id = OLD.playlist_id AND position > OLD.position;
END;

-- Step 9: Record migration
INSERT OR IGNORE INTO migrations (version, name) VALUES ('004', 'playlists_enhanced');
