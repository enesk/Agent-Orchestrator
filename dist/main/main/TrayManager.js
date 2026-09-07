"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrayManager = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
class TrayManager {
    constructor(orchestrator) {
        this.tray = null;
        this.mainWindow = null;
        this.orchestrator = orchestrator;
    }
    init(mainWindow) {
        this.mainWindow = mainWindow;
        const iconPath = path_1.default.join(__dirname, '../../assets/tray-disconnected.png');
        const icon = electron_1.nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
        this.tray = new electron_1.Tray(icon);
        this.tray.setToolTip('Orchestrator Agent – Getrennt');
        this.updateContextMenu();
        this.tray.on('click', () => {
            if (this.mainWindow) {
                this.mainWindow.show();
                this.mainWindow.focus();
            }
        });
    }
    updateStatus(connected) {
        if (!this.tray)
            return;
        // Update icon
        const iconName = connected ? 'tray-connected.png' : 'tray-disconnected.png';
        const iconPath = path_1.default.join(__dirname, '../../assets', iconName);
        const icon = electron_1.nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
        this.tray.setImage(icon);
        // Update tooltip
        this.tray.setToolTip(connected ? 'Orchestrator Agent – Verbunden' : 'Orchestrator Agent – Getrennt');
        // Update context menu
        this.updateContextMenu();
    }
    updateContextMenu() {
        const state = this.orchestrator.getState();
        const menu = electron_1.Menu.buildFromTemplate([
            {
                label: 'Dashboard \u00f6ffnen',
                click: () => {
                    if (this.mainWindow) {
                        this.mainWindow.show();
                        this.mainWindow.focus();
                    }
                },
            },
            { type: 'separator' },
            {
                label: `Status: ${state.connected ? 'Verbunden' : 'Getrennt'}`,
                enabled: false,
            },
            {
                label: `Sessions: ${state.activeSessions}`,
                enabled: false,
            },
            { type: 'separator' },
            {
                label: 'Beenden',
                click: () => {
                    this.orchestrator.destroy();
                    electron_1.app.quit();
                },
            },
        ]);
        this.tray?.setContextMenu(menu);
    }
    destroy() {
        this.tray?.destroy();
        this.tray = null;
    }
}
exports.TrayManager = TrayManager;
//# sourceMappingURL=TrayManager.js.map