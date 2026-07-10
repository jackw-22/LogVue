import { basename } from 'path'
import { utimes } from 'fs/promises'
import type {
  ImportRequest,
  ImportResult,
  NewSessionImportRequest,
  NewSessionImportResult
} from '@shared/types/import'
import type { Session, SessionFile } from '@shared/types/session'
import { createSession } from '../archive/ArchiveService'
import { readMetadataOrDefault, writeMetadata } from '../archive/SessionStore'
import { uniqueFilePath } from '../archive/paths'
import type { AdbLike } from '../adb/AdbClient'
import { getIndexStore, reindexSession } from '../index/indexService'
import { guessFileKind } from './fileKind'
import { findDuplicates } from './identity'

/**
 * The core action (ARCHITECTURE §6.1, spec §7.4): pull a remote hub log into a
 * session folder, append it to `session.json`, and update the index. Never renames
 * or deletes the remote file (invariant #7); import *appends* (invariant #4).
 *
 *   1. duplicate check against the index (skipped when `force`) — spec §14
 *   2. `adb pull` into the session folder (original name kept, collisions suffixed)
 *   3. append a `SessionFile` to `session.json`, bumping `updated_at`
 *   4. re-index the session so the hub-log row flips to "imported"
 */
export async function importToSession(
  adb: AdbLike,
  root: string | null | undefined,
  req: ImportRequest
): Promise<ImportResult> {
  if (!req.force) {
    const store = getIndexStore(root)
    if (store) {
      const existing = findDuplicates(req, store.importsOf(req.remotePath))
      if (existing.length > 0) return { status: 'duplicate', existing }
    }
  }

  // The target must be a real session; a bare folder gets a session.json written
  // (discovery defaults) so the import always lands in something recognised.
  const { metadata } = readMetadataOrDefault(req.sessionPath)

  const destPath = uniqueFilePath(req.sessionPath, req.filename)
  await adb.pull(req.remotePath, destPath)
  const recordedMs = req.recordedAt ? Date.parse(req.recordedAt) : NaN
  if (Number.isFinite(recordedMs)) {
    const recordedDate = new Date(recordedMs)
    await utimes(destPath, recordedDate, recordedDate)
  }

  const file: SessionFile = {
    filename: basename(destPath),
    kind: req.kind ?? guessFileKind(req.filename),
    source: 'control_hub',
    imported_at: new Date().toISOString(),
    recorded_at: Number.isFinite(recordedMs) ? new Date(recordedMs).toISOString() : null,
    remote_path: req.remotePath,
    original_filename: req.filename,
    file_size_bytes: req.fileSize
  }

  const written = writeMetadata(req.sessionPath, {
    ...metadata,
    files: [...metadata.files, file]
  })
  reindexSession(root, req.sessionPath)

  const session: Session = {
    path: req.sessionPath,
    name: basename(req.sessionPath),
    metadata: written,
    hasSessionJson: true
  }
  return { status: 'imported', session, file }
}

/**
 * "Create session from selected" (spec §10): make a fresh session, then import the
 * chosen logs into it. Imports are forced — a brand-new folder can't hold a
 * duplicate, and the user explicitly asked for these logs here.
 */
export async function importToNewSession(
  adb: AdbLike,
  root: string | null | undefined,
  req: NewSessionImportRequest
): Promise<NewSessionImportResult> {
  const session = createSession({
    parentPath: req.parentPath,
    displayName: req.displayName,
    sessionType: req.sessionType
  })

  const results: ImportResult[] = []
  for (const log of req.logs) {
    results.push(
      await importToSession(adb, root, {
        remotePath: log.remotePath,
        filename: log.filename,
        fileSize: log.fileSize,
        recordedAt: log.recordedAt,
        sessionPath: session.path,
        force: true
      })
    )
  }
  return { session, results }
}
