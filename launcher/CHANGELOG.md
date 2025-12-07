# Changelog

All notable changes to Miyao Launcher will be documented in this file.

## [1.2.1] - 2025-12-03 "Celestia"

### Added

#### Phase 7: Database Backup & Maintenance

- **P7-01**: Database backup functionality
  - View database info (size, path, last modified)
  - Create timestamped backups with one click
  - List all available backups with metadata
  - Restore database from any backup
  - Auto-backup before restore for safety
  - Delete old backups
  - Export backups to custom location
  - Import backups from external sources
  - WAL/SHM file support for SQLite
  - Bot running state detection for safe operations

### Fixed

#### Bug Fixes & Improvements

- **BF-01**: Fixed `stopLavalink()` and `stopBot()` not properly awaiting process termination
  - Process termination now uses promisified exec
  - Additional port cleanup after stopping Lavalink
  - Proper error handling and state reset
- **BF-02**: Fixed missing `envValidationTimeout` variable in state
  - Added proper initialization to prevent undefined errors
- **BF-03**: Fixed IPC handlers for stop operations to be async
  - `stop-lavalink` and `stop-bot` now properly await async functions
- **BF-04**: Improved process cleanup robustness
  - Added fallback port killing for zombie processes
  - Better error handling in cleanup functions

### Changed

- Updated launcher version to 1.2.1
- Updated build date to 2025.12.03
- Settings tab now loads database info alongside env config
- Improved overall error handling and user feedback

### Technical

- Added 7 new IPC handlers for database backup operations
- Extended preload script with database backup API exposure
- Added comprehensive CSS styles for backup UI components
- Implemented backup list with real-time updates
- Added confirmation dialogs for destructive operations

---

## [1.2.0] - 2025-01-XX "Celestia"

### Added

#### Phase 6: UX Polish

- **P6-01**: System Tray icon with Miyao branding
- **P6-02**: Tray context menu with service status indicators (🟢/🔴)
- **P6-03**: Minimize to tray option (configurable)
- **P6-03**: Close to tray option (configurable)
- **P6-04**: Desktop notifications when services start/stop
- **P6-05**: Desktop notifications when services crash
- **P6-06**: Keyboard shortcuts for tab navigation (Ctrl+1-5)
- **P6-06**: Keyboard shortcuts for service control (Ctrl+Shift+L/B/A)
- **P6-06**: Keyboard shortcuts for save/search/refresh (Ctrl+S/F, F5)
- **P6-07**: Keyboard shortcuts reference section in Settings tab
- **P6-08**: Window state persistence (position, size, maximized)

### Changed

- Updated launcher version to 1.2.0
- Updated codename to "Celestia"
- Improved Settings tab with new tray/notification toggles

### Technical

- Added Electron Tray and Notification APIs integration
- Added globalShortcut for system-wide shortcuts (reserved for future)
- Implemented window bounds persistence via electron-store
- Added IPC channels for tray settings communication

---

## [1.1.0] - 2024-XX-XX "Aurora"

### Added

#### Phase 1: Performance

- P1-05: Terminal output line limit (1000 lines max)
- P1-07: Batch status IPC calls
- P1-08: Debounced terminal updates (16ms window)

#### Phase 2: Dashboard

- P2-01: Dashboard tab with quick status overview
- P2-02: Service uptime tracking
- P2-03: Quick actions buttons (Start All, Stop All, Restart All)
- P2-04: Recent logs preview
- P2-05: Start All sequential startup
- P2-06: Stop All graceful shutdown
- P2-07: Restart All with delay
- P2-08: Service dependency warnings
- P2-09: Pre-flight checks
- P2-10: Auto-fix for common issues

#### Phase 3: Terminal Enhancements

- P3-01: Search input in terminal toolbar
- P3-02: Ctrl+F search with navigation
- P3-03: Filter dropdown (All/Info/Warn/Error)
- P3-04: Log level filtering
- P3-05: Export logs to file
- P3-06: Copy all logs to clipboard
- P3-07: Line numbers
- P3-08: Timestamps

#### Phase 4: Settings Security

- P4-01: Sensitive key detection
- P4-02: Value masking for tokens/secrets
- P4-03: Toggle visibility buttons
- P4-04: Required fields validation
- P4-05: Validation results panel
- P4-06: Real-time validation
- P4-07: Save confirmation
- P4-08: Import from .env.example

#### Phase 5: Error Handling

- P5-01: User-friendly error messages
- P5-02: Error message mapping
- P5-03: Error modal with solutions
- P5-04: Auto-fix buttons
- P5-05: Error logging
- P5-06: npm install progress modal
- P5-07: Lavalink download guide
- P5-08: Auto-restart for crashed services

### Changed

- Improved terminal scrolling performance
- Enhanced settings editor with masked inputs
- Better error handling throughout

---

## [1.0.0] - 2024-XX-XX "Genesis"

### Added

- Initial release
- Basic Lavalink management
- Basic Bot management
- Setup wizard with requirements check
- .env file editing
- Version info display
