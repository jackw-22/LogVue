import { useEffect, useState } from 'react'
import type { MatchInfo } from '@shared/types/session'
import { ALLIANCES, MATCH_TYPES } from '@shared/constants/matchTypes'
import { useUpdateMeta } from '../api/hooks'

interface Props {
  path: string
  match: MatchInfo | undefined
}

/** String form of a match field for the controlled inputs (numbers become '' when unset). */
interface Draft {
  label: string
  type: string
  number: string
  alliance: string
  station: string
  team_number: string
}

function toDraft(match: MatchInfo | undefined): Draft {
  return {
    label: match?.label ?? '',
    type: match?.type ?? '',
    number: match?.number != null ? String(match.number) : '',
    alliance: match?.alliance ?? '',
    station: match?.station ?? '',
    team_number: match?.team_number != null ? String(match.team_number) : ''
  }
}

/** Rebuild the persisted `match` block from a draft, dropping blank fields and preserving unknown keys. */
function toMatch(draft: Draft, prev: MatchInfo | undefined): MatchInfo {
  const num = draft.number.trim()
  const team = draft.team_number.trim()
  return {
    ...prev,
    label: draft.label.trim() || undefined,
    type: draft.type.trim() || undefined,
    number: num ? Number(num) : undefined,
    alliance: draft.alliance.trim() || undefined,
    station: draft.station.trim() || undefined,
    team_number: team ? Number(team) : undefined
  }
}

/**
 * Editable match metadata (spec §5.2) for official/practice/replay sessions. This is
 * the manual counterpart to FTCScout sync (Phase 5) — the same `match` block, entered
 * by hand. Persists through `updateMeta`, which reindexes so alliance/team feed search.
 */
export default function MatchInfoEditor({ path, match }: Props): JSX.Element {
  const update = useUpdateMeta(path)
  const [draft, setDraft] = useState<Draft>(() => toDraft(match))

  // Re-seed when the selected session (or its match block) changes underneath us.
  useEffect(() => setDraft(toDraft(match)), [path, match])

  function commit(next: Draft): void {
    setDraft(next)
    update.mutate({ match: toMatch(next, match) })
  }

  return (
    <section>
      <h3>Match</h3>
      <div className="match-grid">
        <label className="field">
          Type
          <select value={draft.type} onChange={(e) => commit({ ...draft, type: e.target.value })}>
            <option value="">—</option>
            {MATCH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Number
          <input
            type="number"
            value={draft.number}
            onChange={(e) => setDraft({ ...draft, number: e.target.value })}
            onBlur={() => commit(draft)}
            placeholder="4"
          />
        </label>

        <label className="field">
          Alliance
          <select value={draft.alliance} onChange={(e) => commit({ ...draft, alliance: e.target.value })}>
            <option value="">—</option>
            {ALLIANCES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Station
          <input
            value={draft.station}
            onChange={(e) => setDraft({ ...draft, station: e.target.value })}
            onBlur={() => commit(draft)}
            placeholder="B2"
          />
        </label>

        <label className="field">
          Team #
          <input
            type="number"
            value={draft.team_number}
            onChange={(e) => setDraft({ ...draft, team_number: e.target.value })}
            onBlur={() => commit(draft)}
            placeholder="12345"
          />
        </label>

        <label className="field grow">
          Label (override)
          <input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            onBlur={() => commit(draft)}
            placeholder="Q4"
          />
        </label>
      </div>
    </section>
  )
}
