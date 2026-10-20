-- APNs-Versand: angemeldete iPhones und der Schlüssel aus dem Developer-Konto.
-- Die Geräte melden sich selbst an (`push.register` über die Brücke); der Schlüssel kommt
-- ausschließlich vom Rechner.

CREATE TABLE IF NOT EXISTS push_devices (
  -- Das APNs-Gerätetoken, hex. Es ist der Schlüssel: dasselbe Gerät meldet sich mit
  -- demselben Token wieder an, und dann wird nur `last_seen_at` nachgezogen.
  device_token     TEXT PRIMARY KEY,
  bundle_id        TEXT NOT NULL,
  -- 'sandbox' oder 'production' — getrennte APNs-Welten mit getrennten Token.
  environment      TEXT NOT NULL DEFAULT 'sandbox',
  -- Push-to-Update-Token einer laufenden Live Activity; NULL, solange keine läuft.
  activity_token   TEXT,
  registered_at    TEXT NOT NULL,
  -- Zeitstempel des letzten Kontakts, also der letzten Anmeldung.
  last_seen_at     TEXT NOT NULL,
  -- Ergebnis der letzten Meldung an dieses Gerät, nur zur Anzeige.
  last_push_at     TEXT,
  last_push_kind   TEXT,
  last_push_error  TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_devices_seen ON push_devices (last_seen_at DESC);

-- Genau eine Zeile: der `.p8`-Schlüssel, die Key-ID und die Team-ID. Alle drei Werte liegen
-- mit `safeStorage` verschlüsselt (base64) — im Klartext legt die App sie nicht ab. Der
-- Dateiname bleibt lesbar, damit die Oberfläche zeigen kann, welche Datei hinterlegt ist.
CREATE TABLE IF NOT EXISTS push_credentials (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  key_p8        TEXT,
  key_id        TEXT,
  team_id       TEXT,
  key_file_name TEXT,
  updated_at    TEXT NOT NULL
);
