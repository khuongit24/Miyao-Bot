/**
 * Miyao Launcher - Renderer Process
 * Handles all UI logic and interactions
 *
 * Performance optimizations (v1.2.0):
 * - P1-05: Terminal output line limit (MAX_TERMINAL_LINES = 1000)
 * - P1-07: Batch status IPC calls using getAllStatus()
 * - P1-08: Debounce terminal updates within 16ms window
 */

// ==================== Performance Constants ====================
// P1-05: Maximum number of lines to keep in terminal to optimize memory
const MAX_TERMINAL_LINES = 1000;

// P1-08: Terminal update debounce - batch updates within 16ms window
const TERMINAL_UPDATE_DEBOUNCE_MS = 16;

// ==================== State Management ====================
const state = {
    botPath: '',
    firstRun: true,
    lavalinkRunning: false,
    botRunning: false,
    currentTab: 'dashboard',
    isQuitting: false,
    // P2-02: Uptime tracking
    lavalinkStartTime: null,
    botStartTime: null,
    uptimeInterval: null,
    // P2-04: Recent logs storage (max 10 each)
    recentLavalinkLogs: [],
    recentBotLogs: [],
    // P3-02: Search state
    searchState: {
        lavalink: { query: '', matches: [], currentIndex: -1 },
        bot: { query: '', matches: [], currentIndex: -1 }
    },
    // P3-04: Filter state
    filterState: {
        lavalink: 'all',
        bot: 'all'
    },
    // P3-07/P3-08: Line counter for each terminal
    lineCounter: {
        lavalink: 0,
        bot: 0
    },
    // P4-02, P4-03: Sensitive data masking state
    envMaskState: {
        allVisible: false,
        visibleKeys: new Set()
    },
    // P4-06: Parsed env data for editing
    envData: {
        lineData: [],
        rawContent: ''
    },
    // P5-08: Auto-restart settings
    autoRestart: {
        lavalink: false,
        bot: false,
        lavalinkAttempts: 0,
        botAttempts: 0,
        maxAttempts: 3
    },
    // P7-01: Database backup state
    databaseBackups: [],
    databaseInfo: null,
    // P4-06: Fix missing timeout variable
    envValidationTimeout: null
};

// P1-08: Terminal update buffers for debouncing
const terminalBuffers = {
    lavalink: { buffer: '', timeout: null },
    bot: { buffer: '', timeout: null }
};

// ==================== DOM Elements ====================
const elements = {
    // Setup Wizard
    setupWizard: document.getElementById('setup-wizard'),
    mainApp: document.getElementById('main-app'),
    stepRequirements: document.getElementById('step-requirements'),
    stepSelectDirectory: document.getElementById('step-select-directory'),

    // Requirements
    reqNode: document.getElementById('req-node'),
    reqJava: document.getElementById('req-java'),
    reqNpm: document.getElementById('req-npm'),
    requirementsResult: document.getElementById('requirements-result'),
    btnCheckRequirements: document.getElementById('btn-check-requirements'),
    btnNextStep: document.getElementById('btn-next-step'),

    // Directory Selection
    selectedPath: document.getElementById('selected-path'),
    btnBrowse: document.getElementById('btn-browse'),
    directoryValidation: document.getElementById('directory-validation'),
    btnBackStep: document.getElementById('btn-back-step'),
    btnFinishSetup: document.getElementById('btn-finish-setup'),

    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    tabContents: document.querySelectorAll('.tab-content'),
    currentBotPath: document.getElementById('current-bot-path'),

    // Status Indicators
    lavalinkStatusDot: document.getElementById('lavalink-status-dot'),
    botStatusDot: document.getElementById('bot-status-dot'),
    lavalinkStatusBadge: document.getElementById('lavalink-status-badge'),
    botStatusBadge: document.getElementById('bot-status-badge'),

    // Dashboard Elements (P2-01 to P2-04)
    quickStatusLavalink: document.getElementById('quick-status-lavalink'),
    quickStatusBot: document.getElementById('quick-status-bot'),
    dashboardLavalinkCard: document.getElementById('dashboard-lavalink-card'),
    dashboardBotCard: document.getElementById('dashboard-bot-card'),
    dashboardLavalinkStatus: document.getElementById('dashboard-lavalink-status'),
    dashboardBotStatus: document.getElementById('dashboard-bot-status'),
    dashboardLavalinkUptime: document.getElementById('dashboard-lavalink-uptime'),
    dashboardBotUptime: document.getElementById('dashboard-bot-uptime'),
    dashboardBtnStartLavalink: document.getElementById('dashboard-btn-start-lavalink'),
    dashboardBtnStopLavalink: document.getElementById('dashboard-btn-stop-lavalink'),
    dashboardBtnStartBot: document.getElementById('dashboard-btn-start-bot'),
    dashboardBtnStopBot: document.getElementById('dashboard-btn-stop-bot'),

    // Quick Actions (P2-03, P2-05 to P2-07)
    btnStartAll: document.getElementById('btn-start-all'),
    btnStopAll: document.getElementById('btn-stop-all'),
    btnRestartAll: document.getElementById('btn-restart-all'),
    quickActionsProgress: document.getElementById('quick-actions-progress'),
    quickActionsProgressFill: document.getElementById('quick-actions-progress-fill'),
    quickActionsProgressText: document.getElementById('quick-actions-progress-text'),

    // Recent Logs (P2-04)
    recentLavalinkLogs: document.getElementById('recent-lavalink-logs'),
    recentBotLogs: document.getElementById('recent-bot-logs'),
    btnViewAllLavalinkLogs: document.getElementById('btn-view-all-lavalink-logs'),
    btnViewAllBotLogs: document.getElementById('btn-view-all-bot-logs'),

    // Pre-flight Checks (P2-09, P2-10)
    preflightPanel: document.getElementById('preflight-panel'),
    preflightChecks: document.getElementById('preflight-checks'),
    btnRunPreflight: document.getElementById('btn-run-preflight'),

    // Lavalink Controls
    btnStartLavalink: document.getElementById('btn-start-lavalink'),
    btnStopLavalink: document.getElementById('btn-stop-lavalink'),
    lavalinkTerminal: document.getElementById('lavalink-terminal'),
    btnClearLavalinkTerminal: document.getElementById('btn-clear-lavalink-terminal'),

    // Lavalink Terminal Search/Filter (P3-01 to P3-06)
    lavalinkSearchInput: document.getElementById('lavalink-search-input'),
    lavalinkSearchCount: document.getElementById('lavalink-search-count'),
    lavalinkSearchPrev: document.getElementById('lavalink-search-prev'),
    lavalinkSearchNext: document.getElementById('lavalink-search-next'),
    lavalinkFilterSelect: document.getElementById('lavalink-filter-select'),
    btnCopyLavalinkTerminal: document.getElementById('btn-copy-lavalink-terminal'),
    btnExportLavalinkTerminal: document.getElementById('btn-export-lavalink-terminal'),

    // Bot Controls
    btnStartBot: document.getElementById('btn-start-bot'),
    btnStopBot: document.getElementById('btn-stop-bot'),
    btnDeployCommands: document.getElementById('btn-deploy-commands'),
    botTerminal: document.getElementById('bot-terminal'),
    btnClearBotTerminal: document.getElementById('btn-clear-bot-terminal'),

    // Bot Terminal Search/Filter (P3-01 to P3-06)
    botSearchInput: document.getElementById('bot-search-input'),
    botSearchCount: document.getElementById('bot-search-count'),
    botSearchPrev: document.getElementById('bot-search-prev'),
    botSearchNext: document.getElementById('bot-search-next'),
    botFilterSelect: document.getElementById('bot-filter-select'),
    btnCopyBotTerminal: document.getElementById('btn-copy-bot-terminal'),
    btnExportBotTerminal: document.getElementById('btn-export-bot-terminal'),

    // Settings
    envEditor: document.getElementById('env-editor'),
    envEditorEnhanced: document.getElementById('env-editor-enhanced'),
    envEditorStatus: document.getElementById('env-editor-status'),
    btnReloadEnv: document.getElementById('btn-reload-env'),
    btnSaveEnv: document.getElementById('btn-save-env'),
    settingsBotPath: document.getElementById('settings-bot-path'),
    btnChangeDirectory: document.getElementById('btn-change-directory'),

    // P4-03: Toggle visibility
    btnToggleAllVisibility: document.getElementById('btn-toggle-all-visibility'),
    visibilityIcon: document.getElementById('visibility-icon'),
    visibilityText: document.getElementById('visibility-text'),

    // P4-05: Validation UI
    envValidationPanel: document.getElementById('env-validation-panel'),
    envValidationContent: document.getElementById('env-validation-content'),
    btnValidateEnv: document.getElementById('btn-validate-env'),

    // P4-08: Import .env.example
    btnImportEnvExample: document.getElementById('btn-import-env-example'),

    // P5-08: Auto-restart toggles
    toggleAutoRestartLavalink: document.getElementById('toggle-auto-restart-lavalink'),
    toggleAutoRestartBot: document.getElementById('toggle-auto-restart-bot'),

    // P6-01 to P6-05: System Tray & Notifications toggles
    toggleMinimizeToTray: document.getElementById('toggle-minimize-to-tray'),
    toggleCloseToTray: document.getElementById('toggle-close-to-tray'),
    toggleNotifications: document.getElementById('toggle-notifications'),

    // P7-01: Database Backup elements
    databaseInfo: document.getElementById('database-info'),
    databasePath: document.getElementById('database-path'),
    databaseSize: document.getElementById('database-size'),
    databaseModified: document.getElementById('database-modified'),
    btnCreateBackup: document.getElementById('btn-create-backup'),
    btnImportBackup: document.getElementById('btn-import-backup'),
    btnExportCurrentDb: document.getElementById('btn-export-current-db'),
    btnRefreshBackups: document.getElementById('btn-refresh-backups'),
    backupList: document.getElementById('backup-list'),
    backupCount: document.getElementById('backup-count'),

    // Info
    launcherVersion: document.getElementById('launcher-version'),
    launcherBuild: document.getElementById('launcher-build'),
    launcherCodename: document.getElementById('launcher-codename'),
    botVersion: document.getElementById('bot-version'),
    botBuild: document.getElementById('bot-build'),
    botCodename: document.getElementById('bot-codename'),
    botReleaseDate: document.getElementById('bot-release-date'),

    // Misc
    toastContainer: document.getElementById('toast-container'),
    loadingOverlay: document.getElementById('loading-overlay')
};

