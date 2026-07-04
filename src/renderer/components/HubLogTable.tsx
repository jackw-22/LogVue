import { useMemo, useState } from 'react'
import { ADB_NOT_FOUND_HINT } from '@shared/constants/adb'
import type { HubLog, ImportStatus } from '@shared/types/hublog'
import {
  useAdbStatus,
  useHubLogs,
  useIgnoreHubLog,
  useSettings,
  useUnignoreHubLog
} from '../api/hooks'
import ImportDialog from './ImportDialog'

/** Control Hub view: the remote `.rlog` files, with selection + import/ignore actions (spec §10). */
export default function HubLogTable(): JSX.Element {
  const { data: settings } = useSettings()
  const { data: adb } = useAdbStatus()
  const connected = !!adb?.connected
  const { data: logs, isLoading, isError, error } = useHubLogs(connected)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showIgnored, setShowIgnored] = useState(false)
  const [dialog, setDialog] = useState<{ logs: HubLog[]; mode: 'existing' | 'new' } | null>(null)

  const ignore = useIgnoreHubLog()
  const unignore = useUnignoreHubLog()

  // By default hide ignored logs (spec §15); keep selection in sync with what's shown.
  const visible = useMemo(
    () => (logs ?? []).filter((l) => showIgnored || l.import_status.state !== 'ignored'),
    [logs, showIgnored]
  )
  const ignoredCount = (logs ?? []).filter((l) => l.import_status.state === 'ignored').length

  if (adb?.adbMissing) return <Notice title="adb not found">{ADB_NOT_FOUND_HINT}</Notice>
  if (!connected) {
    return (
      <Notice title="No Control Hub connected">
        Connect the Control Hub over USB (or Wi-Fi ADB) and it will appear here. Status refreshes
        automatically.
      </Notice>
    )
  }
  if (isLoading) return <div className="details-empty">Reading logs from the hub…</div>
  if (isError) {
    return <Notice title="Couldn’t read logs">{(error as Error)?.message ?? 'ADB command failed.'}</Notice>
  }
  if (!logs || logs.length === 0) {
    return <Notice title="No .rlog files found">Nothing under the hub’s PsiKit log folder yet.</Notice>
  }

  const selectedLogs = visible.filter((l) => selected.has(l.remote_path))
  const allShownSelected = visible.length > 0 && visible.every((l) => selected.has(l.remote_path))

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

  return (
    <div className="hublogs">
      <div className="hublogs-head">
        <h3>
          Control Hub logs <span className="muted small">({visible.length})</span>
        </h3>
        <div className="hublogs-actions">
          <button
            className="sm"
            disabled={selectedLogs.length === 0}
            onClick={() => openDialog(selectedLogs, 'existing')}
          >
            Import selected…
          </button>
          <button
            className="ghost sm"
            disabled={selectedLogs.length === 0}
            onClick={() => openDialog(selectedLogs, 'new')}
          >
            New session from selected…
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
                checked={selected.has(log.remote_path)}
                onToggle={() => toggle(log.remote_path)}
                onImport={() => openDialog([log], 'existing')}
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
  checked: boolean
  onToggle: () => void
  onImport: () => void
  onIgnore: () => void
  onUnignore: () => void
}

function Row({ log, checked, onToggle, onImport, onIgnore, onUnignore }: RowProps): JSX.Element {
  const ignored = log.import_status.state === 'ignored'
  return (
    <tr className={ignored ? 'is-ignored' : undefined}>
      <td className="pick">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${log.filename}`} />
      </td>
      <td>{log.opmode ?? <span className="muted">—</span>}</td>
      <td className="mono">{formatTimestamp(log.parsed_timestamp)}</td>
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
    <div className="hublogs">
      <div className="callout hub-notice">
        <div>
          <strong>{title}</strong>
          <p className="muted small">{children}</p>
        </div>
      </div>
    </div>
  )
}

/** `2026-07-04T11:50:05.104` → `2026-07-04 11:50:05` (drop millis for readability). */
function formatTimestamp(ts: string | null): string {
  if (!ts) return '—'
  return ts.replace('T', ' ').replace(/\.\d+$/, '')
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}
