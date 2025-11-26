-- Migration 007: Playlist Track Indexes
-- Purpose: Add indexes for playlist tracks and statistics tables

-- Index for track_url in playlist_tracks (for track presence checks)
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_url 
ON playlist_tracks(track_url);

-- Composite index for faster playlist track lookups
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_url_playlist 
ON playlist_tracks(track_url, playlist_id);

-- Index for statistics aggregation queries  
CREATE INDEX IF NOT EXISTS idx_statistics_date 
ON statistics(recorded_at DESC);

-- NOTE: The following indexes are not needed:
-- - cache_key index: already PRIMARY KEY
-- - idx_playlists_name: already exists
-- - idx_playlists_guild: already exists  
-- - idx_playlists_owner: already exists
-- - audit_logs indexes: created by AuditLog.initialize()

-- Analyze tables to update statistics for query planner
ANALYZE;

-- Record migration
INSERT INTO migrations (version, name, applied_at) 
VALUES ('007', 'playlist_track_indexes', CURRENT_TIMESTAMP)
ON CONFLICT(version) DO NOTHING;
