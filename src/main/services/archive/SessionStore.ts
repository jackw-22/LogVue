import { basename, join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import {
  CURRENT_SCHEMA_VERSION,
  makeDefaultMetadata,
  parseSessionJson
} from '@shared/schema/sessionJson'
import type { SessionMetadata } from '@shared/types/session'
import { NOTES_FILE, SESSION_JSON } from './paths'

/** Read and normalise a folder's `session.json`, or `null` if it has none. */
export function readMetadata(dir: string): SessionMetadata | null {
  const file = join(dir, SESSION_JSON)
  if (!existsSync(file)) return null
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as unknown
  return parseSessionJson(raw, basename(dir))
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
