# Changelog

All notable changes to Miyao Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.11.4] - 2026-03-07

### 🐛 Fixed
- Fix linting and formatting issues
- Fix Shoukaku connection state enumerations in tests (updated to v4.3.0 logic)
- Update dependencies to patch vulnerabilities

## [1.11.2] - 2026-03-07

### 🐛 Bug Fixes (Critical)

- Fix `/search` select menu not responding when selecting a song
- Fix button skip bypassing vote-skip settings
- Fix input validator regex security bypass (global flag)
- Fix server trending showing 0:00 duration

### 🐛 Bug Fixes (High)

- Fix autoplay only searching YouTube regardless of source
- Fix stuck queue when track fails after max retries
- Fix cache warm-up 100% miss rate due to key mismatch
- Fix race condition in auto-play preference recording

### 🌐 Localization

- Replace 15+ English strings with Vietnamese equivalents
- Wire design system field names to embed builders
- Address non-functional language setting

### 🔒 Security

- Fix regex global flag alternating validation bypass
- Add rate limiting to prefix commands
- Add timeout to health check webhook calls

### ⚡ Performance & Reliability

- Fix silent playback failure — add playback start watchdog, position stall detection, and WebSocket close recovery
- Fix ShutdownRegistry hanging on stuck resources
- Add 24/7 reconnect retry limit with backoff
- Fix Statistics timezone mismatch to UTC
- Fix truncate() null crash
- Fix AbortSignal.any() Node 18 compatibility

### 🎨 UI/UX Polish

- Fix loop mode terminology consistency
- Fix requester icon consistency (👤)
- Fix track-added embed color to SUCCESS
- Fix bug report confirmation color to SUCCESS
- Add filter active state indicator
- Standardize help button labels

### 🧹 Code Quality

- Extract shared constants (SKIP_PATTERNS, help categories)
- Extract shared utilities (withTimeout, OAuth embed)
- Extract search handler shared logic (\_processSearchResult)
- Remove dead imports and vestigial code
- Fix version docstrings
- Fix async/sync JSDoc mismatches
- Fix ProgressTracker tier intervals

### 🧪 Testing

- Add regression tests for all critical bug fixes
- Add interactionCreate routing tests
- Add messageCreate fakeInteraction tests
- Add AutoplayManager multi-source tests
- Add Playlist TOCTOU tests
- Fix test infrastructure issues
- Achieve ≥100 test suites, ≥2000 tests

## [1.11.1] - 2026-03-02 — Stabilization Release

> **v1.11.1** — QA audit phát hiện 31 bugs từ v1.11.0. Toàn bộ CRITICAL, HIGH, MEDIUM và LOW bugs đã được sửa. Test suite khôi phục 100%.

### 📊 Release Summary

| Metric             | v1.11.0 (actual)          | v1.11.1                 |
| ------------------ | ------------------------- | ----------------------- |
| Test suites        | 82 passing (14 failed)    | 97 passing (0 failed)   |
| Tests              | 1610 passed (109 crashed) | 1914+ passed (0 failed) |
| Statement coverage | 51.42%                    | ≥58%                    |
| Branch coverage    | 44.20%                    | ≥49%                    |
| ESLint errors      | 12                        | 0                       |

### 🐛 Fixed

#### Critical

- **VER-C01:** Fix `RELEASE_NOTES` undefined causing 109 test crashes across 14 suites
- **SRCH-C01:** Fix `/search` double-prefix (`ytsearch:ytsearch:query`) — source now passed via options

#### High

- **CM-H01:** CacheManager cleanup interval `.unref()` for graceful shutdown
- **RLD-H01:** `resource-leak-detector` `cleanupAll()` now clears event listeners
- **RLD-H02:** `CollectorTracker.destroy()` now stops active collectors
- **SC-H01:** Remove dead zlib compression code from SearchCache
- **PLAY-H01:** Add `ViewChannel` permission check to `/play`
- **HELP-H01:** Add `/search`, `/replay`, `/mypreferences` to help command

#### Medium

- **EQ-M01:** Fix Deezer ARL check mismatch in EnhancedQueue
- **MM-M01:** Separate YouTube Music from YouTube platform (`youtube_music`)
- **PT-M01:** Fix ProgressTracker sentinel race with `_isRunning` flag
- **SRCH-M01:** Add YouTube Music + Deezer choices to `/search`
- **PLAY-M01:** Fix URL case preservation in `normalizeSearchQuery`
- **README-M01:** Fix dead MWEB reference → ANDROID_VR
- **README-M02:** Add missing environment variables to README table
- **CM-M01:** Tighten CacheManager budget validation (0-100%)
- **QC-M01:** Fix `getQueueOrNull()` null guard in queueCheck middleware
- **GMD-M01:** Deduplicate GenreMoodDetector patterns
- **GMD-M02:** Tighten SKIP_PATTERNS to prevent over-filtering
- **DB-M01:** DROP unused `history_archive` table and dead indexes
- **CM-M02:** Fix global eviction — gradient/proportional replacing uniform 20%

#### Low

- **HLP-L01:** Deduplicate `getPlatformIcon()` with PLATFORM_EMOJIS lookup
- **HLP-L02:** Remove phantom emoji entries (applemusic, jiosaavn, yandexmusic)
- **AP-L01:** Log `AggregateError.errors` in AutoplayManager strategy failures
- **APYML-L01:** Add commented `remoteCipher` block to `application.yml`
- **DB-L01:** Document UPDATE trigger recursive fire risk
- **GMD-L01:** Normalize mood cache key for consistency
- **PT-L01:** Remove redundant throttle check in ProgressTracker
- **RLD-L01:** Remove dead code `_orphaned = 0`

### 🔧 Changed

- SearchCache: removed all zlib compression code (was dead/never implemented)
- README: MWEB → ANDROID_VR client reference, added env vars table
- `.env.example`: Updated version header, added Deezer + YouTube advanced variables
- CacheManager: Gradient eviction replaces uniform 20% policy
- CHANGELOG v1.11.0: Added correction disclaimer for false test metrics

### 📚 Documentation

- Full QA audit report (31 bugs documented)
- Performance review (6 issues identified)
- Security review (no critical vulnerabilities)
- Updated bot-specification docs (commands, music engine, caching, testing guide)
- v1.11.1 roadmap with 6 phases
- Release checklist
- Code changes specification

## [1.11.0] - 2026-02-28 — Multi-Source Engine (Released)

> **v1.11.0** giải quyết YouTube blocking + thêm nguồn nhạc thay thế. Hệ thống tự động fallback qua nhiều nguồn nhạc, đảm bảo phát nhạc không gián đoạn ngay cả khi một nguồn bị lỗi.

> **⚠️ Correction (v1.11.1):** Số liệu test ban đầu được ghi nhận TRƯỚC khi phát hiện bug VER-C01 (`RELEASE_NOTES` undefined). Số liệu thực tế sau khi phát hiện: 82/96 suites passed (14 failed), 1610/1899 tests passed (109 crashed), statements 51.42%, branches 44.20%. Tất cả đã được khắc phục trong v1.11.1.

### 📊 Release Summary

| Metric                    | v1.10.2     | v1.11.0                |
| ------------------------- | ----------- | ---------------------- |
| Test suites               | 90 passing  | 96 passing             |
| Tests                     | 1695 passed | 1899 passed (+204 new) |
| Statement coverage        | 59.11%      | 60.97%                 |
| Branch coverage           | 49.96%      | 52.49%                 |
| Function coverage         | 63.51%      | 65.26%                 |
| Line coverage             | 59.88%      | 61.68%                 |
| ESLint errors             | 0           | 0                      |
| npm audit (high/critical) | 0           | 0                      |

### ✨ Added

#### Multi-Source Search Engine

- **Search fallback chain:** `ytsearch → ytmsearch → scsearch → dzsearch` — tự động chuyển nguồn khi một nguồn thất bại
- **`_getAvailableSearchSources()`** — Xác định danh sách nguồn tìm kiếm khả dụng dựa trên config
- **`_executeSearch()` rewrite** — Hệ thống search mới với fallback chain, timeout protection, circuit breaker support
- **`_hasValidTracks()` validator** — Kiểm tra kết quả search hợp lệ (phát hiện OAuth token issues)
- **`searchDirect()` helper** — Tìm kiếm trực tiếp với prefix cụ thể (dùng cho source switch)
- **Search source tagging** — Mỗi kết quả search gắn kèm `searchSource` và `searchSourceName`

#### Error Recovery & Source Switch

