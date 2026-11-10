import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { APP_NAME } from '@shared/constants'
import initial001 from './migrations/001_v2_initial.sql?raw'
import skills002 from './migrations/002_skills.sql?raw'
import skillFiles003 from './migrations/003_skill_files.sql?raw'
import mcpServers004 from './migrations/004_mcp_servers.sql?raw'
import ticketGuidelines005 from './migrations/005_ticket_guidelines.sql?raw'
import push006 from './migrations/006_push.sql?raw'
// 007 (usage) und 008 (schedules) entstehen parallel auf eigenen Zweigen; 009 ist A3.
import questions009 from './migrations/009_questions.sql?raw'

/**
 * Migrationen werden als Rohtext eingebettet, damit sie im gebauten Paket ohne
 * Dateisystemzugriff verfügbar sind. Neue Migrationen unten anhängen — niemals umsortieren.
 */
const MIGRATIONS: readonly { name: string; sql: string }[] = [
  { name: '001_v2_initial', sql: initial001 },
  { name: '002_skills', sql: skills002 },
  { name: '003_skill_files', sql: skillFiles003 },
  { name: '004_mcp_servers', sql: mcpServers004 },
  { name: '005_ticket_guidelines', sql: ticketGuidelines005 },
  { name: '006_push', sql: push006 },
  { name: '009_questions', sql: questions009 },
]

let db: Database.Database | null = null

export function getDatabasePath(): string {
  return join(app.getPath('userData'), 'orchestrator.db')
}

export function initDatabase(filePath = getDatabasePath()): Database.Database {
  if (db) return db

  if (filePath !== ':memory:') {
    mkdirSync(join(filePath, '..'), { recursive: true })
  }

  const connection = new Database(filePath)
  connection.pragma('journal_mode = WAL')
  connection.pragma('foreign_keys = ON')
  connection.pragma('busy_timeout = 5000')

  runMigrations(connection)
  verifySchema(connection, filePath)
  db = connection
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Datenbank ist nicht initialisiert')
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

function runMigrations(connection: Database.Database): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    connection
      .prepare<[], { name: string }>('SELECT name FROM schema_migrations')
      .all()
      .map((row) => row.name),
  )

  const record = connection.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
  )

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue
    // Foreign keys sind während DDL aus, damit Tabellen in beliebiger Reihenfolge entstehen.
    connection.pragma('foreign_keys = OFF')
    const apply = connection.transaction(() => {
      connection.exec(migration.sql)
      record.run(migration.name, new Date().toISOString())
    })
    apply()
    connection.pragma('foreign_keys = ON')
  }
}

/**
 * Stichproben aus dem v2-Schema. Sie sind so gewählt, dass eine v1-Datenbank sicher
 * auffällt: v1 kennt weder `projects.path` noch `tickets.number` noch die Tabelle `agents`.
 */
const REQUIRED_COLUMNS: readonly { table: string; column: string }[] = [
  { table: 'projects', column: 'path' },
  { table: 'tickets', column: 'number' },
  { table: 'agents', column: 'role' },
  { table: 'messages', column: 'project_id' },
  { table: 'project_agents', column: 'agent_id' },
]

export class SchemaMismatchError extends Error {
  constructor(
    readonly databasePath: string,
    readonly missing: readonly string[],
  ) {
    super(
      `Die Datenbank passt nicht zu dieser Version von ${APP_NAME}.\n\n` +
        `Datei: ${databasePath}\n\n` +
        `Es fehlen: ${missing.join(', ')}.\n\n` +
        'Vermutlich stammt die Datei aus einer älteren Version. Verschiebe oder benenne sie ' +
        'um, damit eine neue Datenbank angelegt werden kann — lösche sie nicht, sie enthält ' +
        'möglicherweise noch Daten.',
    )
    this.name = 'SchemaMismatchError'
  }
}

/**
 * `CREATE TABLE IF NOT EXISTS` überspringt Tabellen, die schon in einem fremden Schema
 * existieren. Ohne diese Prüfung startet die App scheinbar normal und stirbt danach bei
 * jeder zweiten Abfrage mit `no such column: …`.
 */
function verifySchema(connection: Database.Database, databasePath: string): void {
  const columnsOf = connection.prepare<[string], { name: string }>(
    'SELECT name FROM pragma_table_info(?)',
  )

  const missing = REQUIRED_COLUMNS.filter(
    ({ table, column }) => !columnsOf.all(table).some((row) => row.name === column),
  ).map(({ table, column }) => `${table}.${column}`)

  if (missing.length > 0) throw new SchemaMismatchError(databasePath, missing)
}

/** ISO-Zeitstempel in dem Format, das alle `*_at`-Spalten benutzen. */
export function nowIso(): string {
  return new Date().toISOString()
}

export function withTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)()
}
