/**
 * Miyao Launcher - Main Process
 * Manages Lavalink and Discord Bot processes
 *
 * Performance optimizations (v1.2.0):
 * - Lazy loading for electron-store and semver modules
 * - Async file operations to avoid blocking UI
 * - Menu.setApplicationMenu(null) before app.whenReady()
 * - Batch IPC status calls
 */

const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    Menu,
    Tray,
    Notification,
    globalShortcut,
    nativeImage
} = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const fsPromises = fs.promises;

// P1-04: Set application menu to null early for faster startup
Menu.setApplicationMenu(null);

// ==================== P6-01 to P6-03: System Tray ====================
let tray = null;
let trayContextMenu = null;

// ==================== P6-04, P6-05: Desktop Notifications ====================
let notificationsEnabled = true;

// P1-01: Lazy loading for electron-store module
let _store = null;
function getStore() {
    if (!_store) {
        const Store = require('electron-store');
        _store = new Store({
            name: 'miyao-launcher-config',
            defaults: {
                botPath: '',
                firstRun: true,
                windowBounds: { width: 1200, height: 800, x: null, y: null },
                // P6-03: Minimize to tray settings
                minimizeToTray: true,
                closeToTray: true,
                // P5-08: Auto-restart settings
                autoRestartLavalink: false,
                autoRestartBot: false,
                // P6-04: Notifications enabled
                notificationsEnabled: true
            }
        });
    }
    return _store;
}

// P1-02: Lazy loading for semver module
let _semver = null;
function getSemver() {
    if (!_semver) {
        _semver = require('semver');
    }
    return _semver;
}

// Launcher version - P7-07: Updated for v1.2.1
const LAUNCHER_VERSION = {
    version: '1.2.1',
    build: '2025.12.03',
    codename: 'Celestia'
};

// Minimum required bot version
const MIN_BOT_VERSION = '1.4.0';

// Process references
let lavalinkProcess = null;
let botProcess = null;
let mainWindow = null;

// Process state
let lavalinkRunning = false;
let botRunning = false;

// Flag to track if we're quitting
let isQuitting = false;

/**
 * Kill process using port (Windows specific for Lavalink on port 2333)
 */
async function killProcessByPort(port) {
    return new Promise(resolve => {
        if (process.platform === 'win32') {
            // Find and kill process using the port on Windows
            exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
                if (error || !stdout) {
                    resolve(false);
                    return;
                }

                // Parse PIDs from netstat output
                const lines = stdout.trim().split('\n');
                const pids = new Set();

                lines.forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    const pid = parts[parts.length - 1];
                    if (pid && !isNaN(pid) && pid !== '0') {
                        pids.add(pid);
                    }
                });

                // Kill each PID
                pids.forEach(pid => {
                    try {
                        exec(`taskkill /F /PID ${pid}`, () => {});
                    } catch (e) {
                        // Ignore
                    }
                });

                resolve(pids.size > 0);
            });
        } else {
            // Unix-like systems
            exec(`lsof -ti:${port} | xargs kill -9`, () => {
                resolve(true);
            });
        }
    });
}

/**
 * Check if port is in use
 */
async function isPortInUse(port) {
    return new Promise(resolve => {
        if (process.platform === 'win32') {
            exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
                resolve(!error && stdout && stdout.trim().length > 0);
            });
        } else {
            exec(`lsof -i:${port}`, (error, stdout) => {
                resolve(!error && stdout && stdout.trim().length > 0);
            });
        }
    });
}

/**
 * Force cleanup all processes
 */
async function cleanupAllProcesses() {
    const cleanupPromises = [];

    // Stop tracked processes
    if (lavalinkProcess) {
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', lavalinkProcess.pid.toString(), '/f', '/t']);
            } else {
                lavalinkProcess.kill('SIGKILL');
            }
        } catch (e) {
            /* ignore */
        }
        lavalinkProcess = null;
    }

    if (botProcess) {
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', botProcess.pid.toString(), '/f', '/t']);
            } else {
                botProcess.kill('SIGKILL');
            }
        } catch (e) {
            /* ignore */
        }
        botProcess = null;
    }

    // Also kill by port to catch zombie processes
    cleanupPromises.push(killProcessByPort(2333)); // Lavalink default port

    // Kill any remaining java processes that might be Lavalink
    if (process.platform === 'win32') {
        cleanupPromises.push(
            new Promise(resolve => {
                exec('wmic process where "commandline like \'%Lavalink%\'" call terminate', () => resolve());
            })
        );
    }

    await Promise.all(cleanupPromises);

    lavalinkRunning = false;
    botRunning = false;
}

/**
 * Create the main browser window
 * P1-03: Using async file operations
 * P6-08: Window state persistence (position, size, maximized)
 */
async function createWindow() {
    const store = getStore();
    const windowBounds = store.get('windowBounds');
    const { width, height } = windowBounds;

    // P1-03: Use async file check for icon
    const iconPath = path.join(__dirname, '../../assets/icon.png');
    let hasIcon = false;
    try {
        await fsPromises.access(iconPath, fs.constants.F_OK);
        hasIcon = true;
    } catch {
        hasIcon = false;
    }

    // P6-08: Prepare window options with saved position
    const windowOptions = {
        width,
        height,
        minWidth: 900,
        minHeight: 600,
        title: 'Miyao Launcher',
        ...(hasIcon && { icon: iconPath }),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        autoHideMenuBar: true,
        backgroundColor: '#1a1a2e'
    };

    // P6-08: Restore window position if saved
    if (windowBounds.x !== null && windowBounds.y !== null) {
        windowOptions.x = windowBounds.x;
        windowOptions.y = windowBounds.y;
    }

    mainWindow = new BrowserWindow(windowOptions);

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // P6-08: Restore maximized state if saved
    if (windowBounds.maximized) {
        mainWindow.maximize();
    }

    // P6-08: Save window bounds on resize, move, and state change
    const saveWindowBounds = () => {
        if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
            const bounds = mainWindow.getBounds();
            store.set('windowBounds', {
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y,
                maximized: false
            });
        }
    };

    mainWindow.on('resize', saveWindowBounds);
    mainWindow.on('move', saveWindowBounds);

    mainWindow.on('maximize', () => {
        const currentBounds = store.get('windowBounds');
        store.set('windowBounds', { ...currentBounds, maximized: true });
    });

    mainWindow.on('unmaximize', () => {
        const currentBounds = store.get('windowBounds');
        store.set('windowBounds', { ...currentBounds, maximized: false });
    });

    // P6-03: Handle window minimize - minimize to tray if enabled
    mainWindow.on('minimize', () => {
        const minimizeToTray = store.get('minimizeToTray');
        if (minimizeToTray && tray) {
            mainWindow.hide();
            showNotification('Miyao Launcher', 'Đã thu nhỏ xuống khay hệ thống');
        }
    });

    // Handle window close - show confirmation if processes are running
    // P6-03: Close to tray if enabled
    mainWindow.on('close', async event => {
        if (isQuitting) {
            return; // Allow close
        }

        const closeToTray = store.get('closeToTray');

        // Check if any processes are running
        if (lavalinkRunning || botRunning) {
            event.preventDefault();
            // Send message to renderer to show confirmation dialog
            mainWindow.webContents.send('confirm-quit');
        } else if (closeToTray && tray) {
            // P6-03: Close to tray instead of quitting
            event.preventDefault();
            mainWindow.hide();
            showNotification('Miyao Launcher', 'Ứng dụng vẫn đang chạy trong khay hệ thống');
        } else {
            // No processes running and close to tray disabled, allow close
            isQuitting = true;
        }
    });

    // Handle window close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    // P6-01, P6-02: Create system tray after window is created
    await createTray();
}

