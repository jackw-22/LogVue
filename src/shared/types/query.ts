import type { SessionType, FileKind } from './session'

/**
 * A structured filter over the session index (spec §12). Every field is optional;
 * an all-empty query matches every session. Multi-value fields combine as OR *within*
 * a facet (any of the listed types) and AND *across* facets (type AND event AND …).
 * `tags`/`hasKinds` require ALL listed values; `missingKinds` requires NONE.
 */
export interface SessionQuery {
  /** Free text matched against display name, event code, and tags (case-insensitive substring). */
  text?: string
  sessionTypes?: SessionType[]
  events?: string[]
  teams?: number[]
  alliances?: string[]
  /** Only sessions with no alliance at all (the quick-find "None" chip). */
  noAlliance?: boolean
  /** Session must carry every one of these tags. */
  tags?: string[]
  /** Session must contain a file of every one of these kinds ("all official matches WITH a teleop log"). */
  hasKinds?: FileKind[]
  /** Session must contain a file of none of these kinds ("all matches MISSING a teleop log"). */
  missingKinds?: FileKind[]
}

/** One session in a query result — the index row plus derived counts and tags. Identity is `path`. */
export interface SessionQueryRow {
  path: string
  sessionType: SessionType
  displayName: string
  eventCode: string | null
  teamNumber: number | null
  alliance: string | null
  sessionStart: string | null
  sortKey: string | null
  fileCount: number
  logCount: number
  tags: string[]
}

/** A single facet value with how many sessions carry it (across the whole archive). */
export interface Facet<T = string> {
  value: T
  count: number
}

/**
 * Distinct filter values across the *entire* archive (not the current result set),
 * used to populate the filter controls. Unfiltered so the controls never vanish
 * mid-refinement.
 */
export interface FacetCounts {
  sessionTypes: Facet[]
  events: Facet[]
  teams: Facet<number>[]
  alliances: Facet[]
  kinds: Facet[]
  tags: Facet[]
}

export interface SessionQueryResult {
  rows: SessionQueryRow[]
  total: number
  facets: FacetCounts
}

/**
 * One imported log file with its session context — a row of the "All logs"
 * dashboard (quick-find). Produced by `index:queryLogs`, newest-first.
 */
export interface LogQueryRow {
  sessionPath: string
  sessionLabel: string
  sessionType: SessionType
  alliance: string | null
  filename: string
  kind: FileKind
  /** Op-mode parsed from the filename, or null if unrecognised. */
  opmode: string | null
  sizeBytes: number | null
  /** When the log was recorded — parsed from the filename, falling back to imported_at. */
  recorded: string | null
}