// ==================== Utility Functions ====================

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 4000) {
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Show/Hide loading overlay
 */
function setLoading(show, text = 'Đang xử lý...') {
    if (show) {
        elements.loadingOverlay.querySelector('.loading-text').textContent = text;
        elements.loadingOverlay.classList.remove('hidden');
    } else {
        elements.loadingOverlay.classList.add('hidden');
    }
}

/**
 * Format path for display (truncate if too long)
 */
function formatPath(path, maxLength = 40) {
    if (!path) return '...';
    if (path.length <= maxLength) return path;

    const parts = path.split(/[\\/]/);
    if (parts.length <= 2) return path;

    const first = parts[0];
    const last = parts.slice(-2).join('/');
    return `${first}/.../${last}`;
}

/**
 * Append text to terminal with auto-scroll
 * P1-05: Implements line limit to prevent memory issues
 * P1-08: Implements debouncing for smoother updates
 * P3-07: Line numbers
 * P3-08: Timestamps
 */
function appendToTerminal(terminal, text, className = '') {
    // Remove welcome message if present
    const welcome = terminal.querySelector('.terminal-welcome');
    if (welcome) welcome.remove();

    // Determine terminal type
    const terminalType = terminal.id === 'lavalink-terminal' ? 'lavalink' : 'bot';

    // Parse and colorize output
    const lines = text.split('\n');
    lines.forEach(line => {
        if (!line.trim()) return;

        // Increment line counter
        state.lineCounter[terminalType]++;
        const lineNumber = state.lineCounter[terminalType];

        // Create timestamp
        const now = new Date();
        const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

        const lineEl = document.createElement('div');
        lineEl.className = 'terminal-line';
        lineEl.dataset.lineNumber = lineNumber;

        // Detect log level and apply colors
        let logLevel = 'default';
        if (line.includes('ERROR') || line.includes('error') || line.includes('Error')) {
            lineEl.classList.add('error');
            logLevel = 'error';
        } else if (line.includes('WARN') || line.includes('warn') || line.includes('Warning')) {
            lineEl.classList.add('warning');
            logLevel = 'warn';
        } else if (
            line.includes('INFO') ||
            line.includes('info') ||
            line.includes('✅') ||
            line.includes('Successfully')
        ) {
            lineEl.classList.add('info');
            logLevel = 'info';
        } else if (line.includes('success') || line.includes('Success') || line.includes('Started')) {
            lineEl.classList.add('success');
            logLevel = 'info';
        }

        // Store log level for filtering
        lineEl.dataset.logLevel = logLevel;

        if (className) lineEl.classList.add(className);

        // P3-07: Create line number element
        const lineNumberEl = document.createElement('span');
        lineNumberEl.className = 'terminal-line-number';
        lineNumberEl.textContent = lineNumber;

        // P3-08: Create timestamp element
        const timestampEl = document.createElement('span');
        timestampEl.className = 'terminal-line-timestamp';
        timestampEl.textContent = `[${timestamp}]`;

        // Create content element
        const contentEl = document.createElement('span');
        contentEl.className = 'terminal-line-content';
        contentEl.textContent = line;

        lineEl.appendChild(lineNumberEl);
        lineEl.appendChild(timestampEl);
        lineEl.appendChild(contentEl);
        terminal.appendChild(lineEl);

        // P2-04: Add to recent logs (keep only last 10)
        const recentLog = { line, timestamp, logLevel, lineNumber };
        if (terminalType === 'lavalink') {
            state.recentLavalinkLogs.push(recentLog);
            if (state.recentLavalinkLogs.length > 10) {
                state.recentLavalinkLogs.shift();
            }
            updateRecentLogs('lavalink');
        } else {
            state.recentBotLogs.push(recentLog);
            if (state.recentBotLogs.length > 10) {
                state.recentBotLogs.shift();
            }
            updateRecentLogs('bot');
        }

        // Apply current filter
        applyFilter(terminalType);
    });

    // P1-05: Trim old lines if exceeding limit
    trimTerminalLines(terminal);

    // Auto scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;
}

/**
 * P1-05: Trim terminal lines to prevent memory issues
 * Removes oldest lines when exceeding MAX_TERMINAL_LINES
 */
function trimTerminalLines(terminal) {
    const lines = terminal.querySelectorAll('.terminal-line');
    const linesToRemove = lines.length - MAX_TERMINAL_LINES;

    if (linesToRemove > 0) {
        for (let i = 0; i < linesToRemove; i++) {
            if (lines[i] && lines[i].parentNode) {
                lines[i].remove();
            }
        }
    }
}

/**
 * P1-08: Debounced terminal append - batches updates within 16ms window
 * This prevents excessive DOM manipulation and improves scroll performance
 */
function appendToTerminalDebounced(terminalType, text, className = '') {
    const bufferKey = terminalType; // 'lavalink' or 'bot'
    const terminal = terminalType === 'lavalink' ? elements.lavalinkTerminal : elements.botTerminal;

    // Add text to buffer
    terminalBuffers[bufferKey].buffer += text;

    // Clear existing timeout
    if (terminalBuffers[bufferKey].timeout) {
        clearTimeout(terminalBuffers[bufferKey].timeout);
    }

    // Set new timeout to flush buffer
    terminalBuffers[bufferKey].timeout = setTimeout(() => {
        if (terminalBuffers[bufferKey].buffer) {
            appendToTerminal(terminal, terminalBuffers[bufferKey].buffer, className);
            terminalBuffers[bufferKey].buffer = '';
        }
        terminalBuffers[bufferKey].timeout = null;
    }, TERMINAL_UPDATE_DEBOUNCE_MS);
}

/**
 * Clear terminal
 */
function clearTerminal(terminal, welcomeMessage) {
    // Determine terminal type and reset line counter
    const terminalType = terminal.id === 'lavalink-terminal' ? 'lavalink' : 'bot';
    state.lineCounter[terminalType] = 0;

    // Clear recent logs
    if (terminalType === 'lavalink') {
        state.recentLavalinkLogs = [];
        updateRecentLogs('lavalink');
    } else {
        state.recentBotLogs = [];
        updateRecentLogs('bot');
    }

    terminal.innerHTML = `<div class="terminal-welcome">${welcomeMessage}</div>`;
}

// ==================== P2-04: Recent Logs Update ====================

/**
 * Update recent logs display in dashboard
 */
function updateRecentLogs(terminalType) {
    const logs = terminalType === 'lavalink' ? state.recentLavalinkLogs : state.recentBotLogs;
    const container = terminalType === 'lavalink' ? elements.recentLavalinkLogs : elements.recentBotLogs;

    if (!container) return;

    if (logs.length === 0) {
        container.innerHTML = '<div class="no-logs">Chưa có logs</div>';
        return;
    }

    container.innerHTML = logs
        .map(log => {
            let levelClass = '';
            if (log.logLevel === 'error') levelClass = 'error';
            else if (log.logLevel === 'warn') levelClass = 'warning';
            else if (log.logLevel === 'info') levelClass = 'info';

            return `<div class="recent-log-line ${levelClass}">[${log.timestamp}] ${escapeHtml(log.line)}</div>`;
        })
        .join('');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== P2-02: Uptime Tracking ====================

/**
 * Format uptime duration
 */
function formatUptime(startTime) {
    if (!startTime) return '--:--:--';

    const now = Date.now();
    const diff = Math.floor((now - startTime) / 1000);

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Start uptime interval
 */
function startUptimeInterval() {
    // Clear existing interval if any
    if (state.uptimeInterval) {
        clearInterval(state.uptimeInterval);
    }

    // Update every second
    state.uptimeInterval = setInterval(() => {
        // Update Lavalink uptime
        if (state.lavalinkRunning && state.lavalinkStartTime) {
            const uptime = formatUptime(state.lavalinkStartTime);
            if (elements.dashboardLavalinkUptime) {
                elements.dashboardLavalinkUptime.textContent = uptime;
            }
        }

        // Update Bot uptime
        if (state.botRunning && state.botStartTime) {
            const uptime = formatUptime(state.botStartTime);
            if (elements.dashboardBotUptime) {
                elements.dashboardBotUptime.textContent = uptime;
            }
        }
    }, 1000);
}

// ==================== P2-03: Quick Actions Buttons State ====================

/**
 * Update quick actions buttons state
 */
function updateQuickActionsState() {
    const anyRunning = state.lavalinkRunning || state.botRunning;
    const allRunning = state.lavalinkRunning && state.botRunning;

    if (elements.btnStartAll) {
        elements.btnStartAll.disabled = allRunning;
    }
    if (elements.btnStopAll) {
        elements.btnStopAll.disabled = !anyRunning;
    }
    if (elements.btnRestartAll) {
        elements.btnRestartAll.disabled = !anyRunning;
    }
}

// ==================== P2-05: Start All Functionality ====================

/**
 * Start all services sequentially
 */
async function startAll() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }

    // Show progress
    showQuickActionsProgress();
    updateProgress(0, 'Đang kiểm tra pre-flight...');

    // Run pre-flight checks first
    const preflightResult = await window.launcherAPI.runPreflightChecks(state.botPath);

    if (preflightResult.hasErrors) {
        hideQuickActionsProgress();
        showPreflightPanel(preflightResult);
        showToast('Có lỗi trong kiểm tra pre-flight. Vui lòng sửa trước khi khởi động.', 'error');
        return;
    }

    updateProgress(20, 'Đang khởi động Lavalink...');

    // Start Lavalink
    const lavalinkResult = await window.launcherAPI.startLavalink(state.botPath);

    if (!lavalinkResult.success) {
        hideQuickActionsProgress();
        showToast('Lỗi khởi động Lavalink: ' + lavalinkResult.error, 'error');
        return;
    }

    updateLavalinkStatus(true);
    updateProgress(40, 'Đang chờ Lavalink sẵn sàng...');

    // Wait for Lavalink to be ready (check for "Lavalink is ready" message or timeout)
    await waitForLavalinkReady();

    updateProgress(70, 'Đang khởi động Bot...');

    // Start Bot
    const botResult = await window.launcherAPI.startBot(state.botPath);

    if (!botResult.success) {
        hideQuickActionsProgress();
        showToast('Lỗi khởi động Bot: ' + botResult.error, 'error');
        return;
    }

    updateBotStatus(true);
    updateProgress(100, 'Hoàn tất!');

    setTimeout(() => {
        hideQuickActionsProgress();
        showToast('Đã khởi động tất cả dịch vụ thành công!', 'success');
    }, 1000);
}

/**
 * Wait for Lavalink to be ready
 */
async function waitForLavalinkReady() {
    return new Promise(resolve => {
        let timeout;
        let checkInterval;

        // Timeout after 15 seconds
        timeout = setTimeout(() => {
            if (checkInterval) clearInterval(checkInterval);
            resolve();
        }, 15000);

        // Check terminal output for ready message
        checkInterval = setInterval(() => {
            const terminal = elements.lavalinkTerminal;
            const lines = terminal.querySelectorAll('.terminal-line-content');
            for (const line of lines) {
                if (
                    line.textContent.includes('Lavalink is ready') ||
                    line.textContent.includes('Started Launcher') ||
                    line.textContent.includes('Undertow started')
                ) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    resolve();
                    return;
                }
            }
        }, 500);
    });
}

/**
 * Show quick actions progress
 */
function showQuickActionsProgress() {
    if (elements.quickActionsProgress) {
        elements.quickActionsProgress.classList.remove('hidden');
    }
}

/**
 * Hide quick actions progress
 */
function hideQuickActionsProgress() {
    if (elements.quickActionsProgress) {
        elements.quickActionsProgress.classList.add('hidden');
    }
}

/**
 * Update progress bar
 */
function updateProgress(percent, text) {
    if (elements.quickActionsProgressFill) {
        elements.quickActionsProgressFill.style.width = `${percent}%`;
    }
    if (elements.quickActionsProgressText) {
        elements.quickActionsProgressText.textContent = text;
    }
}

// ==================== P2-06: Stop All Functionality ====================

/**
 * Stop all services gracefully
 */
async function stopAll() {
    showQuickActionsProgress();
    updateProgress(0, 'Đang dừng Bot...');

    // Stop Bot first
    if (state.botRunning) {
        await window.launcherAPI.stopBot();
        updateBotStatus(false);
    }

    updateProgress(50, 'Đang dừng Lavalink...');

    // Then stop Lavalink
    if (state.lavalinkRunning) {
        await window.launcherAPI.stopLavalink();
        updateLavalinkStatus(false);
    }

    updateProgress(100, 'Hoàn tất!');

    setTimeout(() => {
        hideQuickActionsProgress();
        showToast('Đã dừng tất cả dịch vụ', 'success');
    }, 500);
}

// ==================== P2-07: Restart Functionality ====================

/**
 * Restart all services
 */
async function restartAll() {
    showQuickActionsProgress();
    updateProgress(0, 'Đang dừng các dịch vụ...');

    // Stop all first
    if (state.botRunning) {
        await window.launcherAPI.stopBot();
        updateBotStatus(false);
    }

    updateProgress(25, 'Đang dừng Lavalink...');

    if (state.lavalinkRunning) {
        await window.launcherAPI.stopLavalink();
        updateLavalinkStatus(false);
    }

    updateProgress(50, 'Đang chờ...');

    // Wait a moment before restarting
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start all
    updateProgress(60, 'Đang khởi động lại Lavalink...');

    const lavalinkResult = await window.launcherAPI.startLavalink(state.botPath);
    if (lavalinkResult.success) {
        updateLavalinkStatus(true);
        await waitForLavalinkReady();
    }

    updateProgress(80, 'Đang khởi động lại Bot...');

    const botResult = await window.launcherAPI.startBot(state.botPath);
    if (botResult.success) {
        updateBotStatus(true);
    }

    updateProgress(100, 'Hoàn tất!');

    setTimeout(() => {
        hideQuickActionsProgress();
        showToast('Đã khởi động lại tất cả dịch vụ', 'success');
    }, 500);
}

// ==================== P2-09, P2-10: Pre-flight Checks ====================

/**
 * Run pre-flight checks
 */
async function runPreflightChecks() {
    if (!state.botPath) return;

    const result = await window.launcherAPI.runPreflightChecks(state.botPath);
    showPreflightPanel(result);
}

/**
 * Show pre-flight panel with results
 */
function showPreflightPanel(result) {
    if (!elements.preflightPanel || !elements.preflightChecks) return;

    elements.preflightPanel.classList.remove('hidden');
    elements.preflightPanel.classList.toggle('has-errors', result.hasErrors);

    elements.preflightChecks.innerHTML = result.checks
        .map(check => {
            const icon = check.status === 'success' ? '✅' : '❌';
            const fixButton = check.fixable
                ? `<button class="btn btn-sm btn-primary preflight-fix-btn" data-action="${check.fixAction}">🔧 Sửa</button>`
                : '';

            return `
            <div class="preflight-check-item ${check.status}">
                <div class="preflight-check-info">
                    <span class="preflight-check-icon">${icon}</span>
                    <div>
                        <div class="preflight-check-name">${check.name}</div>
                        <div class="preflight-check-status">${check.message}</div>
                    </div>
                </div>
                ${fixButton}
            </div>
        `;
        })
        .join('');

    // Add event listeners to fix buttons
    elements.preflightChecks.querySelectorAll('.preflight-fix-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            await handlePreflightFix(action);
        });
    });
}

