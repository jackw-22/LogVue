import type {
  BatchImportRequest,
  ImportRequest,
  ImportResult,
  NewSessionImportRequest,
  NewSessionImportResult
} from '@shared/types/import'
import type {
  CreateSessionInput,
  DeleteSessionSummary,
  Session,
  SessionMetadata
} from '@shared/types/session'
import type { FtcScoutSyncRequest, FtcScoutSyncResult } from '@shared/types/ftcscout'
import type { AdbLike } from '../services/adb/AdbClient'
import * as archive from '../services/archive/ArchiveService'
import { writeNotes } from '../services/archive/SessionStore'
import { FtcScoutClient } from '../services/ftcscout/FtcScoutClient'
import { syncFtcScoutEvent, type SyncHooks } from '../services/ftcscout/syncEvent'
import {
  importBatchToSession,
  importToNewSession,
  importToSession,
  type ImportHooks
} from '../services/import/ImportService'
import { rebuild, reindexSession } from '../services/index/indexService'
import { notifyArchiveChanged, pauseArchiveWatcher } from '../services/watcher/Watcher'

type ArchiveRoot = string | null | undefined

export interface NotifyCommandEffects {
  notifyArchiveChanged(root: string, paths: string[]): void
}

export interface ReindexCommandEffects extends NotifyCommandEffects {
  reindexSession(root: ArchiveRoot, path: string): void
}

export interface RebuildCommandEffects extends NotifyCommandEffects {
  rebuild(root: ArchiveRoot): { sessions: number; files: number }
}

export interface ImportCommandEffects extends ReindexCommandEffects {
  pauseArchiveWatcher(): () => void
}

const notifyEffects: NotifyCommandEffects = { notifyArchiveChanged }
const reindexEffects: ReindexCommandEffects = { notifyArchiveChanged, reindexSession }
const rebuildEffects: RebuildCommandEffects = { notifyArchiveChanged, rebuild }
const importEffects: ImportCommandEffects = {
  notifyArchiveChanged,
  pauseArchiveWatcher,
  reindexSession
}

function notifyIfConfigured(
  root: ArchiveRoot,
  paths: string[],
  effects: NotifyCommandEffects
): void {
  if (root) effects.notifyArchiveChanged(root, paths)
}

/** Create archive truth, refresh its index projection, then notify every renderer. */
export function createSessionCommand(
  root: ArchiveRoot,
  input: CreateSessionInput,
  effects: ReindexCommandEffects = reindexEffects
): Session {
  const session = archive.createSession(input)
  effects.reindexSession(root, session.path)
  notifyIfConfigured(root, [session.path], effects)
  return session
}

/** Persist a metadata edit and keep all consumers in step with the resulting session. */
export function updateMetaCommand(
  root: ArchiveRoot,
  path: string,
  patch: Partial<SessionMetadata>,
  effects: ReindexCommandEffects = reindexEffects
): Session {
  const session = archive.updateMeta(path, patch)
  effects.reindexSession(root, session.path)
  notifyIfConfigured(root, [session.path], effects)
  return session
}

/** Promote a bare folder, index the new session, and publish the mutation. */
export function promoteFolderCommand(
  root: ArchiveRoot,
  path: string,
  effects: ReindexCommandEffects = reindexEffects
): Session {
  const session = archive.promoteFolder(path)
  effects.reindexSession(root, session.path)
  notifyIfConfigured(root, [session.path], effects)
  return session
}

/** Delete needs a full rebuild because every descendant row may have disappeared. */
export function deleteSessionCommand(
  root: ArchiveRoot,
  path: string,
  effects: RebuildCommandEffects = rebuildEffects
): DeleteSessionSummary {
  const summary = archive.deleteSession(root, path)
  effects.rebuild(root)
  notifyIfConfigured(root, [summary.path], effects)
  return summary
}

/** Notes are archive truth but are not projected into the current index. */
export function writeNotesCommand(
  root: ArchiveRoot,
  path: string,
  markdown: string,
  effects: NotifyCommandEffects = notifyEffects
): void {
  writeNotes(path, markdown)
  notifyIfConfigured(root, [path], effects)
}

/** Explicitly rebuild the disposable projection and publish its fresh state. */
export function rebuildIndexCommand(
  root: ArchiveRoot,
  effects: RebuildCommandEffects = rebuildEffects
): { sessions: number; files: number } {
  const counts = effects.rebuild(root)
  if (root) effects.notifyArchiveChanged(root, [root])
  return counts
}

async function withPausedArchiveWatcher<T>(
  effects: ImportCommandEffects,
  action: () => Promise<T>
): Promise<T> {
  const resumeWatcher = effects.pauseArchiveWatcher()
  try {
    return await action()
  } finally {
    resumeWatcher()
  }
}

/** Pull one hub log, then update the session projection and renderer state once. */
export function importHubLogCommand(
  adb: AdbLike,
  root: ArchiveRoot,
  request: ImportRequest,
  hooks?: ImportHooks,
  effects: ImportCommandEffects = importEffects
): Promise<ImportResult> {
  return withPausedArchiveWatcher(effects, async () => {
    // Completion is reported only after the derived projection is current. Keep
    // start/byte progress live while deferring the observational end callback.
    const serviceHooks = hooks ? { ...hooks, onFileEnd: undefined } : undefined
    const result = await importToSession(adb, root, request, serviceHooks)
    if (result.status === 'imported') {
      effects.reindexSession(root, result.session.path)
      notifyIfConfigured(root, [result.session.path], effects)
    }
    hooks?.onFileEnd?.(request.remotePath, result)
    return result
  })
}

/** Import a batch with one final projection refresh, preserving request order. */
export function batchImportHubLogsCommand(
  adb: AdbLike,
  root: ArchiveRoot,
  request: BatchImportRequest,
  hooks?: ImportHooks,
  effects: ImportCommandEffects = importEffects
): Promise<ImportResult[]> {
  return withPausedArchiveWatcher(effects, async () => {
    const results = await importBatchToSession(adb, root, request, hooks)
    effects.reindexSession(root, request.sessionPath)
    if (results.some((result) => result.status === 'imported')) {
      notifyIfConfigured(root, [request.sessionPath], effects)
    }
    return results
  })
}

/** Create a session and import its selected logs as one archive mutation. */
export function importHubLogsToNewSessionCommand(
  adb: AdbLike,
  root: ArchiveRoot,
  request: NewSessionImportRequest,
  hooks?: ImportHooks,
  effects: ImportCommandEffects = importEffects
): Promise<NewSessionImportResult> {
  return withPausedArchiveWatcher(effects, async () => {
    const result = await importToNewSession(adb, root, request, hooks)
    effects.reindexSession(root, result.session.path)
    notifyIfConfigured(root, [result.session.path], effects)
    return result
  })
}

/** Keep FTCScout's activity presentation outside the mutation/notification seam. */
export async function syncFtcScoutEventCommand(
  client: FtcScoutClient,
  root: ArchiveRoot,
  request: FtcScoutSyncRequest,
  hooks?: SyncHooks,
  effects: ReindexCommandEffects = reindexEffects
): Promise<FtcScoutSyncResult> {
  const touchedPaths: string[] = []
  const result = await syncFtcScoutEvent(client, root, request, hooks, (path) => {
    effects.reindexSession(root, path)
    touchedPaths.push(path)
  })
  notifyIfConfigured(root, touchedPaths, effects)
  return result
}
