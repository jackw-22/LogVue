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
  'other',
  // A plain grouping folder (e.g. `2026/`), explicitly kept as a folder rather than a
  // session (ARCHITECTURE §10.1). Excluded from the type pickers and from search/facets.
  'container'
] as const

export type SessionType = (typeof SESSION_TYPES)[number]

/** The container sentinel — a folder the user has declared "not a session". */
export const CONTAINER_TYPE = 'container' satisfies SessionType

export function isContainerType(t: SessionType | string): boolean {
  return t === CONTAINER_TYPE
}

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
  other: 'Other',
  container: 'Folder'
}

/** Types offered in the "new session" / type-change pickers — `container` is set via
 *  the tree's "Keep as folder" action, not chosen as a session type. */
export const SELECTABLE_SESSION_TYPES = SESSION_TYPES.filter(
  (t) => t !== CONTAINER_TYPE
) as readonly SessionType[]
