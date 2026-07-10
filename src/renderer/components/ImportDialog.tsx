import { useMemo, useState } from 'react'
import { SELECTABLE_SESSION_TYPES, SESSION_TYPE_LABELS } from '@shared/constants/sessionTypes'
import type { SessionType, SessionNode } from '@shared/types/session'
import type { HubLog, HubTimeSample } from '@shared/types/hublog'
import type { HubLogRef, ImportResult } from '@shared/types/import'
import { useArchiveTree, useImportToNewSession, useImportToSession } from '../api/hooks'
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
type Entry = { log: HubLog; result: ImportResult }

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
 * On a duplicate (spec §14) the import is held and the user can force a copy.
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
  const [entries, setEntries] = useState<Entry[] | null>(null)

  const importOne = useImportToSession()
  const importNew = useImportToNewSession()
  const select = useAppStore((s) => s.select)

  const running = importOne.isPending || importNew.isPending
  const duplicates = entries?.filter((e) => e.result.status === 'duplicate') ?? []

  /** Import every selected log into `targetPath` in order, returning the entries. */
  async function importAllInto(path: string, force: boolean): Promise<Entry[]> {
    const out: Entry[] = []
    for (const log of logs) {
      const result = await importOne.mutateAsync({ ...toRef(log, correctHubTime, hubTime), sessionPath: path, force })
      out.push({ log, result })
    }
    return out
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'existing') {
      if (!targetPath) return
      setEntries(await importAllInto(targetPath, false))
    } else {
      if (!newName.trim()) return
      const res = await importNew.mutateAsync({
        parentPath: newParent,
        displayName: newName.trim(),
        sessionType: newType,
        logs: logs.map((log) => toRef(log, correctHubTime, hubTime))
      })
      select(res.session.path)
      // res.results is one-per-log in request order (spec §10 batch import).
      setEntries(res.results.map((result, i) => ({ log: logs[i], result })))
    }
    onImported()
  }

  /** Re-run just the held duplicates, forcing a copy (spec §14 "Import another copy"). */
  async function forceDuplicates() {
    const forced: Entry[] = []
    for (const { log } of duplicates) {
      const result = await importOne.mutateAsync({ ...toRef(log, correctHubTime, hubTime), sessionPath: targetPath, force: true })
      forced.push({ log, result })
    }
    setEntries((prev) =>
      (prev ?? []).map((e) => forced.find((f) => f.log.remote_path === e.log.remote_path) ?? e)
    )
    onImported()
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

        {entries ? (
          <Results entries={entries} />
        ) : (
          <>
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
          </>
        )}

        <div className="modal-actions">
          {entries ? (
            <>
              {duplicates.length > 0 && (
                <button type="button" className="ghost" onClick={forceDuplicates} disabled={running}>
                  {running ? 'Importing…' : `Import ${duplicates.length} copy(ies) anyway`}
                </button>
              )}
              <button type="button" onClick={onClose}>
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={running || (mode === 'existing' ? !targetPath : !newName.trim())}
              >
                {running ? 'Importing…' : 'Import'}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}

function Results({ entries }: { entries: Entry[] }): JSX.Element {
  return (
    <ul className="import-results">
      {entries.map(({ log, result }) => (
        <li key={log.remote_path}>
          <span className="mono small filename">{log.filename}</span>
          {result.status === 'imported' ? (
            <span className="pill imported" title={result.session.path}>
              ✓ {result.session.metadata.display_name}
            </span>
          ) : (
            <span className="pill new" title={result.existing.map((e) => e.sessionPath).join('\n')}>
              Already in {result.existing[0]?.sessionLabel ?? 'library'}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
