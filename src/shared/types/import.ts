/**
 * Types for the import flow (Phase 3 — spec §7.4, §9.3, §10, §14). Importing pulls
 * a remote hub log off the Control Hub, copies it into a session folder, appends a
 * {@link SessionFile} to that session's `session.json`, and updates the index. The
 * remote file is never renamed or deleted (invariant #7).
 */

import type { FileKind } from '../constants/fileKinds'
import type { SessionType } from '../constants/sessionTypes'
import type { Session, SessionFile } from './session'

/** The minimal remote-file reference the renderer sends to import or ignore a log. */
export interface HubLogRef {
  remotePath: string
  /** Original remote basename — kept as the imported filename (spec §22 default). */
  filename: string
  fileSize: number | null
  recordedAt?: string | null
}

export interface ImportRequest extends HubLogRef {
  /** Absolute path of the target session folder. */
  sessionPath: string
  /** Override the guessed file kind (user-editable later). */
  kind?: FileKind
  /** Import even when a duplicate is detected — spec §14 "Import another copy". */
  force?: boolean
}

/** Where an already-imported copy of a remote file lives (spec §14 duplicate warning). */
export interface ImportedFileLocation {
  sessionPath: string
  sessionLabel: string
  filename: string
}

/**
 * Result of an import. `duplicate` is returned (without pulling) when the same
 * remote file is already imported and the request didn't `force` — the renderer
 * then offers Cancel / Import another copy (spec §14).
 *
 * `failed` only ever comes back from a *batch* import, where one unreadable file
 * must not abandon the rest. A single `import:toSession` still throws.
 */
export type ImportResult =
  | { status: 'imported'; session: Session; file: SessionFile }
  | { status: 'duplicate'; existing: ImportedFileLocation[] }
  | { status: 'failed'; error: string }

/** Import several logs into one existing session, in order (spec §7.4 batch). */
export interface BatchImportRequest {
  sessionPath: string
  logs: HubLogRef[]
  /** Import even when a duplicate is detected — spec §14 "Import another copy". */
  force?: boolean
}

/** Create a fresh session, then import the selected logs into it (spec §10 general workflow). */
export interface NewSessionImportRequest {
  parentPath: string
  displayName: string
  sessionType: SessionType
  logs: HubLogRef[]
}

export interface NewSessionImportResult {
  session: Session
  /** One result per requested log, in order (all forced — a brand-new folder can't collide). */
  results: ImportResult[]
}
