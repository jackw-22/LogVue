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

/**
 * A non-colliding file path in `dir` for `filename`, disambiguating before the
 * extension (`log.rlog` → `log_2.rlog`). Import keeps the original name (spec §22),
 * so a re-imported copy into the same folder gets a suffix rather than overwriting.
 */
export function uniqueFilePath(dir: string, filename: string): string {
  let candidate = join(dir, filename)
  if (!existsSync(candidate)) return candidate
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ''
  let n = 2
  do {
    candidate = join(dir, `${stem}_${n}${ext}`)
    n += 1
  } while (existsSync(candidate))
  return candidate
}
