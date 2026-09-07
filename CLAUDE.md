# Orchestrator Agent v2

Rein lokale Electron-Desktop-App für einen einzelnen Nutzer. Slack-artige Oberfläche, in der
man mit mehreren KI-Agenten gleichzeitig chattet, Tickets führt und Dokumente schreiben lässt.
Jeder Agent ist ein Aufruf der **Claude Code CLI** (`claude -p`) mit eigenem Systemprompt,
Modell und Effort-Level, ausgeführt mit `cwd` = dem konfigurierten Projektpfad.

**Kein Backend, kein Server, kein Login, keine Cloud.** Alles liegt in SQLite unter `userData`.
Die einzige Außenverbindung ist die Claude-CLI selbst.

## Stack

Electron + electron-vite · React 18 + TypeScript (strict) · Tailwind · Zustand ·
better-sqlite3 mit nummerierten SQL-Migrationen · @modelcontextprotocol/sdk · zod ·
react-markdown + remark-gfm · electron-store. Animationen als CSS-Transitions —
kein Framer Motion, kein Tiptap, keine Icon-Bibliothek.

## Ordnerstruktur

```
src/main/
  app/        Bootstrap, Fenster, Tray, Notifications, attachment://-Protokoll, Settings
  db/         connection.ts, migrations/NNN_*.sql, repositories/
  claude/     ClaudeCli.ts, ClaudeRunner.ts, StreamParser.ts, SessionCache.ts
  mcp/        McpServer.ts, RunContextRegistry.ts, tools/
  agents/  chat/  tickets/  documents/  memory/  projects/  goals/
  ipc/        Ein Handler-Modul pro Domäne + registry.ts
  Logger.ts
src/shared/   types.ts, ipc-contract.ts, constants.ts
src/preload/  preload.ts
src/renderer/ features/, layout/, store/, ui/, App.tsx, main.tsx, index.css
```

## Architektur-Kernentscheidungen

1. **Ein einziger `ClaudeRunner`.** Alles, was Claude aufruft — Chat wie autonomer Goal-Loop —
   geht durch `ClaudeRunner.run()`. Der Goal-Loop ruft ihn direkt auf, nicht über eine
   Chat-Nachricht plus Datenbank-Diff.
2. **Werkzeuge statt Textmuster.** Tickets, Status, Dokumente und Erinnerungen ändern Agenten
   ausschließlich über MCP-Tools eines lokalen Servers auf 127.0.0.1. Keine Regex-Erkennung von
   Tags oder Statusänderungen aus Fließtext.
3. **Agenten sind global und haben eine Rolle** (`worker | planner | pm | reviewer`).
   Zuständigkeiten werden über die Rolle aufgelöst — **keine Agentennamen im Code**.
4. **Contract-First.** `src/shared/ipc-contract.ts` definiert jeden IPC-Kanal einmal mit
   Zod-Schemas. `window.api` und die Main-Handler leiten sich daraus ab.
5. **Token-Sparsamkeit.** CLI-Sessions werden pro Scope (Projekt + Agent [+ Goal/Ticket])
   über `--resume` wiederverwendet und nach `SESSION_MAX_TURNS` in Rente geschickt.

## Arbeitsregeln

- **Sprache: Deutsch** für alle UI-Texte, Buttons, Labels, Fehlermeldungen. Kein i18n-Layer,
  Strings stehen direkt im JSX. Code, Variablen und Kommentare auf Englisch.
- **Keine Tests**, außer an sicherheitsrelevanten Stellen (aktuell: `npm run test:security`
  für die Pfadprüfung des `attachment://`-Protokolls).
- **Niemals** Test-Suites oder vollständige Builds laufen lassen (`npm test`, `jest`,
  `npm run build`) — zu langsam. Absicherung ist `npm run typecheck`.
- **Keine neuen Abhängigkeiten** ohne Not.
- Keine Hex-Werte im JSX — die Palette steht in `tailwind.config.js`.
- Row → Domänentyp-Mapping (snake_case → camelCase, JSON parsen) gehört in die Repositories,
  nicht in die Services.

## Befehle

```bash
npm run dev            # App starten
npm run typecheck      # Absicherung
npm run test:security  # Sicherheitstests
```
