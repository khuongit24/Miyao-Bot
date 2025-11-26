/**
 * Miyao Launcher - Main Process
 * Manages Lavalink and Discord Bot processes
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const Store = require('electron-store');
const semver = require('semver');

// Initialize persistent store
const store = new Store({
    name: 'miyao-launcher-config',
    defaults: {
        botPath: '',
        firstRun: true,
        windowBounds: { width: 1200, height: 800 }
    }
});

// Launcher version
const LAUNCHER_VERSION = {
    version: '1.1.0',
    build: '2025.11.26',
    codename: 'Aurora'
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
    return new Promise((resolve) => {
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
    return new Promise((resolve) => {
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
        } catch (e) { /* ignore */ }
        lavalinkProcess = null;
    }
    
    if (botProcess) {
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', botProcess.pid.toString(), '/f', '/t']);
            } else {
                botProcess.kill('SIGKILL');
            }
        } catch (e) { /* ignore */ }
        botProcess = null;
    }
    
    // Also kill by port to catch zombie processes
    cleanupPromises.push(killProcessByPort(2333)); // Lavalink default port
    
    // Kill any remaining java processes that might be Lavalink
    if (process.platform === 'win32') {
        cleanupPromises.push(new Promise((resolve) => {
            exec('wmic process where "commandline like \'%Lavalink%\'" call terminate', () => resolve());
        }));
    }
    
    await Promise.all(cleanupPromises);
    
    lavalinkRunning = false;
    botRunning = false;
}

/**
 * Create the main browser window
 */
