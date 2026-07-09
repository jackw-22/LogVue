/** Session types (spec §4.3). Extendable without breaking older archives. */
export const SESSION_TYPES = [
  'competition_event',
  'official_match',
  'practice_match',
  'replay',
  'workshop_session',
  'tuning_session',
  'debug_session',
  'test_session',
  'general_session',
  'other'
] as const

export type SessionType = (typeof SESSION_TYPES)[number]

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  competition_event: 'Competition event',
  official_match: 'Match',
  practice_match: 'Practice',
  replay: 'Match',
  workshop_session: 'General',
  tuning_session: 'General',
  debug_session: 'General',
  test_session: 'General',
  general_session: 'General',
  other: 'General'
}

/** Types offered in the "new session" / type-change pickers. */
export const SELECTABLE_SESSION_TYPES = [
  'general_session',
  'competition_event',
  'official_match',
  'practice_match'
] as const satisfies readonly SessionType[]

export const MATCH_FILTER_TYPES = ['official_match', 'replay'] as const satisfies readonly SessionType[]
export const PRACTICE_FILTER_TYPES = ['practice_match'] as const satisfies readonly SessionType[]
export const GENERAL_FILTER_TYPES = [
  'general_session',
  'workshop_session',
  'tuning_session',
  'debug_session',
  'test_session',
  'other'
] as const satisfies readonly SessionType[]

export function toSelectableSessionType(type: SessionType): (typeof SELECTABLE_SESSION_TYPES)[number] {
  if (type === 'competition_event' || type === 'official_match' || type === 'practice_match') return type
  if (type === 'replay') return 'official_match'
  return 'general_session'
}
