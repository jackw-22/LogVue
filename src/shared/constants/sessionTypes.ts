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
  official_match: 'Official match',
  practice_match: 'Practice match',
  replay: 'Replay',
  workshop_session: 'Workshop session',
  tuning_session: 'Tuning session',
  debug_session: 'Debug session',
  test_session: 'Test session',
  general_session: 'General session',
  other: 'Other'
}