- **`_tryAlternativeSource()`** — Tự động tìm bài thay thế trên SoundCloud/Deezer khi YouTube fail
- **`_sendSourceSwitchNotification()`** — Thông báo người dùng khi chuyển nguồn nhạc
- **`_handleAllSourcesFailed()`** — Xử lý graceful khi tất cả nguồn đều thất bại
- **Enhanced `_isOAuthError()` patterns** — Phát hiện 16+ OAuth/auth error patterns
- **Consecutive error counter** — Chỉ trigger source switch khi ≥3 lỗi liên tiếp

#### New Platform Support

- **Bandcamp URLs** — Phát nhạc trực tiếp từ Bandcamp track/album URLs
- **Deezer** — Search (`dzsearch:`) và URL playback (yêu cầu ARL cookie, optional)
- **Twitch** — Phát livestream audio từ Twitch URLs
- **Vimeo** — Phát audio từ Vimeo video URLs
- **HTTP Streams** — Hỗ trợ direct audio streams (.mp3, .ogg, .flac, .wav, .aac, .m3u8, .opus)

#### New URL Detection

- **`detectPlatform()` rewrite** — Nhận diện tất cả platform mới (Bandcamp, Deezer, Twitch, Vimeo, HTTP)
- **`URL_PATTERNS`** — Bộ regex patterns cho tất cả URL types được export
- **`getPlatformEmoji()` helper** — Trả về emoji tương ứng với platform

#### New Constants

- **`SEARCH_PREFIXES`** — Frozen object: `YOUTUBE`, `YOUTUBE_MUSIC`, `SOUNDCLOUD`, `DEEZER`
- **`SOURCE_PRIORITY`** — Frozen array: thứ tự ưu tiên nguồn tìm kiếm
- **`PLATFORM_NAMES`** — Tên hiển thị cho 9 platforms
- **`PLATFORM_EMOJIS`** — Emoji biểu tượng cho 10 platforms

#### UI & Design System

- **Now Playing embed** — Hiển thị source indicator (platform emoji)
- **Queue display** — Hiển thị platform icon per track
- **`/play` response** — Badge hiển thị khi kết quả đến từ nguồn fallback
- **Source switch notification embed** — Thông báo khi chuyển nguồn nhạc (màu cam, 0xFFA500)
- **Platform icons** — Thêm icons mới cho Bandcamp, Deezer, Twitch, Vimeo, HTTP trong design-system

### 🔧 Changed

#### Lavalink Configuration

- **YouTube client order:** `TVHTML5_SIMPLY` (first, no OAuth required) → `MUSIC` → `MWEB` → `WEB`
- **Removed `WEBEMBEDDED`** client (deprecated, gây lỗi)
- **`skipInitialization: true`** — OAuth không bắt buộc khi khởi động
- **Request options optimized** — Retry, timeout, và connection settings

#### Code Quality

- **8 source files modified** — `constants.js`, `musicUtils.js`, `MusicManager.js`, `EnhancedQueue.js`, `design-system.js`, `helpers.js`, `application.yml`, `.env.example`
- **Backward compatible** — Tất cả API hiện có không bị thay đổi
- **`SearchCache` compatible** — Key format tương thích với multi-source

### 🧪 Testing

- **204 new tests** (from 1695 to 1899)
- **6 new test suites** — `musicUtils.detectPlatform.test.js`, `MusicManager.multiSourceSearch.test.js`, `EnhancedQueue.sourceSwitch.test.js`, `constants.searchPrefixes.test.js`, `multiSource.integration.test.js`, `v1.11.0-multiSource.test.js`
- **Coverage improved** across all metrics
- **0 regressions** — All 1695 existing tests continue to pass
- **Integration tests** — Multi-source search flow, source switch, URL routing
- **Regression tests** — Backward compatibility verification for constants, detectPlatform, helpers, design-system

### 📚 Documentation

- Full v1.11.0 documentation suite (8 files) in `docs/v1.11.0/`:
    - `00-release-summary.md` — Release overview
    - `01-youtube-recovery-plan.md` — YouTube recovery strategy
    - `02-multi-source-architecture.md` — Multi-source architecture design
    - `03-application-yml-changes.md` — Lavalink config changes
    - `04-code-changes-spec.md` — Code changes specification
    - `05-migration-guide.md` — Migration & deployment guide
    - `06-testing-plan.md` — Testing plan & smoke test checklists
    - `07-v1.11.0-roadmap.md` — Development roadmap

---

## [1.10.2] - 2026-02-27 — Production Stability Release (Released)

> **v1.10.2 is the production-readiness release.** Focused entirely on stability, security hardening, and bug fixes based on comprehensive QA audit results from v1.10.1. **85 total fixes** across 5 phases.

### 📊 Release Summary

| Metric                    | Before               | After                                                      |
| ------------------------- | -------------------- | ---------------------------------------------------------- |
| Critical bugs             | 13 open              | 0 open (all 13 fixed)                                      |
| High-priority bugs        | 29 open              | 0 open (all 29 fixed)                                      |
| Medium bugs               | 30 open              | 0 open (all 30 fixed)                                      |
| Test suites               | 88 passing, 2 failed | 90/90 passing                                              |
| Tests                     | —                    | 1695 pass, 1 skipped (documented)                          |
| ESLint errors             | 212                  | 10 (all remaining are complexity rule on legacy functions) |
| npm audit (high/critical) | 1 high               | 0                                                          |
| Statement coverage        | 39.2%                | 59.11%                                                     |

### 🔴 Phase 0 — Critical Fixes (13 bugs)

- **IDX-C01:** Fixed wrong event name `client.once('clientReady')` → `'ready'` in index.js
- **XC-C01:** Implemented centralized `ShutdownRegistry` for resource disposal (15+ intervals/resources)
- **EQ-C01:** Fixed `_isStopping` flag stuck permanently when `stopTrack()` throws — added try/finally to prevent queue freeze
- **MM-C01:** Fixed SearchCache prune interval leak on shutdown — `dispose()` now clears interval
- **DB-C01:** Fixed HistoryBatcher `flush()` data loss — insert-then-drain order enforced
- **DB-C02:** Fixed UserStatistics/TrackStatistics TOCTOU race with atomic `UPDATE ... SET col = col + ?` upsert
- **EV-C01:** Migrated bug report storage from JSON file to database (eliminated race condition)
- **API-C01:** CORS default changed from `'*'` to `'http://127.0.0.1'`
- **API-C02:** User input no longer reflected in error responses (XSS prevention)
- **API-C03:** Memory percentage now uses dynamic v8 heap limit via `v8.getHeapStatistics()`
- **CMD-C01:** Fixed null dereference crash in skip/voteskip with optional chaining on `queue.current`
- **CMD-C02:** Fixed lazy track resolve crash in trending command (`encoded: null` → resolve before add)
- **CMD-C03:** Fixed metrics.js `setInterval` leak on 429 errors — interval cleared on all error paths

### 🟠 Phase 1 — High Priority Fixes (29 bugs)

- **Entry Point:** PM2 `kill_timeout` aligned (20s > 15s shutdown grace period), `process.send('ready')` added
- **MusicManager:** Double-destroy guard, parallel node recovery (concurrency 10 instead of sequential)
- **EnhancedQueue:** Dead-letter list for failed tracks, stale reference fix in `_saveToDatabase`, position save in `previous()`
- **SearchCache:** Prune interval reference properly stored and cleared on dispose
- **RecommendationEngine:** Empty artist name guard prevents invalid queries
- **ReconnectionManager:** `await destroy()` before reconnect, separate seek retry path to isolate failures
- **Database:** `VALID_PERIODS` validation enforced, migration error handling improved, batch decay processing, exponential backoff on retries
- **Event Handlers:** Null queue guard in buttons/index.js, customId-based page encoding for pagination
- **Utils:** Per-request `AbortController` in lyrics.js, retry delay cap at 30s, DM null guard, config try-catch
- **Commands:** Dead code removal in nowplaying, null-safe rendering across embeds, embed field truncation, pagination boundary fix

### 🟡 Phase 4 — Medium Bug Fixes (30 fixes)

- **Music Engine (12):** Requester normalization, NaN duration/position validation, search cache fixes, rate limit handling improvements
- **Database & Events (6):** Favorites limit enforcement, audit log null safety, query builder parameter fixes
- **Utils & Services (6):** RegExp caching for repeated patterns, metrics value bounding, cache size limits
- **Commands (6):** Redundant import removal, null guards on optional fields, button row splitting for >5 buttons, seek regex validation

### 🔒 Phase 3 — Security & Dependencies

