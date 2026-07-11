import { useEffect, useMemo, useState } from 'react'
import type { HubLog } from '@shared/types/hublog'
import type { MatchInfo } from '@shared/types/session'
import { formatBytes } from '@shared/format/bytes'
import { useAdbStatus, useHubLogs, useHubTime, useImportToSession, useSettings } from '../api/hooks'
import { correctedHubTimestamp, formatHubOffset, formatTimestamp } from '../lib/time'
import {
  formatDelta,
  formatDeltaSeconds,
  matchTimeChoice,
  suggestLogsForMatch
} from '../lib/suggestedLogs'

interface Props {
  sessionPath: string
  match: MatchInfo | undefined
}

function toRef(log: HubLog, recordedAt: string | null) {
  return { remotePath: log.remote_path, filename: log.filename, fileSize: log.file_size_bytes, recordedAt }
}

export default function SuggestedLogs({ sessionPath, match }: Props): JSX.Element | null {
  const { data: settings } = useSettings()
  const { data: adb } = useAdbStatus()
  const sourceIsFolder = settings?.hubDataSource === 'folder'
  const sourceName = sourceIsFolder ? 'Folder Import' : 'Control Hub'
  const connected = sourceIsFolder ? !!settings?.hubLogFolder : !!adb?.connected
  const { data: logs, isLoading: logsLoading } = useHubLogs(connected)
  const { data: hubTime, isLoading: timeLoading, isError: timeError } = useHubTime(connected)
  const importOne = useImportToSession()
  const [correctHubTime, setCorrectHubTime] = useState(true)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const choice = matchTimeChoice(match)

  const activeOffsetMs = correctHubTime ? hubTime?.offsetMs ?? 0 : 0
  const suggestions = useMemo(
    () =>
      suggestLogsForMatch(
        logs ?? [],
        match,
        activeOffsetMs,
        hubTime?.hubTimezoneOffsetMinutes ?? null
      ),
    [logs, match, activeOffsetMs, hubTime?.hubTimezoneOffsetMinutes]
  )
  const busy = importOne.isPending
  const checkedSuggestions = suggestions.filter((item) => !item.imported && checked.has(item.log.remote_path))
  const pendingCount = suggestions.filter((item) => !item.imported).length
  // Hub logs stay cached while the query is disabled, so suggestions outlive a
  // disconnect. Nothing can actually be pulled until the hub is back.
  const canImport = connected && !busy

  useEffect(() => {
    setChecked(
      new Set(
        suggestions
          .filter((item) => item.strength === 'strong' && !item.imported)
          .map((item) => item.log.remote_path)
      )
    )
  }, [suggestions])

  async function importLog(log: HubLog): Promise<void> {
    const recordedAt = correctHubTime
      ? correctedHubTimestamp(log.parsed_timestamp, hubTime?.hubTimezoneOffsetMinutes ?? null, hubTime?.offsetMs ?? 0)
      : null
    await importOne.mutateAsync({ ...toRef(log, recordedAt), sessionPath, force: false })
  }

  async function importAll(): Promise<void> {
    for (const item of checkedSuggestions) {
      // Stop at the first failure — a disconnect mid-run fails every log after it.
      try {
        await importLog(item.log)
      } catch {
        return
      }
    }
  }

  if (!choice) return null

  function toggle(path: string): void {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <section className="suggested-logs">
      <div className="suggested-head">
        <div>
          <h3>Suggested logs</h3>
          <p className="muted small">
            {choice.source === 'actual' ? 'Actual' : 'Scheduled'} match time:{' '}
            <span className="mono">{formatTimestamp(choice.value)}</span>
          </p>
        </div>
        <div className="suggested-actions">
          <label className="show-ignored small" title={hubTime ? `Source round trip ${hubTime.roundTripMs}ms` : undefined}>
            <input
              type="checkbox"
              checked={correctHubTime}
              onChange={(e) => setCorrectHubTime(e.target.checked)}
              disabled={timeLoading || timeError || !hubTime}
            />
            Correct log time {hubTime ? `(${formatHubOffset(hubTime.offsetMs)})` : timeLoading ? '(checking...)' : ''}
          </label>
          {timeLoading && <span className="muted small">Checking log clock…</span>}
          {timeError && <span className="muted small">Using uncorrected log times</span>}
          <button
            className="sm"
            disabled={!canImport || checkedSuggestions.length === 0}
            title={connected ? undefined : `${sourceName} unavailable`}
            onClick={importAll}
          >
            {busy ? 'Importing…' : connected ? `Import ${checkedSuggestions.length || ''}`.trim() : 'Import'}
          </button>
        </div>
      </div>

      {importOne.isError && (
        <p className="small error-text" role="status">
          {importOne.error instanceof Error ? importOne.error.message : 'Import failed'}
        </p>
      )}

      {!connected ? (
        <p className="muted small">
          {logs?.length
            ? `${sourceName} unavailable — restore it to import these logs.`
            : `Open ${sourceName} to suggest logs for this match.`}
        </p>
      ) : logsLoading ? (
        <p className="muted small">Reading {sourceName} logs…</p>
      ) : suggestions.length === 0 ? (
        <p className="muted small">No unimported hub logs found near this match time.</p>
      ) : (
        <div className="suggested-list">
          {pendingCount === 0 && (
            <p className="muted small">Every hub log near this match time has been imported.</p>
          )}
          {suggestions.map(({ log, correctedTimeMs, deltaMs, strength, imported }) => {
            const status = log.import_status
            return (
              <div key={log.remote_path} className={`suggested-log ${strength}`}>
                <div className="suggested-log-main">
                  <input
                    type="checkbox"
                    checked={imported || checked.has(log.remote_path)}
                    onChange={() => toggle(log.remote_path)}
                    disabled={imported}
                    aria-label={imported ? `${log.filename} already imported` : `Select ${log.filename}`}
                  />
                  <strong>{log.opmode ?? log.filename}</strong>
                  <span className="mono small muted">{formatTimestamp(new Date(correctedTimeMs).toISOString())}</span>
                  <span
                    className={`chip${strength === 'strong' ? ' delta-chip' : strength === 'weak' ? ' delta-chip warn' : ''}`}
                    title={formatDeltaSeconds(deltaMs)}
                  >
                    {formatDelta(deltaMs)}
                  </span>
                  <span className="mono small muted">{formatBytes(log.file_size_bytes)}</span>
                </div>
                <div className="suggested-log-actions">
                  <span className="mono small muted" title={log.remote_path}>
                    {log.filename}
                  </span>
                  {imported ? (
                    <span
                      className="chip imported-chip"
                      title={status.state === 'imported' ? `Imported into ${status.sessionPath}` : undefined}
                    >
                      Imported{status.state === 'imported' ? ` → ${status.sessionLabel}` : ''}
                    </span>
                  ) : (
                    <button
                      className="ghost sm"
                      disabled={!canImport}
                      onClick={() => void importLog(log).catch(() => {})}
                    >
                      Import
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
