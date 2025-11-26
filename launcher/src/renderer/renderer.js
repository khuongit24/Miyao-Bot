/**
 * Miyao Launcher - Renderer Process
 * Handles all UI logic and interactions
 */

// ==================== State Management ====================
const state = {
    botPath: '',
    firstRun: true,
    lavalinkRunning: false,
    botRunning: false,
    currentTab: 'lavalink',
    isQuitting: false
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
    
    // Lavalink Controls
    btnStartLavalink: document.getElementById('btn-start-lavalink'),
    btnStopLavalink: document.getElementById('btn-stop-lavalink'),
    lavalinkTerminal: document.getElementById('lavalink-terminal'),
    btnClearLavalinkTerminal: document.getElementById('btn-clear-lavalink-terminal'),
    
    // Bot Controls
    btnStartBot: document.getElementById('btn-start-bot'),
    btnStopBot: document.getElementById('btn-stop-bot'),
    btnDeployCommands: document.getElementById('btn-deploy-commands'),
    botTerminal: document.getElementById('bot-terminal'),
    btnClearBotTerminal: document.getElementById('btn-clear-bot-terminal'),
    
    // Settings
    envEditor: document.getElementById('env-editor'),
    envEditorStatus: document.getElementById('env-editor-status'),
    btnReloadEnv: document.getElementById('btn-reload-env'),
    btnSaveEnv: document.getElementById('btn-save-env'),
    settingsBotPath: document.getElementById('settings-bot-path'),
    btnChangeDirectory: document.getElementById('btn-change-directory'),
    
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
 */
function appendToTerminal(terminal, text, className = '') {
    // Remove welcome message if present
    const welcome = terminal.querySelector('.terminal-welcome');
    if (welcome) welcome.remove();
    
    // Parse and colorize output
    const lines = text.split('\n');
    lines.forEach(line => {
        if (!line.trim()) return;
        
        const lineEl = document.createElement('div');
        lineEl.className = 'terminal-line';
        
        // Detect log level and apply colors
        if (line.includes('ERROR') || line.includes('error') || line.includes('Error')) {
            lineEl.classList.add('error');
        } else if (line.includes('WARN') || line.includes('warn') || line.includes('Warning')) {
            lineEl.classList.add('warning');
        } else if (line.includes('INFO') || line.includes('info') || line.includes('✅') || line.includes('Successfully')) {
            lineEl.classList.add('info');
        } else if (line.includes('success') || line.includes('Success') || line.includes('Started')) {
            lineEl.classList.add('success');
        }
        
        if (className) lineEl.classList.add(className);
        lineEl.textContent = line;
        terminal.appendChild(lineEl);
    });
    
    // Auto scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;
}

/**
 * Clear terminal
 */
function clearTerminal(terminal, welcomeMessage) {
    terminal.innerHTML = `<div class="terminal-welcome">${welcomeMessage}</div>`;
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
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    });
    
    // Handle ESC key
    const escHandler = (e) => {
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
            updateRequirementItem(elements.reqNode, 'error', 
                results.node.version ? `v${results.node.version} (cần ≥ ${results.node.required})` : 'Chưa cài đặt'
            );
        }
        
        // Update Java
        if (results.java.installed) {
            updateRequirementItem(elements.reqJava, 'success', results.java.version);
        } else {
            updateRequirementItem(elements.reqJava, 'error',
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
        elements.directoryValidation.querySelector('.validation-message').textContent = 
            `❌ ${result.error}`;
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
    } else if (tabName === 'info') {
        loadVersionInfo();
    }
}

// ==================== Lavalink Management ====================

/**
 * Update Lavalink status UI
 */
function updateLavalinkStatus(running) {
    state.lavalinkRunning = running;
    
    elements.lavalinkStatusDot.classList.toggle('running', running);
    elements.lavalinkStatusDot.classList.toggle('stopped', !running);
    
    elements.lavalinkStatusBadge.classList.toggle('running', running);
    elements.lavalinkStatusBadge.classList.toggle('stopped', !running);
    elements.lavalinkStatusBadge.querySelector('.status-text').textContent = 
        running ? 'Đang chạy' : 'Đã dừng';
    
    elements.btnStartLavalink.disabled = running;
    elements.btnStopLavalink.disabled = !running;
}

/**
 * Start Lavalink
 */
async function startLavalink() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
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
 */
function updateBotStatus(running) {
    state.botRunning = running;
    
    elements.botStatusDot.classList.toggle('running', running);
    elements.botStatusDot.classList.toggle('stopped', !running);
    
    elements.botStatusBadge.classList.toggle('running', running);
    elements.botStatusBadge.classList.toggle('stopped', !running);
    elements.botStatusBadge.querySelector('.status-text').textContent = 
        running ? 'Đang chạy' : 'Đã dừng';
    
    elements.btnStartBot.disabled = running;
    elements.btnStopBot.disabled = !running;
    elements.btnDeployCommands.disabled = running;
}

