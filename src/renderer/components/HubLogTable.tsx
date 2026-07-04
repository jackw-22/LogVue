import { ADB_NOT_FOUND_HINT } from '@shared/constants/adb'
import type { HubLog, ImportStatus } from '@shared/types/hublog'
import { useAdbStatus, useHubLogs } from '../api/hooks'

/** Control Hub view: the remote `.rlog` files with parsed metadata + import status (spec §7.2–7.3). */
export default function HubLogTable(): JSX.Element {
  const { data: adb } = useAdbStatus()
  const connected = !!adb?.connected
  const { data: logs, isLoading, isError, error } = useHubLogs(connected)

  if (adb?.adbMissing) {
    return <Notice title="adb not found">{ADB_NOT_FOUND_HINT}</Notice>
  }
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

  return (
    <div className="hublogs">
      <div className="hublogs-head">
        <h3>
          Control Hub logs <span className="muted small">({logs.length})</span>
        </h3>
      </div>
      <div className="table-wrap">
        <table className="hublog-table">
          <thead>
            <tr>
              <th>Op-mode</th>
              <th>Recorded</th>
              <th className="num">Size</th>
              <th>Status</th>
              <th>Filename</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <Row key={log.remote_path} log={log} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({ log }: { log: HubLog }): JSX.Element {
  return (
    <tr>
      <td>{log.opmode ?? <span className="muted">—</span>}</td>
      <td className="mono">{formatTimestamp(log.parsed_timestamp)}</td>
      <td className="num mono">{formatBytes(log.file_size_bytes)}</td>
      <td>
        <StatusBadge status={log.import_status} />
      </td>
      <td className="mono filename" title={log.remote_path}>
        {log.filename}
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
