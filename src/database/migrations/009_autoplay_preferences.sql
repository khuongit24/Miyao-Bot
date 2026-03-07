-- Migration 009: Auto-Play Preferences & Tracking
-- Purpose: Track user song confirmation counts and store auto-play preferences
-- Created: 2026-02-12
-- Feature: Stable intent detection → auto-play suggestion → user preference management

-- ============================================================================
-- PART 1: CONFIRMATION TRACKING TABLE
-- ============================================================================

-- Tracks how many times a user confirms the same song within a time window.
-- Used to detect "stable intent" — when a user repeatedly picks the same track.
-- Rows are pruned by the application layer (cleanup older than 30 days).
CREATE TABLE IF NOT EXISTS user_track_confirmations (
    user_id TEXT NOT NULL,
    track_url TEXT NOT NULL,
    track_title TEXT NOT NULL,
    track_author TEXT,
    confirm_count INTEGER DEFAULT 1,
    first_confirmed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_confirmed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, track_url)
);

-- Index for cleanup queries (find stale rows older than 30 days)
CREATE INDEX IF NOT EXISTS idx_utc_last_confirmed
ON user_track_confirmations(last_confirmed_at);

-- Index for finding candidates that crossed the threshold
CREATE INDEX IF NOT EXISTS idx_utc_user_count
ON user_track_confirmations(user_id, confirm_count DESC);

-- ============================================================================
-- PART 2: AUTO-PLAY PREFERENCES TABLE
-- ============================================================================

-- Stores user opt-in preferences for auto-playing specific tracks.
-- confidence starts at 1.0 and increases when the user listens fully,
-- or decreases on instant skip / time decay.
CREATE TABLE IF NOT EXISTS autoplay_preferences (
    user_id TEXT NOT NULL,
    track_url TEXT NOT NULL,
    track_title TEXT NOT NULL,
    track_author TEXT,
    confidence REAL DEFAULT 1.0,
    enabled INTEGER DEFAULT 1,
    times_auto_played INTEGER DEFAULT 0,
    times_listened_full INTEGER DEFAULT 0,
    times_instant_skipped INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_auto_played_at DATETIME,
    last_confidence_update_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, track_url)
);

-- Index for quick lookup during play command (user + track + enabled)
CREATE INDEX IF NOT EXISTS idx_ap_user_enabled
ON autoplay_preferences(user_id, enabled, track_url);

-- Index for cleanup / decay queries
CREATE INDEX IF NOT EXISTS idx_ap_confidence_update
ON autoplay_preferences(last_confidence_update_at);

-- ============================================================================
-- PART 3: SUGGESTION DISMISSAL TABLE
-- ============================================================================

-- Records when a user dismisses a suggestion ("No thanks") so we never ask again.
CREATE TABLE IF NOT EXISTS autoplay_suggestion_dismissals (
    user_id TEXT NOT NULL,
    track_url TEXT NOT NULL,
    dismissed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, track_url)
);

-- ============================================================================
-- PART 4: OPTIMIZE
-- ============================================================================

ANALYZE;

-- ============================================================================
-- PART 5: RECORD MIGRATION
-- ============================================================================

INSERT INTO migrations (version, name, applied_at)
VALUES ('009', 'autoplay_preferences', CURRENT_TIMESTAMP)
ON CONFLICT(version) DO NOTHING;
