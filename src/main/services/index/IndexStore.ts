import Database from 'better-sqlite3'
import type { Database as Db } from 'better-sqlite3'
import type { ImportStatus } from '@shared/types/hublog'
import { DERIVED_TABLES, INDEX_SCHEMA_VERSION, SCHEMA_SQL } from './schema'
import type { IndexRows } from './rebuild'

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
    const insertSession = this.db.prepare(
      `INSERT INTO sessions
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
    )
    const insertFile = this.db.prepare(
      `INSERT INTO files
        (session_id, filename, kind, remote_path, original_filename, file_size_bytes, imported_at)
       VALUES
        (@session_id, @filename, @kind, @remote_path, @original_filename, @file_size_bytes, @imported_at)`
    )
    const replace = this.db.transaction((data: IndexRows) => {
      this.db.exec('DELETE FROM files')
      this.db.exec('DELETE FROM sessions')
      for (const s of data.sessions) insertSession.run(s)
      for (const f of data.files) insertFile.run(f)
    })
    replace(rows)
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