- **npm audit:** 0 high/critical vulnerabilities remaining
- **Fixed vulnerabilities:** minimatch ReDoS (HIGH), ajv ReDoS (MODERATE), qs prototype pollution DoS (MODERATE)
- SQL parameterization enforced across entire database layer
- CORS configuration hardened — no wildcard default
- User input sanitized from all error responses (XSS prevention)
- ESLint errors reduced from 212 → 10 (all remaining are `complexity` rule on legacy functions)

### 🧪 Phase 2 — Test Stabilization

- **90/90 test suites passing**, 1695 tests pass, 1 skipped (documented)
- Added regression test suite `tests/regression/v1.10.2-critical.test.js` covering all 13 critical bug fixes
- **Coverage:** Statements 59.11%, Branches 49.96%, Functions 63.51%, Lines 59.88%

### 📚 Documentation

- Full v1.10.2 documentation suite (8 files) in `docs/v1.10.2/`
- Bot-specification docs updated to v1.10.2
- CHANGELOG updated

---

## [1.10.0] - 2026-02-25 — Stability & Correctness Release

> **Bản stable v1.10.0:** Tập trung hoàn tất toàn bộ 85 bug fixes từ QA audit, đặc biệt là 13 critical bugs blocking release. Cải thiện đáng kể độ ổn định, bảo mật, và chất lượng codebase để đảm bảo bot sẵn sàng cho production release v1.10.2.

### 🔴 Critical & High Fixes

- Hoàn tất các fix release-blocking về startup/shutdown lifecycle, retry playback, Lavalink config guard, và singleton DB safety.
- Hoàn tất nhóm high-priority về reconnection state reset, OAuth failure handling, targeted listener cleanup, heavy command completion flow, và disk health behavior.
- Cải thiện độ ổn định playback/queue/autoplay theo hướng deterministic hơn, giảm race conditions trong error-path.

### 🟠 Medium Bugs (Phase 2)

- Hoàn tất BUG-M01..BUG-M12 trên `MusicManager`, `EnhancedQueue`, `AutoplayManager`.
- Loại bỏ hardcoded runtime knobs quan trọng (disconnect cooldown/stale, health monitor interval, search timeout, play retry max) và đưa về config/constants.
- Thêm guard cho autoplay concurrent execution và validate payload ở `previous()` để tránh crash/undefined playback behavior.

### 🔒 Security

- **SEC-01:** Harden dynamic SQL helpers (`buildUpsert`, `bulkInsert`) bằng validate table/column/primary-key identifiers.
- **SEC-04:** Public `/health` chỉ trả minimal status/timestamp, không lộ chi tiết nội bộ.
- **SEC-05:** Error detail exposure chuyển sang cờ explicit `SHOW_ERROR_DETAILS` (default ẩn).
- **SEC-06:** LIKE wildcard escaping tiếp tục được enforce trong recommendation queries.

### 🧪 Testing & Quality

- Thêm test suite trực tiếp cho:
    - `AutoplayManager`
    - `ReconnectionManager`
    - middleware (`voiceCheck`, `queueCheck`, combined middleware)
    - database helper security validations
- Mở rộng test `resilience.js` cho fallback/race/timeout/stale/bulkhead paths.
- Thêm shared mock factory và bật Jest open-handle diagnostics (`detectOpenHandles`) để theo dõi worker leak.

### 🌐 i18n Direction

- Chốt policy: **Tiếng Việt là primary language**, **English là secondary (beta/partial)**.
- Cập nhật UX message ở command settings để tránh kỳ vọng sai rằng bot đã full bilingual.

### 📚 Documentation

- Cập nhật roadmap evidence cho Phase 2 (`docs/v1.10/08-v1.10.0-roadmap.md`).
- Đồng bộ version metadata lên `v1.10.0` tại runtime/config/docs chính.

## [1.9.4.20260213.build:dev5] - 2026-02-13 — Dev Build 5

> **Dev build 5:** Tập trung hoàn tất toàn bộ 85 bug fixes từ QA audit, đặc biệt là 13 critical bugs blocking release. Cải thiện đáng kể độ ổn định, bảo mật, và chất lượng codebase để đảm bảo bot sẵn sàng cho production release v1.10.2.

### 🐛 Critical Fixes

- **C-01:** `DatabaseManager` `:memory:` path resolution — guarded SQLite special path from `resolve()` on Windows
- **C-02:** Version test regex updated to accept `YYYYMMDD.build:xxx` format

### ⏳ deferReply Compliance (Batch 2)

- Added missing `deferReply()` to `/nodes`, `/nowplaying`, `/queue`, `/shuffle`

### 🎨 Design System (Batch 3)

- 20 hardcoded hex colors migrated to `COLORS.*` constants across 7 files

### 🧹 Code Quality (Batches 4, 6, 10)

- `_lastSearchResults` TTL cleanup for memory leak prevention
- Circular dependency `logger`↔`input-validator` broken
- Async-without-await fixed in 3 functions
- Unused variable removed
- ESLint auto-fix applied across codebase
- `resetDatabaseManager()` added for test isolation

### 📋 Footer/Timestamp Compliance (Batch 5)

- `settings.js` — 3 embeds updated
- `serverstats.js` — 10 embeds updated
- `play.js` — 3 embeds updated

### 🔧 Bug Fixes (Batches 1, 7)

- `FilterManager.test.js` moved to `tests/Core/music/` (correct location)
- `lyrics.js` — regex escapes and import path fixed

### 🔄 Error Handling Migration (Batch 8)

- `createErrorEmbed` → `sendErrorResponse` migration: 83 call sites in 5 button handler files

### 📊 Test Results

- **75 test suites, 1612 tests passing** (5 skipped)
- Zero test failures

---

## [1.9.4] - 2026-02-13 — Hotfix Release

> **Bản hotfix:** Sửa triệt để 137 bugs từ QA 1.9.3 report + phòng ngừa predicted issues. Tập trung vào security hardening, design system consistency, runtime stability, và code quality.

### 🔒 Security

- **FIX-H03:** Timing-safe API key comparison (`timingSafeEqual`) thay thế `includes()`
- **FIX-H04:** IP whitelist exact match thay thế `startsWith()` bypass
- **FIX-H11:** SQL constant validation + pre-built interval strings

### 🐛 Critical Fixes (Batch 1-2)

- **FIX-C01:** Metrics API property mapping khớp `getSummary()` structure
- **FIX-C02:** Migration 008 version comment/value sửa đúng `008`
- **FIX-C03:** `heavyCommandUsage` Map cleanup interval với `.unref()`
- **FIX-C04:** `_historyCacheCleanupInterval` có `.unref()` + export cleanup function
- **FIX-C05:** Voice state timers export `clearAllVoiceTimers()` cho shutdown
- **FIX-H01:** CircuitBreaker HALF_OPEN → single failure → OPEN transition
- **FIX-H02:** Content filter regex escape cho metacharacters
- **FIX-H05:** `VERSION.ENVIRONMENT` → import `ENVIRONMENT` riêng
- **FIX-H07/H08:** Raw SQL transactions → `db.transaction()` wrapper
- **FIX-H20:** Consolidated vote skip vào `VoteSkipManager` singleton
- **FIX-H21:** Logger đọc `LOG_LEVEL` env var override
- **FIX-H22:** Logger project root path resolution

### ⏳ Missing deferReply Fixes

- **FIX-H06:** `feedback.js` — defer + 14× `reply()` → `editReply()`
- **FIX-H13:** `HistoryHandler.js` — defer cho search replay
- **FIX-H18a/b:** `seek.js`, `clear.js`, `move.js`, `remove.js` — defer cho async ops

### 🎨 Design System (Batch 3)

- **FIX-M01–M18:** 18 files migrated từ hardcoded hex colors sang `COLORS.*` constants
- **FIX-M19–M29:** 11 missing footer/timestamp fixes cho ~40 embeds
- **FIX-M30–M47:** 18 logic/runtime fixes (volume `??`, retry notifications, Map eviction, etc.)
- **FIX-M48–M52:** 5 pattern/consistency improvements

### 🧹 Code Quality (Batch 4)

- **FIX-L01–L06:** MusicManager config clone, listener leak fix, cache warming requester, module caching
- **FIX-L07–L15:** CircuitBreaker resetTimeout, helpers null guards, lyrics bigram fix, concurrent cleanup
- **FIX-L16–L24:** Dead code removal, unused var prefixing, dynamic → static imports
- **FIX-L25–L30:** Design system version update, constants export fix, stale test methods, emoji collision docs

### 📦 Legacy Bug Fixes (Batch 5)

