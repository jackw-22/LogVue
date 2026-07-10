import { join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import type { SessionMetadata } from '@shared/types/session'
import { INDEX_FILE, NOTES_FILE, RESERVED_NAMES } from '../archive/paths'
import { readMetadataOrDefault } from '../archive/SessionStore'
import { guessFileKind } from '../import/fileKind'
import { extractRlogMetadata } from '../rlog/rlogMetadata'
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
  recorded_at: string | null
}

/** One row of the `session_tags` table — a (session, tag) membership for "tagged X" filters. */
export interface TagRow {
  session_id: string
  tag: string
}

/** One row of the `file_metadata` table — a metadata entry decoded from an .rlog's head. */
export interface FileMetadataRow {
  session_id: string
  filename: string
  key: string
  value: string
}

export interface IndexRows {
  sessions: SessionRow[]
  files: FileRow[]
  tags: TagRow[]
  fileMeta: FileMetadataRow[]
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
    imported_at: f.imported_at ?? null,
    recorded_at: f.recorded_at ?? null
  }))
}

/**
 * File rows for everything physically present in the session folder. Tracked
 * files keep their curated metadata; loose files are still indexed from disk so
 * copied-in logs show up in search/results before being formally imported.
 */
export function collectFileRows(dir: string, m: SessionMetadata): FileRow[] {
  const rowsByName = new Map(toFileRows(m.session_id, m).map((row) => [row.filename, row]))
  if (!existsSync(dir)) return [...rowsByName.values()]

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const name = entry.name
    if (RESERVED_NAMES.has(name) || name === NOTES_FILE || name === INDEX_FILE) continue
    if (rowsByName.has(name)) continue

    let fileSize: number | null = null
    try {
      fileSize = statSync(join(dir, name)).size
    } catch {
      fileSize = null
    }
    rowsByName.set(name, {
      session_id: m.session_id,
      filename: name,
      kind: guessFileKind(name),
      remote_path: null,
      original_filename: name,
      file_size_bytes: fileSize,
      imported_at: null,
      recorded_at: null
    })
  }

  return [...rowsByName.values()]
}

/**
 * Metadata rows for every `.rlog` physically present in `dir`, decoded from the
 * file heads. Unreadable/foreign files simply contribute no rows.
 */
export function collectFileMetadataRows(dir: string, files: FileRow[]): FileMetadataRow[] {
  const out: FileMetadataRow[] = []
  for (const f of files) {
    if (!f.filename.toLowerCase().endsWith('.rlog')) continue
    const meta = extractRlogMetadata(join(dir, f.filename))
    if (!meta) continue
    for (const [key, value] of Object.entries(meta)) {
      out.push({ session_id: f.session_id, filename: f.filename, key, value })
    }
  }
  return out
}

/** Deduped, blank-stripped (session, tag) rows for the tags table. */
export function toTagRows(sessionId: string, m: SessionMetadata): TagRow[] {
  const seen = new Set<string>()
  const rows: TagRow[] = []
  for (const raw of m.tags ?? []) {
    const tag = raw.trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    rows.push({ session_id: sessionId, tag })
  }
  return rows
}

function walk(dir: string, out: IndexRows): void {
  const { metadata } = readMetadataOrDefault(dir)
  const files = collectFileRows(dir, metadata)
  out.sessions.push(toSessionRow(dir, metadata))
  out.files.push(...files)
  out.tags.push(...toTagRows(metadata.session_id, metadata))
  out.fileMeta.push(...collectFileMetadataRows(dir, files))
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
  const out: IndexRows = { sessions: [], files: [], tags: [], fileMeta: [] }
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