// ==================== P6-01, P6-02: System Tray Functions ====================

/**
 * P6-01, P6-02: Create system tray with icon and context menu
 */
async function createTray() {
    // Try multiple icon formats in order of preference
    const iconFormats = ['icon.png', 'icon.ico', 'icon.svg'];
    let trayIcon = null;

    for (const format of iconFormats) {
        const iconPath = path.join(__dirname, '../../assets', format);
        try {
            await fsPromises.access(iconPath, fs.constants.F_OK);
            trayIcon = nativeImage.createFromPath(iconPath);
            if (!trayIcon.isEmpty()) {
                // Resize for tray (16x16 on Windows, 22x22 on other platforms)
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
                break;
            }
        } catch {
            // Continue to next format
        }
    }

    // Create a simple colored icon if no icon file found
    if (!trayIcon || trayIcon.isEmpty()) {
        // Create a 16x16 purple square as fallback
        const size = 16;
        const canvas = Buffer.alloc(size * size * 4);
        for (let i = 0; i < size * size; i++) {
            canvas[i * 4] = 124; // R - purple
            canvas[i * 4 + 1] = 58; // G
            canvas[i * 4 + 2] = 237; // B
            canvas[i * 4 + 3] = 255; // A
        }
        trayIcon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('Miyao Launcher - Đang chạy');

    // Build and set context menu
    updateTrayMenu();

    // P6-01: Handle tray click - show/hide window
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    // P6-02: Handle double-click - show window
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

/**
 * P6-02: Update tray context menu with current service status
 */
function updateTrayMenu() {
    if (!tray) return;

    const lavalinkStatus = lavalinkRunning ? '🟢 Đang chạy' : '🔴 Đã dừng';
    const botStatus = botRunning ? '🟢 Đang chạy' : '🔴 Đã dừng';
    const store = getStore();
    const botPath = store.get('botPath');

    trayContextMenu = Menu.buildFromTemplate([
        {
            label: '🎵 Miyao Launcher',
            enabled: false
        },
        { type: 'separator' },
        {
            label: 'Hiện/Ẩn cửa sổ',
            click: () => {
                if (mainWindow) {
                    if (mainWindow.isVisible()) {
                        mainWindow.hide();
                    } else {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            }
        },
        { type: 'separator' },
        {
            label: `🎛️ Lavalink: ${lavalinkStatus}`,
            enabled: false
        },
        {
            label: `🤖 Bot: ${botStatus}`,
            enabled: false
        },
        { type: 'separator' },
        {
            label: '🚀 Khởi động tất cả',
            enabled: !lavalinkRunning || !botRunning,
            click: async () => {
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('tray-start-all');
                    mainWindow.show();
                }
            }
        },
        {
            label: '⏹️ Dừng tất cả',
            enabled: lavalinkRunning || botRunning,
            click: async () => {
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('tray-stop-all');
                }
            }
        },
        { type: 'separator' },
        {
            label: '▶️ Khởi động Lavalink',
            enabled: !lavalinkRunning && !!botPath,
            click: async () => {
                const result = await startLavalink(botPath);
                if (result.success) {
                    showNotification('Lavalink', 'Đang khởi động Lavalink...');
                } else {
                    showNotification('Lỗi Lavalink', result.error, 'error');
                }
            }
        },
        {
            label: '⏹️ Dừng Lavalink',
            enabled: lavalinkRunning,
            click: () => {
                stopLavalink();
                showNotification('Lavalink', 'Đã dừng Lavalink');
            }
        },
        {
            label: '▶️ Khởi động Bot',
            enabled: !botRunning && !!botPath,
            click: () => {
                const result = startBot(botPath);
                if (result.success) {
                    showNotification('Bot', 'Đang khởi động Bot...');
                } else {
                    showNotification('Lỗi Bot', result.error, 'error');
                }
            }
        },
        {
            label: '⏹️ Dừng Bot',
            enabled: botRunning,
            click: () => {
                stopBot();
                showNotification('Bot', 'Đã dừng Bot');
            }
        },
        { type: 'separator' },
        {
            label: '❌ Thoát',
            click: async () => {
                if (lavalinkRunning || botRunning) {
                    // Show main window to confirm
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.webContents.send('confirm-quit');
                    }
                } else {
                    isQuitting = true;
                    await cleanupAllProcesses();
                    if (tray) {
                        tray.destroy();
                    }
                    app.quit();
                }
            }
        }
    ]);

    tray.setContextMenu(trayContextMenu);

    // Update tooltip with service status
    const statusText = `Miyao Launcher\n🎛️ Lavalink: ${lavalinkRunning ? 'Chạy' : 'Dừng'}\n🤖 Bot: ${botRunning ? 'Chạy' : 'Dừng'}`;
    tray.setToolTip(statusText);
}

// ==================== P6-04, P6-05: Desktop Notifications ====================

/**
 * P6-04, P6-05: Show desktop notification
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} type - Notification type: 'info', 'success', 'warning', 'error'
 */
function showNotification(title, body, type = 'info') {
    const store = getStore();

    // Check if notifications are enabled
    if (!store.get('notificationsEnabled')) {
        return;
    }

    // Check if notifications are supported
    if (!Notification.isSupported()) {
        return;
    }

    const notification = new Notification({
        title,
        body,
        silent: type === 'info', // Play sound for warnings and errors
        timeoutType: type === 'error' ? 'never' : 'default'
    });

    // P6-04: Click to focus launcher
    notification.on('click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    notification.show();
}

/**
 * P6-04: Send service status notification
 */
function notifyServiceStatus(service, running, exitCode = null) {
    if (running) {
        showNotification(`${service} đã khởi động`, `${service} đang chạy`, 'success');
    } else {
        if (exitCode === 0 || exitCode === null) {
            showNotification(`${service} đã dừng`, `${service} đã dừng thành công`, 'info');
        } else {
            showNotification(`${service} đã dừng bất ngờ`, `${service} đã dừng với mã lỗi: ${exitCode}`, 'error');
        }
    }

    // Update tray menu when service status changes
    updateTrayMenu();
}

/**
 * Check system requirements
 * P1-02: Using lazy loaded semver
 */
async function checkRequirements() {
    const semver = getSemver();
    const results = {
        node: { installed: false, version: null, required: '20.0.0' },
        java: { installed: false, version: null, required: '17' },
        npm: { installed: false, version: null }
    };

    // Check Node.js
    try {
        const nodeVersion = await executeCommand('node --version');
        results.node.version = nodeVersion.trim().replace('v', '');
        results.node.installed = semver.gte(results.node.version, results.node.required);
    } catch (error) {
        results.node.installed = false;
    }

    // Check Java
    try {
        const javaVersion = await executeCommand('java -version 2>&1');
        const match = javaVersion.match(/version "(\d+)/);
        if (match) {
            results.java.version = match[1];
            results.java.installed = parseInt(results.java.version) >= parseInt(results.java.required);
        }
    } catch (error) {
        results.java.installed = false;
    }

    // Check npm
    try {
        const npmVersion = await executeCommand('npm --version');
        results.npm.version = npmVersion.trim();
        results.npm.installed = true;
    } catch (error) {
        results.npm.installed = false;
    }

    return results;
}

/**
 * Execute command and return output
 */
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout || stderr);
            }
        });
    });
}

/**
 * Validate bot directory
 * P1-02: Using lazy loaded semver
 * P1-03: Using async file operations
 */
