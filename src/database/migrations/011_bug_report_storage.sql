-- Migration 011: Bug report storage in database
-- Version: 1.10.2
-- Description: Move bug reports from JSON file to SQLite table to eliminate race conditions (EV-C01)

CREATE TABLE IF NOT EXISTS bug_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    user_tag TEXT,
    username TEXT,
    guild_id TEXT,
    guild_name TEXT,
    title TEXT NOT NULL,
    steps TEXT NOT NULL,
    expected TEXT NOT NULL,
    actual TEXT NOT NULL,
    contact TEXT DEFAULT 'Không cung cấp',
    status TEXT NOT NULL DEFAULT 'OPEN',
    severity TEXT NOT NULL DEFAULT 'MEDIUM',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_user_created
ON bug_reports(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status
ON bug_reports(status);

INSERT OR IGNORE INTO migrations (version, name) VALUES ('011', 'bug_report_storage');
