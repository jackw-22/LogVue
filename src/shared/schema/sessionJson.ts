import { z } from 'zod'
import { SESSION_TYPES } from '../constants/sessionTypes'
import { FILE_KINDS } from '../constants/fileKinds'
import type { SessionMetadata } from '../types/session'

export const CURRENT_SCHEMA_VERSION = 1

/**
 * Lenient by design: a hand-edited or older `session.json` must never crash the
 * app. Unknown keys pass through (future fields preserved); unknown enum values
 * fall back to `'other'`; missing required fields get defaults. See ARCHITECTURE §4.
 */

const sessionTypeSchema = z
  .string()
  .catch('other')
  .transform((v) => (SESSION_TYPES.includes(v as never) ? v : 'other'))

const fileKindSchema = z
  .string()
  .catch('other')
  .transform((v) => (FILE_KINDS.includes(v as never) ? v : 'other'))

const fileSchema = z
  .object({
    filename: z.string(),
    kind: fileKindSchema,
    source: z.string().default('unknown'),
    imported_at: z.string().default(''),
    remote_path: z.string().nullish(),
    original_filename: z.string().nullish(),
    file_size_bytes: z.number().nullish()
  })
  .passthrough()

const metadataSchema = z
  .object({
    schema_version: z.number().default(CURRENT_SCHEMA_VERSION),
    session_id: z.string().optional(),
    session_type: sessionTypeSchema.default('general_session'),
    display_name: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    session_start: z.string().nullish(),
    session_end: z.string().nullish(),
    sort_key: z.string().nullish(),
    tags: z.array(z.string()).default([]),
    notes_file: z.string().default('notes.md'),
    files: z.array(fileSchema).default([])
  })
  .passthrough()

function nowIso(): string {
  return new Date().toISOString()
}

/** Discovery defaults for a folder with no `session.json` (spec §4.2). */
export function makeDefaultMetadata(folderName: string, now = nowIso()): SessionMetadata {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    session_id: crypto.randomUUID(),
    session_type: 'general_session',
    display_name: folderName,
    created_at: now,
    updated_at: now,
    session_start: null,
    session_end: null,
    sort_key: null,
    tags: [],
    notes_file: 'notes.md',
    files: []
  }
}

/**
 * Parse raw `session.json` contents into normalised metadata, filling any missing
 * required fields from `folderName`/now. Throws only if `raw` isn't an object.
 */
export function parseSessionJson(raw: unknown, folderName: string, now = nowIso()): SessionMetadata {
  const parsed = metadataSchema.parse(raw)
  return {
    ...parsed,
    schema_version: parsed.schema_version ?? CURRENT_SCHEMA_VERSION,
    session_id: parsed.session_id || crypto.randomUUID(),
    display_name: parsed.display_name || folderName,
    created_at: parsed.created_at || now,
    updated_at: parsed.updated_at || now
  } as SessionMetadata
}