async function validateBotDirectory(dirPath) {
    const semver = getSemver();
    const result = {
        valid: false,
        version: null,
        error: null
    };

    try {
        // Check if package.json exists (async)
        const packageJsonPath = path.join(dirPath, 'package.json');
        try {
            await fsPromises.access(packageJsonPath, fs.constants.F_OK);
        } catch {
            result.error = 'Không tìm thấy file package.json trong thư mục này';
            return result;
        }

        // Check if it's Miyao Bot (async read)
        const packageJsonContent = await fsPromises.readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent);
        if (packageJson.name !== 'miyao-bot') {
            result.error = 'Thư mục này không phải là Miyao Bot';
            return result;
        }

        // Check version
        result.version = packageJson.version;
        if (!semver.gte(result.version, MIN_BOT_VERSION)) {
            result.error = `Phiên bản bot (${result.version}) thấp hơn yêu cầu tối thiểu (${MIN_BOT_VERSION})`;
            return result;
        }

        // Check if index.js exists (async)
        const indexPath = path.join(dirPath, 'index.js');
        try {
            await fsPromises.access(indexPath, fs.constants.F_OK);
        } catch {
            result.error = 'Không tìm thấy file index.js';
            return result;
        }

        result.valid = true;
    } catch (error) {
        result.error = `Lỗi khi kiểm tra thư mục: ${error.message}`;
    }

    return result;
}

/**
 * Get bot version information
 * P1-03: Using async file operations
 */
async function getBotVersionInfo(botPath) {
    try {
        const versionFilePath = path.join(botPath, 'src', 'utils', 'version.js');

        // Check if version.js exists (async)
        let hasVersionFile = false;
        try {
            await fsPromises.access(versionFilePath, fs.constants.F_OK);
            hasVersionFile = true;
        } catch {
            hasVersionFile = false;
        }

        if (!hasVersionFile) {
            // Fallback to package.json (async read)
            const packageJsonPath = path.join(botPath, 'package.json');
            const packageJsonContent = await fsPromises.readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(packageJsonContent);
            return {
                version: packageJson.version,
                build: 'N/A',
                codename: 'N/A',
                releaseDate: 'N/A'
            };
        }

        const versionContent = await fsPromises.readFile(versionFilePath, 'utf8');

        // Extract version info using regex
        const majorMatch = versionContent.match(/major:\s*(\d+)/);
        const minorMatch = versionContent.match(/minor:\s*(\d+)/);
        const patchMatch = versionContent.match(/patch:\s*(\d+)/);
        const buildMatch = versionContent.match(/build:\s*['"]([^'"]+)['"]/);
        const codenameMatch = versionContent.match(/codename:\s*['"]([^'"]+)['"]/);
        const releaseDateMatch = versionContent.match(/date:\s*['"]([^'"]+)['"]/);

        return {
            version: `${majorMatch?.[1] || '0'}.${minorMatch?.[1] || '0'}.${patchMatch?.[1] || '0'}`,
            build: buildMatch?.[1] || 'N/A',
            codename: codenameMatch?.[1] || 'N/A',
            releaseDate: releaseDateMatch?.[1] || 'N/A'
        };
    } catch (error) {
        return {
            version: 'Unknown',
            build: 'N/A',
            codename: 'N/A',
            releaseDate: 'N/A',
            error: error.message
        };
    }
}

/**
 * Read .env file
 * P1-03: Using async file operations
 */
async function readEnvFile(botPath) {
    const envPath = path.join(botPath, '.env');

    // Check if .env exists (async)
    let envExists = false;
    try {
        await fsPromises.access(envPath, fs.constants.F_OK);
        envExists = true;
    } catch {
        envExists = false;
    }

    if (!envExists) {
        // Check for .env.example
        const examplePath = path.join(botPath, '.env.example');
        let exampleExists = false;
        try {
            await fsPromises.access(examplePath, fs.constants.F_OK);
            exampleExists = true;
        } catch {
            exampleExists = false;
        }

        if (exampleExists) {
            const content = await fsPromises.readFile(examplePath, 'utf8');
            return {
                exists: false,
                content,
                isExample: true
            };
        }
        return { exists: false, content: '', isExample: false };
    }

    const content = await fsPromises.readFile(envPath, 'utf8');
    return {
        exists: true,
        content,
        isExample: false
    };
}

/**
 * Write .env file
 * P1-03: Using async file operations
 */
