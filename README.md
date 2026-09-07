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

Weitere Skripte:

```bash
npm run typecheck      # TypeScript prüfen
npm run test:security  # Sicherheitstests (Pfadprüfung der Anhänge)
npm run dist:mac       # macOS-Paket bauen
```

## Wo liegen die Daten?

In `app.getPath('userData')`:

- `orchestrator.db` — SQLite-Datenbank (WAL-Modus)
- `attachments/` — hochgeladene Dateien, ausgeliefert über das `attachment://`-Protokoll
- `settings.json` — Claude-Pfad, Tray- und Hinweis-Einstellungen

## Architektur

Kurzfassung in [CLAUDE.md](./CLAUDE.md), ausführlich in
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
