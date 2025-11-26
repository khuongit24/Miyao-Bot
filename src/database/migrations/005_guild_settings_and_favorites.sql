-- Migration 005: Guild Settings and Favorites
-- Version: 1.8.0
-- Description: Add guild settings (DJ role, 24/7 mode, vote skip) and favorites system

-- Step 1: Create guild_settings table for server-specific settings
CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    guild_name TEXT,
    dj_role_id TEXT,                    -- DJ role ID for controlling music
    dj_only_mode BOOLEAN DEFAULT 0,     -- If true, only DJ role can use destructive commands
    vote_skip_enabled BOOLEAN DEFAULT 0, -- Enable vote skip feature
    vote_skip_percentage INTEGER DEFAULT 50 CHECK(vote_skip_percentage >= 10 AND vote_skip_percentage <= 100),
    twenty_four_seven BOOLEAN DEFAULT 0, -- 24/7 mode - bot stays in voice channel
    announce_songs BOOLEAN DEFAULT 1,    -- Announce new songs
    default_volume INTEGER DEFAULT 50 CHECK(default_volume >= 0 AND default_volume <= 100),
    max_queue_size INTEGER DEFAULT 500,  -- Maximum queue size per guild
    allow_duplicates BOOLEAN DEFAULT 1,  -- Allow duplicate tracks in queue
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Create favorites table for user liked songs
CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    track_url TEXT NOT NULL,
    track_title TEXT NOT NULL,
    track_author TEXT,
    track_duration INTEGER,
    track_artwork TEXT,
    source_name TEXT,                   -- 'youtube', 'spotify', 'soundcloud', etc.
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, track_url)
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_guild_settings_dj ON guild_settings(dj_role_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_added ON favorites(user_id, added_at DESC);

-- Step 4: Create triggers
-- Trigger: Update guild_settings timestamp on changes
CREATE TRIGGER IF NOT EXISTS update_guild_settings_timestamp
AFTER UPDATE ON guild_settings
BEGIN
    UPDATE guild_settings SET updated_at = CURRENT_TIMESTAMP WHERE guild_id = NEW.guild_id;
END;

-- Step 5: Record migration
INSERT OR IGNORE INTO migrations (version, name) VALUES ('005', 'guild_settings_and_favorites');
