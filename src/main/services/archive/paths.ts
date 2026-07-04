import { join } from 'path'
import { existsSync } from 'fs'

export const SESSION_JSON = 'session.json'
export const NOTES_FILE = 'notes.md'
export const INDEX_FILE = 'index.sqlite'

/** Files/folders the scanner ignores as archive plumbing, not content. */
export const RESERVED_NAMES = new Set([SESSION_JSON, INDEX_FILE])

// Characters illegal in Windows/POSIX file names. Spaces (→ underscore) and
// hyphens (legal, readable) are deliberately NOT in this set.
const ILLEGAL_FS_CHARS = new RegExp('[<>:"/\\\\|?*\\x00-\\x1f]', 'g')

/**
 * Turn a human display name into a filesystem-safe folder name while keeping it
 * readable (spec §3.1: natural names, no sequence prefixes). "Q4 Blue B2" →
 * "Q4_Blue_B2".
 */
export function toFolderName(displayName: string): string {
  const cleaned = displayName
    .trim()
    .replace(ILLEGAL_FS_CHARS, '')
    .replace(/\s+/g, '_') // word boundaries → underscores
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
  return cleaned || 'session'
}

/** Return a child directory path under `parent` that doesn't collide (base, base_2, …). */
export function uniqueChildDir(parent: string, base: string): string {
  let candidate = join(parent, base)
  let n = 2
  while (existsSync(candidate)) {
    candidate = join(parent, `${base}_${n}`)
    n += 1
  }
  return candidate
}
