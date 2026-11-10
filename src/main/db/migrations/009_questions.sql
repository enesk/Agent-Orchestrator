-- Rückfragen: ein Agent, der eine Entscheidung nicht selbst treffen darf, legt hier eine
-- offene Frage ab und beendet seinen Lauf. Nichts bleibt in einem wartenden Prozess stehen —
-- der Zustand steht in dieser Tabelle, und die Antwort startet den Lauf später erneut.

CREATE TABLE IF NOT EXISTS questions (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- Wer gefragt hat. Die Antwort startet genau diesen Agenten im selben Scope erneut,
  -- deshalb hängt die Frage am Agenten und nicht nur am Projekt.
  agent_id     TEXT NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  -- Scope des Laufs, aus dem die Frage kam. Beide NULL heißt: der Lauf war ein Chatlauf.
  goal_id      INTEGER REFERENCES goals (id) ON DELETE SET NULL,
  ticket_id    TEXT REFERENCES tickets (id) ON DELETE SET NULL,
  question     TEXT NOT NULL,
  -- Was der Agent zur Lage sagt, damit die Frage ohne Rückblick zu beantworten ist.
  context      TEXT,
  -- Vorgeschlagene Antworten als JSON-Array. Freitext bleibt immer möglich.
  options      TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'answered', 'discarded', 'expired')),
  answer       TEXT,
  asked_at     TEXT NOT NULL,
  answered_at  TEXT,
  -- Zeitpunkt, ab dem die Frage als unbeantwortet geschlossen wird (sieben Tage).
  expires_at   TEXT NOT NULL
);

-- Die beiden Abfragen, die es gibt: offene Fragen nach Zeit, und offene Fragen zu einem
-- Ticket (die Vorhaben-Phase fragt das in jedem Durchlauf).
CREATE INDEX IF NOT EXISTS idx_questions_status_asked ON questions (status, asked_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_ticket ON questions (ticket_id, status);
