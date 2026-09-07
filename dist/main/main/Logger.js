"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLogCallback = setLogCallback;
exports.getLogEntries = getLogEntries;
exports.log = log;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const constants_1 = require("../shared/constants");
const crypto_1 = require("crypto");
const logDir = path_1.default.join(electron_1.app.getPath('userData'), 'logs');
const logger = winston_1.default.createLogger({
    level: 'debug',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.File({
            filename: path_1.default.join(logDir, 'error.log'),
            level: 'error',
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(logDir, 'combined.log'),
        }),
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple()),
        }),
    ],
});
const logBuffer = [];
let onLogCallback = null;
function addLogEntry(level, message, sessionId) {
    const entry = {
        id: (0, crypto_1.randomUUID)(),
        timestamp: new Date().toISOString(),
        level,
        message,
        sessionId,
    };
    logBuffer.push(entry);
    if (logBuffer.length > constants_1.MAX_LOG_ENTRIES) {
        logBuffer.shift();
    }
    onLogCallback?.(entry);
}
function setLogCallback(cb) {
    onLogCallback = cb;
}
function getLogEntries() {
    return [...logBuffer];
}
function log(level, message, sessionId) {
    logger.log(level, message, { sessionId });
    addLogEntry(level, message, sessionId);
}
exports.default = logger;
//# sourceMappingURL=Logger.js.map