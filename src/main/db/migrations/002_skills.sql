CREATE TABLE IF NOT EXISTS skills (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_slug ON skills (slug);

CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id TEXT NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills (skill_id);
