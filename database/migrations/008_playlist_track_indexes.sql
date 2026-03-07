-- Migration 008: Playlist Track Indexes
-- Purpose: Originally added indexes for playlist tracks and statistics tables.
-- NOTE: The index creation statements were duplicates of migration 007
-- (007_phase_0_optimizations.sql) and have been removed.
-- Indexes already created by 007:
--   idx_playlist_tracks_track_url, idx_playlist_tracks_url_playlist,
--   idx_statistics_date

-- Record migration
INSERT INTO migrations (version, name, applied_at) 
VALUES ('008', 'playlist_track_indexes', CURRENT_TIMESTAMP)
ON CONFLICT(version) DO NOTHING;
