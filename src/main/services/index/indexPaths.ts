import { existsSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { INDEX_FILE, INTERNAL_DIR } from '../archive/paths'

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