/**
 * Handle pre-flight fix action
 */
async function handlePreflightFix(action) {
    switch (action) {
        case 'npm-install':
            setLoading(true, 'Đang chạy npm install...');
            const npmResult = await window.launcherAPI.fixPreflightIssue(state.botPath, action);
            setLoading(false);
            showToast(npmResult.message, npmResult.success ? 'success' : 'error');
            // Re-run checks
            await runPreflightChecks();
            break;
        case 'copy-env-example':
            const copyResult = await window.launcherAPI.fixPreflightIssue(state.botPath, action);
            showToast(copyResult.message, copyResult.success ? 'success' : 'error');
            if (copyResult.success) {
                switchTab('settings');
            }
            await runPreflightChecks();
            break;
        case 'kill-port':
            const killResult = await window.launcherAPI.fixPreflightIssue(state.botPath, action);
            showToast(killResult.message, killResult.success ? 'success' : 'error');
            await runPreflightChecks();
            break;
        case 'open-settings':
            switchTab('settings');
            break;
        case 'download-lavalink':
            // P5-07: Show enhanced Lavalink download guide
            showLavalinkDownloadGuide();
            break;
    }
}

// ==================== P3-02: Terminal Search ====================

/**
 * Perform search in terminal
 */
function performSearch(terminalType) {
    const searchInput = terminalType === 'lavalink' ? elements.lavalinkSearchInput : elements.botSearchInput;
    const terminal = terminalType === 'lavalink' ? elements.lavalinkTerminal : elements.botTerminal;
    const countEl = terminalType === 'lavalink' ? elements.lavalinkSearchCount : elements.botSearchCount;

    const query = searchInput.value.toLowerCase().trim();
    const searchState = state.searchState[terminalType];

    // Clear previous highlights
    terminal.querySelectorAll('.terminal-line').forEach(line => {
        line.classList.remove('search-match', 'search-current');
        const content = line.querySelector('.terminal-line-content');
        if (content) {
            // Remove highlight spans
            content.innerHTML = content.textContent;
        }
    });

    // Reset search state
    searchState.query = query;
    searchState.matches = [];
    searchState.currentIndex = -1;

    if (!query) {
        countEl.textContent = '';
        return;
    }

    // Find matches
    const lines = terminal.querySelectorAll('.terminal-line');
    lines.forEach((line, index) => {
        const content = line.querySelector('.terminal-line-content');
        if (content && content.textContent.toLowerCase().includes(query)) {
            searchState.matches.push(index);
            line.classList.add('search-match');

            // Highlight matching text
            const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
            content.innerHTML = content.textContent.replace(regex, '<span class="search-highlight">$1</span>');
        }
    });

    // Update count
    if (searchState.matches.length > 0) {
        searchState.currentIndex = 0;
        highlightCurrentMatch(terminalType);
        countEl.textContent = `1/${searchState.matches.length}`;
    } else {
        countEl.textContent = '0/0';
    }
}

/**
 * Escape regex special characters
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlight current match
 */
function highlightCurrentMatch(terminalType) {
    const terminal = terminalType === 'lavalink' ? elements.lavalinkTerminal : elements.botTerminal;
    const searchState = state.searchState[terminalType];

    if (searchState.currentIndex < 0 || searchState.matches.length === 0) return;

    // Remove previous current highlight
    terminal.querySelectorAll('.search-current').forEach(line => {
        line.classList.remove('search-current');
    });

    // Highlight current
    const lines = terminal.querySelectorAll('.terminal-line');
    const currentLine = lines[searchState.matches[searchState.currentIndex]];
    if (currentLine) {
        currentLine.classList.add('search-current');
        currentLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * Go to previous search match
 */
function searchPrev(terminalType) {
    const searchState = state.searchState[terminalType];
    const countEl = terminalType === 'lavalink' ? elements.lavalinkSearchCount : elements.botSearchCount;

    if (searchState.matches.length === 0) return;

    searchState.currentIndex = (searchState.currentIndex - 1 + searchState.matches.length) % searchState.matches.length;
    highlightCurrentMatch(terminalType);
    countEl.textContent = `${searchState.currentIndex + 1}/${searchState.matches.length}`;
}

/**
 * Go to next search match
 */
function searchNext(terminalType) {
    const searchState = state.searchState[terminalType];
    const countEl = terminalType === 'lavalink' ? elements.lavalinkSearchCount : elements.botSearchCount;

    if (searchState.matches.length === 0) return;

    searchState.currentIndex = (searchState.currentIndex + 1) % searchState.matches.length;
    highlightCurrentMatch(terminalType);
    countEl.textContent = `${searchState.currentIndex + 1}/${searchState.matches.length}`;
}

// ==================== P3-04: Terminal Filter ====================

/**
 * Apply filter to terminal
 */
function applyFilter(terminalType) {
    const terminal = terminalType === 'lavalink' ? elements.lavalinkTerminal : elements.botTerminal;
    const filter = state.filterState[terminalType];

    const lines = terminal.querySelectorAll('.terminal-line');
    lines.forEach(line => {
        const logLevel = line.dataset.logLevel || 'default';

        if (filter === 'all') {
            line.classList.remove('filter-hidden');
        } else if (filter === 'info' && (logLevel === 'info' || logLevel === 'default')) {
            line.classList.remove('filter-hidden');
        } else if (filter === 'warn' && logLevel === 'warn') {
            line.classList.remove('filter-hidden');
        } else if (filter === 'error' && logLevel === 'error') {
            line.classList.remove('filter-hidden');
        } else if (filter !== 'all') {
            line.classList.add('filter-hidden');
        }
    });
}

/**
 * Handle filter change
 */
function handleFilterChange(terminalType, filterValue) {
    state.filterState[terminalType] = filterValue;
    applyFilter(terminalType);
}

// ==================== P3-05: Export Logs ====================

/**
 * Export terminal logs to file
 */
async function exportLogs(terminalType) {
    const terminal = terminalType === 'lavalink' ? elements.lavalinkTerminal : elements.botTerminal;

    // Collect all log lines with timestamps
    const lines = terminal.querySelectorAll('.terminal-line');
    let logsText = `Miyao Launcher - ${terminalType.charAt(0).toUpperCase() + terminalType.slice(1)} Logs\n`;
    logsText += `Exported: ${new Date().toISOString()}\n`;
    logsText += '='.repeat(60) + '\n\n';

    lines.forEach(line => {
        const timestamp = line.querySelector('.terminal-line-timestamp')?.textContent || '';
        const content = line.querySelector('.terminal-line-content')?.textContent || '';
        logsText += `${timestamp} ${content}\n`;
    });

    const result = await window.launcherAPI.exportLogs(terminalType, logsText);

    if (result.canceled) return;

    if (result.success) {
        showToast(`Đã xuất logs thành công: ${result.filePath}`, 'success');
    } else {
        showToast('Lỗi khi xuất logs: ' + result.error, 'error');
    }
}

// ==================== P3-06: Copy All ====================

/**
 * Copy terminal content to clipboard
 */
async function copyTerminalContent(terminalType) {
    const terminal = terminalType === 'lavalink' ? elements.lavalinkTerminal : elements.botTerminal;

    // Collect all log lines
    const lines = terminal.querySelectorAll('.terminal-line');
    let text = '';

    lines.forEach(line => {
        const timestamp = line.querySelector('.terminal-line-timestamp')?.textContent || '';
        const content = line.querySelector('.terminal-line-content')?.textContent || '';
        text += `${timestamp} ${content}\n`;
    });

    try {
        await navigator.clipboard.writeText(text);
        showToast('Đã sao chép logs vào clipboard!', 'success');
    } catch (err) {
        showToast('Lỗi khi sao chép: ' + err.message, 'error');
    }
}

// ==================== Phase 4: Settings & Security ====================

// P4-01: Sensitive key patterns (synced with main.js)
const SENSITIVE_KEY_PATTERNS = [
    'TOKEN',
    'SECRET',
    'PASSWORD',
    'KEY',
    'CREDENTIAL',
    'AUTH',
    'API_KEY',
    'PRIVATE',
    'CLIENT_SECRET'
];

/**
 * P4-01: Check if a key is sensitive
 */
function isSensitiveKey(key) {
    const upperKey = key.toUpperCase();
    return SENSITIVE_KEY_PATTERNS.some(pattern => upperKey.includes(pattern));
}

/**
 * P4-02: Mask sensitive value display
 */
function maskValue(value) {
    if (!value || value.length === 0) return '';
    if (value.length <= 4) return '●'.repeat(value.length);
    return value.substring(0, 2) + '●'.repeat(Math.min(value.length - 4, 20)) + value.substring(value.length - 2);
}

/**
 * P4-02, P4-03: Load and render enhanced .env editor with masking
 */
async function loadEnhancedEnvEditor() {
    if (!state.botPath) {
        if (elements.envEditorEnhanced) {
            elements.envEditorEnhanced.innerHTML =
                '<div class="env-empty-state">Vui lòng chọn đường dẫn bot trước</div>';
        }
        return;
    }

    try {
        const result = await window.launcherAPI.getEnvParsed(state.botPath);

        if (!result.success) {
            if (elements.envEditorEnhanced) {
                elements.envEditorEnhanced.innerHTML = `<div class="env-empty-state error">Lỗi: ${result.error}</div>`;
            }
            return;
        }

        state.envData.lineData = result.lineData;
        state.envData.rawContent = result.lineData.map(line => line.rawLine || line.content || '').join('\n');

        // Update status
        if (result.isExample) {
            elements.envEditorStatus.textContent = '⚠️ File .env chưa tồn tại. Hiển thị nội dung từ .env.example';
            elements.envEditorStatus.className = 'env-editor-status warning';
        } else if (result.exists) {
            elements.envEditorStatus.textContent = '✅ Đã tải file .env';
            elements.envEditorStatus.className = 'env-editor-status success';
        } else {
            elements.envEditorStatus.textContent = '❌ Không tìm thấy file .env hoặc .env.example';
            elements.envEditorStatus.className = 'env-editor-status error';
        }

        renderEnhancedEnvEditor();

        // Trigger validation
        await validateEnvConfig();
    } catch (error) {
        showToast('Lỗi khi tải .env: ' + error.message, 'error');
    }
}

/**
 * P4-02, P4-03: Render the enhanced .env editor
 */
function renderEnhancedEnvEditor() {
    if (!elements.envEditorEnhanced) return;

    const html = state.envData.lineData
        .map((line, index) => {
            if (line.type === 'comment' || line.type === 'other') {
                return `
                <div class="env-line comment" data-index="${index}">
                    <input type="text" class="env-line-input comment-input" value="${escapeHtml(line.content)}" data-index="${index}" data-type="comment">
                </div>
            `;
            } else if (line.type === 'env') {
                const isVisible = state.envMaskState.allVisible || state.envMaskState.visibleKeys.has(line.key);
                const displayValue = line.isSensitive && !isVisible ? maskValue(line.value) : line.value;
                const inputType = line.isSensitive && !isVisible ? 'password' : 'text';

                return `
                <div class="env-line env-var ${line.isSensitive ? 'sensitive' : ''}" data-index="${index}" data-key="${line.key}">
                    <span class="env-key">${escapeHtml(line.key)}</span>
                    <span class="env-separator">=</span>
                    <input type="${inputType}" class="env-value-input ${line.isSensitive ? 'masked' : ''}" 
                           value="${escapeHtml(line.value)}" 
                           data-index="${index}" 
                           data-key="${line.key}"
                           data-type="env"
                           placeholder="Nhập giá trị...">
                    ${
                        line.isSensitive
                            ? `
                        <button class="btn-icon-only env-visibility-toggle" data-key="${line.key}" title="${isVisible ? 'Ẩn' : 'Hiện'}">
                            ${isVisible ? '🙈' : '👁️'}
                        </button>
                    `
                            : ''
                    }
                    <span class="env-status-indicator" data-key="${line.key}"></span>
                </div>
            `;
            }
            return '';
        })
        .join('');

    elements.envEditorEnhanced.innerHTML = html;

    // Add event listeners to inputs for real-time validation
    elements.envEditorEnhanced.querySelectorAll('.env-value-input, .comment-input').forEach(input => {
        input.addEventListener('input', handleEnvInputChange);
    });

    // Add event listeners to visibility toggle buttons
    elements.envEditorEnhanced.querySelectorAll('.env-visibility-toggle').forEach(btn => {
        btn.addEventListener('click', handleVisibilityToggle);
    });
}

/**
 * P4-03: Handle individual visibility toggle
 */
function handleVisibilityToggle(e) {
    const key = e.currentTarget.dataset.key;
    const isCurrentlyVisible = state.envMaskState.visibleKeys.has(key);

    if (isCurrentlyVisible) {
        state.envMaskState.visibleKeys.delete(key);
    } else {
        state.envMaskState.visibleKeys.add(key);
    }

    renderEnhancedEnvEditor();
}

/**
 * P4-03: Toggle all visibility
 */
function toggleAllVisibility() {
    state.envMaskState.allVisible = !state.envMaskState.allVisible;

    // Update button text
    if (elements.visibilityIcon && elements.visibilityText) {
        elements.visibilityIcon.textContent = state.envMaskState.allVisible ? '🙈' : '👁️';
        elements.visibilityText.textContent = state.envMaskState.allVisible ? 'Ẩn tất cả' : 'Hiện tất cả';
    }

    renderEnhancedEnvEditor();
}

/**
 * P4-06: Handle env input change for real-time validation
 */
function handleEnvInputChange(e) {
    const index = parseInt(e.target.dataset.index);
    const type = e.target.dataset.type;
    const value = e.target.value;

    // Update state
    if (type === 'env') {
        if (state.envData.lineData[index]) {
            state.envData.lineData[index].value = value;
        }
    } else if (type === 'comment') {
        if (state.envData.lineData[index]) {
            state.envData.lineData[index].content = value;
        }
    }

    // Debounced validation
    clearTimeout(state.envValidationTimeout);
    state.envValidationTimeout = setTimeout(() => {
        validateEnvConfig();
    }, 500);
}

/**
 * P4-04, P4-05, P4-06: Validate environment configuration
 */
async function validateEnvConfig() {
    if (!state.botPath || !elements.envValidationContent) return;

    try {
        const result = await window.launcherAPI.validateEnvConfig(state.botPath);
        renderValidationResults(result);
    } catch (error) {
        elements.envValidationContent.innerHTML = `<div class="validation-error">Lỗi: ${error.message}</div>`;
    }
}

/**
 * P4-05: Render validation results
 */
function renderValidationResults(result) {
    if (!elements.envValidationContent) return;

    let html = '';

    // Required keys
    if (result.required && result.required.length > 0) {
        html += '<div class="validation-section"><h4>🔑 Bắt buộc</h4>';
        html += result.required
            .map(
                item => `
            <div class="validation-item ${item.status}">
                <span class="validation-icon">${item.status === 'valid' ? '✅' : '❌'}</span>
                <span class="validation-key">${item.key}</span>
                <span class="validation-message">${item.message}</span>
            </div>
        `
            )
            .join('');
        html += '</div>';
    }

    // Recommended keys
    if (result.recommended && result.recommended.length > 0) {
        html += '<div class="validation-section"><h4>💡 Khuyến nghị</h4>';
        html += result.recommended
            .map(
                item => `
            <div class="validation-item ${item.status}">
                <span class="validation-icon">${item.status === 'valid' ? '✅' : '⚠️'}</span>
                <span class="validation-key">${item.key}</span>
                <span class="validation-message">${item.message}</span>
            </div>
        `
            )
            .join('');
        html += '</div>';
    }

    // Warnings
    if (result.warnings && result.warnings.length > 0) {
        html += '<div class="validation-section warnings"><h4>⚠️ Cảnh báo</h4>';
        html += result.warnings
            .map(
                warning => `
            <div class="validation-item warning">
                <span class="validation-icon">⚠️</span>
                <span class="validation-message">${warning}</span>
            </div>
        `
            )
            .join('');
        html += '</div>';
    }

    // Overall status
    const overallStatus = result.valid
        ? '<div class="validation-overall success">✅ Cấu hình hợp lệ</div>'
        : '<div class="validation-overall error">❌ Cần cấu hình thêm</div>';

    elements.envValidationContent.innerHTML = overallStatus + html;
}

/**
 * P4-08: Import from .env.example
 */
async function importEnvExample() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }

    // Check if .env.example exists
    const exampleResult = await window.launcherAPI.getEnvExample(state.botPath);

    if (!exampleResult.exists) {
        showToast('Không tìm thấy file .env.example', 'error');
        return;
    }

    // Show import dialog
    showImportEnvDialog(exampleResult.content);
}

