import { basename, join } from 'path'
import { copyFileSync, existsSync, readFileSync, statSync } from 'fs'
import {
  CURRENT_SCHEMA_VERSION,
  makeDefaultMetadata,
  parseSessionJson
} from '@shared/schema/sessionJson'
import type { SessionMetadata } from '@shared/types/session'
import { writeFileAtomic } from '../../lib/atomicWrite'
import { NOTES_FILE, SESSION_JSON, uniqueFilePath } from './paths'

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

/**
 * The three states a folder's `session.json` can be in. `missing` and `invalid`
 * are deliberately distinct: both degrade to bare-folder defaults for display,
 * but an invalid file is existing user data — it must be surfaced as a warning
 * and backed up before the app ever writes over it.
 */
export type MetadataProbe =
  | { state: 'missing' }
  | { state: 'invalid'; error: string }
  | { state: 'valid'; metadata: SessionMetadata }

/**
 * Classify and (when possible) parse a folder's `session.json`. session.json is
 * user-editable (the MCP instructions actively invite hand edits), so a corrupt
 * or foreign file must degrade that one folder instead of failing the whole tree
 * scan or index rebuild. Probing never mutates the file.
 */
export function probeMetadata(dir: string): MetadataProbe {
  const file = join(dir, SESSION_JSON)
  if (!existsSync(file)) return { state: 'missing' }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as unknown
    return { state: 'valid', metadata: filesPresentOnDisk(dir, parseSessionJson(raw, basename(dir))) }
  } catch (err) {
    console.warn(`Unreadable session.json in ${dir}:`, err)
    return { state: 'invalid', error: err instanceof Error ? err.message : String(err) }
  }
}

/** Read and normalise a folder's `session.json`, or `null` if it's missing or unreadable. */
export function readMetadata(dir: string): SessionMetadata | null {
  const probe = probeMetadata(dir)
  return probe.state === 'valid' ? probe.metadata : null
}

/** Metadata for display, falling back to discovery defaults for a bare folder. */
export function readMetadataOrDefault(dir: string): {
  metadata: SessionMetadata
  hasSessionJson: boolean
  /** True when a session.json exists but couldn't be read — surfaced as a warning in the UI. */
  metadataInvalid: boolean
} {
  const probe = probeMetadata(dir)
  if (probe.state === 'valid') {
    return { metadata: probe.metadata, hasSessionJson: true, metadataInvalid: false }
  }
  return {
    metadata: makeDefaultMetadata(basename(dir)),
    hasSessionJson: false,
    metadataInvalid: probe.state === 'invalid'
  }
}

/**
 * An invalid (but existing) session.json is user data the app is about to
 * replace — preserve it first. The backup name never collides (`_2` suffixing)
 * so repeated repair attempts can't overwrite an earlier backup.
 */
function backupInvalidMetadata(dir: string): void {
  if (probeMetadata(dir).state !== 'invalid') return
  const backup = uniqueFilePath(dir, `${SESSION_JSON}.bak`)
  copyFileSync(join(dir, SESSION_JSON), backup)
  console.warn(`Backed up invalid session.json in ${dir} to ${basename(backup)}`)
}

/**
 * Write metadata, always stamping `updated_at` and the current schema version.
 * This is the only place a `session_id` is minted — reads never generate ids.
 * Every metadata writer funnels through here, so an invalid existing file is
 * always backed up before being replaced.
 */
export function writeMetadata(dir: string, metadata: SessionMetadata): SessionMetadata {
  backupInvalidMetadata(dir)
  const next: SessionMetadata = {
    ...metadata,
    schema_version: CURRENT_SCHEMA_VERSION,
    session_id: metadata.session_id || crypto.randomUUID(),
    updated_at: new Date().toISOString()
  }
  writeFileAtomic(join(dir, SESSION_JSON), JSON.stringify(next, null, 2) + '\n')
  return next
}

export function readNotes(dir: string): string {
  const file = join(dir, NOTES_FILE)
  return existsSync(file) ? readFileSync(file, 'utf-8') : ''
}

export function writeNotes(dir: string, md: string): void {
  writeFileAtomic(join(dir, NOTES_FILE), md)
}
