import type { SessionType } from './sessionTypes'

/** Session types that carry a `match` block and get the match editor (spec §2.3 / §5.2). */
export const MATCH_SESSION_TYPES = ['official_match', 'practice_match', 'replay'] as const

export function isMatchType(t: SessionType): boolean {
  return (MATCH_SESSION_TYPES as readonly string[]).includes(t)
}

/**
 * FTC match phases. Free-form is allowed on disk; these seed the editor's select.
 * `playoff` covers the double-elimination bracket most events now run, where a
 * match is identified by its bracket position (M-5) rather than a round + index.
 */
export const MATCH_TYPES = [
  'qualification',
  'playoff',
  'quarterfinal',
  'semifinal',
  'final',
  'practice',
  'other'
] as const

export type MatchTypeValue = (typeof MATCH_TYPES)[number]

/** Short code prefix per match type, used to compose a label like `Q4` / `SF1`. */
export const MATCH_TYPE_PREFIX: Record<string, string> = {
  qualification: 'Q',
  playoff: 'DE',
  quarterfinal: 'QF',
  semifinal: 'SF',
  final: 'F',
  practice: 'P'
}

export const ALLIANCES = ['red', 'blue'] as const
