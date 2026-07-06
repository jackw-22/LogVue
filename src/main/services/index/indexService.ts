import { join } from 'path'
import { existsSync } from 'fs'
import { INDEX_FILE } from '../archive/paths'
import { readMetadataOrDefault } from '../archive/SessionStore'
import type { SessionQuery, SessionQueryResult } from '@shared/types/query'
import { IndexStore } from './IndexStore'
import { rebuildIndex, toFileRows, toSessionRow, toTagRows } from './rebuild'

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
  store.indexSession(
    toSessionRow(path, metadata),
    toFileRows(metadata.session_id, metadata),
    toTagRows(metadata.session_id, metadata)
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
