import { join } from 'path'
import { existsSync } from 'fs'
import { INDEX_FILE } from '../archive/paths'
import { readMetadataOrDefault } from '../archive/SessionStore'
import type { LogQueryRow, SessionQuery, SessionQueryResult } from '@shared/types/query'
import type { FileKind, SessionType } from '@shared/types/session'
import { parseRlogFilename } from '../adb/rlogFilename'
import { IndexStore } from './IndexStore'
import {
  collectFileMetadataRows,
  collectFileRows,
  rebuildIndex,
  toSessionRow,
  toTagRows
} from './rebuild'

/**
 * Owns the single open `IndexStore` for the current archive root. The DB file lives
 * at `<archiveRoot>/index.sqlite` (RESERVED, so the scanner skips it). Reopens when
 * the root changes; the index is disposable, so we never migrate data across roots.
 */
let current: { root: string; store: IndexStore } | null = null

function dbPath(root: string): string {
  return join(root, INDEX_FILE)
}

/** Get (opening if needed) the index store bound to `root`, or null when no root is set. */
export function getIndexStore(root: string | null | undefined): IndexStore | null {
  if (!root || !existsSync(root)) return null
  if (current && current.root === root) return current.store
  current?.store.close()
  current = { root, store: new IndexStore(dbPath(root)) }
  return current.store
}

/** Force a full rescan of `root` into the index. Returns row counts (§5 `archive:rebuildIndex`). */
export function rebuild(root: string | null | undefined): { sessions: number; files: number } {
  const store = getIndexStore(root)
  if (!store) return { sessions: 0, files: 0 }
  return rebuildIndex(store, root as string)
}

/**
 * Re-index a single session from disk after an import (spec §6.1 step 4), so its hub
 * logs flip to "imported" without a full rescan. No-op when no index is open.
 */
export function reindexSession(root: string | null | undefined, path: string): void {
  const store = getIndexStore(root)
  if (!store) return
  const { metadata } = readMetadataOrDefault(path)
  const files = collectFileRows(path, metadata)
  store.indexSession(
    toSessionRow(path, metadata),
    files,
    toTagRows(metadata.session_id, metadata),
    collectFileMetadataRows(path, files)
  )
}

/**
 * Run a structured filter/search over the index (spec §12). Returns matching rows
 * plus the whole-archive facet counts for the filter controls. When no index is open
 * (no root) returns an empty result rather than throwing.
 */
export function querySessions(
  root: string | null | undefined,
  query: SessionQuery
): SessionQueryResult {
  const store = getIndexStore(root)
  if (!store) return { rows: [], total: 0, facets: emptyFacets() }
  const rows = store.querySessions(query)
  return { rows, total: rows.length, facets: store.facets() }
}

/**
 * Log-level filter/search for the "All logs" dashboard (quick-find): every imported
 * log matching the session-level query, hydrated with an op-mode and recorded
 * timestamp parsed from its filename (imported_at as fallback), newest-first.
 */
export function queryLogs(root: string | null | undefined, query: SessionQuery): LogQueryRow[] {
  const store = getIndexStore(root)
  if (!store) return []
  const rows = store.queryLogs(query).map((r): LogQueryRow => {
    const { opmode, parsed_timestamp } = parseRlogFilename(r.filename)
    return {
      sessionPath: r.path,
      sessionLabel: r.display_name,
      sessionType: r.session_type as SessionType,
      alliance: r.alliance,
      filename: r.filename,
      kind: r.kind as FileKind,
      opmode,
      sizeBytes: r.file_size_bytes,
      recorded: parsed_timestamp ?? r.imported_at
    }
  })
  // Newest first; rows without any timestamp sink to the end.
  return rows.sort((a, b) => {
    if (a.recorded && b.recorded) return a.recorded < b.recorded ? 1 : a.recorded > b.recorded ? -1 : 0
    if (a.recorded) return -1
    if (b.recorded) return 1
    return a.filename.localeCompare(b.filename)
  })
}

/** Total bytes of every indexed file (0 when no index is open). Fresh as of the last reindex. */
export function librarySizeBytes(root: string | null | undefined): number {
  return getIndexStore(root)?.totalFileSizeBytes() ?? 0
}

function emptyFacets(): SessionQueryResult['facets'] {
  return { sessionTypes: [], events: [], teams: [], alliances: [], kinds: [], tags: [] }
}

/**
 * Cold start (ARCHITECTURE §6.2): open the index for `root` and build it if empty.
 * A stale schema is handled inside IndexStore (derived tables get dropped), so an
 * empty index there triggers a rebuild here. Safe to call with no root (no-op).
 */
export function ensureIndexBuilt(root: string | null | undefined): void {
  const store = getIndexStore(root)
  if (!store) return
  if (store.counts().sessions === 0) rebuildIndex(store, root as string)
}

/** Release the open DB handle (call on app quit). */
export function closeIndex(): void {
  current?.store.close()
  current = null
}