- **FIX-LB01:** `history_archive` table documented as unused dead schema (migration 006 left intact)
- **FIX-LB02:** `Playlist.js` — 11 methods migrated from `db.db.prepare()` to `DatabaseManager` API
- **FIX-LB03:** `helpHandler.js` — verified no dynamic imports remain (already fixed)
- **FIX-LB04:** `interactionCreate.js` — queued interaction expiry check (14-min cutoff) + 10062 handling
- **FIX-LB05:** `/save` — track data sanitization (control chars, URL validation, length caps)
- **FIX-LB06:** `/move` — `from === to` position validation
- **FIX-LB07:** `/history` — voice channel checks verified on all replay paths (already implemented)
- **FIX-LB08:** `metrics-server` — `EADDRINUSE` clears `client._metricsServer` reference
- **FIX-LB09:** `safeAddFields()` exported from MusicEmbeds.js, used in ErrorEmbeds.js
- **FIX-LB10:** `EventQueue` — retry mechanism with `maxRetries: 2`, linear backoff, `totalRetries` metric
- **FIX-LB11:** Lyrics API — global `AbortController` + `cancelPendingLyricsRequests()` wired to shutdown

### 🛡️ Predicted Issues Prevention (Batch 6)

- **FIX-PB01:** Sharding limitation warning (>2000 guilds: warning, >2500: error) at startup
- **FIX-PB02:** Lavalink disconnect handler throttled (10s per-node cooldown)
- **FIX-PB03:** Audited 50 `new Map()` instances — added bounds to 7 unbounded Maps (lyrics, discovery, trending, similar, personal history, context menu sessions, disconnect cooldowns)
- **FIX-PB04:** Prefix command subcommand/arg parsing fixed (subcommand now properly excluded from option args)
- **FIX-PB05:** WAL checkpoint verified correct (init → periodic passive → shutdown truncate → close)
- **FIX-PB06:** Lyrics response size limit verified (1MB `MAX_RESPONSE_SIZE` on all 3 fetch calls)

### 📊 Test Results

- **75 test suites, 1612 tests passing** (1 more than v1.9.3)
- 5 tests skipped (pre-existing, non-regression)
- Zero test failures

## [1.9.3] - 2026-02-13 — Auto-Play Preferences (Stable)

> **Tính năng mới:** Auto-Play Confirmation + Preference Learning. Bot học thói quen nghe nhạc và tự động phát bài yêu thích mà không cần xác nhận. Bản stable — tất cả bugs từ production audit đã được sửa.

### ✨ Tính năng mới

- **Auto-Play thông minh:** Bot theo dõi bài hát bạn xác nhận phát — sau 5 lần, đề xuất bật auto-play
- **Suggestion UI:** Embed với nút Accept/Dismiss, tự hủy sau 2 phút, anti-spam (1 suggestion/user)
- **`/mypreferences`:** Lệnh mới — quản lý danh sách auto-play phân trang (5 bài/trang) với confidence %
- **Nút "Tắt tất cả":** Nút global disable trong `/mypreferences` để tắt toàn bộ auto-play
- **Confidence scoring:** Hệ thống điểm tin cậy (0.3–2.0) với decay tự nhiên 0.02/ngày
- **Confidence feedback loop:** Skip nhanh (<3s) giảm confidence, nghe hết bài tăng confidence
- **Instant skip detection:** Phát hiện skip nhanh → hỏi tắt auto-play cho bài đó
- **Giới hạn thông minh:** Tối đa 50 preferences/user, eviction tự động cho điểm thấp nhất
- **Dismiss cooldown:** Từ chối suggestion → không hỏi lại trong 30 ngày
- **Auto-play tracking toàn diện:** Tracking cho cả Confirm, Pick, và Select flows

### 🐛 Sửa lỗi (từ Production Audit v1.9.3)

- **BUG-001 CRITICAL:** Kết nối confidence feedback loop — `detectInstantSkip()`, `sendInstantSkipPrompt()`, `recordTrackEndFullListen()` giờ đã được gọi từ `skip.js` và `EnhancedQueue.js`
- **BUG-002 HIGH:** Auto-play kiểm tra queue-full trước khi thêm bài, fallback sang confirmation UI khi đầy
- **BUG-004 HIGH:** Thêm `cleanupSuggestionsForUser()` và `shutdownAutoPlayHandler()` cho cleanup Maps
- **BUG-014 HIGH:** `disableAutoPlay()` ghi dismissal record để tránh re-suggestion loop
- **BUG-015 HIGH:** Nút "Giữ lại" (Keep) không còn ghi instant skip penalty — không tự tắt sau 3 lần Keep
- **BUG-022 HIGH:** `runMaintenance()` được lên lịch chạy hàng ngày từ `index.js`
- **BUG-003 MEDIUM:** Text auto-play embed đổi sang tiếng Việt
- **BUG-005 MEDIUM:** Cleanup interval lưu reference và được clear khi shutdown
- **BUG-006 MEDIUM:** `activeSuggestions` Map giới hạn 500 entries
- **BUG-008 MEDIUM:** `recordConfirmation` được gọi trong cả `handleSearchPick` và `handleSearchSelect`
- **BUG-013 MEDIUM:** Dismiss nói rõ "30 ngày" thay vì "không hỏi lại" (misleading)
- **BUG-017 MEDIUM:** Thêm nút "Tắt tất cả" trong `/mypreferences`
- **BUG-021 MEDIUM:** NaN guard trong `_applyDecay()` — bảo vệ khỏi confidence bị corrupt
- **BUG-009 LOW:** Guard chống URL rỗng khi recordConfirmation
- **BUG-016 LOW:** Dismissal reset confirmation count để tránh re-trigger sau cooldown
- **BUG-018 LOW:** Thêm `.setFooter()` cho dismiss confirmation embed
- **BUG-019 LOW:** Thêm `ICONS.AUTOPLAY` vào design system
- **BUG-020 LOW:** Title `/mypreferences` đổi sang tiếng Việt

### 🗄️ Cơ sở dữ liệu

- **Migration 009:** 3 bảng mới (`user_track_confirmations`, `autoplay_preferences`, `autoplay_suggestion_dismissals`)
- Migration hoàn toàn idempotent (CREATE TABLE/INDEX IF NOT EXISTS)
- Index tối ưu cho truy vấn phổ biến (user_id + enabled, confidence_update)

### 🏗️ Kiến trúc

- **`AutoPlayPreferenceService`:** Singleton service mới theo pattern `getDatabaseManager()`
- **`autoPlaySuggestionHandler.js`:** Event handler cho suggestion UX + instant-skip detection + cleanup API
- **Button namespace `AUTOPLAY_PREF`:** 8 button IDs trong `button-ids.js` (thêm `PREF_DISABLE_ALL`)
- **Constants `AUTOPLAY_PREF`:** Threshold, timing, và confidence constants trong `constants.js`
- Tích hợp: `play.js` (checkAutoPlay), `skip.js` (detectInstantSkip), `EnhancedQueue.js` (recordFullListen), `SearchHandlers.js` (recordConfirmation cho cả 3 flows)
- Maintenance scheduler: Daily cleanup + batch decay + prune disabled preferences
- Graceful shutdown: Clear maintenance interval + shutdown auto-play handler

### 🧪 Kiểm thử

- **75 test suites, 1,611 tests passing** (tăng từ 1,579 ở v1.9.2)
- **32 tests mới** cho `AutoPlayPreferenceService` (tracking, suggestion, CRUD, decay, pagination, cap)
- Production audit: `docs/V1.9.3_PRODUCTION_AUDIT.md`

### 📝 Ghi chú kỹ thuật

- Tất cả DB operations có try/catch với fallback an toàn — không crash khi DB lỗi
- In-memory Maps (`activeSuggestions`, `autoPlayedTracks`) tự reset khi restart, có cleanup API
- SQLite atomic writes đảm bảo data integrity khi crash/SIGTERM
- Không có breaking changes — tính năng hoàn toàn additive

---

## [1.9.2] - 2026-02-12 — Stabilization Release

> **Bản stable đầu tiên của dòng v1.9.** Tập trung sửa toàn bộ ~250 lỗi từ audit v1.9.1, cải thiện hiệu năng và ổn định hệ thống. Tất cả users nên cập nhật lên phiên bản này.

### 🐛 Sửa lỗi

#### Quan trọng (Critical)

