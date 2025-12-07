/**
 * Miyao Launcher - Preload Script
 * Securely exposes main process APIs to the renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('launcherAPI', {
    // ==================== Config ====================
    getConfig: () => ipcRenderer.invoke('get-config'),
    setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),

    // ==================== Requirements ====================
    checkRequirements: () => ipcRenderer.invoke('check-requirements'),

    // ==================== Bot Directory ====================
    selectBotDirectory: () => ipcRenderer.invoke('select-bot-directory'),
    validateBotDirectory: dirPath => ipcRenderer.invoke('validate-bot-directory', dirPath),
    getBotVersion: botPath => ipcRenderer.invoke('get-bot-version', botPath),

    // ==================== Environment ====================
    readEnv: botPath => ipcRenderer.invoke('read-env', botPath),
    writeEnv: (botPath, content) => ipcRenderer.invoke('write-env', botPath, content),

    // ==================== Lavalink ====================
    startLavalink: botPath => ipcRenderer.invoke('start-lavalink', botPath),
    stopLavalink: () => ipcRenderer.invoke('stop-lavalink'),
    getLavalinkStatus: () => ipcRenderer.invoke('get-lavalink-status'),

    // Lavalink event listeners
    onLavalinkOutput: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('lavalink-output', listener);
        return () => ipcRenderer.removeListener('lavalink-output', listener);
    },
    onLavalinkStatus: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('lavalink-status', listener);
        return () => ipcRenderer.removeListener('lavalink-status', listener);
    },
    onLavalinkError: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('lavalink-error', listener);
        return () => ipcRenderer.removeListener('lavalink-error', listener);
    },

    // ==================== Bot ====================
    startBot: botPath => ipcRenderer.invoke('start-bot', botPath),
    stopBot: () => ipcRenderer.invoke('stop-bot'),
    getBotStatus: () => ipcRenderer.invoke('get-bot-status'),

    // P1-07: Batch status call - returns all status in one IPC call
    getAllStatus: () => ipcRenderer.invoke('get-all-status'),

    deployCommands: botPath => ipcRenderer.invoke('deploy-commands', botPath),

    // Bot event listeners
    onBotOutput: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('bot-output', listener);
        return () => ipcRenderer.removeListener('bot-output', listener);
    },
    onBotStatus: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('bot-status', listener);
        return () => ipcRenderer.removeListener('bot-status', listener);
    },
    onBotError: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('bot-error', listener);
        return () => ipcRenderer.removeListener('bot-error', listener);
    },

    // Deploy event listeners
    onDeployOutput: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('deploy-output', listener);
        return () => ipcRenderer.removeListener('deploy-output', listener);
    },

    // ==================== Version ====================
    getLauncherVersion: () => ipcRenderer.invoke('get-launcher-version'),

    // ==================== Process Management ====================
    cleanupAllProcesses: () => ipcRenderer.invoke('cleanup-all-processes'),
    hasRunningProcesses: () => ipcRenderer.invoke('has-running-processes'),
    forceQuit: () => ipcRenderer.invoke('force-quit'),

    // Quit confirmation listener
    onConfirmQuit: callback => {
        const listener = () => callback();
        ipcRenderer.on('confirm-quit', listener);
        return () => ipcRenderer.removeListener('confirm-quit', listener);
    },

    // ==================== Pre-flight Checks (P2-09) ====================
    runPreflightChecks: botPath => ipcRenderer.invoke('run-preflight-checks', botPath),
    fixPreflightIssue: (botPath, fixAction) => ipcRenderer.invoke('fix-preflight-issue', botPath, fixAction),

    // npm install output listener
    onNpmInstallOutput: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('npm-install-output', listener);
        return () => ipcRenderer.removeListener('npm-install-output', listener);
    },

    // ==================== Log Export (P3-05) ====================
    exportLogs: (terminalType, logs) => ipcRenderer.invoke('export-logs', terminalType, logs),

    // ==================== P4: Environment Validation & Security ====================
    // P4-04 to P4-06: Environment validation
    validateEnvConfig: botPath => ipcRenderer.invoke('validate-env-config', botPath),

    // P4-02: Get parsed env with sensitivity info
    getEnvParsed: botPath => ipcRenderer.invoke('get-env-parsed', botPath),

    // P4-08: .env.example import
    getEnvExample: botPath => ipcRenderer.invoke('get-env-example', botPath),
    importEnvExample: (botPath, mergeMode) => ipcRenderer.invoke('import-env-example', botPath, mergeMode),

    // ==================== P6: System Tray & Notifications ====================
    // P6-03: Tray settings
    getTraySettings: () => ipcRenderer.invoke('get-tray-settings'),
    setTraySettings: settings => ipcRenderer.invoke('set-tray-settings', settings),

    // P6-02: Tray action listeners (triggered from tray context menu)
    onTrayStartAll: callback => {
        const listener = () => callback();
        ipcRenderer.on('tray-start-all', listener);
        return () => ipcRenderer.removeListener('tray-start-all', listener);
    },
    onTrayStopAll: callback => {
        const listener = () => callback();
        ipcRenderer.on('tray-stop-all', listener);
        return () => ipcRenderer.removeListener('tray-stop-all', listener);
    },

    // ==================== P7: Database Backup ====================
    // P7-01: Database backup operations
    getDatabaseInfo: botPath => ipcRenderer.invoke('get-database-info', botPath),
    listDatabaseBackups: botPath => ipcRenderer.invoke('list-database-backups', botPath),
    createDatabaseBackup: (botPath, customName) => ipcRenderer.invoke('create-database-backup', botPath, customName),
    restoreDatabaseBackup: (botPath, backupFilename) => ipcRenderer.invoke('restore-database-backup', botPath, backupFilename),
    deleteDatabaseBackup: (botPath, backupFilename) => ipcRenderer.invoke('delete-database-backup', botPath, backupFilename),
    exportDatabaseBackup: (botPath, backupFilename) => ipcRenderer.invoke('export-database-backup', botPath, backupFilename),
    importDatabaseBackup: botPath => ipcRenderer.invoke('import-database-backup', botPath),

    // P7-02: Auto-backup database (used when stopping bot)
    backupDatabase: botPath => ipcRenderer.invoke('backup-database', botPath),
    
    // P7-03: Database backup event listeners
    onDatabaseBackupComplete: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('database-backup-complete', listener);
        return () => ipcRenderer.removeListener('database-backup-complete', listener);
    },
    
    // Bot log listener (for backup notifications)
    onBotLog: callback => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('bot-log', listener);
        return () => ipcRenderer.removeListener('bot-log', listener);
    }
});