function createWindow() {
    const { width, height } = store.get('windowBounds');
    
    // Check if icon exists
    const iconPath = path.join(__dirname, '../../assets/icon.png');
    const hasIcon = fs.existsSync(iconPath);
    
    mainWindow = new BrowserWindow({
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
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Save window bounds on resize
    mainWindow.on('resize', () => {
        const bounds = mainWindow.getBounds();
        store.set('windowBounds', { width: bounds.width, height: bounds.height });
    });

    // Handle window close - show confirmation if processes are running
    mainWindow.on('close', async (event) => {
        if (isQuitting) {
            return; // Allow close
        }
        
        // Check if any processes are running
        if (lavalinkRunning || botRunning) {
            event.preventDefault();
            // Send message to renderer to show confirmation dialog
            mainWindow.webContents.send('confirm-quit');
        } else {
            // No processes running, allow close
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
}

/**
 * Check system requirements
 */
async function checkRequirements() {
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
 */
async function validateBotDirectory(dirPath) {
    const result = {
        valid: false,
        version: null,
        error: null
    };

    try {
        // Check if package.json exists
        const packageJsonPath = path.join(dirPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            result.error = 'Không tìm thấy file package.json trong thư mục này';
            return result;
        }

        // Check if it's Miyao Bot
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
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

        // Check if index.js exists
        if (!fs.existsSync(path.join(dirPath, 'index.js'))) {
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
 */
async function getBotVersionInfo(botPath) {
    try {
        const versionFilePath = path.join(botPath, 'src', 'utils', 'version.js');
        if (!fs.existsSync(versionFilePath)) {
            // Fallback to package.json
            const packageJson = JSON.parse(fs.readFileSync(path.join(botPath, 'package.json'), 'utf8'));
            return {
                version: packageJson.version,
                build: 'N/A',
                codename: 'N/A',
                releaseDate: 'N/A'
            };
        }

        const versionContent = fs.readFileSync(versionFilePath, 'utf8');
        
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
 */
function readEnvFile(botPath) {
    const envPath = path.join(botPath, '.env');
    if (!fs.existsSync(envPath)) {
        // Check for .env.example
        const examplePath = path.join(botPath, '.env.example');
        if (fs.existsSync(examplePath)) {
            return {
                exists: false,
                content: fs.readFileSync(examplePath, 'utf8'),
                isExample: true
            };
        }
        return { exists: false, content: '', isExample: false };
    }
    return {
        exists: true,
        content: fs.readFileSync(envPath, 'utf8'),
        isExample: false
    };
}

/**
 * Write .env file
 */
function writeEnvFile(botPath, content) {
    const envPath = path.join(botPath, '.env');
    try {
        fs.writeFileSync(envPath, content, 'utf8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Start Lavalink server
 */
async function startLavalink(botPath) {
    if (lavalinkRunning) {
        return { success: false, error: 'Lavalink đang chạy' };
    }

    const lavalinkJar = findLavalinkJar(botPath);
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
                return { success: false, error: 'Port 2333 đang được sử dụng bởi tiến trình khác. Không thể tắt tự động.' };
            }
        } else {
            return { success: false, error: 'Port 2333 đang được sử dụng. Vui lòng tắt Lavalink đang chạy hoặc restart máy.' };
        }
    }

    try {
        lavalinkProcess = spawn('java', ['-jar', lavalinkJar], {
            cwd: botPath,
            shell: true
        });

        lavalinkRunning = true;

        lavalinkProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lavalink-output', output);
            }
        });

        lavalinkProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lavalink-output', output);
            }
        });

        lavalinkProcess.on('close', (code) => {
            lavalinkRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lavalink-status', { running: false, code });
            }
        });

        lavalinkProcess.on('error', (error) => {
            lavalinkRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lavalink-error', error.message);
            }
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Find Lavalink.jar file
 */
function findLavalinkJar(botPath) {
    // Check common locations
    const possiblePaths = [
        path.join(botPath, 'Lavalink.jar'),
        path.join(botPath, 'lavalink.jar'),
        path.join(botPath, 'lavalink', 'Lavalink.jar')
    ];

    for (const jarPath of possiblePaths) {
        if (fs.existsSync(jarPath)) {
            return jarPath;
        }
    }

    // Search for any .jar file with lavalink in the name
    try {
        const files = fs.readdirSync(botPath);
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
 */
function stopLavalink() {
    if (!lavalinkProcess) {
        return { success: false, error: 'Lavalink không đang chạy' };
    }

    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', lavalinkProcess.pid, '/f', '/t']);
        } else {
            lavalinkProcess.kill('SIGTERM');
        }
        lavalinkProcess = null;
        lavalinkRunning = false;
        return { success: true };
    } catch (error) {
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

        botProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('bot-output', output);
            }
        });

        botProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('bot-output', output);
            }
        });

        botProcess.on('close', (code) => {
            botRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('bot-status', { running: false, code });
            }
        });

        botProcess.on('error', (error) => {
            botRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('bot-error', error.message);
            }
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Stop Discord Bot
 */
function stopBot() {
    if (!botProcess) {
        return { success: false, error: 'Bot không đang chạy' };
    }

    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', botProcess.pid, '/f', '/t']);
        } else {
            botProcess.kill('SIGTERM');
        }
        botProcess = null;
        botRunning = false;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Deploy bot commands
 */
function deployCommands(botPath) {
    return new Promise((resolve) => {
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

        deployProcess.stdout.on('data', (data) => {
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

        deployProcess.stderr.on('data', (data) => {
            const text = data.toString();
            output += text;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('deploy-output', text);
            }
        });

        deployProcess.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: code === 0, output, code });
            }
        });

        deployProcess.on('error', (error) => {
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
 */
async function selectBotDirectory() {
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

// Config handlers
ipcMain.handle('get-config', () => {
    return {
        botPath: store.get('botPath'),
        firstRun: store.get('firstRun'),
        launcherVersion: LAUNCHER_VERSION,
        minBotVersion: MIN_BOT_VERSION
    };
});

ipcMain.handle('set-config', (event, key, value) => {
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

// .env handlers
ipcMain.handle('read-env', (event, botPath) => {
    return readEnvFile(botPath);
});

ipcMain.handle('write-env', (event, botPath, content) => {
    return writeEnvFile(botPath, content);
});

// Lavalink handlers
ipcMain.handle('start-lavalink', async (event, botPath) => {
    return await startLavalink(botPath);
});

ipcMain.handle('stop-lavalink', () => {
    return stopLavalink();
});

ipcMain.handle('get-lavalink-status', () => {
    return { running: lavalinkRunning };
});

// Bot handlers
ipcMain.handle('start-bot', (event, botPath) => {
    return startBot(botPath);
});

ipcMain.handle('stop-bot', () => {
    return stopBot();
});

ipcMain.handle('get-bot-status', () => {
    return { running: botRunning };
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
            app.quit();
        }
    }
});

app.on('before-quit', async (event) => {
    if (!isQuitting) {
        event.preventDefault();
        // Let the window handle the quit confirmation
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('confirm-quit');
        } else {
            isQuitting = true;
            await cleanupAllProcesses();
            app.quit();
        }
    }
});
