import { basename, join } from 'path'
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import {
  CURRENT_SCHEMA_VERSION,
  makeDefaultMetadata,
  parseSessionJson
} from '@shared/schema/sessionJson'
import type { SessionMetadata } from '@shared/types/session'
import { NOTES_FILE, SESSION_JSON } from './paths'

/**
 * `session.json` records imported-file metadata, but the session folder remains
 * authoritative for whether a file currently exists. Filter stale entries at
 * the read boundary so every consumer (tree, index, details, import matching)
 * sees the same reconciled view after an external deletion.
 *
 * This is deliberately non-mutating: merely browsing an unavailable/removable
 * archive must not rewrite its sidecars. A later app-owned metadata write will
 * persist the already-reconciled list.
 */
function filesPresentOnDisk(dir: string, metadata: SessionMetadata): SessionMetadata {
  const files = metadata.files.filter((file) => {
    // Session files live directly in the session folder, never in a child path.
    if (basename(file.filename) !== file.filename) return false
    try {
      return statSync(join(dir, file.filename)).isFile()
    } catch {
      return false
    }
  })
  return files.length === metadata.files.length ? metadata : { ...metadata, files }
}

/** Read and normalise a folder's `session.json`, or `null` if it has none. */
export function readMetadata(dir: string): SessionMetadata | null {
  const file = join(dir, SESSION_JSON)
  if (!existsSync(file)) return null
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as unknown
  return filesPresentOnDisk(dir, parseSessionJson(raw, basename(dir)))
}

/** Metadata for display, falling back to discovery defaults for a bare folder. */
export function readMetadataOrDefault(dir: string): {
  metadata: SessionMetadata
  hasSessionJson: boolean
} {
  const existing = readMetadata(dir)
  if (existing) return { metadata: existing, hasSessionJson: true }
  return { metadata: makeDefaultMetadata(basename(dir)), hasSessionJson: false }
}

/** Write metadata, always stamping `updated_at` and the current schema version. */
export function writeMetadata(dir: string, metadata: SessionMetadata): SessionMetadata {
  const next: SessionMetadata = {
    ...metadata,
    schema_version: CURRENT_SCHEMA_VERSION,
    updated_at: new Date().toISOString()
  }
  writeFileSync(join(dir, SESSION_JSON), JSON.stringify(next, null, 2) + '\n', 'utf-8')
  return next
}

export function readNotes(dir: string): string {
  const file = join(dir, NOTES_FILE)
  return existsSync(file) ? readFileSync(file, 'utf-8') : ''
}

export function writeNotes(dir: string, md: string): void {
  writeFileSync(join(dir, NOTES_FILE), md, 'utf-8')
}
