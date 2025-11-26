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
    validateBotDirectory: (dirPath) => ipcRenderer.invoke('validate-bot-directory', dirPath),
    getBotVersion: (botPath) => ipcRenderer.invoke('get-bot-version', botPath),
    
    // ==================== Environment ====================
    readEnv: (botPath) => ipcRenderer.invoke('read-env', botPath),
    writeEnv: (botPath, content) => ipcRenderer.invoke('write-env', botPath, content),
    
    // ==================== Lavalink ====================
    startLavalink: (botPath) => ipcRenderer.invoke('start-lavalink', botPath),
    stopLavalink: () => ipcRenderer.invoke('stop-lavalink'),
    getLavalinkStatus: () => ipcRenderer.invoke('get-lavalink-status'),
    
    // Lavalink event listeners
    onLavalinkOutput: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('lavalink-output', listener);
        return () => ipcRenderer.removeListener('lavalink-output', listener);
    },
    onLavalinkStatus: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('lavalink-status', listener);
        return () => ipcRenderer.removeListener('lavalink-status', listener);
    },
    onLavalinkError: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('lavalink-error', listener);
        return () => ipcRenderer.removeListener('lavalink-error', listener);
    },
    
    // ==================== Bot ====================
    startBot: (botPath) => ipcRenderer.invoke('start-bot', botPath),
    stopBot: () => ipcRenderer.invoke('stop-bot'),
    getBotStatus: () => ipcRenderer.invoke('get-bot-status'),
    deployCommands: (botPath) => ipcRenderer.invoke('deploy-commands', botPath),
    
    // Bot event listeners
    onBotOutput: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('bot-output', listener);
        return () => ipcRenderer.removeListener('bot-output', listener);
    },
    onBotStatus: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('bot-status', listener);
        return () => ipcRenderer.removeListener('bot-status', listener);
    },
    onBotError: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('bot-error', listener);
        return () => ipcRenderer.removeListener('bot-error', listener);
    },
    
    // Deploy event listeners
    onDeployOutput: (callback) => {
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
    onConfirmQuit: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('confirm-quit', listener);
        return () => ipcRenderer.removeListener('confirm-quit', listener);
    }
});
