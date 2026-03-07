-- Migration 007: Phase 0 Optimizations
-- Additional indexes and performance improvements

-- Add missing indexes identified in analysis

-- Index for track_url in playlist_tracks (for track presence checks)
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_url 
ON playlist_tracks(track_url);

-- Composite index for faster playlist track lookups
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_url_playlist 
ON playlist_tracks(track_url, playlist_id);

-- No need for cache_key index as it's already PRIMARY KEY

-- Index for statistics aggregation queries  
CREATE INDEX IF NOT EXISTS idx_statistics_date 
ON statistics(recorded_at DESC);

-- Index for user preferences (even though table might not exist yet)
-- This will be used when user_preferences table is created in future migrations
-- CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
-- ON user_preferences(user_id);

-- Blacklist already has idx_blacklist_active index, no need for additional

-- idx_playlists_name already exists, verified via check-playlists.js
-- idx_playlists_guild already exists, verified via check-playlists.js
-- idx_playlists_owner already exists, verified via check-playlists.js
-- No play_count column exists in playlists table

-- Index for audit log queries by timestamp range
-- NOTE: audit_logs table is created dynamically by AuditLog.initialize() 
-- and already includes its own indexes. This index will be created by the model.
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp_range 
-- ON audit_logs(created_at DESC, guild_id);

-- Analyze tables to update statistics for query planner
ANALYZE;

-- Record migration
INSERT INTO migrations (version, name, applied_at) 
VALUES ('007', 'phase_0_optimizations', CURRENT_TIMESTAMP)
ON CONFLICT(version) DO NOTHING;
