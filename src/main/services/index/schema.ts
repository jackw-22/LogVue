/**
 * The local index schema (ARCHITECTURE.md §8). Everything here is *derivable from
 * disk* — the index is a rebuildable/disposable cache, never the source of truth
 * (ARCHITECTURE §4). Delete `.logvue/index.sqlite`, relaunch, and `rebuild.ts` reconstructs
 * the `sessions`/`files` rows from a full folder rescan.
 *
 * The DDL lives here as a string constant rather than a `.sql` asset so it ships
 * inside the bundled main process with no separate file to copy at build time.
 *
 * Bump `INDEX_SCHEMA_VERSION` whenever these tables change: on open, IndexStore
 * compares it against `PRAGMA user_version` and, on mismatch, drops and recreates
 * the derived tables (they're rebuilt from disk anyway — see §6.2 cold start).
 */
export const INDEX_SCHEMA_VERSION = 7

export const SCHEMA_SQL = `
-- Identity in the derived tables is the folder path: where a session lives is the
-- one fact the walk can never see twice in a rescan. Paths are stored as
-- ARCHIVE-RELATIVE keys with '/' separators, canonicalised (case, symlinks) at the
-- IndexStore boundary — so a moved archive's index stays valid and Windows
-- case/separator variants can't mint duplicate rows. session_id is carried as data
-- (it may be NULL for a bare folder, or duplicated by an Explorer-copied session)
-- and must never be used as a key.
CREATE TABLE IF NOT EXISTS sessions (
  path          TEXT PRIMARY KEY,
  session_id    TEXT,
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
  session_path      TEXT NOT NULL REFERENCES sessions(path) ON DELETE CASCADE,
  filename          TEXT NOT NULL,
  kind              TEXT NOT NULL,
  remote_path       TEXT,
  original_filename TEXT,
  file_size_bytes   INTEGER,
  imported_at       TEXT,
  recorded_at       TEXT
);

-- Derived tag membership (spec §12), one row per (session, tag), so a "tagged X"
-- filter is an indexed join rather than a JSON scan. Rebuilt from disk like sessions.
CREATE TABLE IF NOT EXISTS session_tags (
  session_path TEXT NOT NULL REFERENCES sessions(path) ON DELETE CASCADE,
  tag          TEXT NOT NULL,
  PRIMARY KEY (session_path, tag)
);

-- RLOG-embedded metadata (Logger.recordMetadata → RealMetadata/* string records),
-- one row per (file, key). Decoded from the head of each .rlog at import/rebuild
-- time, so it's pure derived cache — the log file itself is the source of truth.
CREATE TABLE IF NOT EXISTS file_metadata (
  session_path TEXT NOT NULL REFERENCES sessions(path) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  PRIMARY KEY (session_path, filename, key)
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
CREATE INDEX IF NOT EXISTS idx_files_session   ON files(session_path);
CREATE INDEX IF NOT EXISTS idx_files_kind      ON files(kind);
CREATE INDEX IF NOT EXISTS idx_session_tags    ON session_tags(tag);
CREATE INDEX IF NOT EXISTS idx_file_meta_kv    ON file_metadata(key, value);
`

/** The derived tables a rebuild wipes and repopulates from disk (order matters: FK children first). */
export const DERIVED_TABLES = ['file_metadata', 'session_tags', 'files', 'sessions'] as const
