import type { SessionNode } from '@shared/types/session'
import { SESSION_TYPE_LABELS } from '@shared/constants/sessionTypes'
import { isMatchType } from '@shared/constants/matchTypes'
import { formatLogCount, formatMatchCode, formatMatchStation } from '@shared/format/match'
import { useArchiveTree } from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { findNode } from '../lib/tree'

interface Props {
  eventPath: string
  onCreateChild: () => void
}

function MatchRow({ node }: { node: SessionNode }): JSX.Element {
  const openSession = useAppStore((s) => s.openSession)
  const code = formatMatchCode(node.match) ?? node.displayName
  const station = formatMatchStation(node.match)
  const isMatch = isMatchType(node.sessionType)

  return (
    <div className="match-row" onClick={() => openSession(node.path)} title={node.path}>
      <span className="match-code">{code}</span>
      <span className="match-station">{station}</span>
      {!isMatch && <span className="chip">{SESSION_TYPE_LABELS[node.sessionType]}</span>}
      <span className="match-logs muted small">{formatLogCount(node.logCount)}</span>
      <button
        className="ghost sm"
        onClick={(e) => {
          e.stopPropagation()
          openSession(node.path)
        }}
      >
        Open
      </button>
    </div>
  )
}

/**
 * The match list for a competition_event (spec §9.2): its child sessions rendered as
 * rows — official/practice matches show a match code + alliance/station, custom sessions
 * show their name + type. Manual for now; FTCScout seeds these rows in Phase 5.
 */
export default function MatchList({ eventPath, onCreateChild }: Props): JSX.Element {
  const { data: tree } = useArchiveTree(true)
  const node = tree ? findNode(tree, eventPath) : null
  const children = node?.children ?? []

  return (
    <section>
      <h3>
        Matches &amp; sessions <span className="muted small">({children.length})</span>
      </h3>
      {children.length === 0 ? (
        <p className="muted small">No matches or sessions yet. Create one below.</p>
      ) : (
        <div className="match-list">
          {children.map((child) => (
            <MatchRow key={child.path} node={child} />
          ))}
        </div>
      )}
      <button className="ghost sm" onClick={onCreateChild}>
        + Create custom session here
      </button>
    </section>
  )
}
