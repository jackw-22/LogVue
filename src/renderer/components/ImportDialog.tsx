import { useMemo, useState } from 'react'
import { SELECTABLE_SESSION_TYPES, SESSION_TYPE_LABELS } from '@shared/constants/sessionTypes'
import type { SessionType, SessionNode } from '@shared/types/session'
import type { HubLog, HubTimeSample } from '@shared/types/hublog'
import type { HubLogRef } from '@shared/types/import'
import { useArchiveTree, useImportBatchToSession, useImportToNewSession } from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { correctedHubTimestamp } from '../lib/time'

interface Props {
  logs: HubLog[]
  archiveRoot: string
  /** Start on the "new session" tab (the "Create session from selected" action). */
  initialMode?: Mode
  onClose: () => void
  onImported: () => void
  correctHubTime: boolean
  hubTime: HubTimeSample | undefined
}

type Mode = 'existing' | 'new'

/** Flattened tree row for the session picker. */
interface FlatNode {
  path: string
  label: string
  depth: number
}

function flatten(nodes: SessionNode[], depth = 0, out: FlatNode[] = []): FlatNode[] {
  for (const n of nodes) {
    out.push({ path: n.path, label: n.displayName, depth })
    flatten(n.children, depth + 1, out)
  }
  return out
}

function toRef(log: HubLog, correctHubTime: boolean, hubTime: HubTimeSample | undefined): HubLogRef {
  return {
    remotePath: log.remote_path,
    filename: log.filename,
    fileSize: log.file_size_bytes,
    recordedAt: correctHubTime
      ? correctedHubTimestamp(log.parsed_timestamp, hubTime?.hubTimezoneOffsetMinutes ?? null, hubTime?.offsetMs ?? 0)
      : null
  }
}

/**
 * Import the selected hub logs into a session (spec §7.4, §9.3, §10). Two targets:
 * an existing session, or a freshly-created one ("Create session from selected").
 * Once submitted, the dialog closes and the activity toast reports progress and results.
 */
export default function ImportDialog({
  logs,
  archiveRoot,
  initialMode = 'existing',
  onClose,
  onImported,
  correctHubTime,
  hubTime
}: Props): JSX.Element {
  const { data: tree } = useArchiveTree(true)
  const flat = useMemo(() => (tree ? flatten(tree) : []), [tree])

  const [mode, setMode] = useState<Mode>(initialMode)
  const [targetPath, setTargetPath] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<SessionType>('general_session')
  const [newParent, setNewParent] = useState(archiveRoot)

  const importBatch = useImportBatchToSession()
  const importNew = useImportToNewSession()
  const select = useAppStore((s) => s.select)

  const running = importBatch.isPending || importNew.isPending
  /**
   * Import every selected log into `targetPath`. The loop runs in main so the whole
   * batch shows up as one activity toast; results come back one per log, in order.
   */
  async function importAllInto(path: string, force: boolean, subset = logs): Promise<void> {
    await importBatch.mutateAsync({
      sessionPath: path,
      logs: subset.map((log) => toRef(log, correctHubTime, hubTime)),
      force
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'existing') {
      if (!targetPath) return
      onImported()
      onClose()
      try {
        await importAllInto(targetPath, false)
      } catch {
        // The activity toast owns progress and failure feedback after the dialog closes.
      }
    } else {
      if (!newName.trim()) return
      onImported()
      onClose()
      try {
        const res = await importNew.mutateAsync({
          parentPath: newParent,
          displayName: newName.trim(),
          sessionType: newType,
          logs: logs.map((log) => toRef(log, correctHubTime, hubTime))
        })
        select(res.session.path)
      } catch {
        // The activity toast owns progress and failure feedback after the dialog closes.
      }
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal import-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Import {logs.length === 1 ? '1 log' : `${logs.length} logs`}</h2>

        <ul className="import-loglist">
          {logs.map((l) => (
            <li key={l.remote_path} className="mono small">
              {l.filename}
            </li>
          ))}
        </ul>

        <div className="seg" role="tablist">
          <button
            type="button"
            className={`seg-btn ${mode === 'existing' ? 'active' : ''}`}
            onClick={() => setMode('existing')}
          >
            Into existing session
          </button>
          <button
            type="button"
            className={`seg-btn ${mode === 'new' ? 'active' : ''}`}
            onClick={() => setMode('new')}
          >
            Into a new session
          </button>
        </div>

        {mode === 'existing' ? (
          <label>
            Session
            <select value={targetPath} onChange={(e) => setTargetPath(e.target.value)} autoFocus>
              <option value="">Choose a session…</option>
              {flat.map((n) => (
                <option key={n.path} value={n.path}>
                  {'  '.repeat(n.depth)}
                  {n.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Name
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. 2026-07-04 Drivebase tuning"
              />
            </label>
            <label>
              Type
              <select value={newType} onChange={(e) => setNewType(e.target.value as SessionType)}>
                {SELECTABLE_SESSION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SESSION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Under
              <select value={newParent} onChange={(e) => setNewParent(e.target.value)}>
                <option value={archiveRoot}>Library</option>
                {flat.map((n) => (
                  <option key={n.path} value={n.path}>
                    {'  '.repeat(n.depth)}
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={running || (mode === 'existing' ? !targetPath : !newName.trim())}
          >
            {running ? 'Importing…' : 'Import'}
          </button>
        </div>
      </form>
    </div>
  )
}