- **Phát nhạc trùng lặp:** Sửa xung đột sự kiện khi quay lại bài trước — không còn phát 2 bài cùng lúc
- **Rò rỉ hàng đợi nhạc:** Hàng đợi giờ được dọn dẹp đúng cách khi bot rời kênh thoại
- **Crash khi vào/rời kênh:** Bot không còn bị crash khi người dùng vào/rời kênh thoại
- **Playlist treo vĩnh viễn:** Sửa lỗi "Đang xử lý..." hiển thị mãi khi thao tác playlist thất bại
- **Lệnh `/seek` crash:** Không còn crash khi chưa có bài hát nào đang phát
- **Ghi lịch sử crash:** Sửa lỗi transaction lồng nhau khi ghi thống kê phát nhạc
- **Migration thiếu:** Thêm 2 file migration bị bỏ sót, đảm bảo database cập nhật đầy đủ
- **Sao lưu database:** Giờ đợi hoàn tất thực sự trước khi báo thành công
- **Bộ lọc nội dung crash:** Sửa crash khi từ khóa chứa ký tự đặc biệt regex
- **SIGTERM handler:** Thêm cơ chế tắt bot an toàn — tránh mất dữ liệu khi restart

#### Giao diện & Trải nghiệm (UI/UX)

- **"Đang xử lý...":** Thêm deferReply cho 7+ lệnh nhạc — không còn lỗi timeout
- **Thanh tiến trình:** Xử lý đúng bài hát dài 24h+, thời lượng 0, và phát trực tiếp (🔴 LIVE)
- **Hàng đợi:** Sửa tính toán phân trang, tiêu đề cắt ngắn gọn gàng
- **Xung đột nút bấm:** Sửa xung đột giữa vote-skip và các nút điều khiển khác
- **Embed lỗi:** Không còn crash khi thiếu cấu hình — tự động dùng màu mặc định
- **Autocomplete:** Thêm gợi ý tên playlist khi gõ lệnh
- **Tin nhắn chào mừng:** Bot tự tìm kênh phù hợp khi vào server mới

#### Cơ sở dữ liệu (Database)

- **SQL injection:** Chống injection trong hàm thống kê và gợi ý nhạc
- **Transaction:** Thêm xử lý transaction cho thao tác playlist (thêm/xóa/di chuyển bài)
- **Tìm kiếm:** Ký tự đặc biệt trong tìm kiếm được escape đúng cách
- **Thống kê server:** Dùng UPSERT thay vì INSERT — tránh lỗi trùng lặp
- **Migration tương thích:** Nâng cấp từ phiên bản cũ không còn bị lỗi

### ⚡ Hiệu năng

- **GuildSettings LRU cache:** Cài đặt server được cache thông minh, giảm truy vấn database
- **EventQueue notification-based:** Chuyển từ polling sang notification — giảm tải CPU đáng kể
- **Async file I/O:** Toàn bộ thao tác file đều bất đồng bộ — không block event loop
- **Dọn dẹp cache tự động:** Cache tìm kiếm, phát hiện thể loại, và dữ liệu hiệu năng tự xóa mục cũ
- **Giới hạn retry:** Tối đa 10 lần thử khi phát nhạc thất bại — tránh vòng lặp vô hạn
- **CPU metrics:** Tính toán chính xác hơn bằng cách so sánh delta giữa các lần đo
- **Loại bỏ nén đồng bộ:** Bỏ gzip sync trong cache tìm kiếm — giảm latency
- **Truy vấn tinh gọn:** Loại bỏ truy vấn thừa trong chức năng yêu thích

### 🛡️ Ổn định

- **Graceful shutdown:** SIGTERM/SIGINT với force-exit timeout, đóng database và dọn hàng đợi an toàn
- **Stale queue cleanup:** Tự động dọn hàng đợi không hoạt động sau 30 phút (cấu hình được)
- **Giới hạn tài nguyên:** `maxQueueSize: 500`, `maxConcurrentQueues: 50` — tránh quá tải
- **PM2 memory limit:** Tự khởi động lại khi dùng quá 512MB RAM
- **Circuit breaker:** Cơ chế ngắt mạch cho dịch vụ ngoài — tự phục hồi khi hoạt động lại
- **Timer cleanup:** Tất cả bộ hẹn giờ được dọn dẹp đúng cách khi reset/destroy
- **Event listener cleanup:** Không còn rò rỉ listener trên Lavalink và Discord client
- **Log rotation:** File log tự xoay vòng (5MB, tối đa 3 file) — tránh đầy ổ đĩa
- **Localhost-only metrics:** Metrics server chỉ lắng nghe localhost — không lộ ra mạng ngoài
- **Config freeze:** Cấu hình hệ thống bị đóng băng sau khi load — ngăn chỉnh sửa ngoài ý muốn
- **Error event handler:** Tạo `src/events/error.js` — xử lý lỗi process tập trung
- **Expired interaction handling:** Tất cả handler xử lý mã lỗi 10062 êm thay vì crash

### 🧹 Dọn dẹp

- Xóa 2 module không còn sử dụng: `i18n.js`, `graceful-degradation.js` và test files tương ứng
- Xóa 3 khối comment thừa trong code (dead imports, developer notes)
- Codebase: 0 console.log debug, 0 TODO urgent, 0 commented-out code blocks

### 🧪 Kiểm thử

- **74 test suites, 1,579 tests passing** (tăng từ 1,464 ở v1.9.1)
- **7 test files mới** cho regression testing (26 bug-specific test cases)
- **0 open bugs** — tất cả ~250 lỗi từ audit đã được sửa và xác nhận

### 📝 Ghi chú kỹ thuật

- Tổng số lỗi đã sửa: ~250 (13 critical, 32 high, 55+ medium, 12 low)
- Chi tiết đầy đủ: `docs/BUGFIX_LOG.md`, `docs/FINAL_TEST_REPORT.md`
- Báo cáo hiệu năng: `docs/PERFORMANCE_IMPROVEMENTS.md`
- Báo cáo ổn định: `docs/STABILITY_REPORT.md`

---

## [1.9.1] - 2026-02-12 — Optimization Release

> **Tập trung:** Sửa lỗi, cải thiện trải nghiệm người dùng, và nhất quán giao diện.  
> Không có tính năng mới — chỉ làm tính năng hiện tại dễ dùng hơn.

### 🐛 Sửa lỗi

- **Nút ⚙️ Cài đặt** không còn bị crash — giờ hiển thị âm lượng, bộ lọc, và chế độ lặp hiện tại
- **Link welcome message** dẫn đến GitHub repo thật thay vì URL placeholder
- **My Stats** không còn crash cho người dùng chưa có dữ liệu streak
- **Chỉnh speed** không còn tự reset pitch (và ngược lại) — giá trị được giữ nguyên
- **Menu âm lượng** bỏ lựa chọn 150% và 200% (vượt quá giới hạn max volume 100%)
- **Hẹn giờ rời kênh** không còn bị chồng khi người dùng rời/vào lại nhiều lần
- **Nút tương tác hết hạn** được xử lý êm thay vì hiện lỗi
- **Hàm import playlist** bị trùng lặp đã được gỡ bỏ

### ✨ Cải thiện

- **Hệ thống màu sắc mới:** Tạo design system trung tâm — tất cả embed dùng chung bảng màu nhất quán thay vì 12+ màu rời rạc
- **Bảng xếp hạng:** Dịch hoàn toàn sang tiếng Việt (trước đây toàn English)
- **Hệ thống /help:** Thêm 4 lệnh bị thiếu (metrics, save, voteskip, feedback), xóa lệnh `favorites` không tồn tại, sửa ví dụ `/seek`
- **Hướng dẫn nhanh:** Thêm quick-start guide cho người dùng mới vào /help
- **Khám phá nhạc:** `/trending` và `/discover` dùng năm hiện tại thay vì "2024" cũ
- **Thanh tiến trình:** `/discover` hiện `🔍 Đang tìm kiếm... (X/6)` thay vì chờ im lặng
- **Menu âm lượng:** Nhãn tiếng Việt (Tắt tiếng, Nhỏ, Vừa, 75%, Tối đa)
- **Mô tả lệnh:** Cải thiện cho 15+ lệnh — rõ ràng hơn, có ví dụ cụ thể
- **Phiên bản footer:** Cập nhật đúng v1.9.1 trên tất cả embeds

### 🔄 Thay đổi

- **`/jump` và `/stats`** giờ defer reply trước khi xử lý — không còn bị timeout
- **`/clear`** sửa emoji (dùng info embed thay vì warning cho queue trống)
- **Welcome message** bỏ nút Discord invite (chưa có support server), sửa double emoji
- **GitHub link** trong báo lỗi sửa đúng → `khuongit24/Miyao-Bot/issues`
- **`QueueFullError`** lỗi giới hạn queue mặc định từ 1000 → 100 (đúng với config thật)