/**
 * Start Bot
 */
async function startBot() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }
    
    // Warn if Lavalink is not running
    if (!state.lavalinkRunning) {
        showToast('Cảnh báo: Lavalink chưa chạy. Bot có thể không phát nhạc được.', 'warning');
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
 */
async function loadEnvFile() {
    if (!state.botPath) {
        elements.envEditor.value = '# Vui lòng chọn đường dẫn bot trước';
        return;
    }
    
    const result = await window.launcherAPI.readEnv(state.botPath);
    
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
    
    elements.envEditor.value = result.content;
}

/**
 * Save .env file
 */
async function saveEnvFile() {
    if (!state.botPath) {
        showToast('Vui lòng chọn đường dẫn bot trước', 'warning');
        return;
    }
    
    const content = elements.envEditor.value;
    const result = await window.launcherAPI.writeEnv(state.botPath, content);
    
    if (result.success) {
        showToast('Đã lưu file .env thành công!', 'success');
        elements.envEditorStatus.textContent = '✅ Đã lưu thay đổi';
        elements.envEditorStatus.className = 'env-editor-status success';
    } else {
        showToast('Lỗi khi lưu: ' + result.error, 'error');
        elements.envEditorStatus.textContent = '❌ Lỗi: ' + result.error;
        elements.envEditorStatus.className = 'env-editor-status error';
    }
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
        showToast('Thiết lập hoàn tất! Chào mừng đến với Miyao Launcher 🎵', 'success');
    });
    
    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });
    
    // Lavalink Controls
    elements.btnStartLavalink.addEventListener('click', startLavalink);
    elements.btnStopLavalink.addEventListener('click', stopLavalink);
    elements.btnClearLavalinkTerminal.addEventListener('click', () => {
        clearTerminal(elements.lavalinkTerminal, 'Chưa có output. Nhấn "Khởi động Lavalink" để bắt đầu.');
    });
    
    // Bot Controls
    elements.btnStartBot.addEventListener('click', startBot);
    elements.btnStopBot.addEventListener('click', stopBot);
    elements.btnDeployCommands.addEventListener('click', deployCommands);
    elements.btnClearBotTerminal.addEventListener('click', () => {
        clearTerminal(elements.botTerminal, 'Chưa có output. Nhấn "Khởi động Bot" để bắt đầu.');
    });
    
    // Settings
    elements.btnReloadEnv.addEventListener('click', loadEnvFile);
    elements.btnSaveEnv.addEventListener('click', saveEnvFile);
    elements.btnChangeDirectory.addEventListener('click', changeDirectory);
    
    // IPC Event Listeners
    window.launcherAPI.onLavalinkOutput((data) => {
        appendToTerminal(elements.lavalinkTerminal, data);
    });
    
    window.launcherAPI.onLavalinkStatus((data) => {
        updateLavalinkStatus(data.running);
        if (!data.running) {
            appendToTerminal(elements.lavalinkTerminal, `\n[Lavalink đã dừng với code: ${data.code}]\n`, 'info');
        }
    });
    
    window.launcherAPI.onLavalinkError((error) => {
        appendToTerminal(elements.lavalinkTerminal, `[ERROR] ${error}\n`, 'error');
        showToast('Lỗi Lavalink: ' + error, 'error');
    });
    
    window.launcherAPI.onBotOutput((data) => {
        appendToTerminal(elements.botTerminal, data);
    });
    
    window.launcherAPI.onBotStatus((data) => {
        updateBotStatus(data.running);
        if (!data.running) {
            appendToTerminal(elements.botTerminal, `\n[Bot đã dừng với code: ${data.code}]\n`, 'info');
        }
    });
    
    window.launcherAPI.onBotError((error) => {
        appendToTerminal(elements.botTerminal, `[ERROR] ${error}\n`, 'error');
        showToast('Lỗi Bot: ' + error, 'error');
    });
    
    window.launcherAPI.onDeployOutput((data) => {
        appendToTerminal(elements.botTerminal, data);
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
}

// ==================== Initialization ====================

async function init() {
    setupEventListeners();
    
    // Load config
    const config = await window.launcherAPI.getConfig();
    state.botPath = config.botPath;
    state.firstRun = config.firstRun;
    
    // Check current process status
    const lavalinkStatus = await window.launcherAPI.getLavalinkStatus();
    const botStatus = await window.launcherAPI.getBotStatus();
    
    updateLavalinkStatus(lavalinkStatus.running);
    updateBotStatus(botStatus.running);
    
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
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
