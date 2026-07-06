import { useMemo, useState } from 'react'
import { SESSION_TYPE_LABELS } from '@shared/constants/sessionTypes'
import { FILE_KIND_LABELS } from '@shared/constants/fileKinds'
import type { SessionType, FileKind } from '@shared/types/session'
import type { Facet, SessionQuery, SessionQueryRow } from '@shared/types/query'
import { useSessionQuery } from '../api/hooks'
import { useAppStore } from '../stores/appStore'

/** Toggle membership of `value` in an array-valued filter field. */
function toggle<T>(list: T[] | undefined, value: T): T[] {
  const arr = list ?? []
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

export default function SearchView(): JSX.Element {
  const [query, setQuery] = useState<SessionQuery>({})
  const { data, isFetching } = useSessionQuery(query, true)
  const facets = data?.facets
  const rows = data?.rows ?? []

  const activeCount = useMemo(() => {
    const q = query
    return (
      (q.text?.trim() ? 1 : 0) +
      (q.sessionTypes?.length ?? 0) +
      (q.events?.length ?? 0) +
      (q.teams?.length ?? 0) +
      (q.alliances?.length ?? 0) +
      (q.tags?.length ?? 0) +
      (q.hasKinds?.length ?? 0) +
      (q.missingKinds?.length ?? 0)
    )
  }, [query])

  return (
    <div className="search">
      <aside className="search-filters">
        <div className="search-filters-head">
          <h3>Filters</h3>
          {activeCount > 0 && (
            <button className="ghost sm" onClick={() => setQuery({})}>
              Clear ({activeCount})
            </button>
          )}
        </div>

        <input
          className="search-text"
          value={query.text ?? ''}
          onChange={(e) => setQuery((q) => ({ ...q, text: e.target.value }))}
          placeholder="Search name, event, tag…"
          autoFocus
        />

        <FacetGroup<SessionType>
          title="Session type"
          facets={facets?.sessionTypes as Facet<SessionType>[] | undefined}
          selected={query.sessionTypes}
          label={(v) => SESSION_TYPE_LABELS[v] ?? v}
          onToggle={(v) => setQuery((q) => ({ ...q, sessionTypes: toggle(q.sessionTypes, v) }))}
        />

        <FacetGroup<FileKind>
          title="Contains file kind"
          facets={facets?.kinds as Facet<FileKind>[] | undefined}
          selected={query.hasKinds}
          label={(v) => FILE_KIND_LABELS[v] ?? v}
          onToggle={(v) => setQuery((q) => ({ ...q, hasKinds: toggle(q.hasKinds, v) }))}
        />

        <FacetGroup<FileKind>
          title="Missing file kind"
          facets={facets?.kinds as Facet<FileKind>[] | undefined}
          selected={query.missingKinds}
          label={(v) => FILE_KIND_LABELS[v] ?? v}
          onToggle={(v) => setQuery((q) => ({ ...q, missingKinds: toggle(q.missingKinds, v) }))}
        />

        <FacetGroup
          title="Event"
          facets={facets?.events}
          selected={query.events}
          onToggle={(v) => setQuery((q) => ({ ...q, events: toggle(q.events, v) }))}
        />

        <FacetGroup
          title="Alliance"
          facets={facets?.alliances}
          selected={query.alliances}
          label={(v) => (v === 'red' ? 'Red' : v === 'blue' ? 'Blue' : v)}
          onToggle={(v) => setQuery((q) => ({ ...q, alliances: toggle(q.alliances, v) }))}
        />

        <FacetGroup<number>
          title="Team"
          facets={facets?.teams}
          selected={query.teams}
          onToggle={(v) => setQuery((q) => ({ ...q, teams: toggle(q.teams, v) }))}
        />

        <FacetGroup
          title="Tags"
          facets={facets?.tags}
          selected={query.tags}
          onToggle={(v) => setQuery((q) => ({ ...q, tags: toggle(q.tags, v) }))}
        />
      </aside>

      <main className="search-results">
        <div className="search-results-head">
          <span className="muted small">
            {isFetching
              ? 'Searching…'
              : `${rows.length} session${rows.length === 1 ? '' : 's'}${activeCount > 0 ? ' matched' : ''}`}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="details-empty">
            {isFetching ? 'Searching…' : 'No sessions match these filters.'}
          </div>
        ) : (
          <ul className="result-list">
            {rows.map((r) => (
              <ResultRow key={r.sessionId} row={r} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function ResultRow({ row }: { row: SessionQueryRow }): JSX.Element {
  const openSession = useAppStore((s) => s.openSession)
  const logs = row.logCount
  return (
    <li className="result-row" onClick={() => openSession(row.path)} title={row.path}>
      <div className="result-main">
        <span className="result-name">{row.displayName}</span>
        <span className="chip">{SESSION_TYPE_LABELS[row.sessionType] ?? row.sessionType}</span>
        {row.eventCode && <span className="chip subtle">{row.eventCode}</span>}
        {row.alliance && <span className={`chip alliance ${row.alliance}`}>{row.alliance}</span>}
        {row.teamNumber != null && <span className="chip subtle">#{row.teamNumber}</span>}
      </div>
      <div className="result-meta">
        {row.tags.map((t) => (
          <span key={t} className="chip tag">
            {t}
          </span>
        ))}
        <span className="chip count">
          {logs > 0 ? `${logs} log${logs === 1 ? '' : 's'}` : `${row.fileCount} file${row.fileCount === 1 ? '' : 's'}`}
        </span>
      </div>
    </li>
  )
}

interface FacetGroupProps<T> {
  title: string
  facets?: Facet<T>[]
  selected?: T[]
  label?: (value: T) => string
  onToggle: (value: T) => void
}

function FacetGroup<T extends string | number = string>({
  title,
  facets,
  selected,
  label,
  onToggle
}: FacetGroupProps<T>): JSX.Element | null {
  if (!facets || facets.length === 0) return null
  const sel = selected ?? []
  return (
    <div className="facet-group">
      <h4>{title}</h4>
      {facets.map((f) => {
        const checked = sel.includes(f.value)
        return (
          <label key={String(f.value)} className={`facet${checked ? ' checked' : ''}`}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(f.value)} />
            <span className="facet-label">{label ? label(f.value) : String(f.value)}</span>
            <span className="facet-count">{f.count}</span>
          </label>
        )
      })}
    </div>
  )
}