/**
 * P4-08: Show import .env.example dialog
 */
function showImportEnvDialog(exampleContent) {
    const modal = document.createElement('div');
    modal.className = 'quit-modal-overlay';
    modal.innerHTML = `
        <div class="quit-modal" style="max-width: 520px;">
            <div class="quit-modal-header">
                <span class="quit-modal-icon">📥</span>
                <h2>Import từ .env.example</h2>
            </div>
            <div class="quit-modal-body">
                <p>Chọn cách import:</p>
                <div class="import-options">
                    <div class="import-option" data-mode="merge">
                        <div class="option-header">
                            <input type="radio" name="import-mode" value="merge" id="mode-merge" checked>
                            <label for="mode-merge"><strong>🔀 Merge (Khuyến nghị)</strong></label>
                        </div>
                        <p class="option-desc">Giữ các giá trị hiện tại, chỉ thêm các key mới từ .env.example</p>
                    </div>
                    <div class="import-option" data-mode="replace">
                        <div class="option-header">
                            <input type="radio" name="import-mode" value="replace" id="mode-replace">
                            <label for="mode-replace"><strong>🔄 Thay thế</strong></label>
                        </div>
                        <p class="option-desc">Thay thế toàn bộ .env bằng nội dung từ .env.example (sẽ mất dữ liệu cũ)</p>
                    </div>
                </div>
            </div>
            <div class="quit-modal-actions">
                <button class="btn btn-secondary" id="btn-cancel-import">
                    <span>↩️</span> Hủy
                </button>
                <button class="btn btn-success" id="btn-confirm-import">
                    <span>📥</span> Import
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    // Handle cancel
    modal.querySelector('#btn-cancel-import').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    });

    // Handle confirm
    modal.querySelector('#btn-confirm-import').addEventListener('click', async () => {
        const mode = modal.querySelector('input[name="import-mode"]:checked').value;

        modal.querySelector('.quit-modal-body').innerHTML = `
            <div class="quit-loading">
                <div class="loading-spinner"></div>
                <p>Đang import...</p>
            </div>
        `;
        modal.querySelector('.quit-modal-actions').style.display = 'none';

        const result = await window.launcherAPI.importEnvExample(state.botPath, mode);

        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);

        if (result.success) {
            showToast(result.message, 'success');
            // Reload env editor
            await loadEnhancedEnvEditor();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    });

    // Handle click outside
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    });
}

/**
 * Save enhanced .env file
 */
async function saveEnhancedEnvFile() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }

    // Build content from lineData
    const content = state.envData.lineData
        .map(line => {
            if (line.type === 'comment' || line.type === 'other') {
                return line.content;
            } else if (line.type === 'env') {
                return `${line.key}=${line.value}`;
            }
            return '';
        })
        .join('\n');

    const result = await window.launcherAPI.writeEnv(state.botPath, content);

    if (result.success) {
        showToast('Đã lưu file .env thành công!', 'success');
        elements.envEditorStatus.textContent = '✅ Đã lưu thay đổi';
        elements.envEditorStatus.className = 'env-editor-status success';

        // Re-validate
        await validateEnvConfig();
    } else {
        showToast('Lỗi khi lưu: ' + result.error, 'error');
        elements.envEditorStatus.textContent = '❌ Lỗi: ' + result.error;
        elements.envEditorStatus.className = 'env-editor-status error';
    }
}

// ==================== Phase 5: Error Handling ====================

// P5-01: Error message mapping
const ERROR_MESSAGES = {
    // Lavalink errors
    EADDRINUSE: {
        title: 'Port đã được sử dụng',
        message: 'Port 2333 đang được sử dụng bởi tiến trình khác.',
        solutions: [
            'Tắt tiến trình đang sử dụng port 2333',
            'Kiểm tra Task Manager/Activity Monitor',
            'Restart máy tính'
        ],
        fixable: true,
        fixAction: 'kill-port'
    },
    ENOENT: {
        title: 'Không tìm thấy file',
        message: 'File hoặc thư mục cần thiết không tồn tại.',
        solutions: ['Kiểm tra đường dẫn bot', 'Đảm bảo đã chạy npm install', 'Kiểm tra file Lavalink.jar'],
        fixable: false
    },
    JAVA_NOT_FOUND: {
        title: 'Không tìm thấy Java',
        message: 'Java Runtime Environment chưa được cài đặt hoặc không nằm trong PATH.',
        solutions: ['Cài đặt Java 17 hoặc mới hơn', 'Thêm Java vào PATH', 'Restart launcher sau khi cài Java'],
        fixable: false
    },
    NODE_MODULES_MISSING: {
        title: 'Thiếu dependencies',
        message: 'Thư mục node_modules không tồn tại hoặc thiếu dependencies.',
        solutions: [
            'Chạy npm install trong thư mục bot',
            'Xóa node_modules và chạy lại npm install',
            'Kiểm tra file package.json'
        ],
        fixable: true,
        fixAction: 'npm-install'
    },
    DISCORD_TOKEN_INVALID: {
        title: 'Token Discord không hợp lệ',
        message: 'Token Discord trong file .env không hợp lệ hoặc đã hết hạn.',
        solutions: [
            'Kiểm tra DISCORD_TOKEN trong .env',
            'Lấy token mới từ Discord Developer Portal',
            'Đảm bảo không có khoảng trắng thừa'
        ],
        fixable: true,
        fixAction: 'open-settings'
    },
    LAVALINK_CONNECTION_FAILED: {
        title: 'Không thể kết nối Lavalink',
        message: 'Bot không thể kết nối đến Lavalink server.',
        solutions: [
            'Đảm bảo Lavalink đang chạy',
            'Kiểm tra cấu hình host/port trong application.yml',
            'Kiểm tra password Lavalink'
        ],
        fixable: false
    },
    SPAWN_ERROR: {
        title: 'Lỗi khởi động tiến trình',
        message: 'Không thể khởi động tiến trình con.',
        solutions: ['Kiểm tra quyền thực thi', 'Đảm bảo Node.js và Java đã cài đặt', 'Restart launcher'],
        fixable: false
    },
    UNEXPECTED_EXIT: {
        title: 'Tiến trình thoát bất ngờ',
        message: 'Tiến trình đã dừng với mã lỗi không mong đợi.',
        solutions: ['Kiểm tra logs để biết thêm chi tiết', 'Đảm bảo cấu hình đúng', 'Kiểm tra RAM và CPU'],
        fixable: false
    }
};

/**
 * P5-01, P5-02: Parse error and get user-friendly message
 */
function getErrorDetails(errorCode, originalMessage = '') {
    // Try to match error code
    for (const [code, details] of Object.entries(ERROR_MESSAGES)) {
        if (originalMessage.includes(code) || errorCode === code) {
            return details;
        }
    }

    // Check for common patterns
    if (originalMessage.includes('EADDRINUSE') || originalMessage.includes('address already in use')) {
        return ERROR_MESSAGES['EADDRINUSE'];
    }
    if (originalMessage.includes('ENOENT') || originalMessage.includes('no such file')) {
        return ERROR_MESSAGES['ENOENT'];
    }
    if (originalMessage.includes('node_modules') || originalMessage.includes('MODULE_NOT_FOUND')) {
        return ERROR_MESSAGES['NODE_MODULES_MISSING'];
    }
    if (originalMessage.includes('TOKEN') || originalMessage.includes('invalid token')) {
        return ERROR_MESSAGES['DISCORD_TOKEN_INVALID'];
    }
    if (originalMessage.includes('java') && originalMessage.includes('not') && originalMessage.includes('found')) {
        return ERROR_MESSAGES['JAVA_NOT_FOUND'];
    }

    // Default error
    return {
        title: 'Lỗi không xác định',
        message: originalMessage || 'Đã xảy ra lỗi không xác định.',
        solutions: ['Kiểm tra logs để biết thêm chi tiết', 'Thử restart launcher', 'Liên hệ hỗ trợ nếu lỗi tiếp tục'],
        fixable: false
    };
}

/**
 * P5-03, P5-04: Show error details modal
 */
function showErrorModal(errorDetails, context = '') {
    const modal = document.createElement('div');
    modal.className = 'quit-modal-overlay';
    modal.innerHTML = `
        <div class="quit-modal error-modal">
            <div class="quit-modal-header error">
                <span class="quit-modal-icon">❌</span>
                <h2>${errorDetails.title}</h2>
            </div>
            <div class="quit-modal-body">
                ${context ? `<p class="error-context"><strong>Ngữ cảnh:</strong> ${context}</p>` : ''}
                <p class="error-message">${errorDetails.message}</p>
                
                <div class="error-solutions">
                    <h4>💡 Giải pháp:</h4>
                    <ul>
                        ${errorDetails.solutions.map(s => `<li>${s}</li>`).join('')}
                    </ul>
                </div>
            </div>
            <div class="quit-modal-actions">
                <button class="btn btn-secondary" id="btn-close-error">
                    <span>✖️</span> Đóng
                </button>
                ${
                    errorDetails.fixable
                        ? `
                    <button class="btn btn-primary" id="btn-auto-fix" data-action="${errorDetails.fixAction}">
                        <span>🔧</span> Tự động sửa
                    </button>
                `
                        : ''
                }
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    // Handle close
    modal.querySelector('#btn-close-error').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    });

    // Handle auto-fix
    const fixBtn = modal.querySelector('#btn-auto-fix');
    if (fixBtn) {
        fixBtn.addEventListener('click', async () => {
            const action = fixBtn.dataset.action;
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);

            await handleAutoFix(action);
        });
    }

    // Handle click outside
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    });
}

