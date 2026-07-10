import { basename } from 'path'
import { formatBytes } from '@shared/format/bytes'
import type {
  BatchImportRequest,
  HubLogRef,
  ImportRequest,
  ImportResult,
  NewSessionImportRequest,
  NewSessionImportResult
} from '@shared/types/import'
import type { AdbLike } from '../adb/AdbClient'
import { readMetadataOrDefault } from '../archive/SessionStore'
import { startTask, type TaskHandle } from '../tasks/TaskService'
import { importBatchToSession, importToNewSession, type ImportHooks } from './ImportService'

/**
 * Wraps a batch import in an activity task (spec §7.4 + the progress bubble). Byte
 * counts come from polling the destination file — see pullProgress.ts — because
 * `adb pull` reports nothing while it runs.
 */

/** Hooks that drive `handle` from the import's per-file callbacks. */
function hooksFor(handle: TaskHandle, logs: HubLogRef[]): ImportHooks {
  const sizeOf = new Map(logs.map((l) => [l.remotePath, l.fileSize]))
  return {
    onFileStart: (remotePath) => handle.itemStatus(remotePath, 'active', null),
    onFileBytes: (remotePath, bytes) => handle.itemBytes(remotePath, bytes),
    onFileEnd: (remotePath, result) => {
      if (result.status === 'imported') {
        handle.itemStatus(remotePath, 'done', formatBytes(sizeOf.get(remotePath)))
      } else if (result.status === 'duplicate') {
        const where = result.existing[0]?.sessionLabel ?? 'library'
        handle.itemStatus(remotePath, 'duplicate', `already in ${where}`)
      } else {
        handle.itemStatus(remotePath, 'failed', result.error)
      }
    }
  }
}

/** Attach the retry payload to each failed item so the toast's Retry button can re-run it. */
function attachRetries(handle: TaskHandle, logs: HubLogRef[], sessionPath: string): void {
  for (const item of handle.task.items) {
    if (item.status !== 'failed') continue
    const log = logs.find((l) => l.remotePath === item.id)
    if (!log) continue
    const retry: ImportRequest = { ...log, sessionPath, force: true }
    item.retry = retry
  }
}

function finish(handle: TaskHandle, results: ImportResult[], label: string, sessionPath: string): void {
  const imported = results.filter((r) => r.status === 'imported').length
  const duplicates = results.filter((r) => r.status === 'duplicate').length
  const failed = results.filter((r) => r.status === 'failed').length

  if (failed === results.length && failed > 0) {
    const first = results.find((r) => r.status === 'failed')
    handle.fail(new Error(first && first.status === 'failed' ? first.error : 'Import failed'))
    return
  }

  const parts = [`${imported} imported`]
  if (duplicates > 0) parts.push(`${duplicates} already in library`)
  if (failed > 0) parts.push(`${failed} failed`)
  handle.patch({ title: `Imported to ${label}` })
  handle.succeed(parts.join(' · '), sessionPath)
}

function itemsFor(logs: HubLogRef[]): Array<{ id: string; label: string; bytes: number | null }> {
  return logs.map((l) => ({ id: l.remotePath, label: l.filename, bytes: l.fileSize }))
}

/** Import selected logs into an existing session, reported as one task. */
export async function runImportTask(
  adb: AdbLike,
  root: string | null | undefined,
  req: BatchImportRequest
): Promise<ImportResult[]> {
  const label = sessionLabel(req.sessionPath)
  const handle = startTask({
    kind: 'import',
    title: `Importing to ${label}`,
    subtitle: 'ADB pull · Control Hub',
    targetPath: req.sessionPath
  })
  handle.setItems(itemsFor(req.logs))

  try {
    const results = await importBatchToSession(adb, root, req, hooksFor(handle, req.logs))
    attachRetries(handle, req.logs, req.sessionPath)
    finish(handle, results, label, req.sessionPath)
    return results
  } catch (err) {
    handle.fail(err)
    throw err
  }
}

/** "Create session from selected" (spec §10), reported as one task. */
export async function runNewSessionImportTask(
  adb: AdbLike,
  root: string | null | undefined,
  req: NewSessionImportRequest
): Promise<NewSessionImportResult> {
  const handle = startTask({
    kind: 'import',
    title: `Importing to ${req.displayName}`,
    subtitle: 'ADB pull · Control Hub'
  })
  handle.setItems(itemsFor(req.logs))

  try {
    const res = await importToNewSession(adb, root, req, hooksFor(handle, req.logs))
    attachRetries(handle, req.logs, res.session.path)
    finish(handle, res.results, req.displayName, res.session.path)
    return res
  } catch (err) {
    handle.fail(err)
    throw err
  }
}

function sessionLabel(sessionPath: string): string {
  const { metadata } = readMetadataOrDefault(sessionPath)
  return metadata.display_name || basename(sessionPath)
}
