/**
 * Plugin-Backend Entry Point
 * Läuft im UXP Plugin-Kontext mit Zugriff auf die Premiere Pro API.
 * Kommuniziert mit dem Webview über den Bolt Messaging-Mechanismus.
 *
 * WICHTIG: `require("premierepro")` ist ausschließlich hier im Backend erlaubt.
 * Das Webview hat keinen direkten Zugriff auf die Premiere API.
 */
import type { BridgeRequest } from '../shared/message-types';
interface MessageEvent {
    data: BridgeRequest;
}
interface WebviewPanel {
    postMessage(message: unknown): void;
    addEventListener(event: string, handler: (e: MessageEvent) => void): void;
}
/**
 * Initialisiert den Message-Handler für die Webview-Kommunikation.
 * Wird vom Bolt UXP Framework beim Panel-Start aufgerufen.
 */
export declare function setupMessageHandler(panel: WebviewPanel): void;
export {};
