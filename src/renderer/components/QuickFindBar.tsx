import type { AllianceFilter, ShadeMode, TypeFilter } from '../stores/appStore'
import { useAppStore } from '../stores/appStore'
import { useArchiveTree, useLogQuery } from '../api/hooks'
import { allianceClass } from '../lib/alliance'
import { formatRelative } from '../lib/time'
import { findNode } from '../lib/tree'

const ALLIANCE_CHIPS: { value: AllianceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' },
  { value: 'none', label: 'None' }
]

const TYPE_CHIPS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'match', label: 'Match' },
  { value: 'practice', label: 'Practice' },
  { value: 'general', label: 'General' }
]

const SHADE_CHIPS: { value: ShadeMode; label: string }[] = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'tint', label: 'Full tint' }
]

/**
 * The quick-find bar above the archive view: alliance/type filter chips, the
 * stripe-vs-tint colour toggle, free-text search, and a "Latest" jump button
 * (always the true newest log, ignoring the active filters).
 */
export default function QuickFindBar(): JSX.Element {
  const search = useAppStore((s) => s.search)
  const setSearch = useAppStore((s) => s.setSearch)
  const alliance = useAppStore((s) => s.alliance)
  const setAlliance = useAppStore((s) => s.setAlliance)
  const typeFilter = useAppStore((s) => s.typeFilter)
  const setTypeFilter = useAppStore((s) => s.setTypeFilter)
  const shade = useAppStore((s) => s.shade)
  const setShade = useAppStore((s) => s.setShade)
  const openSession = useAppStore((s) => s.openSession)

  // Unfiltered query — the latest log across the whole archive.
  const { data: allLogs } = useLogQuery({})
  const { data: tree } = useArchiveTree(true)
  const latest = allLogs?.[0]
  const latestPath = latest ? (tree ? findNode(tree, latest.sessionPath)?.path ?? latest.sessionPath : latest.sessionPath) : null

  return (
    <div className="quickfind">
      <div className="quickfind-chips">
        <span className="quickfind-label">Filter</span>
        <div className="chip-group">
          {ALLIANCE_CHIPS.map((c) => (
            <button
              key={c.value}
              className={`filter-chip${alliance === c.value ? ' active' : ''}`}
              onClick={() => setAlliance(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="quickfind-divider" />
        <div className="chip-group">
          {TYPE_CHIPS.map((c) => (
            <button
              key={c.value}
              className={`filter-chip${typeFilter === c.value ? ' active' : ''}`}
              onClick={() => setTypeFilter(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="quickfind-divider" />
        <div className="chip-group">
          <span className="quickfind-label">Color</span>
          {SHADE_CHIPS.map((c) => (
            <button
              key={c.value}
              className={`filter-chip${shade === c.value ? ' active' : ''}`}
              onClick={() => setShade(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="quickfind-search">
        <input
          id="library-search-input"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search — try an opmode, “red”, “blue”, a tag, or a filename…"
        />
        {latest && (
          <button
            className="latest-btn"
            onClick={() => latestPath && openSession(latestPath)}
            title={latest.filename}
          >
            <span className={`dot ${allianceClass(latest.alliance)}`} />
            <span className="muted">Latest:</span>
            <span className="latest-name">
              {latest.opmode ?? latest.filename} · {latest.sessionLabel}
            </span>
            {latest.recorded && <span className="latest-when">{formatRelative(latest.recorded)}</span>}
          </button>
        )}
      </div>
    </div>
  )
}