/**
 * P5-04: Handle auto-fix actions
 */
async function handleAutoFix(action) {
    switch (action) {
        case 'kill-port':
            setLoading(true, 'Đang tắt tiến trình trên port 2333...');
            const killResult = await window.launcherAPI.fixPreflightIssue(state.botPath, 'kill-port');
            setLoading(false);
            showToast(killResult.message, killResult.success ? 'success' : 'error');
            if (killResult.success) {
                await runPreflightChecks();
            }
            break;
        case 'npm-install':
            setLoading(true, 'Đang chạy npm install...');
            showNpmInstallProgress();
            const npmResult = await window.launcherAPI.fixPreflightIssue(state.botPath, 'npm-install');
            setLoading(false);
            hideNpmInstallProgress();
            showToast(npmResult.message, npmResult.success ? 'success' : 'error');
            if (npmResult.success) {
                await runPreflightChecks();
            }
            break;
        case 'open-settings':
            switchTab('settings');
            break;
        default:
            showToast('Hành động không được hỗ trợ', 'warning');
    }
}

/**
 * P5-06: Show npm install progress modal
 */
function showNpmInstallProgress() {
    const modal = document.createElement('div');
    modal.className = 'npm-install-modal';
    modal.id = 'npm-install-modal';
    modal.innerHTML = `
        <div class="npm-install-content">
            <h3>📦 Đang cài đặt dependencies...</h3>
            <div class="npm-install-output" id="npm-install-output"></div>
        </div>
    `;
    document.body.appendChild(modal);
}

/**
 * P5-06: Hide npm install progress modal
 */
function hideNpmInstallProgress() {
    const modal = document.getElementById('npm-install-modal');
    if (modal) modal.remove();
}

/**
 * P5-07: Show Lavalink download guide
 */
function showLavalinkDownloadGuide() {
    const modal = document.createElement('div');
    modal.className = 'quit-modal-overlay';
    modal.innerHTML = `
        <div class="quit-modal">
            <div class="quit-modal-header">
                <span class="quit-modal-icon">📥</span>
                <h2>Tải Lavalink.jar</h2>
            </div>
            <div class="quit-modal-body">
                <p>Lavalink.jar không được tìm thấy trong thư mục bot. Vui lòng tải về từ GitHub.</p>
                
                <div class="download-steps">
                    <h4>Các bước:</h4>
                    <ol>
                        <li>Truy cập trang Releases của Lavalink</li>
                        <li>Tải file <code>Lavalink.jar</code> từ phiên bản mới nhất</li>
                        <li>Đặt file vào thư mục gốc của bot: <code>${state.botPath}</code></li>
                        <li>Quay lại launcher và khởi động lại</li>
                    </ol>
                </div>
                
                <div class="download-link">
                    <a href="https://github.com/lavalink-devs/Lavalink/releases" target="_blank" class="btn btn-primary">
                        <span>🌐</span> Mở trang Releases
                    </a>
                </div>
            </div>
            <div class="quit-modal-actions">
                <button class="btn btn-secondary" id="btn-close-download">
                    <span>✖️</span> Đóng
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    modal.querySelector('#btn-close-download').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    });

    modal.addEventListener('click', e => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    });
}

/**
 * P5-08: Handle auto-restart for crashed services
 */
async function handleServiceCrash(service, exitCode) {
    const autoRestartEnabled = service === 'lavalink' ? state.autoRestart.lavalink : state.autoRestart.bot;
    const attempts = service === 'lavalink' ? state.autoRestart.lavalinkAttempts : state.autoRestart.botAttempts;

    if (!autoRestartEnabled || attempts >= state.autoRestart.maxAttempts) {
        // Show error details if not auto-restarting
        const errorDetails = getErrorDetails('UNEXPECTED_EXIT', `${service} exited with code ${exitCode}`);
        showErrorModal(errorDetails, `${service === 'lavalink' ? 'Lavalink' : 'Bot'} đã dừng bất ngờ`);

        // Reset attempts if max reached
        if (service === 'lavalink') {
            state.autoRestart.lavalinkAttempts = 0;
        } else {
            state.autoRestart.botAttempts = 0;
        }
        return;
    }

    // Increment attempts
    if (service === 'lavalink') {
        state.autoRestart.lavalinkAttempts++;
    } else {
        state.autoRestart.botAttempts++;
    }

    const currentAttempt = service === 'lavalink' ? state.autoRestart.lavalinkAttempts : state.autoRestart.botAttempts;

    // Show notification
    showToast(
        `${service === 'lavalink' ? 'Lavalink' : 'Bot'} bị crash. Đang tự động khởi động lại (lần ${currentAttempt}/${state.autoRestart.maxAttempts})...`,
        'warning'
    );

    // Exponential backoff: 2s, 4s, 8s
    const delay = Math.pow(2, currentAttempt) * 1000;

    setTimeout(async () => {
        if (service === 'lavalink') {
            const result = await window.launcherAPI.startLavalink(state.botPath);
            if (result.success) {
                updateLavalinkStatus(true);
                showToast('Lavalink đã khởi động lại thành công!', 'success');
                state.autoRestart.lavalinkAttempts = 0;
            } else {
                showToast('Lỗi khởi động lại Lavalink: ' + result.error, 'error');
            }
        } else {
            const result = await window.launcherAPI.startBot(state.botPath);
            if (result.success) {
                updateBotStatus(true);
                showToast('Bot đã khởi động lại thành công!', 'success');
                state.autoRestart.botAttempts = 0;
            } else {
                showToast('Lỗi khởi động lại Bot: ' + result.error, 'error');
            }
        }
    }, delay);
}

/**
 * P5-08: Save auto-restart settings
 */
async function saveAutoRestartSettings() {
    state.autoRestart.lavalink = elements.toggleAutoRestartLavalink?.checked || false;
    state.autoRestart.bot = elements.toggleAutoRestartBot?.checked || false;

    // Save to config
    await window.launcherAPI.setConfig('autoRestartLavalink', state.autoRestart.lavalink);
    await window.launcherAPI.setConfig('autoRestartBot', state.autoRestart.bot);
}

/**
 * P5-08: Load auto-restart settings
 */
async function loadAutoRestartSettings() {
    const config = await window.launcherAPI.getConfig();
    state.autoRestart.lavalink = config.autoRestartLavalink || false;
    state.autoRestart.bot = config.autoRestartBot || false;

    if (elements.toggleAutoRestartLavalink) {
        elements.toggleAutoRestartLavalink.checked = state.autoRestart.lavalink;
    }
    if (elements.toggleAutoRestartBot) {
        elements.toggleAutoRestartBot.checked = state.autoRestart.bot;
    }
}

// ==================== Phase 6: UX Enhancements ====================

/**
 * P6-01 to P6-05: Tray settings state
 */
const traySettings = {
    minimizeToTray: true,
    closeToTray: true,
    notificationsEnabled: true
};

/**
 * P6-01 to P6-05: Load tray settings from main process
 */
async function loadTraySettings() {
    try {
        const settings = await window.launcherAPI.getTraySettings();
        traySettings.minimizeToTray = settings.minimizeToTray ?? true;
        traySettings.closeToTray = settings.closeToTray ?? true;
        traySettings.notificationsEnabled = settings.notificationsEnabled ?? true;

        // Update UI
        if (elements.toggleMinimizeToTray) {
            elements.toggleMinimizeToTray.checked = traySettings.minimizeToTray;
        }
        if (elements.toggleCloseToTray) {
            elements.toggleCloseToTray.checked = traySettings.closeToTray;
        }
        if (elements.toggleNotifications) {
            elements.toggleNotifications.checked = traySettings.notificationsEnabled;
        }
    } catch (error) {
        console.error('Failed to load tray settings:', error);
    }
}

/**
 * P6-01 to P6-05: Save tray settings to main process
 */
async function saveTraySettings() {
    traySettings.minimizeToTray = elements.toggleMinimizeToTray?.checked ?? true;
    traySettings.closeToTray = elements.toggleCloseToTray?.checked ?? true;
    traySettings.notificationsEnabled = elements.toggleNotifications?.checked ?? true;

    try {
        await window.launcherAPI.setTraySettings(traySettings);
    } catch (error) {
        console.error('Failed to save tray settings:', error);
        showToast('Lỗi lưu cài đặt tray: ' + error.message, 'error');
    }
}

/**
 * P6-06, P6-07: Setup keyboard shortcuts
 * Shortcuts are handled in renderer process for better responsiveness
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        // Ignore if user is typing in an input/textarea
        const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

        // Ctrl+1-5: Tab switching
        if (e.ctrlKey && !e.shiftKey && !e.altKey) {
            const tabKeys = {
                1: 'dashboard',
                2: 'lavalink',
                3: 'bot',
                4: 'settings',
                5: 'info'
            };

            if (tabKeys[e.key]) {
                e.preventDefault();
                switchTab(tabKeys[e.key]);
                return;
            }

            // Ctrl+S: Save .env (only in settings tab)
            if (e.key === 's' || e.key === 'S') {
                if (state.currentTab === 'settings') {
                    e.preventDefault();
                    saveEnvFile();
                    return;
                }
            }

            // Ctrl+F: Focus search input
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                // Focus appropriate search input based on current tab
                if (state.currentTab === 'lavalink' && elements.lavalinkSearchInput) {
                    elements.lavalinkSearchInput.focus();
                } else if (state.currentTab === 'bot' && elements.botSearchInput) {
                    elements.botSearchInput.focus();
                }
                return;
            }
        }

        // Ctrl+Shift+L: Toggle Lavalink
        if (e.ctrlKey && e.shiftKey && (e.key === 'l' || e.key === 'L')) {
            e.preventDefault();
            if (state.lavalinkRunning) {
                stopLavalink();
            } else {
                startLavalink();
            }
            return;
        }

        // Ctrl+Shift+B: Toggle Bot
        if (e.ctrlKey && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
            e.preventDefault();
            if (state.botRunning) {
                stopBot();
            } else {
                startBot();
            }
            return;
        }

        // Ctrl+Shift+A: Start All
        if (e.ctrlKey && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            if (!state.lavalinkRunning || !state.botRunning) {
                startAll();
            }
            return;
        }

        // F5: Refresh / Run pre-flight checks
        if (e.key === 'F5') {
            e.preventDefault();
            if (state.currentTab === 'dashboard') {
                runPreflightChecks();
            } else if (state.currentTab === 'settings') {
                loadEnvFile();
            } else if (state.currentTab === 'info') {
                loadVersionInfo();
            }
            return;
        }

        // Escape: Clear search
        if (e.key === 'Escape' && !isTyping) {
            if (state.currentTab === 'lavalink' && elements.lavalinkSearchInput) {
                elements.lavalinkSearchInput.value = '';
                performSearch('lavalink');
            } else if (state.currentTab === 'bot' && elements.botSearchInput) {
                elements.botSearchInput.value = '';
                performSearch('bot');
            }
        }
    });
}

/**
 * P6-01 to P6-05: Setup tray event listeners from main process
 */
function setupTrayEventListeners() {
    // Handle Start All from tray menu
    if (window.launcherAPI.onTrayStartAll) {
        window.launcherAPI.onTrayStartAll(() => {
            startAll();
        });
    }

    // Handle Stop All from tray menu
    if (window.launcherAPI.onTrayStopAll) {
        window.launcherAPI.onTrayStopAll(() => {
            stopAll();
        });
    }
}

/**
 * Show quit confirmation dialog
 */
function showQuitConfirmation(runningInfo) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'quit-modal-overlay';
    modal.innerHTML = `
        <div class="quit-modal">
            <div class="quit-modal-header">
                <span class="quit-modal-icon">⚠️</span>
                <h2>Xác nhận thoát</h2>
            </div>
            <div class="quit-modal-body">
                <p>Các tiến trình sau đang chạy:</p>
                <ul class="running-processes-list">
                    ${runningInfo.lavalink ? '<li>🎛️ Lavalink Server</li>' : ''}
                    ${runningInfo.bot ? '<li>🤖 Discord Bot</li>' : ''}
                </ul>
                <p class="quit-warning">Nếu thoát, tất cả tiến trình sẽ được tắt tự động.</p>
            </div>
            <div class="quit-modal-actions">
                <button class="btn btn-secondary" id="btn-cancel-quit">
                    <span>↩️</span> Hủy
                </button>
                <button class="btn btn-danger" id="btn-confirm-quit">
                    <span>🚪</span> Thoát và tắt tất cả
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add animation
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });

    // Handle cancel
    modal.querySelector('#btn-cancel-quit').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    });

    // Handle confirm
    modal.querySelector('#btn-confirm-quit').addEventListener('click', async () => {
        modal.querySelector('.quit-modal-body').innerHTML = `
            <div class="quit-loading">
                <div class="loading-spinner"></div>
                <p>Đang tắt các tiến trình...</p>
            </div>
        `;
        modal.querySelector('.quit-modal-actions').style.display = 'none';

        state.isQuitting = true;
        await window.launcherAPI.cleanupAllProcesses();

        // Small delay to ensure cleanup is complete
        setTimeout(async () => {
            await window.launcherAPI.forceQuit();
        }, 500);
    });

    // Handle click outside
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    });

    // Handle ESC key
    const escHandler = e => {
        if (e.key === 'Escape') {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// ==================== Requirements Check ====================

/**
 * Update requirement item UI
 */
function updateRequirementItem(element, status, version = null) {
    const icon = element.querySelector('.req-icon');
    const statusEl = element.querySelector('.req-status');

    element.classList.remove('success', 'error');

    if (status === 'checking') {
        icon.textContent = '⏳';
        statusEl.textContent = 'Đang kiểm tra...';
    } else if (status === 'success') {
        icon.textContent = '✅';
        statusEl.textContent = version ? `v${version}` : 'Đã cài đặt';
        element.classList.add('success');
    } else if (status === 'error') {
        icon.textContent = '❌';
        statusEl.textContent = version || 'Chưa cài đặt';
        element.classList.add('error');
    }
}

/**
 * Check system requirements
 */
async function checkRequirements() {
    // Reset UI
    updateRequirementItem(elements.reqNode, 'checking');
    updateRequirementItem(elements.reqJava, 'checking');
    updateRequirementItem(elements.reqNpm, 'checking');
    elements.requirementsResult.classList.add('hidden');
    elements.btnNextStep.disabled = true;

    try {
        const results = await window.launcherAPI.checkRequirements();

        // Update Node.js
        if (results.node.installed) {
            updateRequirementItem(elements.reqNode, 'success', results.node.version);
        } else {
            updateRequirementItem(
                elements.reqNode,
                'error',
                results.node.version ? `v${results.node.version} (cần ≥ ${results.node.required})` : 'Chưa cài đặt'
            );
        }

        // Update Java
        if (results.java.installed) {
            updateRequirementItem(elements.reqJava, 'success', results.java.version);
        } else {
            updateRequirementItem(
                elements.reqJava,
                'error',
                results.java.version ? `v${results.java.version} (cần ≥ ${results.java.required})` : 'Chưa cài đặt'
            );
        }

        // Update npm
        if (results.npm.installed) {
            updateRequirementItem(elements.reqNpm, 'success', results.npm.version);
        } else {
            updateRequirementItem(elements.reqNpm, 'error');
        }

        // Show result
        const allPassed = results.node.installed && results.java.installed && results.npm.installed;
        elements.requirementsResult.classList.remove('hidden', 'success', 'error');
        elements.requirementsResult.classList.add(allPassed ? 'success' : 'error');

        const resultMessage = elements.requirementsResult.querySelector('.result-message');
        if (allPassed) {
            resultMessage.innerHTML = '✅ Tất cả yêu cầu đã được đáp ứng. Bạn có thể tiếp tục.';
            elements.btnNextStep.disabled = false;
        } else {
            let missingItems = [];
            if (!results.node.installed) missingItems.push('Node.js ≥ 20.0.0');
            if (!results.java.installed) missingItems.push('Java ≥ 17');
            if (!results.npm.installed) missingItems.push('npm');

            resultMessage.innerHTML = `
                ❌ Vui lòng cài đặt các yêu cầu sau trước khi tiếp tục:
                <br><br>
                ${missingItems.map(item => `• ${item}`).join('<br>')}
                <br><br>
                <small>Tải Node.js: <a href="https://nodejs.org" target="_blank">nodejs.org</a></small>
                <br>
                <small>Tải Java: <a href="https://adoptium.net" target="_blank">adoptium.net</a></small>
            `;
        }
    } catch (error) {
        showToast('Lỗi khi kiểm tra yêu cầu: ' + error.message, 'error');
    }
}

// ==================== Directory Selection ====================

/**
 * Select bot directory
 */
async function selectBotDirectory() {
    const result = await window.launcherAPI.selectBotDirectory();

    if (result.canceled) return;

    elements.selectedPath.innerHTML = `<span>${result.path}</span>`;
    elements.directoryValidation.classList.remove('hidden', 'success', 'error');

    if (result.valid) {
        elements.directoryValidation.classList.add('success');
        elements.directoryValidation.querySelector('.validation-message').textContent =
            `✅ Miyao Bot v${result.version} - Hợp lệ!`;
        elements.btnFinishSetup.disabled = false;
        state.botPath = result.path;
    } else {
        elements.directoryValidation.classList.add('error');
        elements.directoryValidation.querySelector('.validation-message').textContent = `❌ ${result.error}`;
        elements.btnFinishSetup.disabled = true;
    }
}

// ==================== Tab Navigation ====================

/**
 * Switch to a tab
 */
function switchTab(tabName) {
    // Update nav items
    elements.navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
    });

    // Update tab contents
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    state.currentTab = tabName;

    // Load tab-specific data
    if (tabName === 'settings') {
        loadEnvFile();
        loadDatabaseInfo(); // P7-01: Load database backup info
    } else if (tabName === 'info') {
        loadVersionInfo();
    }
}

