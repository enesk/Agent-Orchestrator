CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  path        TEXT,
  metadata    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  title         TEXT,
  mention_key   TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('worker', 'planner', 'pm', 'reviewer')),
  system_prompt TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL,
  effort        TEXT NOT NULL,
  color         TEXT NOT NULL,
  avatar        TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_mention_key ON agents (mention_key);

CREATE TABLE IF NOT EXISTS project_agents (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  agent_id   TEXT NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  stopped    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, agent_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'agent', 'system')),
  agent_id    TEXT REFERENCES agents (id) ON DELETE SET NULL,
  content     TEXT NOT NULL DEFAULT '',
  thinking    TEXT,
  mentions    TEXT NOT NULL DEFAULT '[]',
  reply_to_id TEXT REFERENCES messages (id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'done'
                CHECK (status IN ('streaming', 'done', 'error', 'stopped')),
  error_code  TEXT,
  metadata    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_project_created
  ON messages (project_id, created_at);

CREATE TABLE IF NOT EXISTS attachments (
  id            TEXT PRIMARY KEY,
  message_id    TEXT REFERENCES messages (id) ON DELETE CASCADE,
  ticket_id     TEXT,
  file_name     TEXT NOT NULL,
  mime_type     TEXT,
  relative_path TEXT NOT NULL,
  size          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments (ticket_id);

CREATE TABLE IF NOT EXISTS tickets (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  number            INTEGER NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'done')),
  category          TEXT NOT NULL DEFAULT 'task',
  assigned_agent_id TEXT REFERENCES agents (id) ON DELETE SET NULL,
  goal_id           INTEGER,
  external_id       TEXT,
  epic_id           TEXT REFERENCES tickets (id) ON DELETE SET NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (project_id, number)
);

CREATE INDEX IF NOT EXISTS idx_tickets_project_status ON tickets (project_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_goal ON tickets (goal_id);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('user', 'agent')),
  agent_id    TEXT REFERENCES agents (id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments (ticket_id);

CREATE TABLE IF NOT EXISTS ticket_dependencies (
  ticket_id     TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  depends_on_id TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, depends_on_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_dependencies_depends_on
  ON ticket_dependencies (depends_on_id);

CREATE TABLE IF NOT EXISTS documents (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  content              TEXT NOT NULL DEFAULT '',
  created_by_agent_id  TEXT REFERENCES agents (id) ON DELETE SET NULL,
  updated_by_agent_id  TEXT REFERENCES agents (id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents (project_id);

CREATE TABLE IF NOT EXISTS memories (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id         TEXT NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects (id) ON DELETE CASCADE,
  key              TEXT NOT NULL,
  value            TEXT NOT NULL,
  importance       INTEGER NOT NULL DEFAULT 2 CHECK (importance BETWEEN 1 AND 3),
  source           TEXT NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'user')),
  access_count     INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_scope_key
  ON memories (agent_id, IFNULL(project_id, ''), key);

CREATE TABLE IF NOT EXISTS goals (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  mode               TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'selected')),
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'planning', 'in_progress',
                                         'reviewing', 'done', 'cancelled', 'failed')),
  phase              TEXT,
  spec_document_id   TEXT REFERENCES documents (id) ON DELETE SET NULL,
  selected_agent_ids TEXT NOT NULL DEFAULT '[]',
  checkpoint         TEXT,
  retry_count        INTEGER NOT NULL DEFAULT 0,
  error_type         TEXT,
  error_message      TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  completed_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_goals_project ON goals (project_id, status);

CREATE TABLE IF NOT EXISTS goal_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id    INTEGER NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  phase      TEXT,
  agent_id   TEXT REFERENCES agents (id) ON DELETE SET NULL,
  ticket_id  TEXT REFERENCES tickets (id) ON DELETE SET NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'running'
               CHECK (status IN ('running', 'success', 'failed')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goal_log_goal ON goal_log (goal_id, id);

CREATE TABLE IF NOT EXISTS claude_sessions (
  scope_key    TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  cwd          TEXT,
  turn_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