async function writeEnvFile(botPath, content) {
    const envPath = path.join(botPath, '.env');
    try {
        await fsPromises.writeFile(envPath, content, 'utf8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Start Lavalink server
 * P1-03: Updated to use async findLavalinkJar
 */
async function startLavalink(botPath) {
    if (lavalinkRunning) {
        return { success: false, error: 'Lavalink đang chạy' };
    }

    const lavalinkJar = await findLavalinkJar(botPath);
    if (!lavalinkJar) {
        return { success: false, error: 'Không tìm thấy file Lavalink.jar' };
    }

    // Check if port 2333 is already in use
    const portInUse = await isPortInUse(2333);
    if (portInUse) {
        // Try to kill the process using the port
        const killed = await killProcessByPort(2333);
        if (killed) {
            // Wait a bit for the port to be released
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Check again
            const stillInUse = await isPortInUse(2333);
            if (stillInUse) {
                return {
                    success: false,
                    error: 'Port 2333 đang được sử dụng bởi tiến trình khác. Không thể tắt tự động.'
                };
            }
        } else {
            return {
                success: false,
                error: 'Port 2333 đang được sử dụng. Vui lòng tắt Lavalink đang chạy hoặc restart máy.'
            };
        }
    }

    try {
        lavalinkProcess = spawn('java', ['-jar', lavalinkJar], {
            cwd: botPath,
            shell: true
        });

        lavalinkRunning = true;
        // P6-02: Update tray menu when service starts
        updateTrayMenu();

        lavalinkProcess.stdout.on('data', data => {
            const output = data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lavalink-output', output);
            }
        });

        lavalinkProcess.stderr.on('data', data => {
            const output = data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lavalink-output', output);
            }
        });

        lavalinkProcess.on('close', code => {
            lavalinkRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lavalink-status', { running: false, code });
            }
            // P6-04: Send notification when Lavalink stops
            notifyServiceStatus('Lavalink', false, code);
        });

        lavalinkProcess.on('error', error => {
            lavalinkRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lavalink-error', error.message);
            }
            // P6-05: Send error notification
            showNotification('Lỗi Lavalink', error.message, 'error');
            updateTrayMenu();
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Find Lavalink.jar file
 * P1-03: Using async file operations
 */
async function findLavalinkJar(botPath) {
    // Check common locations
    const possiblePaths = [
        path.join(botPath, 'Lavalink.jar'),
        path.join(botPath, 'lavalink.jar'),
        path.join(botPath, 'lavalink', 'Lavalink.jar')
    ];

    for (const jarPath of possiblePaths) {
        try {
            await fsPromises.access(jarPath, fs.constants.F_OK);
            return jarPath;
        } catch {
            // Continue checking next path
        }
    }

    // Search for any .jar file with lavalink in the name
    try {
        const files = await fsPromises.readdir(botPath);
        for (const file of files) {
            if (file.toLowerCase().includes('lavalink') && file.endsWith('.jar')) {
                return path.join(botPath, file);
            }
        }
    } catch (error) {
        // Ignore
    }

    return null;
}

/**
 * Stop Lavalink server
 * Fixed: Properly await process termination
 */
async function stopLavalink() {
    if (!lavalinkProcess && !lavalinkRunning) {
        return { success: false, error: 'Lavalink không đang chạy' };
    }

    try {
        const pid = lavalinkProcess?.pid;
        
        if (pid) {
            if (process.platform === 'win32') {
                // Use promisified exec for proper awaiting
                await new Promise((resolve) => {
                    exec(`taskkill /pid ${pid} /f /t`, (error) => {
                        // Ignore errors - process may have already exited
                        resolve();
                    });
                });
            } else {
                lavalinkProcess.kill('SIGTERM');
            }
        }
        
        lavalinkProcess = null;
        lavalinkRunning = false;
        
        // Also kill by port to ensure cleanup
        await killProcessByPort(2333);
        
        // Update tray menu
        updateTrayMenu();
        
        return { success: true };
    } catch (error) {
        // Even if there's an error, try to reset state
        lavalinkProcess = null;
        lavalinkRunning = false;
        updateTrayMenu();
        return { success: false, error: error.message };
    }
}

/**
 * Start Discord Bot
 */
function startBot(botPath) {
    if (botRunning) {
        return { success: false, error: 'Bot đang chạy' };
    }

    try {
        botProcess = spawn('node', ['index.js'], {
            cwd: botPath,
            shell: true,
            env: { ...process.env, FORCE_COLOR: '1' }
        });

        botRunning = true;
        // P6-02: Update tray menu when service starts
        updateTrayMenu();

        botProcess.stdout.on('data', data => {
            const output = data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('bot-output', output);
            }
        });

        botProcess.stderr.on('data', data => {
            const output = data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('bot-output', output);
            }
        });

        botProcess.on('close', code => {
            botRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('bot-status', { running: false, code });
            }
            // P6-04: Send notification when Bot stops
            notifyServiceStatus('Bot', false, code);
        });

        botProcess.on('error', error => {
            botRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('bot-error', error.message);
            }
            // P6-05: Send error notification
            showNotification('Lỗi Bot', error.message, 'error');
            updateTrayMenu();
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Backup database to db_saves folder with timestamp-based directory structure
 * Format: db_saves/DD-MM-YYYY_HH-mm-ss/miyao.db
 * @param {string} botPath - Path to bot directory
 * @returns {Object} Result with success status and backup path
 */
async function backupDatabase(botPath) {
    try {
        const dataDir = path.join(botPath, 'data');
        const dbPath = path.join(dataDir, 'miyao.db');
        const dbSavesDir = path.join(dataDir, 'db_saves');

        // Check if database file exists
        try {
            await fsPromises.access(dbPath, fs.constants.F_OK);
        } catch {
            return { 
                success: false, 
                error: 'Database file không tồn tại',
                path: null
            };
        }

        // Create db_saves directory if not exists
        try {
            await fsPromises.access(dbSavesDir, fs.constants.F_OK);
        } catch {
            await fsPromises.mkdir(dbSavesDir, { recursive: true });
        }

        // Generate timestamp-based folder name: DD-MM-YYYY_HH-mm-ss
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const backupFolderName = `${day}-${month}-${year}_${hours}-${minutes}-${seconds}`;
        const backupDir = path.join(dbSavesDir, backupFolderName);

        // Create backup directory
        await fsPromises.mkdir(backupDir, { recursive: true });

        // Copy database file to backup directory
        const backupPath = path.join(backupDir, 'miyao.db');
        await fsPromises.copyFile(dbPath, backupPath);

        // Also copy WAL and SHM files if they exist (for full database state)
        const walPath = path.join(dataDir, 'miyao.db-wal');
        const shmPath = path.join(dataDir, 'miyao.db-shm');

        try {
            await fsPromises.access(walPath, fs.constants.F_OK);
            await fsPromises.copyFile(walPath, path.join(backupDir, 'miyao.db-wal'));
        } catch {
            // WAL file doesn't exist, skip
        }

        try {
            await fsPromises.access(shmPath, fs.constants.F_OK);
            await fsPromises.copyFile(shmPath, path.join(backupDir, 'miyao.db-shm'));
        } catch {
            // SHM file doesn't exist, skip
        }

        // Send notification to renderer about successful backup
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('database-backup-complete', {
                success: true,
                path: backupDir,
                timestamp: now.toISOString()
            });
        }

        return { 
            success: true, 
            path: backupDir,
            folderName: backupFolderName,
            timestamp: now.toISOString()
        };
    } catch (error) {
        // Send notification to renderer about failed backup
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('database-backup-complete', {
                success: false,
                error: error.message
            });
        }

        return { 
            success: false, 
            error: error.message,
            path: null
        };
    }
}

/**
 * Stop Discord Bot
 * Fixed: Properly await process termination
 * Updated: Auto-backup database before stopping
 */
async function stopBot() {
    if (!botProcess && !botRunning) {
        return { success: false, error: 'Bot không đang chạy' };
    }

    try {
        // Get bot path from store for backup
        const store = getStore();
        const botPath = store.get('botPath');

        // Backup database before stopping bot
        if (botPath) {
            const backupResult = await backupDatabase(botPath);
            if (backupResult.success) {
                // Log successful backup (send to renderer)
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('bot-log', {
                        type: 'info',
                        message: `Database đã được sao lưu: ${backupResult.folderName}`
                    });
                }
            } else {
                // Log backup failure but continue with stopping bot
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('bot-log', {
                        type: 'warn',
                        message: `Không thể sao lưu database: ${backupResult.error}`
                    });
                }
            }
        }

        const pid = botProcess?.pid;
        
        if (pid) {
            if (process.platform === 'win32') {
                // Use promisified exec for proper awaiting
                await new Promise((resolve) => {
                    exec(`taskkill /pid ${pid} /f /t`, (error) => {
                        // Ignore errors - process may have already exited
                        resolve();
                    });
                });
            } else {
                botProcess.kill('SIGTERM');
            }
        }
        
        botProcess = null;
        botRunning = false;
        
        // Update tray menu
        updateTrayMenu();
        
        return { success: true };
    } catch (error) {
        // Even if there's an error, try to reset state
        botProcess = null;
        botRunning = false;
        updateTrayMenu();
        return { success: false, error: error.message };
    }
}

/**
 * Deploy bot commands
 */
function deployCommands(botPath) {
    return new Promise(resolve => {
        const deployProcess = spawn('node', ['src/scripts/deploy-commands.js'], {
            cwd: botPath,
            shell: true
        });

        let output = '';
        let resolved = false;
        let deploymentSuccessDetected = false;

        // Timeout to prevent infinite hanging (30 seconds max)
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                // Kill the process if it's still running
                try {
                    if (process.platform === 'win32') {
                        spawn('taskkill', ['/pid', deployProcess.pid, '/f', '/t']);
                    } else {
                        deployProcess.kill('SIGTERM');
                    }
                } catch (e) {
                    // Ignore kill errors
                }
                // If we detected success message, consider it successful despite timeout
                resolve({
                    success: deploymentSuccessDetected,
                    output,
                    code: deploymentSuccessDetected ? 0 : -1,
                    timedOut: true
                });
            }
        }, 30000);

        deployProcess.stdout.on('data', data => {
            const text = data.toString();
            output += text;

            // Detect successful deployment
            if (text.includes('Deployment complete') || text.includes('Successfully reloaded')) {
                deploymentSuccessDetected = true;

                // Give a short delay then force resolve if process doesn't exit
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        // Kill the hanging process
                        try {
                            if (process.platform === 'win32') {
                                spawn('taskkill', ['/pid', deployProcess.pid, '/f', '/t']);
                            } else {
                                deployProcess.kill('SIGTERM');
                            }
                        } catch (e) {
                            // Ignore
                        }
                        resolve({ success: true, output, code: 0 });
                    }
                }, 2000); // Wait 2 seconds for natural exit, then force
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('deploy-output', text);
            }
        });

        deployProcess.stderr.on('data', data => {
            const text = data.toString();
            output += text;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('deploy-output', text);
            }
        });

        deployProcess.on('close', code => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: code === 0, output, code });
            }
        });

        deployProcess.on('error', error => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: false, error: error.message });
            }
        });
    });
}

