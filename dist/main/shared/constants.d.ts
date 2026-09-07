export declare const APP_NAME = "Orchestrator Agent";
export declare const APP_VERSION = "1.0.0";
export declare const DEFAULT_BACKEND_URL = "wss://localhost:8080/ws";
export declare const DEFAULT_CLAUDE_PATH = "/usr/local/bin/claude";
export declare const RECONNECT_INTERVAL_MS = 5000;
export declare const PING_INTERVAL_MS = 30000;
export declare const MAX_LOG_ENTRIES = 500;
export declare const WINDOW_WIDTH = 1200;
export declare const WINDOW_HEIGHT = 750;
export declare const WINDOW_MIN_WIDTH = 900;
export declare const WINDOW_MIN_HEIGHT = 550;
export declare const AGENT_MODELS: readonly [{
    readonly value: "claude-sonnet-5";
    readonly label: "Sonnet 5 — schnell & günstig (empfohlen)";
    readonly group: "Sonnet";
}, {
    readonly value: "claude-sonnet-4-6";
    readonly label: "Sonnet 4.6";
    readonly group: "Sonnet";
}, {
    readonly value: "claude-sonnet-4-5";
    readonly label: "Sonnet 4.5";
    readonly group: "Sonnet";
}, {
    readonly value: "claude-opus-5";
    readonly label: "Opus 5 — neueste, stärkste";
    readonly group: "Opus";
}, {
    readonly value: "claude-opus-4-8";
    readonly label: "Opus 4.8";
    readonly group: "Opus";
}, {
    readonly value: "claude-opus-4-7";
    readonly label: "Opus 4.7";
    readonly group: "Opus";
}, {
    readonly value: "claude-opus-4-6";
    readonly label: "Opus 4.6";
    readonly group: "Opus";
}, {
    readonly value: "claude-opus-4-5";
    readonly label: "Opus 4.5";
    readonly group: "Opus";
}, {
    readonly value: "claude-haiku-4-5";
    readonly label: "Haiku 4.5 — am günstigsten";
    readonly group: "Haiku";
}, {
    readonly value: "claude-fable-5";
    readonly label: "Fable 5 — max. Fähigkeit, sehr teuer";
    readonly group: "Fable";
}];
export type AgentModel = (typeof AGENT_MODELS)[number]['value'];
export declare const AGENT_MODEL_GROUPS: string[];
export declare const DEFAULT_AGENT_MODEL: string;
export declare const AGENT_EFFORTS: readonly [{
    readonly value: "low";
    readonly label: "Low — günstig, für einfache Aufgaben";
}, {
    readonly value: "medium";
    readonly label: "Medium — sparsam, meist ausreichend";
}, {
    readonly value: "high";
    readonly label: "High — ausgewogen (empfohlen)";
}, {
    readonly value: "xhigh";
    readonly label: "XHigh — für Coding & Agenten-Aufgaben";
}, {
    readonly value: "max";
    readonly label: "Max — teuer, nur wenn Korrektheit alles ist";
}];
export type AgentEffort = (typeof AGENT_EFFORTS)[number]['value'];
export declare const DEFAULT_AGENT_EFFORT: string;
/**
 * Effort level to actually pass for this model, or null when the flag must be omitted.
 * Sending an unsupported level is a hard API error, and the model is free-text (custom
 * ids), so anything unknown is passed through as-is and left to the CLI to judge.
 */
export declare function resolveEffortForModel(model: string, effort: string): string | null;
//# sourceMappingURL=constants.d.ts.map