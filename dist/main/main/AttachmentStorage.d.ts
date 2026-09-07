import type { MessageAttachment } from '../shared/types';
export interface SaveAttachmentInput {
    messageId: string;
    fileName: string;
    mimeType: string;
    data: Buffer;
}
export declare class AttachmentStorage {
    private rootDir;
    initialize(): void;
    save(input: SaveAttachmentInput): MessageAttachment;
    deleteForMessage(messageId: string): void;
}
export declare const attachmentStorage: AttachmentStorage;
//# sourceMappingURL=AttachmentStorage.d.ts.map