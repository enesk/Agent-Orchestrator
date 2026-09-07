"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeProcessManager = exports.ClaudeProcessManager = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const Logger_1 = require("./Logger");
// ── Class ───────────────────────────────────────────────────────────────────
class ClaudeProcessManager extends events_1.EventEmitter {
    constructor(claudePath = 'claude') {
        super();
        this.process = null;
        this.isStarted = false;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 5;
        this.restartDelay = 2000;
        this.outputBuffer = '';
        this.claudePath = claudePath;
    }
    // ── Public API ──────────────────────────────────────────────────────────
    async start() {
        // Resolve claude binary path if using the default
        if (this.claudePath === 'claude') {
            this.claudePath = await this.detectClaudePath();
        }
        // Verify claude binary exists
        const resolved = await this.verifyClaudeExists(this.claudePath);
        if (!resolved) {
            const msg = 'Claude Code CLI not found. Please install it first:\n' +
                '  npm install -g @anthropic-ai/claude-code\n' +
                'Or set the correct path in Settings.';
            (0, Logger_1.log)('error', msg);
            this.emit('error', msg);
            return;
        }
        (0, Logger_1.log)('info', `Starting Claude Code CLI: ${this.claudePath}`);
        this.process = (0, child_process_1.spawn)(this.claudePath, ['-p', '--verbose', '--output-format', 'stream-json', '--input-format', 'stream-json', '--dangerously-skip-permissions'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
        });
        this.process.stdout.setEncoding('utf8');
        // ── stdout ──────────────────────────────────────────────────────────
        this.process.stdout.on('data', (chunk) => {
            (0, Logger_1.log)('info', `[CPM] stdout chunk (${chunk.length} bytes): ${chunk.substring(0, 150)}`);
            this.outputBuffer += chunk;
            const lines = this.outputBuffer.split('\n');
            // Keep the last (potentially incomplete) line in the buffer
            this.outputBuffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                try {
                    const parsed = JSON.parse(trimmed);
                    (0, Logger_1.log)('info', `[CPM] Parsed event type="${parsed.type}"`);
                    this.emit('output', parsed);
                }
                catch {
                    (0, Logger_1.log)('info', `[CPM] Raw (not JSON): ${trimmed.substring(0, 100)}`);
                    this.emit('raw-output', trimmed);
                }
            }
        });
        // ── stderr ──────────────────────────────────────────────────────────
        this.process.stderr.setEncoding('utf8');
        this.process.stderr.on('data', (data) => {
            const text = data.trim();
            if (text) {
                (0, Logger_1.log)('error', `Claude stderr: ${text}`);
                this.emit('error', text);
            }
        });
        // ── close ───────────────────────────────────────────────────────────
        this.process.on('close', (code) => {
            this.isStarted = false;
            this.process = null;
            const exitCode = code ?? 1;
            (0, Logger_1.log)('warn', `Claude process exited with code ${exitCode}`);
            this.emit('crashed', exitCode);
            // Exponential backoff restart
            if (this.restartAttempts < this.maxRestartAttempts) {
                this.restartAttempts++;
                const delay = Math.min(this.restartDelay, 30000);
                (0, Logger_1.log)('info', `Restart attempt ${this.restartAttempts}/${this.maxRestartAttempts} in ${delay}ms`);
                setTimeout(() => {
                    this.start();
                }, delay);
                // Double delay for next attempt
                this.restartDelay = Math.min(this.restartDelay * 2, 30000);
            }
            else {
                const msg = `Claude process crashed ${this.maxRestartAttempts} times. Giving up. Please restart manually.`;
                (0, Logger_1.log)('error', msg);
                this.emit('fatal-error', msg);
            }
        });
        // ── spawn error ─────────────────────────────────────────────────────
        this.process.on('error', (err) => {
            this.isStarted = false;
            this.process = null;
            const msg = `Failed to spawn Claude process: ${err.message}`;
            (0, Logger_1.log)('error', msg);
            this.emit('error', msg);
        });
        this.isStarted = true;
        this.outputBuffer = '';
        (0, Logger_1.log)('info', 'Claude Code CLI started successfully');
        this.emit('ready');
    }
    async stop() {
        if (!this.process) {
            this.isStarted = false;
            this.emit('stopped');
            return;
        }
        (0, Logger_1.log)('info', 'Stopping Claude Code CLI...');
        // Prevent auto-restart on intentional stop
        const maxAttemptsBak = this.maxRestartAttempts;
        this.maxRestartAttempts = 0;
        const proc = this.process;
        await new Promise((resolve) => {
            const killTimer = setTimeout(() => {
                if (proc.exitCode === null) {
                    (0, Logger_1.log)('warn', 'Claude did not exit gracefully, sending SIGKILL');
                    proc.kill('SIGKILL');
                }
                resolve();
            }, 3000);
            proc.once('close', () => {
                clearTimeout(killTimer);
                resolve();
            });
            proc.kill('SIGTERM');
        });
        this.process = null;
        this.isStarted = false;
        this.restartAttempts = 0;
        this.restartDelay = 2000;
        this.maxRestartAttempts = maxAttemptsBak;
        (0, Logger_1.log)('info', 'Claude Code CLI stopped');
        this.emit('stopped');
    }
    sendCommand(input) {
        if (!this.isRunning()) {
            (0, Logger_1.log)('warn', '[CPM] Cannot send command: Claude process is not running');
            return;
        }
        (0, Logger_1.log)('info', `[CPM] isRunning=${this.isRunning()}, pid=${this.process?.pid}, sending ${input.length} chars`);
        // Format as stream-json message for --input-format stream-json
        const message = JSON.stringify({ type: 'user', content: input });
        this.process.stdin.write(message + '\n');
        (0, Logger_1.log)('info', `[CPM] Command sent: ${input.substring(0, 120)}${input.length > 120 ? '...' : ''}`);
        this.emit('command-sent', input);
    }
    isRunning() {
        return this.isStarted && this.process !== null && this.process.exitCode === null;
    }
    async detectClaudePath() {
        const isWindows = process.platform === 'win32';
        // 1. Try which/where (system PATH lookup)
        const whichCmd = isWindows ? 'where' : 'which';
        const pathFromSystem = await this.execQuiet(whichCmd, ['claude']);
        if (pathFromSystem)
            return pathFromSystem;
        // 2. Check known installation paths
        const candidates = isWindows
            ? [
                path_1.default.join(process.env.APPDATA ?? '', 'Claude', 'claude.exe'),
                'C:\\Program Files\\Claude\\claude.exe',
            ]
            : [
                path_1.default.join(process.env.HOME ?? '', '.claude', 'local', 'claude'),
                '/usr/local/bin/claude',
            ];
        for (const candidate of candidates) {
            if ((0, fs_1.existsSync)(candidate)) {
                (0, Logger_1.log)('info', `Detected Claude at: ${candidate}`);
                return candidate;
            }
        }
        // 3. Fallback – rely on $PATH
        (0, Logger_1.log)('info', 'Claude not found in known paths, falling back to "claude" from $PATH');
        return 'claude';
    }
    // ── Private helpers ───────────────────────────────────────────────────
    async verifyClaudeExists(cmdPath) {
        // If it's an absolute path, check the file directly
        if (path_1.default.isAbsolute(cmdPath)) {
            return (0, fs_1.existsSync)(cmdPath);
        }
        // Otherwise, try which/where
        const whichCmd = process.platform === 'win32' ? 'where' : 'which';
        const result = await this.execQuiet(whichCmd, [cmdPath]);
        return result !== null;
    }
    execQuiet(cmd, args) {
        return new Promise((resolve) => {
            (0, child_process_1.execFile)(cmd, args, { timeout: 5000 }, (error, stdout) => {
                if (error) {
                    resolve(null);
                    return;
                }
                const result = stdout.toString().trim().split('\n')[0]?.trim();
                resolve(result || null);
            });
        });
    }
}
exports.ClaudeProcessManager = ClaudeProcessManager;
// ── Singleton export ────────────────────────────────────────────────────────
exports.claudeProcessManager = new ClaudeProcessManager();
//# sourceMappingURL=ClaudeProcessManager.js.map