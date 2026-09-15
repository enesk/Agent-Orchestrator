-- Beidateien eines Skills (references/…, assets/…). Der Inhalt liegt unter
-- userData/skill-files/<skill_id>/<rel_path>; die SKILL.md selbst bleibt in skills.content.
CREATE TABLE IF NOT EXISTS skill_files (
  id         TEXT PRIMARY KEY,
  skill_id   TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  rel_path   TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (skill_id, rel_path)
);
