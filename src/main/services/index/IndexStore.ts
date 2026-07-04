import Database from 'better-sqlite3'
import type { Database as Db } from 'better-sqlite3'
import type { ImportStatus } from '@shared/types/hublog'
import type { HubLogRef } from '@shared/types/import'
import { DERIVED_TABLES, INDEX_SCHEMA_VERSION, SCHEMA_SQL } from './schema'
import type { FileRow, IndexRows, SessionRow } from './rebuild'
import type { ImportIdentity } from '../import/identity'

/** Upsert a `sessions` row (used by both a full rebuild and a single-session reindex). */
const INSERT_SESSION_SQL = `INSERT INTO sessions
    (session_id, path, session_type, display_name, event_code, team_number,
     alliance, session_start, sort_key, updated_at)
   VALUES
    (@session_id, @path, @session_type, @display_name, @event_code, @team_number,
     @alliance, @session_start, @sort_key, @updated_at)
   ON CONFLICT(session_id) DO UPDATE SET
     path=excluded.path, session_type=excluded.session_type,
     display_name=excluded.display_name, event_code=excluded.event_code,
     team_number=excluded.team_number, alliance=excluded.alliance,
     session_start=excluded.session_start, sort_key=excluded.sort_key,
     updated_at=excluded.updated_at`

const INSERT_FILE_SQL = `INSERT INTO files
    (session_id, filename, kind, remote_path, original_filename, file_size_bytes, imported_at)
   VALUES
    (@session_id, @filename, @kind, @remote_path, @original_filename, @file_size_bytes, @imported_at)`

/**
 * The local index (ARCHITECTURE.md §8) — the *only* module that touches the native
 * `better-sqlite3` binary. Everything it holds is derivable from disk, so it's safe
 * to delete `index.sqlite` and rebuild (§4). Keeping the native dependency isolated
 * here means the disk → rows projection (`rebuild.collectIndexRows`) stays unit-
 * testable under Vitest without an Electron-ABI rebuild of the binary.
 */
export class IndexStore {
  private readonly db: Db

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.ensureSchema()
  }

  /**
   * Create the schema, recreating the *derived* tables when the on-disk schema
   * version is stale (§6.2 cold start). User/cache tables are left alone unless the
   * whole file is being created fresh.
   */
  private ensureSchema(): void {
    const current = this.db.pragma('user_version', { simple: true }) as number
    if (current !== INDEX_SCHEMA_VERSION) {
      // Derived tables may have an old shape — drop and let SCHEMA_SQL rebuild them.
      // (They're repopulated from disk by rebuildIndex.)
      for (const table of DERIVED_TABLES) this.db.exec(`DROP TABLE IF EXISTS ${table}`)
    }
    this.db.exec(SCHEMA_SQL)
    this.db.pragma(`user_version = ${INDEX_SCHEMA_VERSION}`)
  }

  /**
   * Atomically replace the derived `sessions`/`files` rows with a fresh rescan.
   * Runs in a single transaction so a crash mid-rebuild can't leave a half-index.
   * Preserves `ignored_hublogs` and `ftcscout_cache`.
   */
  replaceSessions(rows: IndexRows): void {
    const insertSession = this.db.prepare(INSERT_SESSION_SQL)
    const insertFile = this.db.prepare(INSERT_FILE_SQL)
    const replace = this.db.transaction((data: IndexRows) => {
      this.db.exec('DELETE FROM files')
      this.db.exec('DELETE FROM sessions')
      for (const s of data.sessions) insertSession.run(s)
      for (const f of data.files) insertFile.run(f)
    })
    replace(rows)
  }

  /**
   * Re-index a single session after an import (spec §6.1 step 4): upsert its row and
   * replace just that session's file rows, so a hub log's import status flips without
   * a full rescan. The `files` change is bounded to one `session_id`.
   */
  indexSession(session: SessionRow, files: FileRow[]): void {
    const insertSession = this.db.prepare(INSERT_SESSION_SQL)
    const insertFile = this.db.prepare(INSERT_FILE_SQL)
    const deleteFiles = this.db.prepare('DELETE FROM files WHERE session_id = ?')
    const write = this.db.transaction(() => {
      insertSession.run(session)
      deleteFiles.run(session.session_id)
      for (const f of files) insertFile.run(f)
    })
    write()
  }

  /**
   * Existing imports of a remote file, with where each landed — the raw material for
   * duplicate detection (spec §14). Matching on identity fields is done purely in
   * `import/identity.findDuplicates`.
   */
  importsOf(remotePath: string): ImportIdentity[] {
    return this.db
      .prepare(
        `SELECT f.remote_path, f.original_filename, f.file_size_bytes, f.filename,
                s.path AS sessionPath, s.display_name AS sessionLabel
           FROM files f JOIN sessions s ON s.session_id = f.session_id
          WHERE f.remote_path = ?`
      )
      .all(remotePath) as ImportIdentity[]
  }

  /** Mark a remote hub log as ignored (spec §15) — hidden from the default log view. */
  ignoreHubLog(entry: HubLogRef): void {
    this.db
      .prepare(
        `INSERT INTO ignored_hublogs (remote_path, filename, file_size_bytes, ignored_at)
         VALUES (@remote_path, @filename, @file_size_bytes, @ignored_at)
         ON CONFLICT(remote_path) DO UPDATE SET
           filename=excluded.filename, file_size_bytes=excluded.file_size_bytes,
           ignored_at=excluded.ignored_at`
      )
      .run({
        remote_path: entry.remotePath,
        filename: entry.filename,
        file_size_bytes: entry.fileSize,
        ignored_at: new Date().toISOString()
      })
  }

  /** Un-ignore a remote hub log (spec §15 — reversible). */
  unignoreHubLog(remotePath: string): void {
    this.db.prepare('DELETE FROM ignored_hublogs WHERE remote_path = ?').run(remotePath)
  }

  /**
   * Resolve a remote hub log's import status against the index (spec §7.3): whether
   * it's already been imported into a session, or the user has hidden it. "Imported"
   * wins over "ignored" — an actually-present file is the stronger fact.
   */
  importStatusFor(remotePath: string): ImportStatus {
    const imported = this.db
      .prepare(
        `SELECT s.path AS path, s.display_name AS label
           FROM files f JOIN sessions s ON s.session_id = f.session_id
          WHERE f.remote_path = ? LIMIT 1`
      )
      .get(remotePath) as { path: string; label: string } | undefined
    if (imported) {
      return { state: 'imported', sessionPath: imported.path, sessionLabel: imported.label }
    }
    const ignored = this.db
      .prepare('SELECT 1 FROM ignored_hublogs WHERE remote_path = ? LIMIT 1')
      .get(remotePath)
    return ignored ? { state: 'ignored' } : { state: 'not_imported' }
  }

  /** Row counts for the derived tables (what `archive:rebuildIndex` reports back). */
  counts(): { sessions: number; files: number } {
    const sessions = this.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }
    const files = this.db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }
    return { sessions: sessions.n, files: files.n }
  }

  close(): void {
    this.db.close()
  }
}
