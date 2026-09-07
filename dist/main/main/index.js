"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const url_1 = __importDefault(require("url"));
const Orchestrator_1 = require("./Orchestrator");
const TrayManager_1 = require("./TrayManager");
const StoreManager_1 = require("./StoreManager");
const Logger_1 = require("./Logger");
const constants_1 = require("../shared/constants");
electron_1.protocol.registerSchemesAsPrivileged([
    { scheme: 'attachment', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
let mainWindow = null;
let trayManager;
function createWindow() {
    const isMac = process.platform === 'darwin';
    mainWindow = new electron_1.BrowserWindow({
        width: constants_1.WINDOW_WIDTH,
        height: constants_1.WINDOW_HEIGHT,
        minWidth: constants_1.WINDOW_MIN_WIDTH,
        minHeight: constants_1.WINDOW_MIN_HEIGHT,
        title: 'Orchestrator Agent',
        titleBarStyle: isMac ? 'hiddenInset' : 'default',
        backgroundColor: '#0a0a0f',
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, '../../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    // Show window when ready to avoid flash
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../renderer/index.html'));
    }
    mainWindow.on('close', (e) => {
        const settings = (0, StoreManager_1.getSettings)();
        if (settings.minimizeToTray) {
            e.preventDefault();
            mainWindow?.hide();
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    Orchestrator_1.orchestrator.setMainWindow(mainWindow);
    trayManager.init(mainWindow);
    // Update tray when state changes
    Orchestrator_1.orchestrator.on('state-update', () => {
        const state = Orchestrator_1.orchestrator.getState();
        trayManager.updateStatus(state.connected);
    });
}
electron_1.app.whenReady().then(async () => {
    (0, Logger_1.log)('info', 'Orchestrator Agent starting...');
    // Serve user-data attachment files via attachment:// scheme
    const attachmentsRoot = path_1.default.join(electron_1.app.getPath('userData'), 'attachments');
    electron_1.protocol.handle('attachment', (req) => {
        const requested = req.url.replace(/^attachment:\/\//, '');
        const decoded = decodeURIComponent(requested);
        const resolved = path_1.default.normalize(path_1.default.join(attachmentsRoot, decoded));
        if (!resolved.startsWith(attachmentsRoot)) {
            return new Response('Forbidden', { status: 403 });
        }
        return electron_1.net.fetch(url_1.default.pathToFileURL(resolved).toString());
    });
    trayManager = new TrayManager_1.TrayManager(Orchestrator_1.orchestrator);
    await Orchestrator_1.orchestrator.initialize();
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        Orchestrator_1.orchestrator.destroy();
        electron_1.app.quit();
    }
});
electron_1.app.on('before-quit', () => {
    Orchestrator_1.orchestrator.destroy();
    trayManager.destroy();
});
//# sourceMappingURL=index.js.map