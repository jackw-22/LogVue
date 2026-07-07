import type { MatchInfo } from '../types/session'
import { MATCH_TYPE_PREFIX } from '../constants/matchTypes'

/**
 * Short match code for a row/label, e.g. `Q4`, `SF1`, or a hand-typed label.
 * Prefers an explicit `label`, else composes `<prefix><number>` from type+number.
 * Returns `null` when there's nothing to show (an unlabelled custom session).
 */
export function formatMatchCode(match: MatchInfo | null | undefined): string | null {
  if (!match) return null
  const label = match.label?.trim()
  if (label) return label
  const prefix = match.type ? MATCH_TYPE_PREFIX[match.type] : undefined
  if (prefix && match.number != null) return `${prefix}${match.number}`
  if (match.number != null) return `Match ${match.number}`
  return null
}

/** Capitalised alliance + station, e.g. `Blue B2` / `Red` / `B2`. Empty when neither is set. */
export function formatMatchStation(match: MatchInfo | null | undefined): string {
  if (!match) return ''
  const alliance = match.alliance?.trim()
  const station = match.station?.trim()
  const alliancePart = alliance ? alliance.charAt(0).toUpperCase() + alliance.slice(1) : ''
  return [alliancePart, station].filter(Boolean).join(' ')
}

/** Human count string for a session's logs, e.g. `no logs`, `1 log`, `3 logs`. */
export function formatLogCount(n: number): string {
  if (n === 0) return 'no logs'
  return n === 1 ? '1 log' : `${n} logs`
}
