-- Migration 010: Feedback storage in database
-- Version: 1.10.1
-- Description: Move feedback submissions from JSON file to SQLite table

CREATE TABLE IF NOT EXISTS feedback_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'FEEDBACK',
    user_id TEXT NOT NULL,
    user_tag TEXT,
    username TEXT,
    guild_id TEXT,
    guild_name TEXT,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    contact TEXT,
    legacy_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_submissions_user_created
ON feedback_submissions(user_id, created_at DESC);

INSERT OR IGNORE INTO migrations (version, name) VALUES ('010', 'feedback_storage');
