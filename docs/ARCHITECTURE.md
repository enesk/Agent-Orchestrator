# Architektur

## Prozesse

Die App besteht aus den drei üblichen Electron-Prozessen, gebaut von einem einzigen
`electron-vite`-Setup:

| Prozess  | Einstieg                  | Aufgabe                                                     |
| -------- | ------------------------- | ----------------------------------------------------------- |
| Main     | `src/main/app/index.ts`   | Fenster, Tray, Datenbank, IPC, Claude-CLI, MCP-Server        |
| Preload  | `src/preload/preload.ts`  | Baut `window.api` aus dem IPC-Vertrag, sonst nichts          |
| Renderer | `src/renderer/main.tsx`   | React-Oberfläche, Zustand-Stores, keine Node-APIs            |

`contextIsolation` ist an, `nodeIntegration` aus. Der Renderer erreicht den Main-Prozess
ausschließlich über `window.api`.

## Contract-First

`src/shared/ipc-contract.ts` beschreibt **jeden** Kanal genau einmal:

```ts
export const ipcContract = {
  projects: {
    list: { request: z.void(), response: z.array(projectSchema) },
    create: { request: createProjectSchema, response: projectSchema },
  },
} as const
```

Daraus entstehen automatisch drei Dinge:

- `window.api.projects.create(input)` im Preload — die Kanalliste wird über die Schlüssel des
  Vertrags erzeugt, es gibt keine handgepflegte Liste.
- Der Typ `IpcApi`, mit dem `window.api` in `src/renderer/env.d.ts` deklariert wird.
- `registerDomain('projects', handlers)` im Main-Prozess, das jeden Request gegen das Schema
  prüft, bevor der Handler ihn sieht.

Der Nutzen: Renderer und Main lassen sich unabhängig voneinander bauen. Solange eine Domäne
noch fehlt, kann sie über `createStubHandlers(domain)` registriert werden; der Stub wirft
`"<domain>.<method> ist noch nicht implementiert"`, der Renderer kann aber schon dagegen
bauen. Im aktuellen Stand ist jede Domäne des Vertrags echt umgesetzt — `registerIpcHandlers()`
in `src/main/ipc/index.ts` registriert elf Domänen, keine davon als Stub.

Events laufen umgekehrt (main → renderer) über einen einzigen Kanal (`app:event`) mit einem
Umschlag `{ event, payload }`. `window.api.on(event, cb)` gibt die Abmeldefunktion zurück.
Die Event-Namen und ihre Schemas stehen in `ipcEvents`.

## Start und Beenden

`src/main/app/index.ts` ist die einzige Stelle, an der die Teile zusammengesteckt werden. Der
Ablauf beim Start:

1. `app.setPath('userData', …/'Orchestrator Agent v2')` — muss vor jedem `getPath('userData')`
   laufen. v1 heißt ebenfalls `orchestrator-agent` und legt dort eine `orchestrator.db` in einem
   anderen Schema ab; ohne eigenen Ordner mischen sich beide.
   `registerAttachmentSchemePrivileges()` — muss vor `app.whenReady()` laufen, sonst kennt
   Electron das Schema `attachment://` nicht.
2. Einzelinstanz-Sperre; eine zweite Instanz holt nur das vorhandene Fenster nach vorne.
3. `initDatabase()` — öffnet `orchestrator.db`, wendet offene Migrationen an und prüft
   anschließend das Schema (`verifySchema`). Passt es nicht, bricht der Start mit einer
   deutschen Meldung samt Dateipfad ab, statt in einen halb kaputten Zustand zu laufen.
   `markStaleStreamingMessages()` räumt Nachrichten auf, die beim letzten Beenden noch liefen.
4. `registerAttachmentProtocol()`, `initChatEngine()`, `registerIpcHandlers()`.
5. `startMcpServer()` — schlägt das fehl, läuft die App weiter, die Agenten arbeiten dann
   aber ohne Werkzeuge.
6. `setTrayStatusSources()` + `createTray()` + `createMainWindow()`. Der Tray fragt seinen
   Inhalt über die angemeldeten Quellen ab, statt Claude- oder Runner-Module zu importieren.