// ==================== Lavalink Management ====================

/**
 * Update Lavalink status UI
 * P2-02: Now also updates dashboard status card and uptime
 */
function updateLavalinkStatus(running) {
    state.lavalinkRunning = running;

    // Update sidebar status dot
    elements.lavalinkStatusDot.classList.toggle('running', running);
    elements.lavalinkStatusDot.classList.toggle('stopped', !running);

    // Update Lavalink tab status badge
    elements.lavalinkStatusBadge.classList.toggle('running', running);
    elements.lavalinkStatusBadge.classList.toggle('stopped', !running);
    elements.lavalinkStatusBadge.querySelector('.status-text').textContent = running ? 'Đang chạy' : 'Đã dừng';

    // Update Lavalink tab buttons
    elements.btnStartLavalink.disabled = running;
    elements.btnStopLavalink.disabled = !running;

    // P2-02: Update Dashboard quick status
    if (elements.quickStatusLavalink) {
        elements.quickStatusLavalink.classList.toggle('running', running);
        elements.quickStatusLavalink.classList.toggle('stopped', !running);
    }

    // P2-02: Update Dashboard status card
    if (elements.dashboardLavalinkCard) {
        elements.dashboardLavalinkCard.classList.toggle('running', running);
        elements.dashboardLavalinkCard.classList.toggle('stopped', !running);
    }

    if (elements.dashboardLavalinkStatus) {
        elements.dashboardLavalinkStatus.querySelector('.status-text').textContent = running ? 'Đang chạy' : 'Đã dừng';
    }

    // P2-02: Update Dashboard buttons
    if (elements.dashboardBtnStartLavalink) {
        elements.dashboardBtnStartLavalink.disabled = running;
    }
    if (elements.dashboardBtnStopLavalink) {
        elements.dashboardBtnStopLavalink.disabled = !running;
    }

    // P2-02: Track uptime
    if (running) {
        state.lavalinkStartTime = Date.now();
    } else {
        state.lavalinkStartTime = null;
        if (elements.dashboardLavalinkUptime) {
            elements.dashboardLavalinkUptime.textContent = '--:--:--';
        }
    }

    // P2-03: Update quick actions buttons state
    updateQuickActionsState();
}

/**
 * Start Lavalink
 */
async function startLavalink() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }

    // P2-09: Run pre-flight checks first
    const preflightResult = await window.launcherAPI.runPreflightChecks(state.botPath);
    if (preflightResult.hasErrors) {
        // Check if it's just the Lavalink.jar missing
        const lavalinkCheck = preflightResult.checks.find(c => c.id === 'lavalink-jar');
        if (lavalinkCheck && lavalinkCheck.status === 'error') {
            showToast('Không tìm thấy file Lavalink.jar. Vui lòng tải từ GitHub.', 'error');
            showPreflightPanel(preflightResult);
            return;
        }
    }

    setLoading(true, 'Đang khởi động Lavalink...');

    const result = await window.launcherAPI.startLavalink(state.botPath);

    setLoading(false);

    if (result.success) {
        updateLavalinkStatus(true);
        showToast('Đang khởi động Lavalink...', 'info');
    } else {
        showToast('Lỗi: ' + result.error, 'error');
    }
}

/**
 * Stop Lavalink
 */
async function stopLavalink() {
    setLoading(true, 'Đang dừng Lavalink...');

    const result = await window.launcherAPI.stopLavalink();

    setLoading(false);

    if (result.success) {
        updateLavalinkStatus(false);
        showToast('Đã dừng Lavalink', 'success');
    } else {
        showToast('Lỗi: ' + result.error, 'error');
    }
}

// ==================== Bot Management ====================

/**
 * Update Bot status UI
 * P2-02: Now also updates dashboard status card and uptime
 */
function updateBotStatus(running) {
    state.botRunning = running;

    // Update sidebar status dot
    elements.botStatusDot.classList.toggle('running', running);
    elements.botStatusDot.classList.toggle('stopped', !running);

    // Update Bot tab status badge
    elements.botStatusBadge.classList.toggle('running', running);
    elements.botStatusBadge.classList.toggle('stopped', !running);
    elements.botStatusBadge.querySelector('.status-text').textContent = running ? 'Đang chạy' : 'Đã dừng';

    // Update Bot tab buttons
    elements.btnStartBot.disabled = running;
    elements.btnStopBot.disabled = !running;
    elements.btnDeployCommands.disabled = running;

    // P2-02: Update Dashboard quick status
    if (elements.quickStatusBot) {
        elements.quickStatusBot.classList.toggle('running', running);
        elements.quickStatusBot.classList.toggle('stopped', !running);
    }

    // P2-02: Update Dashboard status card
    if (elements.dashboardBotCard) {
        elements.dashboardBotCard.classList.toggle('running', running);
        elements.dashboardBotCard.classList.toggle('stopped', !running);
    }

    if (elements.dashboardBotStatus) {
        elements.dashboardBotStatus.querySelector('.status-text').textContent = running ? 'Đang chạy' : 'Đã dừng';
    }

    // P2-02: Update Dashboard buttons
    if (elements.dashboardBtnStartBot) {
        elements.dashboardBtnStartBot.disabled = running;
    }
    if (elements.dashboardBtnStopBot) {
        elements.dashboardBtnStopBot.disabled = !running;
    }

    // P2-02: Track uptime
    if (running) {
        state.botStartTime = Date.now();
    } else {
        state.botStartTime = null;
        if (elements.dashboardBotUptime) {
            elements.dashboardBotUptime.textContent = '--:--:--';
        }
    }

    // P2-03: Update quick actions buttons state
    updateQuickActionsState();
}

/**
 * Start Bot
 * P2-08: Now includes service dependency check
 */
async function startBot() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }

    // P2-08: Warn if Lavalink is not running
    if (!state.lavalinkRunning) {
        // Show more prominent warning
        const shouldContinue = await showLavalinkWarningDialog();
        if (!shouldContinue) {
            return;
        }
    }

    setLoading(true, 'Đang khởi động Bot...');

    const result = await window.launcherAPI.startBot(state.botPath);

    setLoading(false);

    if (result.success) {
        updateBotStatus(true);
        showToast('Đang khởi động Bot...', 'info');
    } else {
        showToast('Lỗi: ' + result.error, 'error');
    }
}

/**
 * P2-08: Show Lavalink warning dialog
 */
