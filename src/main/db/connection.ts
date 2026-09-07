import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { app } from 'electron'
import initial001 from './migrations/001_initial.sql?raw'

/**
 * Migrationen werden als Rohtext eingebettet, damit sie im gebauten Paket ohne
 * Dateisystemzugriff verfügbar sind. Neue Migrationen unten anhängen — niemals umsortieren.
 */
const MIGRATIONS: readonly { name: string; sql: string }[] = [
  { name: '001_initial', sql: initial001 },
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

/** ISO-Zeitstempel in dem Format, das alle `*_at`-Spalten benutzen. */
export function nowIso(): string {
  return new Date().toISOString()
}

export function withTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)()
}
