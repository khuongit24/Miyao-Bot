-- Migration 002: Optimize Database Schema
-- Created: 2025-10-04
-- Version: v1.5.0
-- Purpose: Add composite indexes and optimize queries

-- Add composite indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_history_guild_user ON history(guild_id, user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_track_url ON history(track_url, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlists_public ON playlists(is_public, created_at DESC) WHERE is_public = 1;
CREATE INDEX IF NOT EXISTS idx_statistics_composite ON statistics(metric_type, entity_id, metric_name, recorded_at DESC);

-- Add index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Optimize blacklist lookups
CREATE INDEX IF NOT EXISTS idx_blacklist_active ON blacklist(type, is_active, pattern) WHERE is_active = 1;

-- Insert migration record
INSERT OR IGNORE INTO migrations (version, name) VALUES ('002', 'optimize_schema');