function showLavalinkWarningDialog() {
    return new Promise(resolve => {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'quit-modal-overlay';
        modal.innerHTML = `
            <div class="quit-modal">
                <div class="quit-modal-header">
                    <span class="quit-modal-icon">⚠️</span>
                    <h2>Lavalink chưa chạy</h2>
                </div>
                <div class="quit-modal-body">
                    <p>Lavalink Server chưa được khởi động. Bot có thể không phát nhạc được nếu không có Lavalink.</p>
                    <p class="quit-warning">Bạn có muốn khởi động Lavalink trước không?</p>
                </div>
                <div class="quit-modal-actions">
                    <button class="btn btn-secondary" id="btn-skip-lavalink">
                        <span>⏭️</span> Bỏ qua, khởi động Bot
                    </button>
                    <button class="btn btn-success" id="btn-start-lavalink-first">
                        <span>🎛️</span> Khởi động Lavalink trước
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add animation
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        // Handle skip (continue without Lavalink)
        modal.querySelector('#btn-skip-lavalink').addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
            resolve(true); // Continue starting bot
        });

        // Handle start Lavalink first
        modal.querySelector('#btn-start-lavalink-first').addEventListener('click', async () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);

            // Start Lavalink first
            await startLavalink();
            await waitForLavalinkReady();

            resolve(true); // Then continue starting bot
        });

        // Handle click outside - cancel
        modal.addEventListener('click', e => {
            if (e.target === modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 300);
                resolve(false); // Cancel
            }
        });

        // Handle ESC key
        const escHandler = e => {
            if (e.key === 'Escape') {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 300);
                document.removeEventListener('keydown', escHandler);
                resolve(false); // Cancel
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

/**
 * Stop Bot
 */
async function stopBot() {
    setLoading(true, 'Đang dừng Bot...');

    const result = await window.launcherAPI.stopBot();

    setLoading(false);

    if (result.success) {
        updateBotStatus(false);
        showToast('Đã dừng Bot', 'success');
    } else {
        showToast('Lỗi: ' + result.error, 'error');
    }
}

/**
 * Deploy Commands
 */
async function deployCommands() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }

    if (state.botRunning) {
        showToast('Vui lòng dừng bot trước khi deploy commands', 'warning');
        return;
    }

    setLoading(true, 'Đang deploy commands...');
    clearTerminal(elements.botTerminal, 'Đang deploy commands...');

    const result = await window.launcherAPI.deployCommands(state.botPath);

    setLoading(false);

    if (result.success) {
        showToast('Deploy commands thành công!', 'success');
    } else {
        showToast('Lỗi deploy: ' + (result.error || 'Xem terminal để biết chi tiết'), 'error');
    }
}

// ==================== Settings Management ====================

/**
 * Load .env file
 * Updated to use enhanced editor by default
 */
async function loadEnvFile() {
    if (!state.botPath) {
        elements.envEditor.value = '# Vui lòng chọn đường dẫn bot trước';
        return;
    }

    // Use enhanced editor by default
    await loadEnhancedEnvEditor();

    // Also load raw content for fallback
    const result = await window.launcherAPI.readEnv(state.botPath);
    elements.envEditor.value = result.content;
}

/**
 * Save .env file
 * Updated to use enhanced editor data
 */
async function saveEnvFile() {
    // Use enhanced save function
    await saveEnhancedEnvFile();
}

/**
 * Change bot directory from settings
 */
async function changeDirectory() {
    // Stop processes if running
    if (state.lavalinkRunning || state.botRunning) {
        showToast('Vui lòng dừng Lavalink và Bot trước khi thay đổi đường dẫn', 'warning');
        return;
    }

    const result = await window.launcherAPI.selectBotDirectory();

    if (result.canceled) return;

    if (result.valid) {
        state.botPath = result.path;
        updateBotPathUI();
        showToast(`Đã chuyển sang: ${result.path}`, 'success');
        loadEnvFile();
        loadVersionInfo();
    } else {
        showToast(result.error, 'error');
    }
}

/**
 * Update bot path UI elements
 */
function updateBotPathUI() {
    elements.currentBotPath.textContent = formatPath(state.botPath);
    elements.currentBotPath.title = state.botPath;
    elements.settingsBotPath.textContent = state.botPath || '...';
}

// ==================== P7-01: Database Backup Functions ====================

/**
 * Load database info and backup list
 */
async function loadDatabaseInfo() {
    if (!state.botPath) {
        updateDatabaseInfoUI(null);
        updateBackupListUI([]);
        return;
    }

    try {
        // Load database info
        const dbInfo = await window.launcherAPI.getDatabaseInfo(state.botPath);
        state.databaseInfo = dbInfo;
        updateDatabaseInfoUI(dbInfo);

        // Load backup list
        const backupsResult = await window.launcherAPI.listDatabaseBackups(state.botPath);
        if (backupsResult.success) {
            state.databaseBackups = backupsResult.backups;
            updateBackupListUI(backupsResult.backups);
        }
    } catch (error) {
        showToast('Lỗi khi tải thông tin database: ' + error.message, 'error');
    }
}

/**
 * Update database info UI
 */
function updateDatabaseInfoUI(info) {
    if (!elements.databaseInfo) return;

    if (!info || !info.exists) {
        elements.databaseInfo.classList.add('error');
        elements.databasePath.textContent = info?.error || 'Database không tồn tại';
        elements.databaseSize.textContent = '--';
        elements.databaseModified.textContent = '--';
        return;
    }

    elements.databaseInfo.classList.remove('error');
    elements.databasePath.textContent = info.path;
    elements.databaseSize.textContent = info.sizeFormatted;
    elements.databaseModified.textContent = `Cập nhật: ${info.lastModifiedFormatted}`;
}

/**
 * Update backup list UI
 */
function updateBackupListUI(backups) {
    if (!elements.backupList || !elements.backupCount) return;

    elements.backupCount.textContent = `${backups.length} backup`;

    if (backups.length === 0) {
        elements.backupList.innerHTML = '<div class="backup-empty">Chưa có backup nào. Nhấn "Tạo Backup" để bắt đầu.</div>';
        return;
    }

    elements.backupList.innerHTML = backups.map(backup => `
        <div class="backup-item" data-filename="${escapeHtml(backup.filename)}">
            <span class="backup-item-icon">📦</span>
            <div class="backup-item-info">
                <span class="backup-item-name">${escapeHtml(backup.filename)}</span>
                <div class="backup-item-meta">
                    <span>📅 ${backup.dateFormatted}</span>
                    <span>💾 ${backup.sizeFormatted}</span>
                </div>
            </div>
            <div class="backup-item-actions">
                <button class="btn btn-sm btn-restore" data-action="restore" data-filename="${escapeHtml(backup.filename)}" title="Khôi phục">
                    🔄 Khôi phục
                </button>
                <button class="btn btn-sm btn-secondary" data-action="export" data-filename="${escapeHtml(backup.filename)}" title="Xuất">
                    📤
                </button>
                <button class="btn btn-sm btn-delete" data-action="delete" data-filename="${escapeHtml(backup.filename)}" title="Xóa">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');

    // Add event listeners to backup action buttons
    elements.backupList.querySelectorAll('.backup-item-actions button').forEach(btn => {
        btn.addEventListener('click', handleBackupAction);
    });
}

/**
 * Handle backup action (restore, export, delete)
 */
async function handleBackupAction(event) {
    const action = event.currentTarget.dataset.action;
    const filename = event.currentTarget.dataset.filename;

    switch (action) {
        case 'restore':
            await showRestoreConfirmation(filename);
            break;
        case 'export':
            await exportBackup(filename);
            break;
        case 'delete':
            await showDeleteConfirmation(filename);
            break;
    }
}

/**
 * Create a new database backup
 */
async function createDatabaseBackup() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }

    // Check if database exists
    if (!state.databaseInfo || !state.databaseInfo.exists) {
        showToast('Database không tồn tại', 'error');
        return;
    }

    // Show progress
    setLoading(true, 'Đang tạo backup...');

    try {
        const result = await window.launcherAPI.createDatabaseBackup(state.botPath);

        setLoading(false);

        if (result.success) {
            showToast(`Đã tạo backup: ${result.filename} (${result.sizeFormatted})`, 'success');
            
            // Show warning if bot was running
            if (result.warning) {
                setTimeout(() => {
                    showToast(result.warning, 'warning', 6000);
                }, 1000);
            }

            // Refresh backup list
            await loadDatabaseInfo();
        } else {
            showToast('Lỗi tạo backup: ' + result.error, 'error');
        }
    } catch (error) {
        setLoading(false);
        showToast('Lỗi tạo backup: ' + error.message, 'error');
    }
}

/**
 * Show restore confirmation dialog
 */
async function showRestoreConfirmation(filename) {
    // Check if bot is running
    if (state.botRunning) {
        showToast('Vui lòng dừng Bot trước khi khôi phục database', 'warning');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'quit-modal-overlay';
    modal.innerHTML = `
        <div class="quit-modal">
            <div class="quit-modal-header">
                <span class="quit-modal-icon">🔄</span>
                <h2>Khôi phục Database</h2>
            </div>
            <div class="quit-modal-body">
                <p>Bạn có chắc chắn muốn khôi phục database từ backup này?</p>
                <div class="backup-filename">${escapeHtml(filename)}</div>
                <div class="backup-warning">
                    ⚠️ Database hiện tại sẽ được backup tự động trước khi khôi phục. 
                    Sau khi khôi phục, hãy khởi động lại Bot để áp dụng thay đổi.
                </div>
            </div>
            <div class="quit-modal-actions">
                <button class="btn btn-secondary" id="btn-cancel-restore">
                    <span>↩️</span> Hủy
                </button>
                <button class="btn btn-primary" id="btn-confirm-restore">
                    <span>🔄</span> Khôi phục
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    // Handle cancel
    modal.querySelector('#btn-cancel-restore').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    });

    // Handle confirm
    modal.querySelector('#btn-confirm-restore').addEventListener('click', async () => {
        modal.querySelector('.quit-modal-body').innerHTML = `
            <div class="backup-progress">
                <div class="loading-spinner"></div>
                <p class="backup-progress-text">Đang khôi phục database...</p>
            </div>
        `;
        modal.querySelector('.quit-modal-actions').style.display = 'none';

        const result = await window.launcherAPI.restoreDatabaseBackup(state.botPath, filename);

        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);

        if (result.success) {
            showToast(result.message, 'success', 5000);
            // Refresh database info
            await loadDatabaseInfo();
        } else {
            showToast('Lỗi khôi phục: ' + result.error, 'error');
        }
    });

    // Handle click outside
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    });
}

/**
 * Show delete confirmation dialog
 */
async function showDeleteConfirmation(filename) {
    const modal = document.createElement('div');
    modal.className = 'quit-modal-overlay';
    modal.innerHTML = `
        <div class="quit-modal">
            <div class="quit-modal-header">
                <span class="quit-modal-icon">🗑️</span>
                <h2>Xóa Backup</h2>
            </div>
            <div class="quit-modal-body">
                <p>Bạn có chắc chắn muốn xóa backup này?</p>
                <div class="backup-filename">${escapeHtml(filename)}</div>
                <div class="backup-warning">
                    ⚠️ Hành động này không thể hoàn tác!
                </div>
            </div>
            <div class="quit-modal-actions">
                <button class="btn btn-secondary" id="btn-cancel-delete">
                    <span>↩️</span> Hủy
                </button>
                <button class="btn btn-danger" id="btn-confirm-delete">
                    <span>🗑️</span> Xóa
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    // Handle cancel
    modal.querySelector('#btn-cancel-delete').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    });

    // Handle confirm
    modal.querySelector('#btn-confirm-delete').addEventListener('click', async () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);

        const result = await window.launcherAPI.deleteDatabaseBackup(state.botPath, filename);

        if (result.success) {
            showToast(`Đã xóa backup: ${filename}`, 'success');
            await loadDatabaseInfo();
        } else {
            showToast('Lỗi xóa backup: ' + result.error, 'error');
        }
    });

    // Handle click outside
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    });
}

/**
 * Export a backup file
 */
async function exportBackup(filename) {
    const result = await window.launcherAPI.exportDatabaseBackup(state.botPath, filename);

    if (result.canceled) return;

    if (result.success) {
        showToast(`Đã xuất backup đến: ${result.exportedTo}`, 'success');
    } else {
        showToast('Lỗi xuất backup: ' + result.error, 'error');
    }
}

/**
 * Export current database
 */
async function exportCurrentDatabase() {
    if (!state.botPath || !state.databaseInfo?.exists) {
        showToast('Database không tồn tại', 'error');
        return;
    }

    const result = await window.launcherAPI.exportDatabaseBackup(state.botPath, null);

    if (result.canceled) return;

    if (result.success) {
        showToast(`Đã xuất database đến: ${result.exportedTo}`, 'success');
    } else {
        showToast('Lỗi xuất database: ' + result.error, 'error');
    }
}

/**
 * Import a backup from external location
 */
async function importDatabaseBackup() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }

    const result = await window.launcherAPI.importDatabaseBackup(state.botPath);

    if (result.canceled) return;

    if (result.success) {
        showToast(`Đã nhập backup: ${result.filename} (${result.sizeFormatted})`, 'success');
        await loadDatabaseInfo();
    } else {
        showToast('Lỗi nhập backup: ' + result.error, 'error');
    }
}

// ==================== Info Page ====================

/**
 * Load version information
 */
