import { BrowserWindow } from 'electron';
import { Orchestrator } from './Orchestrator';
export declare class TrayManager {
    private tray;
    private orchestrator;
    private mainWindow;
    constructor(orchestrator: Orchestrator);
    init(mainWindow: BrowserWindow): void;
    updateStatus(connected: boolean): void;
    private updateContextMenu;
    destroy(): void;
}
//# sourceMappingURL=TrayManager.d.ts.map