7. `refreshClaudeStatus()` — die CLI-Erkennung läuft von sich aus los; das Ergebnis geht als
   Event `claude.status` an den Renderer und aktualisiert den Tray.
8. `resumeInterrupted()` — Vorhaben, die beim letzten Beenden noch liefen, machen aus ihrem
   Checkpoint weiter.

Beim Beenden (`before-quit`) werden laufende Vorhaben angehalten (ohne sie als abgebrochen zu
markieren), alle MCP-Lauf-Token freigegeben und der Werkzeugserver gestoppt; auf `quit` folgen
Tray und Datenbank.

## Datenmodell

SQLite über `better-sqlite3`, Datei `orchestrator.db` in `userData`, WAL an,
`PRAGMA foreign_keys = ON`. Migrationen sind nummerierte `.sql`-Dateien unter
`src/main/db/migrations/`, werden als Rohtext eingebettet (`?raw`) und der Reihe nach
angewendet; der Stand steht in `schema_migrations`. Die Namen tragen ein `v2` (`001_v2_initial`),
damit ein Migrationsstand aus v1 nicht versehentlich als erledigt gilt.

Weil `CREATE TABLE IF NOT EXISTS` an bereits vorhandenen Tabellen fremden Schemas wortlos
vorbeigeht, prüft `verifySchema()` danach Stichproben (u. a. `projects.path`, `tickets.number`,
`agents.role`) und wirft sonst einen `SchemaMismatchError`.

```
projects ──┬── project_agents ── agents
           ├── messages ── attachments
           ├── tickets ──┬── ticket_comments
           │             └── ticket_dependencies (ticket_id, depends_on_id)
           ├── documents
           ├── memories (agent_id, project_id nullable)
           └── goals ── goal_log

claude_sessions (scope_key → session_id)   -- prozessübergreifender Session-Cache
```

Kurz zu den weniger offensichtlichen Tabellen:

- **project_agents** hält die Zuordnung *und* den projektbezogenen Zustand (`sort_order`,
  `stopped`). Systemprompts liegen ausschließlich in `agents` und werden nie pro Projekt
  kopiert.
- **ticket_dependencies** ist ein reiner Kantenspeicher. `listUnblockedTickets()` liefert
  daraus die Tickets, deren Vorgänger alle `done` sind — die Auswahlbasis des Goal-Loops.
- **memories** ist pro `(agent_id, project_id, key)` eindeutig; `project_id = NULL` bedeutet
  „gilt überall". Projektbezogene Abfragen sehen die globalen Erinnerungen mit.
- **goals.checkpoint** ist ein JSON-Blob, mit dem der Goal-Loop nach einem Neustart an der
  richtigen Stelle weitermacht.
- **claude_sessions** bildet den Session-Cache ab: `scope_key` ist
  `projectId|agentId[|goal:N][|ticket:X]`. Alles, was Systemprompt oder Arbeitsverzeichnis
  ändert, muss in den Schlüssel einfließen, sonst wird eine Session fälschlich weiterverwendet.

Die Umsetzung von Zeile zu Domänentyp (snake_case → camelCase, JSON parsen, `0/1` → boolean)
liegt vollständig in `src/main/db/repositories/`. Services bekommen nur fertige Domänentypen.

## Ein einziger ClaudeRunner

Jeder Claude-Aufruf — Chat wie autonomer Goal-Loop — geht durch `ClaudeRunner.run()`. Er
spawnt `claude -p --output-format stream-json …` mit `cwd` = Projektpfad, parst den Stream und
liefert Events (Text, Denkschritte, Tool-Aufrufe, Ende).

Die einzige bewusste Ausnahme von „`cwd` = Projektpfad" ist die Systemprompt-Erzeugung im
Agenten-Editor (`src/main/chat/wiring.ts`): Sie gehört zu keinem Projekt und läuft deshalb mit
`cwd = userData`, damit sie kein fremdes Repo als Arbeitsverzeichnis sieht.

