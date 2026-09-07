"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.saveSettings = saveSettings;
exports.getToken = getToken;
exports.getBackendUrl = getBackendUrl;
const electron_store_1 = __importDefault(require("electron-store"));
const constants_1 = require("../shared/constants");
const defaults = {
    backendUrl: constants_1.DEFAULT_BACKEND_URL,
    userToken: '',
    autoStart: false,
    minimizeToTray: true,
    claudePath: constants_1.DEFAULT_CLAUDE_PATH,
};
const store = new electron_store_1.default({ defaults });
function getSettings() {
    return {
        backendUrl: store.get('backendUrl'),
        userToken: store.get('userToken'),
        autoStart: store.get('autoStart'),
        minimizeToTray: store.get('minimizeToTray'),
        claudePath: store.get('claudePath'),
    };
}
function saveSettings(settings) {
    for (const [key, value] of Object.entries(settings)) {
        store.set(key, value);
    }
}
function getToken() {
    return store.get('userToken');
}
function getBackendUrl() {
    return store.get('backendUrl');
}
exports.default = store;
//# sourceMappingURL=StoreManager.js.map