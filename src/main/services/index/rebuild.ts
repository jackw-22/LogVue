import { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import type { SessionMetadata } from '@shared/types/session'
import { readMetadataOrDefault } from '../archive/SessionStore'
import type { IndexStore } from './IndexStore'

/** One row of the `sessions` table — a flattened, queryable projection of `session.json`. */
export interface SessionRow {
  session_id: string
  path: string
  session_type: string
  display_name: string
  event_code: string | null
  team_number: number | null
  alliance: string | null
  session_start: string | null
  sort_key: string | null
  updated_at: string | null
}

/** One row of the `files` table — a session's imported files, for "has kind"/"missing kind" filters. */
export interface FileRow {
  session_id: string
  filename: string
  kind: string
  remote_path: string | null
  original_filename: string | null
  file_size_bytes: number | null
  imported_at: string | null
}

export interface IndexRows {
  sessions: SessionRow[]
  files: FileRow[]
}

/** Flatten a session's metadata into the row the `sessions` table stores. */
export function toSessionRow(path: string, m: SessionMetadata): SessionRow {
  return {
    session_id: m.session_id,
    path,
    session_type: m.session_type,
    display_name: m.display_name,
    event_code: m.event?.display_code ?? m.event?.ftcscout_code ?? null,
    team_number: m.match?.team_number ?? m.teams?.[0] ?? null,
    alliance: m.match?.alliance ?? null,
    session_start: m.session_start ?? null,
    sort_key: m.sort_key ?? m.session_start ?? null,
    updated_at: m.updated_at ?? null
  }
}

export function toFileRows(sessionId: string, m: SessionMetadata): FileRow[] {
  return m.files.map((f) => ({
    session_id: sessionId,
    filename: f.filename,
    kind: f.kind,
    remote_path: f.remote_path ?? null,
    original_filename: f.original_filename ?? null,
    file_size_bytes: f.file_size_bytes ?? null,
    imported_at: f.imported_at ?? null
  }))
}

function walk(dir: string, out: IndexRows): void {
  const { metadata } = readMetadataOrDefault(dir)
  out.sessions.push(toSessionRow(dir, metadata))
  out.files.push(...toFileRows(metadata.session_id, metadata))
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(dir, entry.name), out)
  }
}

/**
 * Pure disk → rows projection (no database involved), so it's unit-testable without
 * the native `better-sqlite3` binary. Walks every folder under `root` — each is a
 * session (bare folders get discovery-default metadata, mirroring the tree scan) —
 * and flattens it into `sessions`/`files` rows.
 */
export function collectIndexRows(root: string): IndexRows {
  const out: IndexRows = { sessions: [], files: [] }
  if (!root || !existsSync(root)) return out
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(root, entry.name), out)
  }
  return out
}

/**
 * Full rebuild: rescan `root` from disk and replace the derived tables. Preserves
 * user/cache-only tables (`ignored_hublogs`, `ftcscout_cache`). Returns row counts.
 */
export function rebuildIndex(store: IndexStore, root: string): { sessions: number; files: number } {
  const rows = collectIndexRows(root)
  store.replaceSessions(rows)
  return { sessions: rows.sessions.length, files: rows.files.length }
}