Der Goal-Loop ruft den Runner **direkt** auf. Er darf nicht den Umweg über „Chat-Nachricht
schreiben, danach die Datenbank auf Änderungen absuchen" nehmen: In v1 war genau das die
fragilste Stelle, weil der Loop-Fortschritt vom Nebeneffekt einer UI-Aktion abhing.

## Warum Werkzeuge statt Textmuster

Die App hostet einen lokalen MCP-Server auf 127.0.0.1 mit Zufallsport. Agenten legen Tickets
an, ändern Status, speichern Dokumente und Erinnerungen **nur** über MCP-Tools.

In v1 wurden Absichten stattdessen aus dem Fließtext gelesen — Tags wie `[TICKET_CREATE: …]`
und Statusänderungen per Regex. Das ging schief, sobald ein Agent normal über Tickets sprach:
„#3 ist noch nicht fertig" schloss Ticket 3. Ein Werkzeugaufruf ist dagegen eindeutig, er hat
ein Schema, er kann fehlschlagen und die Fehlermeldung geht an das Modell zurück.

Damit ein Tool weiß, in wessen Namen es läuft, hält der Main-Prozess eine
`RunContextRegistry`: Vor dem CLI-Aufruf wird ein Lauf-Token registriert (Projekt, Agent,
optional Goal/Ticket), das der Agent bei jedem Tool-Aufruf mitschickt.

## Warum Rollen statt Namen

Jeder Agent hat eine Rolle: `worker | planner | pm | reviewer`. Der Goal-Loop fragt nach
Rollen („welcher `planner` ist in diesem Projekt aktiv?"), nie nach Namen.

In v1 standen Agentennamen im Code. Ein Umbenennen in der Oberfläche brach den Loop, und ein
Projekt ohne den erwarteten Namen bekam still keinen Planer. Über die Rolle ist die App
gegenüber Umbenennungen und beliebigen Agentenbesetzungen unempfindlich.

## Vorhaben

Ein Vorhaben (`goals`) läuft durch fünf Stationen: `spec → tickets → work → review → done`.
Im Modus `ai` beginnt es beim Pflichtenheft; im Modus `selected` — gestartet aus im Board
ausgewählten Tickets — steigt es direkt bei `work` ein und endet ohne Abnahme.

`GoalEngine` hält je laufendem Vorhaben genau einen `AbortController` im Speicher; aller
übrige Zustand steht im `checkpoint`-JSON. `cancel()` bricht das Signal ab **und** beendet über
`killByFilter(info => info.scope.goalId === id)` die noch laufenden CLI-Prozesse.

Die Arbeitsphase verteilt `WorkerPool` auf bis zu drei parallele Läufe. Bereit ist ein Ticket,
wenn alle seine Abhängigkeiten `done` sind; bevorzugt wird, was andere Tickets blockiert. Meldet
ein Lauf eine Blockade, geht das Ticket zurück in die Warteschlange (höchstens dreimal).
Besetzt werden die Läufe über `resolveWorkers()` — also über die Rolle, nie über Namen.

## Sicherheit

Der Renderer bekommt keine Node-APIs. Anhänge werden über ein eigenes Protokoll
`attachment://` ausgeliefert, das ausschließlich aus `userData/attachments` liest.

Die Pfadprüfung in `src/main/app/attachment-path.ts` bildet den Pfad relativ zum
Wurzelverzeichnis und lehnt alles ab, was mit `..` beginnt oder absolut ist. Ein
`resolved.startsWith(root)`-Vergleich würde hier nicht reichen: Ein Geschwisterordner
`attachments-evil/` beginnt ebenfalls mit dem Pfad von `attachments/`. Das ist die einzige
Stelle mit Tests (`npm run test:security`).

## Token-Sparsamkeit

CLI-Sessions werden pro Scope wiederverwendet (`--resume`), damit der Prompt-Cache warm
bleibt. Beim Resume geht nur der *dynamische* Kontext erneut raus, nicht der komplette
Systemprompt. Nach `SESSION_MAX_TURNS` Turns wird die Session in Rente geschickt und beim
nächsten Aufruf neu aufgebaut.