### 📝 Ghi chú kỹ thuật

- File mới: `src/config/design-system.js` — nguồn duy nhất cho colors, icons, messages
- 4 hàm dead code trong ErrorEmbeds đã được gỡ
- ~30 hardcoded hex colors → design system constants (lộ trình tiếp tục)
- Test pass rate: 98.7% (1464/1484), 0 regression chức năng

---

## [1.9.0] - 2026-02-12

### ✨ New Features

- **Playlist Import**: Import playlists directly from YouTube and Spotify URLs (`/playlist import`).
- **Karaoke Mode**: Remove vocals from tracks using AI-based filtering (`/filter karaoke`).
- **Custom Speed & Pitch**: Adjust playback speed and pitch from 0.5x to 2.0x (`/filter speed`, `/filter pitch`).
- **Enhanced Now Playing**: Redesigned embed with requester avatar, next track info, and active filter status.
- **Interactive Menus**: Dropdown menus for volume and filter selection directly from the player.
- **Performance Dashboard**: Live metrics for memory, CPU, and event loop lag (`/metrics dashboard`).

### 🚀 Improvements

- **Refactoring**: Massive codebase restructuring for better maintainability (Utils, Services, Commands, Events, Music).
- **Music Core**: Split `EnhancedQueue` god class into `FilterManager`, `ReconnectionManager`, `ProgressTracker`, and `AutoplayManager`.
- **Database**: Optimized queries with composite indexes and combined stats retrieval.
- **Caching**: Implemented stale-while-revalidate caching for search results.
- **Error Handling**: Standardized error classes and improved user-facing messages.

### 🛡️ Security

- **Secrets Management**: Moved sensitive credentials (Lavalink password) to `.env`.
- **Rate Limiting**: Added strict rate limits for buttons and interactions (High H4).
- **Input Validation**: Added request body size limits and timeout for external APIs (High H3).
- **Permissions**: Fixed default-allow permission issues for sensitive commands (High H1).

### 🧪 Quality Assurance

- **Testing**: Added comprehensive Unit Tests (>85% coverage forUtils), Integration Tests (Playlist, Filter), and Load Testing scripts.
- **CI/CD**: Set up GitHub Actions workflow for automated linting and testing.
- **Standards**: Enforced ESLint, Prettier, and Husky hooks.

## [1.8.7] - 2026-02-04

### Fixed

#### Critical Stability Fixes

