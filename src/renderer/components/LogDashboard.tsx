import { useMemo } from 'react'
import type { LogQueryRow } from '@shared/types/query'
import { SESSION_TYPE_LABELS } from '@shared/constants/sessionTypes'
import { formatBytes } from '@shared/format/bytes'
import { useArchiveTree, useLogQuery, useSettings } from '../api/hooks'
import { toSessionQuery, useAppStore } from '../stores/appStore'
import { allianceClass, kindBadge } from '../lib/alliance'
import { buildPathLabels, findNode, normalizePathKey } from '../lib/tree'
import { formatRecentTimestamp, formatTimestamp } from '../lib/time'

/**
 * The archive dashboard when nothing is selected: every imported log across the
 * archive, filtered by the quick-find bar, either newest-first ("flat") or grouped
 * by session. Clicking a row opens the owning session.
 */
export default function LogDashboard(): JSX.Element {
  const search = useAppStore((s) => s.search)
  const alliance = useAppStore((s) => s.alliance)
  const typeFilter = useAppStore((s) => s.typeFilter)
  const mode = useAppStore((s) => s.dashboardMode)
  const setMode = useAppStore((s) => s.setDashboardMode)
  const { data: settings } = useSettings()
  const sourceName = settings?.hubDataSource === 'folder' ? 'Folder Import' : 'Control Hub'

  const query = useMemo(
    () => toSessionQuery(search, alliance, typeFilter),
    [search, alliance, typeFilter]
  )
  const { data: rows, isLoading } = useLogQuery(query)
  const { data: tree } = useArchiveTree(true)
  const labels = useMemo(() => (tree ? buildPathLabels(tree) : new Map()), [tree])

  const logs = rows ?? []

  /** "Group / Session" breadcrumb for a row (just the session name at top level). */
  function crumb(row: LogQueryRow): string {
    const parent = labels.get(normalizePathKey(row.sessionPath))?.parentLabel
    return parent ? `${parent} / ${row.sessionLabel}` : row.sessionLabel
  }

  function canonicalPath(path: string): string {
    return tree ? findNode(tree, path)?.path ?? path : path
  }

  return (
    <div className="dashboard">
      <div className="dashboard-head">
        <h3>
          All logs <span className="muted small">({logs.length})</span>
        </h3>
        <div className="spacer" />
        <div className="tabs" role="tablist">
          <button
            className={`tab ${mode === 'flat' ? 'active' : ''}`}
            role="tab"
            aria-selected={mode === 'flat'}
            onClick={() => setMode('flat')}
          >
            Newest first
          </button>
          <button
            className={`tab ${mode === 'grouped' ? 'active' : ''}`}
            role="tab"
            aria-selected={mode === 'grouped'}
            onClick={() => setMode('grouped')}
          >
            By session
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="details-empty">
          {isLoading ? 'Loading…' : `No logs match. Import some from the ${sourceName} tab, or clear the filters.`}
        </div>
      ) : mode === 'flat' ? (
        <FlatList logs={logs} crumb={crumb} canonicalPath={canonicalPath} />
      ) : (
        <GroupedList logs={logs} crumb={crumb} canonicalPath={canonicalPath} />
      )}
    </div>
  )
}

function FlatList({
  logs,
  crumb,
  canonicalPath
}: {
  logs: LogQueryRow[]
  crumb: (row: LogQueryRow) => string
  canonicalPath: (path: string) => string
}): JSX.Element {
  const shade = useAppStore((s) => s.shade)
  const openSession = useAppStore((s) => s.openSession)
  return (
    <div className="log-list">
      {logs.map((row) => {
        const colour = allianceClass(row.alliance)
        return (
          <div
            key={`${canonicalPath(row.sessionPath)}/${row.filename}`}
            className={`log-row${shade === 'tint' ? ` tint-${colour}` : ''}`}
            onClick={() => openSession(canonicalPath(row.sessionPath))}
            title={row.filename}
          >
            <span className={`stripe ${colour}`} />
            <span className="kind-badge">{kindBadge(row.kind)}</span>
            <span className="log-opmode">{row.opmode ?? row.filename}</span>
            <span className="log-crumb muted">{crumb(row)}</span>
            <span className="log-size mono muted">{formatBytes(row.sizeBytes)}</span>
            <span className="log-when mono muted">{formatRecentTimestamp(row.recorded)}</span>
          </div>
        )
      })}
    </div>
  )
}

function GroupedList({
  logs,
  crumb,
  canonicalPath
}: {
  logs: LogQueryRow[]
  crumb: (row: LogQueryRow) => string
  canonicalPath: (path: string) => string
}): JSX.Element {
  const shade = useAppStore((s) => s.shade)
  const openSession = useAppStore((s) => s.openSession)

  // Sections in first-occurrence order — logs arrive newest-first, so the most
  // recently active session leads.
  const sections = useMemo(() => {
    const map = new Map<string, LogQueryRow[]>()
    for (const row of logs) {
      const path = canonicalPath(row.sessionPath)
      const list = map.get(path) ?? []
      list.push(row)
      map.set(path, list)
    }
    return [...map.entries()]
  }, [logs, canonicalPath])

  return (
    <div className="log-sections">
      {sections.map(([path, rows]) => {
        const head = rows[0]
        const colour = allianceClass(head.alliance)
        return (
          <div key={path} className="log-section">
            <div
              className={`log-section-head${shade === 'tint' ? ` tint-${colour}` : ''}`}
              onClick={() => openSession(path)}
            >
              <span className={`dot ${colour}`} />
              <span className="log-section-name">{crumb(head)}</span>
              <span className="muted small">{SESSION_TYPE_LABELS[head.sessionType]}</span>
              <div className="spacer" />
              <span className="muted small">
                {rows.length} log{rows.length === 1 ? '' : 's'}
              </span>
            </div>
            {rows.map((row) => (
              <div
                key={row.filename}
                className={`log-row nested${shade === 'tint' ? ` tint-${colour}` : ''}`}
                onClick={() => openSession(path)}
                title={row.filename}
              >
                <span className="kind-badge">{kindBadge(row.kind)}</span>
                <span className="log-opmode">{row.opmode ?? row.filename}</span>
                <span className="log-size mono muted">{formatBytes(row.sizeBytes)}</span>
                <span className="log-when mono muted">{formatTimestamp(row.recorded)}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