/**
 * Select bot directory dialog
 * P1-01: Using lazy loaded store
 */
async function selectBotDirectory() {
    const store = getStore();
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Chọn thư mục Miyao Bot',
        properties: ['openDirectory'],
        buttonLabel: 'Chọn thư mục này'
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
    }

    const dirPath = result.filePaths[0];
    const validation = await validateBotDirectory(dirPath);

    if (validation.valid) {
        store.set('botPath', dirPath);
        store.set('firstRun', false);
    }

    return {
        canceled: false,
        path: dirPath,
        ...validation
    };
}

// ==================== IPC Handlers ====================

// Config handlers - P1-01: Using lazy loaded store
ipcMain.handle('get-config', () => {
    const store = getStore();
    return {
        botPath: store.get('botPath'),
        firstRun: store.get('firstRun'),
        launcherVersion: LAUNCHER_VERSION,
        minBotVersion: MIN_BOT_VERSION
    };
});

ipcMain.handle('set-config', (event, key, value) => {
    const store = getStore();
    store.set(key, value);
    return { success: true };
});

// Requirements check
ipcMain.handle('check-requirements', async () => {
    return await checkRequirements();
});

// Bot directory handlers
ipcMain.handle('select-bot-directory', async () => {
    return await selectBotDirectory();
});

ipcMain.handle('validate-bot-directory', async (event, dirPath) => {
    return await validateBotDirectory(dirPath);
});

ipcMain.handle('get-bot-version', async (event, botPath) => {
    return await getBotVersionInfo(botPath);
});

// .env handlers - P1-03: Now async
ipcMain.handle('read-env', async (event, botPath) => {
    return await readEnvFile(botPath);
});

ipcMain.handle('write-env', async (event, botPath, content) => {
    return await writeEnvFile(botPath, content);
});

// Lavalink handlers
ipcMain.handle('start-lavalink', async (event, botPath) => {
    return await startLavalink(botPath);
});

ipcMain.handle('stop-lavalink', async () => {
    return await stopLavalink();
});

ipcMain.handle('get-lavalink-status', () => {
    return { running: lavalinkRunning };
});

// Bot handlers
ipcMain.handle('start-bot', (event, botPath) => {
    return startBot(botPath);
});

ipcMain.handle('stop-bot', async () => {
    return await stopBot();
});

ipcMain.handle('get-bot-status', () => {
    return { running: botRunning };
});

// Database backup handlers
ipcMain.handle('backup-database', async (event, botPath) => {
    return await backupDatabase(botPath);
});

// P1-07: Batch status IPC call - returns all status in one call
ipcMain.handle('get-all-status', () => {
    return {
        lavalink: { running: lavalinkRunning },
        bot: { running: botRunning },
        hasRunning: lavalinkRunning || botRunning
    };
});

ipcMain.handle('deploy-commands', async (event, botPath) => {
    return await deployCommands(botPath);
});

// Launcher version
ipcMain.handle('get-launcher-version', () => {
    return LAUNCHER_VERSION;
});

// Cleanup handler
ipcMain.handle('cleanup-all-processes', async () => {
    await cleanupAllProcesses();
    return { success: true };
});

// Check if processes are running
ipcMain.handle('has-running-processes', () => {
    return {
        hasRunning: lavalinkRunning || botRunning,
        lavalink: lavalinkRunning,
        bot: botRunning
    };
});

// Force quit without confirmation
ipcMain.handle('force-quit', async () => {
    isQuitting = true;
    await cleanupAllProcesses();
    app.quit();
});

// ==================== Pre-flight Checks ====================

/**
 * Run pre-flight checks before starting services
 * P2-09: Checks package.json, node_modules, .env, Lavalink.jar, port 2333
 */
ipcMain.handle('run-preflight-checks', async (event, botPath) => {
    const checks = [];

    // Check 1: package.json exists
    const packageJsonPath = path.join(botPath, 'package.json');
    try {
        await fsPromises.access(packageJsonPath, fs.constants.F_OK);
        checks.push({
            id: 'package-json',
            name: 'package.json',
            status: 'success',
            message: 'File tồn tại',
            fixable: false
        });
    } catch {
        checks.push({
            id: 'package-json',
            name: 'package.json',
            status: 'error',
            message: 'Không tìm thấy file package.json',
            fixable: false
        });
    }

    // Check 2: node_modules exists
    const nodeModulesPath = path.join(botPath, 'node_modules');
    try {
        await fsPromises.access(nodeModulesPath, fs.constants.F_OK);
        // Check for key dependencies
        const discordJsPath = path.join(nodeModulesPath, 'discord.js');
        try {
            await fsPromises.access(discordJsPath, fs.constants.F_OK);
            checks.push({
                id: 'node-modules',
                name: 'node_modules',
                status: 'success',
                message: 'Dependencies đã cài đặt',
                fixable: false
            });
        } catch {
            checks.push({
                id: 'node-modules',
                name: 'node_modules',
                status: 'error',
                message: 'Dependencies chưa đầy đủ - cần chạy npm install',
                fixable: true,
                fixAction: 'npm-install'
            });
        }
    } catch {
        checks.push({
            id: 'node-modules',
            name: 'node_modules',
            status: 'error',
            message: 'Chưa cài đặt dependencies - cần chạy npm install',
            fixable: true,
            fixAction: 'npm-install'
        });
    }

    // Check 3: .env exists
    const envPath = path.join(botPath, '.env');
    try {
        await fsPromises.access(envPath, fs.constants.F_OK);
        // Read and check for required keys
        const envContent = await fsPromises.readFile(envPath, 'utf8');
        if (envContent.includes('DISCORD_TOKEN=') && !envContent.includes('DISCORD_TOKEN=your_')) {
            checks.push({
                id: 'env-file',
                name: '.env file',
                status: 'success',
                message: 'File cấu hình đã thiết lập',
                fixable: false
            });
        } else {
            checks.push({
                id: 'env-file',
                name: '.env file',
                status: 'error',
                message: 'DISCORD_TOKEN chưa được cấu hình',
                fixable: true,
                fixAction: 'open-settings'
            });
        }
    } catch {
        // Check for .env.example
        const examplePath = path.join(botPath, '.env.example');
        try {
            await fsPromises.access(examplePath, fs.constants.F_OK);
            checks.push({
                id: 'env-file',
                name: '.env file',
                status: 'error',
                message: 'Chưa tạo file .env - có thể copy từ .env.example',
                fixable: true,
                fixAction: 'copy-env-example'
            });
        } catch {
            checks.push({
                id: 'env-file',
                name: '.env file',
                status: 'error',
                message: 'Không tìm thấy file .env',
                fixable: true,
                fixAction: 'open-settings'
            });
        }
    }

    // Check 4: Lavalink.jar exists
    const lavalinkJar = await findLavalinkJar(botPath);
    if (lavalinkJar) {
        checks.push({
            id: 'lavalink-jar',
            name: 'Lavalink.jar',
            status: 'success',
            message: 'File tồn tại',
            fixable: false
        });
    } else {
        checks.push({
            id: 'lavalink-jar',
            name: 'Lavalink.jar',
            status: 'error',
            message: 'Không tìm thấy file Lavalink.jar',
            fixable: true,
            fixAction: 'download-lavalink'
        });
    }

    // Check 5: Port 2333 availability
    const portInUse = await isPortInUse(2333);
    if (portInUse && !lavalinkRunning) {
        checks.push({
            id: 'port-2333',
            name: 'Port 2333',
            status: 'error',
            message: 'Port đang bị chiếm bởi tiến trình khác',
            fixable: true,
            fixAction: 'kill-port'
        });
    } else {
        checks.push({
            id: 'port-2333',
            name: 'Port 2333',
            status: 'success',
            message: portInUse ? 'Lavalink đang sử dụng' : 'Port khả dụng',
            fixable: false
        });
    }

    return {
        checks,
        allPassed: checks.every(c => c.status === 'success'),
        hasErrors: checks.some(c => c.status === 'error')
    };
});