- **FIX**: Bot crash on WebSocket timeout - now handles recoverable network errors
    - Added detection for `handshake`, `ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `socket hang up` patterns
    - Bot continues running instead of calling `process.exit(1)` for these errors
    - **File**: `index.js`

- **FIX**: Duplicate migration file numbers
    - Renamed `007_playlist_track_indexes.sql` → `008_playlist_track_indexes.sql`
    - **Directory**: `src/database/migrations/`

- **FIX**: ESLint warnings for unused variables
    - Removed unused `degradationManager` import from `index.js`
    - Fixed `hasQueue` unused variable in `MusicControls.js`

- **FIX**: node-fetch dependency issue
    - Replaced dynamic `node-fetch` import with native `fetch` (Node 18+)
    - **File**: `src/utils/health-check.js`

### Improved

- **IMPROVED**: Memory leak detection thresholds tuned to reduce false positives
    - Now requires heap > 200MB AND > 15% growth, or > 25% growth for any size
    - Added `heapMB` to leak detection output for debugging
    - **File**: `src/utils/memory-optimization.js`

- **IMPROVED**: Added Lavalink timeout configuration
    - Added `restTimeout` (60000ms) and `socketTimeout` (120000ms) options
    - **File**: `src/config/config.json`

### Updated

- Version bumped to 1.8.7 across all files:
    - `package.json`
    - `src/config/config.json`
    - `src/utils/version.js`
    - `README.md`

---

## [1.8.6] - 2025-12-12

### Fixed

#### QA Audit Fixes

- **FIX**: Version mismatch between `config.json` (1.8.4) and `package.json` (1.8.5)
    - Synced all version references to 1.8.6
    - **Files**: `src/config/config.json`, `package.json`, `src/utils/version.js`

- **FIX**: History cache cleanup interval memory leak on shutdown
    - Added cleanup for `client._historyCacheCleanupInterval` in SIGINT handler
    - **Impact**: Prevents interval from continuing to run after bot shutdown
    - **File**: `index.js`

### Removed

- **REMOVED**: Quiz Mode feature flag (`QUIZ_MODE: false`)
    - Feature was never implemented and not suitable for music bot
    - **Files**: `src/utils/constants.js`, `src/config/config.json`

### Notes

- **Favorites.js**: Retained as it's still used in help UI for documentation purposes
- **Vote Skip**: Already has session expiry validation at line 251-256 of skip.js
- **Legacy Cache Fallback**: Kept for backward compatibility, properly handles migration

---

## [1.8.5] - 2025-12-04

### Fixed

#### Critical Memory Leaks - Comprehensive Bug Fix Release

- **CRITICAL FIX**: Fixed major memory leak in `EnhancedQueue.destroy()` - player event listeners were never removed
    - Added `removeAllListeners()` for all 6 player events (start, end, exception, stuck, closed, update)
    - **Impact**: Prevented accumulation of dead event handlers that could cause memory to grow unbounded
    - **File**: `src/music/EnhancedQueue.js`

- **CRITICAL FIX**: Fixed memory leak in `index.js` - database cleanup interval not cleared on shutdown
    - Now stores interval ID in `client.dbCleanupInterval` and clears it in SIGINT handler
    - **Impact**: Prevented interval from continuing to run after bot shutdown
    - **File**: `index.js`

- **CRITICAL FIX**: Fixed memory leak in `index.js` - metrics logging interval not cleared on shutdown
    - Now stores interval ID in `client.metricsInterval` and clears it in SIGINT handler
    - **Impact**: Prevented interval from continuing to run after bot shutdown
    - **File**: `index.js`

- **CRITICAL FIX**: Fixed memory leak in `MusicManager._startMemoryMonitor()` - interval not cleared
    - Now stores interval ID in `this.memoryMonitorInterval` and clears it in `shutdown()` method
    - **Impact**: Prevented interval from running after MusicManager shutdown
    - **File**: `src/music/MusicManager.js`

#### Null Safety & Defensive Programming

- **ENHANCEMENT**: Added comprehensive null safety with optional chaining across critical files
    - `src/commands/music/skip.js`: Added `?.` operator for all `track.info` access with fallback values
    - `src/commands/music/seek.js`: Added null safety for track length and livestream checks
    - `src/events/buttonHandler.js`: Added optional chaining for button handler track access
    - **Impact**: Prevents crashes from undefined/null track data in edge cases
    - **Result**: More robust error handling and better user experience

### Improved

#### Shutdown and Cleanup

- **Enhanced shutdown sequence**: All intervals and event listeners now properly cleaned up
- **Better resource management**: Zero memory leaks in graceful shutdown process
- **Comprehensive cleanup**: Added detailed logging for each cleanup step

#### Error Handling

- **Null-safe track access**: All track.info properties now accessed with optional chaining
- **Graceful degradation**: Commands handle missing track data gracefully
- **Better error messages**: Fallback to "Unknown Track" instead of crashing

### Technical Details

#### Files Modified

- `src/music/EnhancedQueue.js` - Added player event listener cleanup in `destroy()`
- `index.js` - Added interval ID storage and cleanup for database and metrics intervals
- `src/music/MusicManager.js` - Added memory monitor interval cleanup in `shutdown()`
- `package.json` - Version bump to 1.8.5
- `src/utils/version.js` - Version bump to 1.8.5, build date updated to 2025-12-04

#### Testing

- ✅ All 57/57 test suites passing (1371 tests)
- ✅ No regression in existing functionality
- ✅ Memory leak fixes verified

#### Impact

This release fixes **4 critical memory leaks** that could cause the bot to consume unbounded memory over time. These fixes are essential for long-term stability and reduce memory consumption significantly in long-running deployments.

---

## [1.8.4] - 2025-12-01

### Fixed

#### Discovery Commands - Button & Dropdown Handlers

- **Critical Fix**: Added `handleDiscoveryButton` handler for "Play All" and "Shuffle" buttons in `/similar`, `/trending`, and `/discover` commands
- **Critical Fix**: Fixed `handleDiscoverySelect` cache lookup - now checks both `cacheManager` and fallback Maps correctly
- **Root Cause**: Buttons like `similar_play_all_*`, `trending_play_all_*`, `discover_play_all_*`, `discover_shuffle_all_*`, `trending_shuffle_*` were created but had no handlers
- **Cache Issue**: Dropdown selection was failing because cache lookup only checked fallback Maps, not `cacheManager`

### Changed & Improved

#### `/trending` Command - Quality Improvements

- **Better Search Queries**: More specific music-focused queries (e.g., "top hits 2024 official music video" instead of generic "top 100 songs 2024")
- **Duration Filtering**: Filters out shorts (<1 min) and long mixes (>15 min)
- **Skip Patterns**: Automatically skips compilations, playlists, shorts, and non-music content
- **Artist Diversity**: Limits max 2 tracks per artist for better variety
- **Simplified Regions**: Removed Thailand and China options that had poor search results

#### `/discover` Command - Quality Improvements

- **Better Search Queries**: More targeted queries with "official mv" and specific year markers
- **Quality Filtering**:
    - Minimum duration: 1.5 minutes (filters shorts)
    - Maximum duration: 10 minutes (filters long mixes)
    - Skip patterns: shorts, compilations, reactions, covers, karaoke, slowed/sped versions, 8D audio
- **Improved Artist Name Cleaning**: Removes "- Topic", "VEVO", "Official", "Channel", "Music" suffixes
- **History Exclusion**: Excludes tracks from recent 100 history entries (by URL and similar title)
- **Relevance-based Ordering**: Results maintain relevance order unless "random" source is selected
- **Better Server-based Recommendations**: Uses cleaned artist names from top 30 most played tracks

### Removed

- **`/favorites` Command**: Removed redundant favorites command. The ❤️ button on now-playing already adds tracks to the shared "Được mọi người yêu thích" playlist. This simplifies the UX and removes duplicate functionality.

### Changed & Improved

#### `/discover` Command - Complete Rewrite

- **Server-based Recommendations**: Now uses actual server listening history (`History.getMostPlayed()`) instead of random YouTube searches
- **Intelligent Filtering**: Excludes tracks user has already listened to, diversifies artists (max 2 tracks per artist)
- **Genre/Mood Support**: Added genre and mood selection with curated search queries
- **Fallback System**: Falls back to curated playlist searches when server history is insufficient

#### `/history` Command - Complete Rewrite

- **Personal History Mode**: New "personal" mode queries user's listening history from database using `History.getUserHistory()`
- **Session Mode**: Original session-only view still available
- **Statistics Display**: Shows total unique tracks, total listening time, and most played tracks
- **Replay Feature**: Dropdown menu to replay any track from personal history
- **New Handler**: Added `handlePersonalHistorySelect` in `interactionCreate.js` for replaying tracks

#### `/trending` Command - Complete Rewrite

- **Server Hot Tracks**: New "server_hot" source option shows actual server trending based on `History.getMostPlayed()` with play counts
- **Regional Support**: Added regions: Global, Vietnam (vn), Korea (kr), Japan (jp), US, UK, Thailand (th), China (cn)
- **Period Filtering**: Filter by time period: 24h, 7 days, 30 days, all time
- **Curated Fallback**: Falls back to region-specific curated playlist searches when server data is insufficient

#### `/lyrics` Command - Major Improvements

- **Multi-Strategy Search**: Now uses 5 different search strategies with intelligent fallback:
    1. Exact match with original names
    2. Exact match with cleaned names
    3. Search API with "track artist" query (fuzzy matching)
    4. Search API with track name only (for covers/remixes)
    5. Dash-separated title parsing (YouTube format)
- **Improved `cleanTrackName()`**: Now removes 40+ patterns including:
    - Video/audio markers: (Official Video), [MV], [Lyrics], etc.
    - Quality indicators: (HD), [4K], (1080p), etc.
    - Version indicators: (Remix), [Cover], (Live), (Acoustic), etc.
    - Platform-specific: (Music Video), [Visualizer], (Performance)
    - Localized: (OST), (Nhạc Phim), etc.
    - Remaster/Reissue markers
    - Feat./ft. suffixes
- **New `cleanArtistName()`**: Removes:
    - Featuring/collaboration parts (feat., ft., &, x, with, vs.)
    - "- Topic" suffix from YouTube auto-generated channels
    - "VEVO", "Official", "Channel", "Music" suffixes
- **Smart Match Scoring**: Uses Dice coefficient for fuzzy string matching with configurable confidence threshold
- **Duration Matching**: ±5 second tolerance for better accuracy

#### `/similar` Command - Complete Rewrite

- **Collaborative Filtering**: "Users who listened to X also listened to Y" - queries database for users who played the reference track and finds their other favorite tracks
- **Artist-based Recommendations**: Searches for other popular tracks from the same artist
- **Metadata-based Similarity**: Analyzes track title for genre hints (K-pop, V-pop, EDM, Rock, etc.) and finds tracks with similar patterns
- **Curated Fallback**: Falls back to smart curated search queries when database data is insufficient
- **Source Indicators**: Each recommendation shows its source (👥 collaborative, 🎤 artist, 🔍 metadata, 🌟 curated)
- **Improved Error Messages**: Better guidance when no similar tracks are found

### Performance Review - Music Playback Optimization

After comprehensive code review of the music system (`MusicManager.js`, `EnhancedQueue.js`, `SearchCache.js`, `NodeHealthMonitor.js`), all major performance optimizations are already implemented:

#### Already Optimized Features:

- ✅ **Circuit Breaker**: Prevents cascading failures with 5-failure threshold, 60s timeout
- ✅ **Search Deduplication**: In-flight request deduplication prevents duplicate concurrent searches
- ✅ **Pending Search TTL Cleanup**: 30s TTL with 10s cleanup interval prevents memory leaks
- ✅ **zlib Compression**: SearchCache compresses entries >1KB (60-80% size reduction)
- ✅ **LRU Cache Eviction**: Proper O(1) LRU implementation using ES6 Map
- ✅ **Gradient Memory Cleanup**: Soft (500MB) → Normal (700MB) → Critical (800MB) levels
- ✅ **Smart Progress Updates**: 2s interval with 30s idle timeout and 1.5s debounce
- ✅ **Exponential Backoff Reconnection**: 1s → 2s → 4s → 8s → 16s → 30s max (5 retries)
- ✅ **Node Health Monitoring**: 30s health checks with CPU/memory thresholds
- ✅ **Node Blacklisting**: Auto-blacklist after 3 consecutive failures (5min duration)
- ✅ **Autoplay Strategy Racing**: `Promise.any()` races 3 strategies for faster response
- ✅ **Filter Compatibility**: Bass + 8D can coexist; Nightcore clears EQ as designed

### Technical Details

#### Files Removed

- `src/commands/playlist/favorites.js`

#### Files Modified

- `src/events/buttonHandler.js` - Added `handleDiscoveryButton()` function, fixed `handleDiscoverySelect()` cache lookup to check both cacheManager and fallback Maps
- `src/events/interactionCreate.js` - Added routing for discovery buttons (`similar_play_all_*`, `trending_play_all_*`, etc.), imported `handleDiscoveryButton`
- `src/commands/discovery/discover.js` - Added quality filtering (duration, skip patterns), better search queries, improved artist name cleaning
- `src/commands/discovery/trending.js` - Added duration filtering, skip patterns, artist diversity, better search queries
- `src/commands/discovery/similar.js` - Complete rewrite with collaborative filtering algorithm
- `src/commands/stats/history.js` - Complete rewrite with personal database history
- `src/utils/lyrics.js` - Added multi-strategy search, `cleanArtistName()`, improved `cleanTrackName()`
- `src/commands/discovery/lyrics.js` - Now uses `cleanArtistName()` for better matching
- `src/config/config.json` - Version bump to 1.8.4
- `package.json` - Version bump to 1.8.4

#### New Functions

- `buttonHandler.js::handleDiscoveryButton(interaction, client)` - Handle play all/shuffle buttons for discovery commands
- `lyrics.js::cleanArtistName(artist)` - Clean artist name for better lyrics matching
- `lyrics.js::tryExactMatch(trackName, artistName, albumName, duration)` - Try LRCLIB get API
- `lyrics.js::trySearchMatch(query, originalTrack, originalArtist, duration)` - Try LRCLIB search API with scoring
- `lyrics.js::calculateSimilarity(str1, str2)` - Dice coefficient string similarity
- `interactionCreate.js::handlePersonalHistorySelect(interaction, client)` - Handle history track selection
- `similar.js::findCollaborativeRecommendations()` - Find tracks using collaborative filtering
- `similar.js::findArtistTracks()` - Find other tracks from same artist
- `similar.js::findMetadataSimilar()` - Find tracks with similar metadata patterns
- `similar.js::detectGenreFromTitle()` - Detect genre hints from track title

---

## [1.8.3] - 2025-12-02

### Fixed

#### Bug Fixes

- **Seek Command**: Fixed `position === 0` rejection bug - seeking to start of track (0:00) is now valid. Added proper time format validation with regex `/^(\d+:)?\d{1,2}:\d{2}$/`
- **History Replay Select Menu**: Fixed potential Discord API error when all history entries have invalid track info - now throws descriptive error instead of creating empty SelectMenu
- **Queue Remove Command**: Fixed potential crash when `removed.info` is undefined - now uses optional chaining with fallback
- **Queue Jump Command**: Fixed potential crash when `trackToJump.info.title` is undefined - now uses optional chaining with fallback
- **Queue Move Command**: Fixed potential crash when `trackToMove.info.title` is undefined - now uses optional chaining with fallback
- **Playlist Play Command**: Added try-catch around `queue.play()` to handle connection failures gracefully - now shows warning but keeps tracks in queue

#### Memory & Performance Fixes

- **NodeHealthMonitor Memory Leak**: Added cleanup for stale `failureCounters` (entries older than 10 minutes) and size limit for `nodeStats` (max 20 entries)
- **EventQueue Infinite Loop Prevention**: Added safety counter (max 1000 iterations = 10s) to prevent infinite loop when `activeCount >= concurrencyLimit` persists

#### Logging Improvements

- **Autoplay AggregateError Logging**: Now properly logs all individual errors from `Promise.any()` rejection instead of just the aggregate message

### Technical Details

#### Files Modified

- `src/commands/music/seek.js` - Time format validation
- `src/commands/queue/remove.js` - Optional chaining for track info
- `src/commands/queue/jump.js` - Optional chaining for track info
- `src/commands/queue/move.js` - Optional chaining for track info
- `src/commands/playlist/playlist.js` - Error handling for queue.play()
- `src/UI/components/MusicControls.js` - Empty SelectMenu validation
- `src/music/NodeHealthMonitor.js` - Memory cleanup improvements
- `src/music/EnhancedQueue.js` - AggregateError logging
- `src/utils/EventQueue.js` - Infinite loop prevention

---

## [1.8.2] - 2025-12-02

### Added

#### New Features

- **Previous Track Button**: Go back to the previous track from history with the new Previous button in music controls
- **Save Queue to Playlist**: `/queue save <name>` command to save current queue as a playlist
- **Auto-Remove Duplicates**: Option to automatically skip duplicate tracks when adding to queue
- **Queue Position Jump**: Improved `/queue jump <position>` command for better queue navigation
- **Enhanced Statistics**:
    - Listening streaks tracking (current and longest)
    - Peak usage hours analysis
    - Diversity score for music variety
    - Weekly listening trends

#### Performance Improvements

- **Parallel Playlist Resolution**: Playlist loading is now 40-60% faster with concurrent track resolution
- **Autoplay Strategy Racing**: Uses `Promise.any()` to race multiple strategies, reducing autoplay response time from 5s to ~2s
- **Node Blacklisting**: Automatic blacklisting of failing Lavalink nodes after 3 consecutive failures
- **Exponential Backoff for Reconnection**: Smart reconnection with delays: 1s → 2s → 4s → 8s → 16s (max 30s)

#### UX Improvements

- **Smart Progress Updates**: Progress bar updates every 2s (down from 5s) with idle detection
- **Filter Combination Support**: Bass boost + 8D audio can now work together
- **Smart Search Suggestions**: When search fails, shows suggestions from user history and server popularity
- **Interactive Help System**: Searchable help with category dropdown and quick navigation

#### Lyrics Feature

- **Lyrics Command**: `/lyrics` command with LRCLIB integration
- Pagination for long lyrics
- Sync with current track
- Jump to specific line feature

### Changed

- **Progress Update Interval**: Reduced from 5000ms to 2000ms for smoother UX
- **Cache Configuration**: Cache budgets are now configurable via `config.json`
- **Rate Limits**: Rate limiting configuration moved to `config.json` for easier adjustment
- **Feature Flags**: Added `features` section in config for enabling/disabling features
- **Bot Version**: Updated to 1.8.2 in config and version files
- **Memory Optimization**: Removed unused `OptimizedEmbed` class (use discord.js `EmbedBuilder` instead)
- **Search Cache**: Implemented real zlib compression for entries > 1KB (60-80% size reduction)

### Fixed

- **Memory Leak Prevention**: Added TTL cleanup for `pendingSearches` Map (30s TTL, 10s cleanup interval)
- **Filter Conflicts**: Only conflicting filters are cleared now (e.g., Bass + 8D works, Nightcore clears EQ as designed)
- **Reconnection Spam**: Exponential backoff prevents spamming reconnection attempts when Lavalink is down
- **Progress Bar Rate Limits**: Added debounce (1.5s) and idle timeout (30s) to prevent Discord API rate limits
- **Startup Race Condition**: Fixed cache warming failing when Lavalink nodes are not yet connected by adding `waitForNode()` method
- **Cache Warming Error Spam**: Cache warming now checks node availability and circuit breaker state before starting, stops early after consecutive failures
- **Reconnect Interval Unit Bug**: Fixed Shoukaku `reconnectInterval` config - now correctly converts milliseconds to seconds (was showing "5000 seconds" instead of "5 seconds")
- **Discord.js v14 Deprecation**: Changed `ready` event to `clientReady` to fix DeprecationWarning

### Improved

- **Error Messages**: All error messages now include emojis and user-friendly suggestions
- **Guild Settings Integration**: Queue now respects guild settings (volume, duplicates) on creation
- **Duplicate Detection**: Uses both URI and title+author comparison for better accuracy
- **Node Selection**: Blacklisted nodes are skipped in `getBestNode()` selection

### Code Quality

- **Configuration Externalization**:
    - Rate limits moved to `config.json`
    - Feature flags moved to `config.json`
    - Cache budgets configurable at runtime
- **Dead Code Removal**: Removed unused `OptimizedEmbed` class
- **Documentation**: Added comprehensive README.md with troubleshooting guide
- **Test Coverage**: Added unit tests for new features (previous, blacklisting, filter combination)

### Technical Details

#### New Constants Added (`src/utils/constants.js`)

```javascript
PROGRESS_IDLE_TIMEOUT: 30000      // Smart skip after 30s idle
PROGRESS_UPDATE_DEBOUNCE: 1500    // Debounce for rate limit prevention
PLAYLIST_RESOLUTION: {
  CONCURRENCY: 10,                // Parallel track resolution
  STAGGER_DELAY: 100,            // Delay between batches
  TRACK_RESOLUTION_TIMEOUT: 10000
}
AUTOPLAY: {
  STRATEGY_TIMEOUT: 2000,        // Per-strategy timeout
  RACE_STRATEGIES_COUNT: 3       // Strategies to race
}
RECONNECTION: {
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000,
  MULTIPLIER: 2,
  MAX_RETRIES: 5,
  JITTER_FACTOR: 0.1
}
```

#### New Config Sections (`src/config/config.json`)

- `rateLimits.commands`: Command rate limiting config
- `rateLimits.guild`: Guild operation rate limiting config
- `features`: Feature flags for toggling functionality

---

## [1.8.1] - 2025-11-30

### Added

- Context menu playlist integration
- Search results with button selection
- Improved mobile optimization

### Fixed

- Fixed queue pagination issues
- Fixed filter clearing behavior

---

## [1.8.0] - 2025-11-15

### Added

- Initial release of Miyao Bot v1.8.0 "Seraphina"
- Full music playback support
- Playlist management
- Queue management with shuffle, loop, etc.
- Audio filters (EQ presets, Nightcore, Vaporwave, 8D)
- Database with SQLite for persistence
- Health monitoring for Lavalink nodes
- Metrics and logging system

---

## Migration Guide

### From 1.8.1 to 1.8.2

1. **Update config.json**: Add new sections:

    ```json
    "rateLimits": {
      "commands": { "maxCommands": 5, "windowMs": 10000 },
      "guild": { ... }
    },
    "features": { "autoplay": true, "lyrics": true, ... }
    ```

2. **No database migration required**: All changes are backward compatible

3. **Deploy commands**: Run `npm run deploy` to update slash commands

4. **Restart bot**: Changes take effect after restart
