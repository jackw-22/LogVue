import { existsSync, mkdirSync, realpathSync, renameSync } from 'fs'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { INDEX_FILE, INTERNAL_DIR } from '../archive/paths'

/**
 * One canonical spelling for a path: absolute, symlinks resolved, and — on
 * Windows — the on-disk casing and drive letter via `realpath.native`. Every
 * path entering the index layer goes through this, so case or separator
 * variants of the same folder (e.g. an MCP caller's `c:/archive/q4`) can't
 * mint a second identity under SQLite's binary string equality. Falls back to
 * plain resolution for paths that don't exist.
 */
export function canonicalPath(p: string): string {
  const resolved = resolve(p)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

/**
 * The index's session key: the archive-relative path with `/` separators.
 * Relative keys stay valid when the archive folder is moved or synced to
 * another machine — the absolute root is joined back on only at the query
 * boundary. Both arguments must already be canonical (`canonicalPath`).
 */
export function toArchiveKey(root: string, absPath: string): string {
  const rel = relative(root, absPath)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path is not inside the archive root: ${absPath}`)
  }
  return rel.split(sep).join('/')
}

/** Inverse of {@link toArchiveKey}: absolute path for a stored session key. */
export function fromArchiveKey(root: string, key: string): string {
  return join(root, ...key.split('/'))
}

/** SQLite sidecars that must travel with the main database during migration. */
const SQLITE_SIDECARS = ['-wal', '-shm', '-journal'] as const

export function indexDirectory(root: string): string {
  return join(root, INTERNAL_DIR)
}

export function indexPath(root: string): string {
  return join(indexDirectory(root), INDEX_FILE)
}

/**
 * Ensure the app-owned directory exists and migrate the legacy root-level SQLite
 * family when necessary. Sidecars move before the main file so an interrupted
 * migration can safely resume next launch; the main file's presence marks the new
 * location as authoritative.
 */
export function ensureIndexLocation(root: string): string {
  const dir = indexDirectory(root)
  mkdirSync(dir, { recursive: true })

  const current = indexPath(root)
  const legacy = join(root, INDEX_FILE)
  if (existsSync(current) || !existsSync(legacy)) return current

  for (const suffix of [...SQLITE_SIDECARS, '']) {
    const from = `${legacy}${suffix}`
    const to = `${current}${suffix}`
    if (existsSync(from) && !existsSync(to)) renameSync(from, to)
  }
  return current
}
