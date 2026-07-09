/**
 * The local index schema (ARCHITECTURE.md §8). Everything here is *derivable from
 * disk* — the index is a rebuildable/disposable cache, never the source of truth
 * (ARCHITECTURE §4). Delete `index.sqlite`, relaunch, and `rebuild.ts` reconstructs
 * the `sessions`/`files` rows from a full folder rescan.
 *
 * The DDL lives here as a string constant rather than a `.sql` asset so it ships
 * inside the bundled main process with no separate file to copy at build time.
 *
 * Bump `INDEX_SCHEMA_VERSION` whenever these tables change: on open, IndexStore
 * compares it against `PRAGMA user_version` and, on mismatch, drops and recreates
 * the derived tables (they're rebuilt from disk anyway — see §6.2 cold start).
 */
export const INDEX_SCHEMA_VERSION = 3

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id    TEXT PRIMARY KEY,
  path          TEXT NOT NULL,
  session_type  TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  event_code    TEXT,
  team_number   INTEGER,
  alliance      TEXT,
  session_start TEXT,
  sort_key      TEXT,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS files (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  filename          TEXT NOT NULL,
  kind              TEXT NOT NULL,
  remote_path       TEXT,
  original_filename TEXT,
  file_size_bytes   INTEGER,
  imported_at       TEXT
);

-- Derived tag membership (spec §12), one row per (session, tag), so a "tagged X"
-- filter is an indexed join rather than a JSON scan. Rebuilt from disk like sessions.
CREATE TABLE IF NOT EXISTS session_tags (
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  PRIMARY KEY (session_id, tag)
);

-- User intent that lives only in the index (spec §15): which remote hub logs the
-- user chose to hide. NOT touched by a rebuild.
CREATE TABLE IF NOT EXISTS ignored_hublogs (
  remote_path     TEXT PRIMARY KEY,
  filename        TEXT,
  file_size_bytes INTEGER,
  ignored_at      TEXT
);

-- Offline cache of FTCScout responses (spec §8). NOT touched by a rebuild.
CREATE TABLE IF NOT EXISTS ftcscout_cache (
  event_code   TEXT NOT NULL,
  season       INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  last_synced  TEXT,
  PRIMARY KEY (event_code, season)
);

CREATE INDEX IF NOT EXISTS idx_sessions_type   ON sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_event  ON sessions(event_code);
CREATE INDEX IF NOT EXISTS idx_sessions_team   ON sessions(team_number);
CREATE INDEX IF NOT EXISTS idx_files_session   ON files(session_id);
CREATE INDEX IF NOT EXISTS idx_files_kind      ON files(kind);
CREATE INDEX IF NOT EXISTS idx_session_tags    ON session_tags(tag);
`

/** The derived tables a rebuild wipes and repopulates from disk (order matters: FK children first). */
export const DERIVED_TABLES = ['session_tags', 'files', 'sessions'] as const