/**
 * Fix pre-flight check issues
 */
ipcMain.handle('fix-preflight-issue', async (event, botPath, fixAction) => {
    switch (fixAction) {
        case 'npm-install':
            return await runNpmInstall(botPath);
        case 'copy-env-example':
            return await copyEnvExample(botPath);
        case 'kill-port':
            const killed = await killProcessByPort(2333);
            return { success: killed, message: killed ? 'Đã tắt tiến trình' : 'Không thể tắt tiến trình' };
        default:
            return { success: false, message: 'Hành động không được hỗ trợ' };
    }
});

/**
 * Run npm install in bot directory
 */
async function runNpmInstall(botPath) {
    return new Promise(resolve => {
        const npmProcess = spawn('npm', ['install'], {
            cwd: botPath,
            shell: true
        });

        let output = '';

        npmProcess.stdout.on('data', data => {
            output += data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('npm-install-output', data.toString());
            }
        });

        npmProcess.stderr.on('data', data => {
            output += data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('npm-install-output', data.toString());
            }
        });

        npmProcess.on('close', code => {
            resolve({
                success: code === 0,
                output,
                message: code === 0 ? 'Cài đặt dependencies thành công' : 'Lỗi khi cài đặt dependencies'
            });
        });

        npmProcess.on('error', error => {
            resolve({
                success: false,
                error: error.message,
                message: 'Không thể chạy npm install'
            });
        });
    });
}

/**
 * Copy .env.example to .env
 */
async function copyEnvExample(botPath) {
    try {
        const examplePath = path.join(botPath, '.env.example');
        const envPath = path.join(botPath, '.env');

        await fsPromises.copyFile(examplePath, envPath);
        return { success: true, message: 'Đã tạo file .env từ .env.example' };
    } catch (error) {
        return { success: false, error: error.message, message: 'Không thể copy file' };
    }
}

// ==================== P4-01: Sensitive Keys Configuration ====================

/**
 * List of sensitive key patterns to mask in .env editor
 * P4-01: Identify sensitive keys
 */
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
 * Required environment keys for bot operation
 * P4-04: Required keys validation
 */
const REQUIRED_ENV_KEYS = ['DISCORD_TOKEN'];

/**
 * Recommended environment keys for full functionality
 * P4-04: Recommended keys validation
 */
const RECOMMENDED_ENV_KEYS = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'];

/**
 * Check if a key is sensitive
 * P4-01: Helper function
 */
function isSensitiveKey(key) {
    const upperKey = key.toUpperCase();
    return SENSITIVE_KEY_PATTERNS.some(pattern => upperKey.includes(pattern));
}

/**
 * Parse .env content into key-value pairs
 */
function parseEnvContent(content) {
    const lines = content.split('\n');
    const env = {};
    const lineData = [];

    lines.forEach((line, index) => {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
            lineData.push({ type: 'comment', content: line, index });
            return;
        }

        // Parse key=value
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            const value = trimmed.substring(eqIndex + 1).trim();
            env[key] = value;
            lineData.push({
                type: 'env',
                key,
                value,
                isSensitive: isSensitiveKey(key),
                index,
                rawLine: line
            });
        } else {
            lineData.push({ type: 'other', content: line, index });
        }
    });

    return { env, lineData };
}

/**
 * Validate environment configuration
 * P4-04: Required keys validation
 */
function validateEnvConfig(envContent) {
    const { env } = parseEnvContent(envContent);
    const results = {
        valid: true,
        required: [],
        recommended: [],
        warnings: []
    };

    // Check required keys
    REQUIRED_ENV_KEYS.forEach(key => {
        const value = env[key];
        const isSet = value && !value.startsWith('your_') && value.length > 0;
        results.required.push({
            key,
            status: isSet ? 'valid' : 'missing',
            message: isSet ? 'Đã cấu hình' : 'Bắt buộc - chưa cấu hình'
        });
        if (!isSet) results.valid = false;
    });

    // Check recommended keys
    RECOMMENDED_ENV_KEYS.forEach(key => {
        const value = env[key];
        const isSet = value && !value.startsWith('your_') && value.length > 0;
        results.recommended.push({
            key,
            status: isSet ? 'valid' : 'warning',
            message: isSet ? 'Đã cấu hình' : 'Khuyến nghị - chưa cấu hình (nhạc Spotify sẽ không hoạt động)'
        });
    });

    // Add warnings for common issues
    if (env['DISCORD_TOKEN'] && env['DISCORD_TOKEN'].length < 50) {
        results.warnings.push('DISCORD_TOKEN có vẻ không hợp lệ (quá ngắn)');
    }

    return results;
}

// ==================== P4-04 to P4-06: Environment Validation IPC ====================

/**
 * Validate environment configuration
 * P4-04, P4-05, P4-06: Returns validation results
 */
ipcMain.handle('validate-env-config', async (event, botPath) => {
    try {
        const envResult = await readEnvFile(botPath);
        if (!envResult.exists && !envResult.isExample) {
            return {
                valid: false,
                required: REQUIRED_ENV_KEYS.map(key => ({
                    key,
                    status: 'missing',
                    message: 'File .env không tồn tại'
                })),
                recommended: [],
                warnings: ['Không tìm thấy file .env']
            };
        }
        return validateEnvConfig(envResult.content);
    } catch (error) {
        return {
            valid: false,
            error: error.message,
            required: [],
            recommended: [],
            warnings: ['Lỗi khi đọc file .env: ' + error.message]
        };
    }
});

/**
 * Get parsed env data with sensitivity info
 * P4-02: For masking sensitive values
 */
