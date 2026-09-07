"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachmentStorage = exports.AttachmentStorage = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const Logger_1 = require("./Logger");
const ALLOWED_MIME = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
class AttachmentStorage {
    initialize() {
        this.rootDir = path_1.default.join(electron_1.app.getPath('userData'), 'attachments');
        if (!fs_1.default.existsSync(this.rootDir)) {
            fs_1.default.mkdirSync(this.rootDir, { recursive: true });
        }
        (0, Logger_1.log)('info', `AttachmentStorage initialized at ${this.rootDir}`);
    }
    save(input) {
        if (!ALLOWED_MIME.has(input.mimeType.toLowerCase())) {
            throw new Error(`Unsupported mime type: ${input.mimeType}`);
        }
        if (input.data.length > MAX_BYTES) {
            throw new Error(`Attachment too large: ${input.data.length} bytes (max ${MAX_BYTES})`);
        }
        const dir = path_1.default.join(this.rootDir, input.messageId);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        const id = crypto_1.default.randomUUID();
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'image';
        const filePath = path_1.default.join(dir, `${id}_${safeName}`);
        fs_1.default.writeFileSync(filePath, input.data);
        return {
            id,
            fileName: input.fileName,
            mimeType: input.mimeType,
            localPath: filePath,
            size: input.data.length,
        };
    }
    deleteForMessage(messageId) {
        const dir = path_1.default.join(this.rootDir, messageId);
        if (fs_1.default.existsSync(dir)) {
            try {
                fs_1.default.rmSync(dir, { recursive: true, force: true });
            }
            catch (err) {
                (0, Logger_1.log)('warn', `Failed to delete attachments for ${messageId}: ${err.message}`);
            }
        }
    }
}
exports.AttachmentStorage = AttachmentStorage;
exports.attachmentStorage = new AttachmentStorage();
//# sourceMappingURL=AttachmentStorage.js.map