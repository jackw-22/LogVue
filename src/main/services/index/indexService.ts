import { existsSync } from 'fs'
import { readMetadataOrDefault } from '../archive/SessionStore'
import type { LogQueryRow, SessionQuery, SessionQueryResult } from '@shared/types/query'
import type { FileKind, SessionType } from '@shared/types/session'
import { parseRlogFilename } from '../adb/rlogFilename'
import { IndexStore } from './IndexStore'
import { canonicalPath, ensureIndexLocation } from './indexPaths'
import {
  collectFileMetadataRows,
  collectFileRows,
  rebuildIndex,
  toSessionRow,
  toTagRows
} from './rebuild'

/**
 * Owns the single open `IndexStore` for the current archive root. The DB file lives
 * at `<archiveRoot>/.logvue/index.sqlite`; the app-owned directory is excluded from
 * archive scans. Reopens when the root changes.
 */
let current: { root: string; store: IndexStore } | null = null

/**
 * Get (opening if needed) the index store bound to `root`, or null when no root is
 * set. The root is canonicalised once here and that spelling is used for the scan
 * walk and for every key conversion, so caller-provided variants (case, separators,
 * symlinks) all land on the same store and the same row identities.
 */
export function getIndexStore(root: string | null | undefined): IndexStore | null {
  if (!root || !existsSync(root)) return null
  const canonicalRoot = canonicalPath(root)
  if (current && current.root === canonicalRoot) return current.store
  current?.store.close()
  current = { root: canonicalRoot, store: new IndexStore(ensureIndexLocation(canonicalRoot), canonicalRoot) }
  return current.store
}

/** Force a full rescan of `root` into the index. Returns row counts (§5 `archive:rebuildIndex`). */
export function rebuild(root: string | null | undefined): { sessions: number; files: number } {
  const store = getIndexStore(root)
  if (!store) return { sessions: 0, files: 0 }
  return rebuildIndex(store, store.archiveRoot)
}

/**
 * Re-index a single session from disk after an import (spec §6.1 step 4), so its hub
 * logs flip to "imported" without a full rescan. No-op when no index is open. The
 * caller-provided path is canonicalised so an alternate spelling of an already-indexed
 * folder updates that row instead of minting a duplicate.
 */
export function reindexSession(root: string | null | undefined, path: string): void {
  const store = getIndexStore(root)
  if (!store) return
  const dir = canonicalPath(path)
  const { metadata } = readMetadataOrDefault(dir)
  const files = collectFileRows(dir, metadata)
  store.indexSession(
    toSessionRow(dir, metadata),
    files,
    toTagRows(dir, metadata),
    collectFileMetadataRows(dir, files)
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
      recorded: r.recorded_at ?? parsed_timestamp ?? r.imported_at
    }
  })
  // Newest first; rows without any timestamp sink to the end.
  return rows.sort((a, b) => {
    const aTime = a.recorded ? Date.parse(a.recorded) : NaN
    const bTime = b.recorded ? Date.parse(b.recorded) : NaN
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime
    if (Number.isFinite(aTime)) return -1
    if (Number.isFinite(bTime)) return 1
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
 * A non-empty index is trusted as-is: its keys are archive-relative, so they stay
 * valid even when the whole archive folder was moved since the last run.
 */
export function ensureIndexBuilt(root: string | null | undefined): void {
  const store = getIndexStore(root)
  if (!store) return
  if (store.counts().sessions === 0) rebuildIndex(store, store.archiveRoot)
}

/** Release the open DB handle (call on app quit). */
export function closeIndex(): void {
  current?.store.close()
  current = null
}