ipcMain.handle('get-env-parsed', async (event, botPath) => {
    try {
        const envResult = await readEnvFile(botPath);
        const { env, lineData } = parseEnvContent(envResult.content);
        return {
            success: true,
            exists: envResult.exists,
            isExample: envResult.isExample,
            env,
            lineData,
            sensitivePatterns: SENSITIVE_KEY_PATTERNS
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

/**
 * Check if .env.example exists and get its content for comparison
 * P4-08: .env.example import
 */
ipcMain.handle('get-env-example', async (event, botPath) => {
    const examplePath = path.join(botPath, '.env.example');
    try {
        await fsPromises.access(examplePath, fs.constants.F_OK);
        const content = await fsPromises.readFile(examplePath, 'utf8');
        return { exists: true, content };
    } catch {
        return { exists: false, content: '' };
    }
});

/**
 * Import/merge from .env.example
 * P4-08: .env.example import
 */
ipcMain.handle('import-env-example', async (event, botPath, mergeMode = 'merge') => {
    try {
        const envPath = path.join(botPath, '.env');
        const examplePath = path.join(botPath, '.env.example');

        // Get .env.example content
        let exampleContent;
        try {
            exampleContent = await fsPromises.readFile(examplePath, 'utf8');
        } catch {
            return { success: false, error: 'Không tìm thấy file .env.example' };
        }

        // Check if .env exists
        let envExists = false;
        let envContent = '';
        try {
            await fsPromises.access(envPath, fs.constants.F_OK);
            envContent = await fsPromises.readFile(envPath, 'utf8');
            envExists = true;
        } catch {
            envExists = false;
        }

        if (mergeMode === 'replace' || !envExists) {
            // Simply copy .env.example to .env
            await fsPromises.writeFile(envPath, exampleContent, 'utf8');
            return { success: true, mode: 'replaced', message: 'Đã tạo file .env từ .env.example' };
        }

        // Merge mode: keep existing values, add missing keys from example
        const { env: currentEnv } = parseEnvContent(envContent);
        const { lineData: exampleLineData } = parseEnvContent(exampleContent);

        let mergedContent = '';
        const processedKeys = new Set();

        // Process each line from example
        exampleLineData.forEach(line => {
            if (line.type === 'comment' || line.type === 'other') {
                mergedContent += line.content + '\n';
            } else if (line.type === 'env') {
                processedKeys.add(line.key);
                // Keep existing value if present, otherwise use example
                const value = currentEnv[line.key] !== undefined ? currentEnv[line.key] : line.value;
                mergedContent += `${line.key}=${value}\n`;
            }
        });

        // Add any existing keys that are not in example
        Object.keys(currentEnv).forEach(key => {
            if (!processedKeys.has(key)) {
                mergedContent += `${key}=${currentEnv[key]}\n`;
            }
        });

        await fsPromises.writeFile(envPath, mergedContent.trim(), 'utf8');
        return { success: true, mode: 'merged', message: 'Đã merge từ .env.example' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

/**
 * Export terminal logs to file
 * P3-05: Export logs button functionality
 */
ipcMain.handle('export-logs', async (event, terminalType, logs) => {
    const date = new Date().toISOString().split('T')[0];
    const defaultFilename = `miyao-${terminalType}-${date}.log`;

    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Xuất logs',
        defaultPath: defaultFilename,
        filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }]
    });

    if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
    }

    try {
        await fsPromises.writeFile(result.filePath, logs, 'utf8');
        return { success: true, filePath: result.filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ==================== P7-01: Database Backup Feature ====================

/**
 * Get database info
 * P7-01: Check if database exists and get its stats
 */
async function getDatabaseInfo(botPath) {
    const dbPath = path.join(botPath, 'data', 'miyao.db');
    
    try {
        const stats = await fsPromises.stat(dbPath);
        const sizeKB = Math.round(stats.size / 1024);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        return {
            exists: true,
            path: dbPath,
            size: stats.size,
            sizeFormatted: sizeKB > 1024 ? `${sizeMB} MB` : `${sizeKB} KB`,
            lastModified: stats.mtime.toISOString(),
            lastModifiedFormatted: stats.mtime.toLocaleString('vi-VN')
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { exists: false, path: dbPath, error: 'Database không tồn tại' };
        }
        return { exists: false, path: dbPath, error: error.message };
    }
}

/**
 * List existing backups
 * P7-01: List all backup files in the backup directory
 */
async function listDatabaseBackups(botPath) {
    const backupDir = path.join(botPath, 'data', 'backups');
    
    try {
        // Create backup directory if it doesn't exist
        await fsPromises.mkdir(backupDir, { recursive: true });
        
        const files = await fsPromises.readdir(backupDir);
        const backups = [];
        
        for (const file of files) {
            if (file.startsWith('miyao_backup_') && file.endsWith('.db')) {
                const filePath = path.join(backupDir, file);
                try {
                    const stats = await fsPromises.stat(filePath);
                    const sizeKB = Math.round(stats.size / 1024);
                    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                    
                    // Parse timestamp from filename: miyao_backup_YYYYMMDD_HHMMSS.db
                    const match = file.match(/miyao_backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.db/);
                    let dateFormatted = 'Unknown';
                    if (match) {
                        const [, year, month, day, hour, minute, second] = match;
                        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
                        dateFormatted = date.toLocaleString('vi-VN');
                    }
                    
                    backups.push({
                        filename: file,
                        path: filePath,
                        size: stats.size,
                        sizeFormatted: sizeKB > 1024 ? `${sizeMB} MB` : `${sizeKB} KB`,
                        createdAt: stats.birthtime.toISOString(),
                        dateFormatted
                    });
                } catch (e) {
                    // Skip files that can't be read
                }
            }
        }
        
        // Sort by creation date, newest first
        backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return { success: true, backups, backupDir };
    } catch (error) {
        return { success: false, error: error.message, backups: [] };
    }
}

/**
 * Create database backup
 * P7-01: Backup the SQLite database with timestamp
 */
async function createDatabaseBackup(botPath, customName = null) {
    const dbPath = path.join(botPath, 'data', 'miyao.db');
    const backupDir = path.join(botPath, 'data', 'backups');
    
    try {
        // Check if source database exists
        try {
            await fsPromises.access(dbPath, fs.constants.F_OK);
        } catch {
            return { success: false, error: 'Database không tồn tại' };
        }
        
        // Create backup directory if it doesn't exist
        await fsPromises.mkdir(backupDir, { recursive: true });
        
        // Generate backup filename with timestamp
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
        const filename = customName 
            ? `miyao_backup_${customName}_${timestamp}.db`
            : `miyao_backup_${timestamp}.db`;
        const backupPath = path.join(backupDir, filename);
        
        // Check if bot is running - warn user
        const botIsRunning = botRunning;
        
        // Copy the database file
        // For SQLite, we should also copy WAL and SHM files if they exist
        await fsPromises.copyFile(dbPath, backupPath);
        
        // Try to copy WAL file if exists
        const walPath = dbPath + '-wal';
        const backupWalPath = backupPath + '-wal';
        try {
            await fsPromises.access(walPath, fs.constants.F_OK);
            await fsPromises.copyFile(walPath, backupWalPath);
        } catch {
            // WAL doesn't exist or can't be copied, that's ok
        }
        
        // Try to copy SHM file if exists
        const shmPath = dbPath + '-shm';
        const backupShmPath = backupPath + '-shm';
        try {
            await fsPromises.access(shmPath, fs.constants.F_OK);
            await fsPromises.copyFile(shmPath, backupShmPath);
        } catch {
            // SHM doesn't exist or can't be copied, that's ok
        }
        
        // Get backup file size
        const stats = await fsPromises.stat(backupPath);
        const sizeKB = Math.round(stats.size / 1024);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        return {
            success: true,
            filename,
            path: backupPath,
            size: stats.size,
            sizeFormatted: sizeKB > 1024 ? `${sizeMB} MB` : `${sizeKB} KB`,
            timestamp: now.toISOString(),
            warning: botIsRunning ? 'Bot đang chạy - backup có thể không hoàn chỉnh. Khuyến nghị dừng bot trước khi backup.' : null
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Restore database from backup
 * P7-01: Restore database from a backup file
 */
async function restoreDatabaseBackup(botPath, backupFilename) {
    const dbPath = path.join(botPath, 'data', 'miyao.db');
    const backupDir = path.join(botPath, 'data', 'backups');
    const backupPath = path.join(backupDir, backupFilename);
    
    try {
        // Check if backup file exists
        try {
            await fsPromises.access(backupPath, fs.constants.F_OK);
        } catch {
            return { success: false, error: 'File backup không tồn tại' };
        }
        
        // Check if bot is running - MUST stop first
        if (botRunning) {
            return { 
                success: false, 
                error: 'Bot đang chạy. Vui lòng dừng bot trước khi restore database.',
                requireStop: true
            };
        }
        
        // Create a safety backup of current database before restoring
        const now = new Date();
        const safetyTimestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
        const safetyBackupPath = path.join(backupDir, `miyao_pre_restore_${safetyTimestamp}.db`);
        
        try {
            await fsPromises.access(dbPath, fs.constants.F_OK);
            await fsPromises.copyFile(dbPath, safetyBackupPath);
        } catch {
            // Current database doesn't exist, that's ok
        }
        
        // Remove existing database files (including WAL and SHM)
        const filesToRemove = [dbPath, dbPath + '-wal', dbPath + '-shm'];
        for (const file of filesToRemove) {
            try {
                await fsPromises.unlink(file);
            } catch {
                // File doesn't exist, that's ok
            }
        }
        
        // Copy backup to database location
        await fsPromises.copyFile(backupPath, dbPath);
        
        // Also copy WAL and SHM if they exist in backup
        try {
            await fsPromises.access(backupPath + '-wal', fs.constants.F_OK);
            await fsPromises.copyFile(backupPath + '-wal', dbPath + '-wal');
        } catch {
            // Backup WAL doesn't exist, that's ok
        }
        
        try {
            await fsPromises.access(backupPath + '-shm', fs.constants.F_OK);
            await fsPromises.copyFile(backupPath + '-shm', dbPath + '-shm');
        } catch {
            // Backup SHM doesn't exist, that's ok
        }
        
        return {
            success: true,
            restoredFrom: backupFilename,
            safetyBackup: `miyao_pre_restore_${safetyTimestamp}.db`,
            message: 'Database đã được khôi phục thành công. Hãy khởi động lại bot để áp dụng.'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a database backup
 * P7-01: Delete a specific backup file
 */
async function deleteDatabaseBackup(botPath, backupFilename) {
    const backupDir = path.join(botPath, 'data', 'backups');
    const backupPath = path.join(backupDir, backupFilename);
    
    try {
        // Security check: ensure filename is valid
        if (!backupFilename.startsWith('miyao_') || !backupFilename.endsWith('.db')) {
            return { success: false, error: 'Tên file backup không hợp lệ' };
        }
        
        // Check if file exists
        try {
            await fsPromises.access(backupPath, fs.constants.F_OK);
        } catch {
            return { success: false, error: 'File backup không tồn tại' };
        }
        
        // Delete the backup file and associated WAL/SHM files
        await fsPromises.unlink(backupPath);
        
        try {
            await fsPromises.unlink(backupPath + '-wal');
        } catch {
            // WAL doesn't exist, that's ok
        }
        
        try {
            await fsPromises.unlink(backupPath + '-shm');
        } catch {
            // SHM doesn't exist, that's ok
        }
        
        return { success: true, deleted: backupFilename };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Export backup to custom location
 * P7-01: Export a backup file to user-selected location
 */
async function exportDatabaseBackup(botPath, backupFilename = null) {
    let sourcePath;
    let defaultFilename;
    
    if (backupFilename) {
        // Export specific backup
        sourcePath = path.join(botPath, 'data', 'backups', backupFilename);
        defaultFilename = backupFilename;
    } else {
        // Export current database
        sourcePath = path.join(botPath, 'data', 'miyao.db');
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
        defaultFilename = `miyao_export_${timestamp}.db`;
    }
    
    // Check if source exists
    try {
        await fsPromises.access(sourcePath, fs.constants.F_OK);
    } catch {
        return { success: false, error: 'File không tồn tại' };
    }
    
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Xuất Database Backup',
        defaultPath: defaultFilename,
        filters: [
            { name: 'SQLite Database', extensions: ['db'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    
    if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
    }
    
    try {
        await fsPromises.copyFile(sourcePath, result.filePath);
        return { success: true, exportedTo: result.filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Import backup from external location
 * P7-01: Import a backup file from user-selected location
 */
async function importDatabaseBackup(botPath) {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Nhập Database Backup',
        filters: [
            { name: 'SQLite Database', extensions: ['db'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });
    
    if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
    }
    
    const importPath = result.filePaths[0];
    const backupDir = path.join(botPath, 'data', 'backups');
    
    try {
        // Create backup directory if it doesn't exist
        await fsPromises.mkdir(backupDir, { recursive: true });
        
        // Generate filename for imported backup
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
        const filename = `miyao_imported_${timestamp}.db`;
        const destPath = path.join(backupDir, filename);
        
        // Copy the imported file
        await fsPromises.copyFile(importPath, destPath);
        
        // Get file info
        const stats = await fsPromises.stat(destPath);
        const sizeKB = Math.round(stats.size / 1024);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        return {
            success: true,
            filename,
            path: destPath,
            sizeFormatted: sizeKB > 1024 ? `${sizeMB} MB` : `${sizeKB} KB`,
            importedFrom: importPath
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==================== P7-01: Database Backup IPC Handlers ====================

ipcMain.handle('get-database-info', async (event, botPath) => {
    return await getDatabaseInfo(botPath);
});

ipcMain.handle('list-database-backups', async (event, botPath) => {
    return await listDatabaseBackups(botPath);
});

ipcMain.handle('create-database-backup', async (event, botPath, customName) => {
    return await createDatabaseBackup(botPath, customName);
});

ipcMain.handle('restore-database-backup', async (event, botPath, backupFilename) => {
    return await restoreDatabaseBackup(botPath, backupFilename);
});

ipcMain.handle('delete-database-backup', async (event, botPath, backupFilename) => {
    return await deleteDatabaseBackup(botPath, backupFilename);
});

ipcMain.handle('export-database-backup', async (event, botPath, backupFilename) => {
    return await exportDatabaseBackup(botPath, backupFilename);
});

ipcMain.handle('import-database-backup', async (event, botPath) => {
    return await importDatabaseBackup(botPath);
});

// ==================== P6-03: Tray Settings IPC Handlers ====================

ipcMain.handle('get-tray-settings', () => {
    const store = getStore();
    return {
        minimizeToTray: store.get('minimizeToTray'),
        closeToTray: store.get('closeToTray'),
        notificationsEnabled: store.get('notificationsEnabled')
    };
});

ipcMain.handle('set-tray-settings', (event, settings) => {
    const store = getStore();
    if (settings.minimizeToTray !== undefined) {
        store.set('minimizeToTray', settings.minimizeToTray);
    }
    if (settings.closeToTray !== undefined) {
        store.set('closeToTray', settings.closeToTray);
    }
    if (settings.notificationsEnabled !== undefined) {
        store.set('notificationsEnabled', settings.notificationsEnabled);
    }
    return { success: true };
});

// ==================== App Lifecycle ====================

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', async () => {
    // This is handled by the close event with confirmation
    if (process.platform !== 'darwin') {
        if (isQuitting) {
            // P6-01: Destroy tray on quit
            if (tray) {
                tray.destroy();
            }
            app.quit();
        }
    }
});

app.on('before-quit', async event => {
    if (!isQuitting) {
        event.preventDefault();
        // Let the window handle the quit confirmation
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('confirm-quit');
        } else {
            isQuitting = true;
            await cleanupAllProcesses();
            // P6-01: Destroy tray on quit
            if (tray) {
                tray.destroy();
            }
            app.quit();
        }
    }
});
