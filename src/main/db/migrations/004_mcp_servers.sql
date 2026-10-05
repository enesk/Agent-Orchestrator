-- Externe MCP-Server. Global definiert, Projekten zugewiesen — derselbe Server kann in
-- mehreren Projekten laufen, ohne zweimal eingetragen zu werden.
CREATE TABLE IF NOT EXISTS mcp_servers (
  id          TEXT PRIMARY KEY,
  -- Zugleich das Werkzeug-Präfix der CLI (`mcp__<name>__…`): klein, nur [a-z0-9_-], eindeutig.
  name        TEXT NOT NULL,
  transport   TEXT NOT NULL DEFAULT 'http',
  url         TEXT,
  command     TEXT,
  -- JSON-Array der Argumente bei stdio.
  args        TEXT NOT NULL DEFAULT '[]',
  -- JSON-Objekte Schlüssel → mit safeStorage verschlüsselter Wert (base64). Die Schlüssel
  -- stehen im Klartext, damit die Oberfläche sie anzeigen kann; die Werte nie.
  headers     TEXT NOT NULL DEFAULT '{}',
  env         TEXT NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  -- Ergebnis des letzten „Prüfen"-Knopfs, nur zur Anzeige.
  tool_count  INTEGER,
  checked_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers (name);

CREATE TABLE IF NOT EXISTS project_mcp_servers (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  server_id  TEXT NOT NULL REFERENCES mcp_servers (id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, server_id)
);

CREATE INDEX IF NOT EXISTS idx_project_mcp_servers_server ON project_mcp_servers (server_id);