async function loadVersionInfo() {
    // Load launcher version
    const launcherVersion = await window.launcherAPI.getLauncherVersion();
    elements.launcherVersion.textContent = `v${launcherVersion.version}`;
    elements.launcherBuild.textContent = launcherVersion.build;
    elements.launcherCodename.textContent = launcherVersion.codename;

    // Load bot version
    if (state.botPath) {
        const botVersion = await window.launcherAPI.getBotVersion(state.botPath);
        elements.botVersion.textContent = `v${botVersion.version}`;
        elements.botBuild.textContent = botVersion.build;
        elements.botCodename.textContent = botVersion.codename;
        elements.botReleaseDate.textContent = botVersion.releaseDate;
    } else {
        elements.botVersion.textContent = 'N/A';
        elements.botBuild.textContent = 'N/A';
        elements.botCodename.textContent = 'N/A';
        elements.botReleaseDate.textContent = 'N/A';
    }
}

// ==================== Event Listeners Setup ====================

function setupEventListeners() {
    // Setup Wizard - Requirements
    elements.btnCheckRequirements.addEventListener('click', checkRequirements);
    elements.btnNextStep.addEventListener('click', () => {
        elements.stepRequirements.classList.add('hidden');
        elements.stepSelectDirectory.classList.remove('hidden');
    });

    // Setup Wizard - Directory
    elements.btnBrowse.addEventListener('click', selectBotDirectory);
    elements.btnBackStep.addEventListener('click', () => {
        elements.stepSelectDirectory.classList.add('hidden');
        elements.stepRequirements.classList.remove('hidden');
    });
    elements.btnFinishSetup.addEventListener('click', async () => {
        await window.launcherAPI.setConfig('firstRun', false);
        await window.launcherAPI.setConfig('botPath', state.botPath);

        elements.setupWizard.classList.add('hidden');
        elements.mainApp.classList.remove('hidden');

        updateBotPathUI();
        loadVersionInfo();
        startUptimeInterval();
        runPreflightChecks();
        showToast('Thiết lập hoàn tất! Chào mừng đến với Miyao Launcher 🎵', 'success');
    });

    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // ==================== Dashboard Event Listeners (P2-01 to P2-10) ====================

    // Dashboard Lavalink Controls
    if (elements.dashboardBtnStartLavalink) {
        elements.dashboardBtnStartLavalink.addEventListener('click', startLavalink);
    }
    if (elements.dashboardBtnStopLavalink) {
        elements.dashboardBtnStopLavalink.addEventListener('click', stopLavalink);
    }

    // Dashboard Bot Controls
    if (elements.dashboardBtnStartBot) {
        elements.dashboardBtnStartBot.addEventListener('click', startBot);
    }
    if (elements.dashboardBtnStopBot) {
        elements.dashboardBtnStopBot.addEventListener('click', stopBot);
    }

    // Quick Actions (P2-05, P2-06, P2-07)
    if (elements.btnStartAll) {
        elements.btnStartAll.addEventListener('click', startAll);
    }
    if (elements.btnStopAll) {
        elements.btnStopAll.addEventListener('click', stopAll);
    }
    if (elements.btnRestartAll) {
        elements.btnRestartAll.addEventListener('click', restartAll);
    }

    // Recent Logs View All (P2-04)
    if (elements.btnViewAllLavalinkLogs) {
        elements.btnViewAllLavalinkLogs.addEventListener('click', () => switchTab('lavalink'));
    }
    if (elements.btnViewAllBotLogs) {
        elements.btnViewAllBotLogs.addEventListener('click', () => switchTab('bot'));
    }

    // Pre-flight Checks (P2-09, P2-10)
    if (elements.btnRunPreflight) {
        elements.btnRunPreflight.addEventListener('click', runPreflightChecks);
    }

    // ==================== Lavalink Tab Controls ====================
    elements.btnStartLavalink.addEventListener('click', startLavalink);
    elements.btnStopLavalink.addEventListener('click', stopLavalink);
    elements.btnClearLavalinkTerminal.addEventListener('click', () => {
        clearTerminal(elements.lavalinkTerminal, 'Chưa có output. Nhấn "Khởi động Lavalink" để bắt đầu.');
    });

    // Lavalink Terminal Search (P3-01, P3-02)
    if (elements.lavalinkSearchInput) {
        elements.lavalinkSearchInput.addEventListener(
            'input',
            debounce(() => {
                performSearch('lavalink');
            }, 300)
        );
        elements.lavalinkSearchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    searchPrev('lavalink');
                } else {
                    searchNext('lavalink');
                }
            }
        });
    }
    if (elements.lavalinkSearchPrev) {
        elements.lavalinkSearchPrev.addEventListener('click', () => searchPrev('lavalink'));
    }
    if (elements.lavalinkSearchNext) {
        elements.lavalinkSearchNext.addEventListener('click', () => searchNext('lavalink'));
    }

    // Lavalink Terminal Filter (P3-03, P3-04)
    if (elements.lavalinkFilterSelect) {
        elements.lavalinkFilterSelect.addEventListener('change', e => {
            handleFilterChange('lavalink', e.target.value);
        });
    }

    // Lavalink Terminal Copy/Export (P3-05, P3-06)
    if (elements.btnCopyLavalinkTerminal) {
        elements.btnCopyLavalinkTerminal.addEventListener('click', () => copyTerminalContent('lavalink'));
    }
    if (elements.btnExportLavalinkTerminal) {
        elements.btnExportLavalinkTerminal.addEventListener('click', () => exportLogs('lavalink'));
    }

    // ==================== Bot Tab Controls ====================
    elements.btnStartBot.addEventListener('click', startBot);
    elements.btnStopBot.addEventListener('click', stopBot);
    elements.btnDeployCommands.addEventListener('click', deployCommands);
    elements.btnClearBotTerminal.addEventListener('click', () => {
        clearTerminal(elements.botTerminal, 'Chưa có output. Nhấn "Khởi động Bot" để bắt đầu.');
    });

    // Bot Terminal Search (P3-01, P3-02)
    if (elements.botSearchInput) {
        elements.botSearchInput.addEventListener(
            'input',
            debounce(() => {
                performSearch('bot');
            }, 300)
        );
        elements.botSearchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    searchPrev('bot');
                } else {
                    searchNext('bot');
                }
            }
        });
    }
    if (elements.botSearchPrev) {
        elements.botSearchPrev.addEventListener('click', () => searchPrev('bot'));
    }
    if (elements.botSearchNext) {
        elements.botSearchNext.addEventListener('click', () => searchNext('bot'));
    }

    // Bot Terminal Filter (P3-03, P3-04)
    if (elements.botFilterSelect) {
        elements.botFilterSelect.addEventListener('change', e => {
            handleFilterChange('bot', e.target.value);
        });
    }

    // Bot Terminal Copy/Export (P3-05, P3-06)
    if (elements.btnCopyBotTerminal) {
        elements.btnCopyBotTerminal.addEventListener('click', () => copyTerminalContent('bot'));
    }
    if (elements.btnExportBotTerminal) {
        elements.btnExportBotTerminal.addEventListener('click', () => exportLogs('bot'));
    }

    // ==================== Settings ====================
    elements.btnReloadEnv.addEventListener('click', loadEnvFile);
    elements.btnSaveEnv.addEventListener('click', saveEnvFile);
    elements.btnChangeDirectory.addEventListener('click', changeDirectory);

    // P4-03: Toggle visibility
    if (elements.btnToggleAllVisibility) {
        elements.btnToggleAllVisibility.addEventListener('click', toggleAllVisibility);
    }

    // P4-05: Validate env button
    if (elements.btnValidateEnv) {
        elements.btnValidateEnv.addEventListener('click', validateEnvConfig);
    }

    // P4-08: Import .env.example
    if (elements.btnImportEnvExample) {
        elements.btnImportEnvExample.addEventListener('click', importEnvExample);
    }

    // P7-01: Database Backup event listeners
    if (elements.btnCreateBackup) {
        elements.btnCreateBackup.addEventListener('click', createDatabaseBackup);
    }
    if (elements.btnImportBackup) {
        elements.btnImportBackup.addEventListener('click', importDatabaseBackup);
    }
    if (elements.btnExportCurrentDb) {
        elements.btnExportCurrentDb.addEventListener('click', exportCurrentDatabase);
    }
    if (elements.btnRefreshBackups) {
        elements.btnRefreshBackups.addEventListener('click', loadDatabaseInfo);
    }

    // P5-08: Auto-restart toggles
    if (elements.toggleAutoRestartLavalink) {
        elements.toggleAutoRestartLavalink.addEventListener('change', saveAutoRestartSettings);
    }
    if (elements.toggleAutoRestartBot) {
        elements.toggleAutoRestartBot.addEventListener('change', saveAutoRestartSettings);
    }

    // P6-01 to P6-05: System Tray & Notifications toggles
    if (elements.toggleMinimizeToTray) {
        elements.toggleMinimizeToTray.addEventListener('change', saveTraySettings);
    }
    if (elements.toggleCloseToTray) {
        elements.toggleCloseToTray.addEventListener('change', saveTraySettings);
    }
    if (elements.toggleNotifications) {
        elements.toggleNotifications.addEventListener('change', saveTraySettings);
    }

    // P6-06, P6-07: Setup keyboard shortcuts
    setupKeyboardShortcuts();

    // P6-01 to P6-05: Setup tray event listeners
    setupTrayEventListeners();

    // ==================== IPC Event Listeners ====================
    // P1-08: Using debounced terminal updates for smoother scrolling
    window.launcherAPI.onLavalinkOutput(data => {
        appendToTerminalDebounced('lavalink', data);
    });

    window.launcherAPI.onLavalinkStatus(data => {
        updateLavalinkStatus(data.running);
        if (!data.running) {
            appendToTerminal(elements.lavalinkTerminal, `\n[Lavalink đã dừng với code: ${data.code}]\n`, 'info');

            // P5-08: Handle auto-restart for crashed services
            if (data.code !== 0 && data.code !== null && !state.isQuitting) {
                handleServiceCrash('lavalink', data.code);
            }
        }
    });

    window.launcherAPI.onLavalinkError(error => {
        appendToTerminal(elements.lavalinkTerminal, `[ERROR] ${error}\n`, 'error');
        showToast('Lỗi Lavalink: ' + error, 'error');
    });

    // P1-08: Using debounced terminal updates for smoother scrolling
    window.launcherAPI.onBotOutput(data => {
        appendToTerminalDebounced('bot', data);
    });

    window.launcherAPI.onBotStatus(data => {
        updateBotStatus(data.running);
        if (!data.running) {
            appendToTerminal(elements.botTerminal, `\n[Bot đã dừng với code: ${data.code}]\n`, 'info');

            // P5-08: Handle auto-restart for crashed services
            if (data.code !== 0 && data.code !== null && !state.isQuitting) {
                handleServiceCrash('bot', data.code);
            }
        }
    });

    window.launcherAPI.onBotError(error => {
        appendToTerminal(elements.botTerminal, `[ERROR] ${error}\n`, 'error');
        showToast('Lỗi Bot: ' + error, 'error');
    });

    window.launcherAPI.onDeployOutput(data => {
        appendToTerminalDebounced('bot', data);
    });

    // Quit confirmation handler
    window.launcherAPI.onConfirmQuit(async () => {
        if (state.isQuitting) return;

        const hasRunning = await window.launcherAPI.hasRunningProcesses();

        if (hasRunning.hasRunning) {
            // Show confirmation dialog
            showQuitConfirmation(hasRunning);
        } else {
            // No processes running, just quit
            state.isQuitting = true;
            await window.launcherAPI.forceQuit();
        }
    });

    // P5-06: npm install output listener
    window.launcherAPI.onNpmInstallOutput(data => {
        const outputEl = document.getElementById('npm-install-output');
        if (outputEl) {
            outputEl.textContent += data;
            outputEl.scrollTop = outputEl.scrollHeight;
        }
    });
}

/**
 * Debounce utility function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== Initialization ====================

async function init() {
    setupEventListeners();

    // Load config
    const config = await window.launcherAPI.getConfig();
    state.botPath = config.botPath;
    state.firstRun = config.firstRun;

    // P1-07: Use batch status IPC call instead of separate calls
    // This reduces IPC overhead during initialization
    const allStatus = await window.launcherAPI.getAllStatus();

    updateLavalinkStatus(allStatus.lavalink.running);
    updateBotStatus(allStatus.bot.running);

    // P2-02: Start uptime interval
    startUptimeInterval();

    // P2-03: Update quick actions state
    updateQuickActionsState();

    // P5-08: Load auto-restart settings
    await loadAutoRestartSettings();

    // P6-01 to P6-05: Load tray settings
    await loadTraySettings();

    if (state.firstRun || !state.botPath) {
        // Show setup wizard
        elements.setupWizard.classList.remove('hidden');
        elements.mainApp.classList.add('hidden');

        // Start requirements check
        checkRequirements();
    } else {
        // Show main app
        elements.setupWizard.classList.add('hidden');
        elements.mainApp.classList.remove('hidden');

        updateBotPathUI();
        loadVersionInfo();

        // P2-09, P2-10: Run pre-flight checks on startup
        runPreflightChecks();
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
