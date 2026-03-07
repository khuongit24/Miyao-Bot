-- Migration 012: Drop unused history_archive table and indexes (DB-M01)
-- The history_archive table was created in migration 006 but cleanupHistory()
-- only DELETEs records, never archives them. The table has always been empty.

DROP INDEX IF EXISTS idx_history_archive_guild_date;
DROP INDEX IF EXISTS idx_history_archive_user_date;
DROP INDEX IF EXISTS idx_history_archive_track;
DROP TABLE IF EXISTS history_archive;
