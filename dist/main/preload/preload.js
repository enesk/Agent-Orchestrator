"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const ipc_channels_1 = require("../shared/ipc-channels");
const api = {
    getState: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IpcChannel.GET_STATE),
    connect: (url, token) => electron_1.ipcRenderer.invoke(ipc_channels_1.IpcChannel.CONNECT, { backendUrl: url, token }),
    disconnect: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IpcChannel.DISCONNECT),
    getLogs: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IpcChannel.GET_LOGS),
    getSettings: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IpcChannel.GET_SETTINGS),
    saveSettings: (settings) => electron_1.ipcRenderer.invoke(ipc_channels_1.IpcChannel.SAVE_SETTINGS, settings),
    minimizeToTray: () => electron_1.ipcRenderer.send(ipc_channels_1.IpcChannel.MINIMIZE_TO_TRAY),
    onStateUpdate: (callback) => {
        const listener = (_event, state) => callback(state);
        electron_1.ipcRenderer.on(ipc_channels_1.IpcChannel.STATE_UPDATE, listener);
        return () => { electron_1.ipcRenderer.removeListener(ipc_channels_1.IpcChannel.STATE_UPDATE, listener); };
    },
    onLogUpdate: (callback) => {
        const listener = (_event, entry) => callback(entry);
        electron_1.ipcRenderer.on(ipc_channels_1.IpcChannel.LOG_UPDATE, listener);
        return () => { electron_1.ipcRenderer.removeListener(ipc_channels_1.IpcChannel.LOG_UPDATE, listener); };
    },
};
electron_1.contextBridge.exposeInMainWorld('orchestrator', api);
//# sourceMappingURL=preload.js.map