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

Der Nutzen: Renderer und Main lassen sich unabhängig voneinander bauen. Ein noch nicht
umgesetzter Kanal wird über `createStubHandlers(domain)` registriert und wirft
`"<domain>.<method> ist noch nicht implementiert"` — der Renderer kann bereits dagegen bauen.

Events laufen umgekehrt (main → renderer) über einen einzigen Kanal (`app:event`) mit einem
Umschlag `{ event, payload }`. `window.api.on(event, cb)` gibt die Abmeldefunktion zurück.
Die Event-Namen und ihre Schemas stehen in `ipcEvents`.

## Datenmodell

SQLite über `better-sqlite3`, Datei `orchestrator.db` in `userData`, WAL an,
`PRAGMA foreign_keys = ON`. Migrationen sind nummerierte `.sql`-Dateien unter
`src/main/db/migrations/`, werden als Rohtext eingebettet (`?raw`) und der Reihe nach
angewendet; der Stand steht in `schema_migrations`.

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
