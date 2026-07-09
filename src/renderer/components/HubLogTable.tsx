import { useMemo, useState } from 'react'
import { ADB_NOT_FOUND_HINT } from '@shared/constants/adb'
import { formatBytes } from '@shared/format/bytes'
import type { SessionNode } from '@shared/types/session'
import type { HubLog, ImportStatus } from '@shared/types/hublog'
import {
  useAdbStatus,
  useArchiveTree,
  useHubLogs,
  useHubTime,
  useIgnoreHubLog,
  useImportToNewSession,
  useImportToSession,
  useSettings,
  useUnignoreHubLog
} from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { guessAlliance } from '../lib/alliance'
import { correctedHubTimestamp, formatHubOffset, formatTimestamp } from '../lib/time'
import ImportDialog from './ImportDialog'

/** Local YYYY-MM-DD, the name of the date-based session quick import targets. */
function todayKey(): string {
  const d = new Date()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mo}-${day}`
}

/** Control Hub view: the remote `.rlog` files, with selection + import/ignore actions (spec §10). */
export default function HubLogTable(): JSX.Element {
  const { data: settings } = useSettings()
  const { data: adb } = useAdbStatus()
  const sourceIsFolder = settings?.hubDataSource === 'folder'
  const connected = sourceIsFolder ? !!settings?.hubLogFolder : !!adb?.connected
  const sourceName = sourceIsFolder ? 'Folder Import' : 'Control Hub'
  const { data: logs, isLoading, isError, error } = useHubLogs(connected)
  const { data: hubTime, isLoading: hubTimeLoading, isError: hubTimeError } = useHubTime(connected)
  const { data: tree } = useArchiveTree(true)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showIgnored, setShowIgnored] = useState(false)
  const [correctHubTime, setCorrectHubTime] = useState(true)
  const [dialog, setDialog] = useState<{ logs: HubLog[]; mode: 'existing' | 'new' } | null>(null)

  const ignore = useIgnoreHubLog()
  const unignore = useUnignoreHubLog()
  const importOne = useImportToSession()
  const importNew = useImportToNewSession()
  const shade = useAppStore((s) => s.shade)

  // By default hide ignored logs (spec §15); keep selection in sync with what's shown.
  const visible = useMemo(
    () => (logs ?? []).filter((l) => showIgnored || l.import_status.state !== 'ignored'),
    [logs, showIgnored]
  )
  const ignoredCount = (logs ?? []).filter((l) => l.import_status.state === 'ignored').length

  if (sourceIsFolder && !settings?.hubLogFolder) {
    return <Notice title="No folder selected">Choose a hub log folder in Settings.</Notice>
  }
  if (!sourceIsFolder && adb?.adbMissing) return <Notice title="adb not found">{ADB_NOT_FOUND_HINT}</Notice>
  if (!connected) {
    return (
      <Notice title="No Control Hub connected">
        Connect the Control Hub over USB (or Wi-Fi ADB) and it will appear here. Status refreshes
        automatically.
      </Notice>
    )
  }
  if (isLoading) return <div className="details-empty">Reading logs from {sourceIsFolder ? 'the folder' : 'the hub'}…</div>
  if (isError) {
    return <Notice title="Couldn’t read logs">{(error as Error)?.message ?? 'ADB command failed.'}</Notice>
  }
  if (!logs || logs.length === 0) {
    return <Notice title="No .rlog files found">
      {sourceIsFolder ? 'No .rlog files were found in the selected folder.' : 'Nothing under the hub’s PsiKit log folder yet.'}
    </Notice>
  }

  const selectedLogs = visible.filter((l) => selected.has(l.remote_path))
  const allShownSelected = visible.length > 0 && visible.every((l) => selected.has(l.remote_path))
  const importing = importOne.isPending || importNew.isPending

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  function toggleAll() {
    setSelected(allShownSelected ? new Set() : new Set(visible.map((l) => l.remote_path)))
  }
  function openDialog(target: HubLog[], mode: 'existing' | 'new') {
    if (target.length > 0) setDialog({ logs: target, mode })
  }

  /**
   * Quick import (prototype §hub): drop logs straight into today's date-based
   * session at the archive root, creating it on first use, no dialog.
   */
  async function quickImport(target: HubLog[]) {
    if (target.length === 0 || !settings?.archiveRoot || importing) return
    const key = todayKey()
    const existing = (tree ?? []).find(
      (n: SessionNode) => n.displayName === key || n.name === key
    )
    const refs = target.map((l) => ({
      remotePath: l.remote_path,
      filename: l.filename,
      fileSize: l.file_size_bytes
    }))
    if (existing) {
      for (const ref of refs) {
        await importOne.mutateAsync({ ...ref, sessionPath: existing.path, force: false })
      }
    } else {
      await importNew.mutateAsync({
        parentPath: settings.archiveRoot,
        displayName: key,
        sessionType: 'general_session',
        logs: refs
      })
    }
    setSelected(new Set())
  }

  return (
    <div className="hublogs">
      <div className="hublogs-head">
        <h3>
          {sourceName} <span className="muted small">({visible.length})</span>
        </h3>
        <div className="hublogs-actions">
          <button
            className="sm"
            disabled={selectedLogs.length === 0 || importing}
            onClick={() => openDialog(selectedLogs, 'existing')}
          >
            Import selected…
          </button>
          <button
            className="quick-btn sm"
            disabled={selectedLogs.length === 0 || importing}
            onClick={() => quickImport(selectedLogs)}
            title="Import straight into today's date-based session"
          >
            {importing ? 'Importing…' : `Quick import → ${todayKey()}`}
          </button>
          <button
            className="ghost sm"
            disabled={selectedLogs.length === 0 || importing}
            onClick={() => openDialog(selectedLogs, 'new')}
          >
            New session…
          </button>
          {ignoredCount > 0 && (
            <label className="show-ignored small">
              <input
                type="checkbox"
                checked={showIgnored}
                onChange={(e) => setShowIgnored(e.target.checked)}
              />
              Show ignored ({ignoredCount})
            </label>
          )}
          <label className="show-ignored small" title="Apply the clock offset between this computer and the log source">
            <input
              type="checkbox"
              checked={correctHubTime}
              onChange={(e) => setCorrectHubTime(e.target.checked)}
              disabled={hubTimeLoading || hubTimeError || !hubTime}
            />
            Correct log time {hubTime ? `(${formatHubOffset(hubTime.offsetMs)})` : hubTimeLoading ? '(checking...)' : ''}
          </label>
        </div>
      </div>

      <div className="table-wrap">
        <table className="hublog-table">
          <thead>
            <tr>
              <th className="pick">
                <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th>Op-mode</th>
              <th>Recorded</th>
              <th className="num">Size</th>
              <th>Status</th>
              <th>Filename</th>
              <th className="row-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((log) => (
              <Row
                key={log.remote_path}
                log={log}
                recorded={
                  correctHubTime
                    ? correctedHubTimestamp(
                        log.parsed_timestamp,
                        hubTime?.hubTimezoneOffsetMinutes ?? null,
                        hubTime?.offsetMs ?? 0
                      )
                    : log.parsed_timestamp
                }
                tint={shade === 'tint'}
                checked={selected.has(log.remote_path)}
                onToggle={() => toggle(log.remote_path)}
                onImport={() => openDialog([log], 'existing')}
                onQuickImport={() => quickImport([log])}
                onIgnore={() =>
                  ignore.mutate({
                    remotePath: log.remote_path,
                    filename: log.filename,
                    fileSize: log.file_size_bytes
                  })
                }
                onUnignore={() => unignore.mutate(log.remote_path)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {dialog && settings?.archiveRoot && (
        <ImportDialog
          logs={dialog.logs}
          archiveRoot={settings.archiveRoot}
          initialMode={dialog.mode}
          onImported={() => setSelected(new Set())}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

interface RowProps {
  log: HubLog
  recorded: string | null
  tint: boolean
  checked: boolean
  onToggle: () => void
  onImport: () => void
  onQuickImport: () => void
  onIgnore: () => void
  onUnignore: () => void
}

function Row({
  log,
  recorded,
  tint,
  checked,
  onToggle,
  onImport,
  onQuickImport,
  onIgnore,
  onUnignore
}: RowProps): JSX.Element {
  const ignored = log.import_status.state === 'ignored'
  const colour = guessAlliance(log.opmode, log.filename)
  return (
    <tr className={`${ignored ? 'is-ignored' : ''}${tint ? ` tint-${colour}` : ''}`}>
      <td className={`pick striped ${colour}`}>
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${log.filename}`} />
      </td>
      <td>
        <span className="opmode-cell">
          <span className={`dot ${colour}`} />
          {log.opmode ?? <span className="muted">—</span>}
        </span>
      </td>
      <td className="mono">{formatTimestamp(recorded)}</td>
      <td className="num mono">{formatBytes(log.file_size_bytes)}</td>
      <td>
        <StatusBadge status={log.import_status} />
      </td>
      <td className="mono filename" title={log.remote_path}>
        {log.filename}
      </td>
      <td className="row-actions">
        <button className="link-btn" onClick={onImport}>
          Import
        </button>
        <button
          className="link-btn quick"
          onClick={onQuickImport}
          title="Import straight into today's date-based session"
        >
          Quick import
        </button>
        {ignored ? (
          <button className="link-btn muted" onClick={onUnignore}>
            Un-ignore
          </button>
        ) : (
          <button className="link-btn muted" onClick={onIgnore}>
            Ignore
          </button>
        )}
      </td>
    </tr>
  )
}

function StatusBadge({ status }: { status: ImportStatus }): JSX.Element {
  if (status.state === 'imported') {
    return (
      <span className="pill imported" title={status.sessionPath}>
        ✓ {status.sessionLabel}
      </span>
    )
  }
  if (status.state === 'ignored') return <span className="pill ignored">Ignored</span>
  return <span className="pill new">Not imported</span>
}

function Notice({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="hublogs hub-notice-wrap">
      <div className="callout hub-notice">
        <div>
          <strong>{title}</strong>
          <p className="muted small">{children}</p>
        </div>
      </div>
    </div>
  )
}
