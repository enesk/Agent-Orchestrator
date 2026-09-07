# Orchestrator Agent

Eine lokale Desktop-App, in der mehrere KI-Agenten gemeinsam an echten Code-Repos auf der
eigenen Festplatte arbeiten. Man chattet mit ihnen wie in Slack, führt Tickets, lässt
Dokumente schreiben und kann ganze Vorhaben autonom abarbeiten lassen.

Jeder Agent ist ein Aufruf der Claude Code CLI mit eigenem Systemprompt, Modell und
Effort-Level — ausgeführt im konfigurierten Projektordner. Es gibt kein Backend, keinen
Login und keine Cloud: alle Daten liegen in einer lokalen SQLite-Datei.

## Voraussetzungen

- **Node.js 20 oder neuer**
- **Claude Code CLI** (`claude`) im `PATH` oder mit hinterlegtem Pfad in den Einstellungen
- macOS (Windows und Linux sind nicht getestet)

## Loslegen

```bash
npm install     # installiert Abhängigkeiten und baut better-sqlite3 für Electron
npm run dev     # startet die App im Entwicklungsmodus
```

Bricht `npm run dev` mit „Electron uninstall" ab, hat `npm install` das Electron-Binary nicht
heruntergeladen (kommt hinter Proxys und in Sandboxes vor). Dann einmal nachholen:

```bash
node node_modules/electron/install.js
```

Weitere Skripte:

```bash
npm run typecheck      # TypeScript prüfen
npm run test:security  # Sicherheitstests (Pfadprüfung der Anhänge, MCP-Token)
npm run dist:mac       # macOS-Paket (DMG) nach release/ bauen
```

Das DMG landet unter `release/`. Gebaut wird ausschließlich für macOS; Windows und Linux
sind nicht vorgesehen.

## Wo liegen die Daten?

In `app.getPath('userData')`, das der Start bewusst auf einen **eigenen v2-Ordner** umbiegt
(macOS: `~/Library/Application Support/Orchestrator Agent v2/`):

- `orchestrator.db` — SQLite-Datenbank (WAL-Modus)
- `attachments/` — hochgeladene Dateien, ausgeliefert über das `attachment://`-Protokoll
- `settings.json` — Claude-Pfad, Tray- und Hinweis-Einstellungen

Version 1 benutzt den Ordner `orchestrator-agent` und legt dort eine gleichnamige
`orchestrator.db` in einem völlig anderen Schema ab. Die Trennung ist nötig, weil beide
Schemata sonst in derselben Datei landen und die App an `no such column: …` stirbt. Findet v2
trotzdem eine fremde Datenbank, bricht es beim Start mit einer Meldung ab, statt halb
weiterzulaufen.

## Architektur in Kurzform

Drei Prozesse aus einem `electron-vite`-Setup:

- **Main** (`src/main/`) — Fenster und Tray, SQLite samt Migrationen, IPC-Handler, die
  Claude-CLI-Anbindung und der lokale MCP-Werkzeugserver.
- **Preload** (`src/preload/preload.ts`) — baut `window.api` aus dem IPC-Vertrag.
  `contextIsolation` ist an, `nodeIntegration` aus.
- **Renderer** (`src/renderer/`) — React 18, Tailwind, Zustand-Stores. Kennt keine Node-APIs
  und erreicht den Main-Prozess nur über `window.api`.

Vier Entscheidungen prägen den Rest:

1. **Ein einziger `ClaudeRunner`.** Jeder Claude-Aufruf — Chat wie autonomes Vorhaben — geht
   durch `ClaudeRunner.run()`. Er spawnt `claude -p --output-format stream-json …` mit
   `cwd` = Projektpfad und liefert Text, Denkschritte und Werkzeugaufrufe als Events.
2. **Werkzeuge statt Textmuster** (siehe unten).
3. **Agenten sind global und haben eine Rolle** (`worker | planner | pm | reviewer`).
   Zuständigkeiten werden über die Rolle aufgelöst, nie über Agentennamen.
4. **Contract-First.** `src/shared/ipc-contract.ts` beschreibt jeden IPC-Kanal einmal mit
   Zod-Schemas; `window.api` und die Main-Handler leiten sich daraus ab.

Ausführlich: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), Kurzfassung für Agenten in
[CLAUDE.md](./CLAUDE.md).

## Das Werkzeug-Protokoll

Agenten ändern **nichts** dadurch, dass sie etwas in den Chat schreiben. Tickets, Ticketstatus,
Dokumente und Erinnerungen ändern sie ausschließlich über **MCP-Werkzeuge**.

Dafür startet die App beim Hochfahren einen lokalen MCP-Server auf `127.0.0.1` mit einem
zufälligen Port. Vor jedem CLI-Aufruf registriert der Main-Prozess ein Lauf-Token
(Projekt, Agent, optional Vorhaben und Ticket) und gibt dem Prozess über `--mcp-config` die
Server-URL samt Token im `Authorization`-Header mit. Der Server nimmt nur Anfragen mit
gültigem Token an und weiß dadurch, in wessen Namen ein Werkzeug läuft; nach dem Lauf wird das
Token wieder ungültig.

Zur Verfügung stehen unter anderem: Ticket anlegen, Ticket ändern, Ticket kommentieren,
Dokument speichern, etwas merken, Zwischenstand an ein Vorhaben melden. Jeder Aufruf erscheint
im Chat als Werkzeug-Chip.

Der Grund für diese Strenge: In Version 1 wurden Absichten per Regex aus dem Fließtext gelesen
(`[TICKET_CREATE: …]`, Statuswechsel aus Sätzen). Sobald ein Agent normal über Tickets sprach,
ging das schief — „#3 ist noch nicht fertig" schloss Ticket 3. Ein Werkzeugaufruf ist dagegen
eindeutig, hat ein Schema und kann mit einer Fehlermeldung an das Modell zurückgehen.
