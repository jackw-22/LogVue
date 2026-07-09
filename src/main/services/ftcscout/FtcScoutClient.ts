import type {
  FtcScoutEventPayload,
  FtcScoutEventSearchRequest,
  FtcScoutEventSearchResult,
  FtcScoutMatch
} from '@shared/types/ftcscout'
import type { MatchInfo } from '@shared/types/session'

const ENDPOINT = 'https://api.ftcscout.org/graphql'

const EVENT_QUERY = `
query EventForTeam($season: Int!, $code: String!) {
  eventByCode(season: $season, code: $code) {
    season
    code
    name
    timezone
    start
    end
    hasMatches
    teamMatches {
      teamNumber
      alliance
      station
      surrogate
      noShow
      dq
      onField
      match {
        id
        season
        eventCode
        tournamentLevel
        series
        matchNum
        description
        scheduledStartTime
        actualStartTime
        hasBeenPlayed
      }
    }
  }
}
`

const EVENT_SEARCH_QUERY = `
query SearchEvents($season: Int!, $searchText: String, $hasMatches: Boolean, $limit: Int) {
  eventsSearch(season: $season, searchText: $searchText, hasMatches: $hasMatches, limit: $limit) {
    season
    code
    name
    type
    start
    end
    timezone
    hasMatches
    location {
      city
      state
      country
    }
    teams {
      teamNumber
    }
  }
}
`

interface GraphQlResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

interface RawEventResponse {
  eventByCode: RawEvent | null
}

interface RawEvent {
  season: number
  code: string
  name: string
  timezone?: string | null
  start?: string | null
  end?: string | null
  hasMatches: boolean
  teamMatches: RawTeamMatch[]
}

interface RawEventSearchResponse {
  eventsSearch: RawSearchEvent[]
}

interface RawSearchEvent {
  season: number
  code: string
  name: string
  type: string
  start?: string | null
  end?: string | null
  timezone?: string | null
  hasMatches: boolean
  location?: {
    city?: string | null
    state?: string | null
    country?: string | null
  } | null
  teams: Array<{ teamNumber: number }>
}

interface RawTeamMatch {
  teamNumber: number
  alliance: string
  station: string
  surrogate: boolean
  noShow: boolean
  dq: boolean
  onField: boolean
  match: RawMatch
}

interface RawMatch {
  id: number
  season: number
  eventCode: string
  tournamentLevel: string
  series: number
  matchNum: number
  description: string
  scheduledStartTime?: string | null
  actualStartTime?: string | null
  hasBeenPlayed: boolean
}

export class FtcScoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FtcScoutError'
  }
}

export class FtcScoutClient {
  async searchEvents(req: FtcScoutEventSearchRequest): Promise<FtcScoutEventSearchResult[]> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: EVENT_SEARCH_QUERY,
        variables: {
          season: req.season,
          searchText: req.searchText.trim() || null,
          hasMatches: req.hasMatches,
          limit: req.limit ?? 20
        }
      })
    })
    if (!response.ok) throw new FtcScoutError(`FTCScout returned HTTP ${response.status}`)

    const body = (await response.json()) as GraphQlResponse<RawEventSearchResponse>
    if (body.errors?.length) {
      throw new FtcScoutError(body.errors.map((e) => e.message).join('; '))
    }
    const events = body.data?.eventsSearch ?? []
    const filtered =
      req.onlyTeamEvents && req.teamNumber
        ? events.filter((event) => event.teams.some((team) => team.teamNumber === req.teamNumber))
        : events
    return filtered.map(normalizeSearchEvent)
  }

  async fetchEventForTeam(
    season: number,
    eventCode: string,
    teamNumber: number
  ): Promise<FtcScoutEventPayload> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: EVENT_QUERY,
        variables: { season, code: eventCode.trim().toUpperCase() }
      })
    })
    if (!response.ok) throw new FtcScoutError(`FTCScout returned HTTP ${response.status}`)

    const body = (await response.json()) as GraphQlResponse<RawEventResponse>
    if (body.errors?.length) {
      throw new FtcScoutError(body.errors.map((e) => e.message).join('; '))
    }
    if (!body.data?.eventByCode) {
      throw new FtcScoutError(`FTCScout event ${season} ${eventCode.toUpperCase()} was not found`)
    }
    return normalizeEvent(body.data.eventByCode, teamNumber)
  }
}

export function normalizeSearchEvent(event: RawSearchEvent): FtcScoutEventSearchResult {
  const location = event.location
  const locationLabel = location
    ? [location.city, location.state, location.country].filter(Boolean).join(', ') || null
    : null
  return {
    season: event.season,
    code: event.code.toUpperCase(),
    name: event.name,
    type: event.type,
    start: event.start ?? null,
    end: event.end ?? null,
    timezone: event.timezone ?? null,
    locationLabel,
    hasMatches: event.hasMatches
  }
}

export function normalizeEvent(event: RawEvent, teamNumber: number, now = new Date()): FtcScoutEventPayload {
  const matches = event.teamMatches
    .filter((tm) => tm.teamNumber === teamNumber)
    .map((tm) => normalizeMatch(tm))
    .sort(compareMatches)

  return {
    season: event.season,
    code: event.code.toUpperCase(),
    name: event.name,
    timezone: event.timezone ?? null,
    start: event.start ?? null,
    end: event.end ?? null,
    hasMatches: event.hasMatches,
    lastSynced: now.toISOString(),
    matches
  }
}

function normalizeMatch(tm: RawTeamMatch): FtcScoutMatch {
  const { tournamentLevel: level, series, matchNum } = tm.match
  const type = toLocalMatchType(level)
  const alliance = tm.alliance.toLowerCase()
  const station = toStation(tm.alliance, tm.station)
  const label = toLabel(level, series, matchNum)
  const replay = replayNumberFor(level, matchNum)
  const match: MatchInfo = {
    source: 'ftcscout',
    label,
    type,
    number: matchNumberFor(level, series, matchNum),
    ...(replay != null ? { replay } : {}),
    alliance,
    station,
    team_number: tm.teamNumber,
    ftcscout_id: tm.match.id,
    ftcscout_event_code: tm.match.eventCode.toUpperCase(),
    ftcscout_tournament_level: tm.match.tournamentLevel,
    ftcscout_series: tm.match.series,
    surrogate: tm.surrogate,
    no_show: tm.noShow,
    dq: tm.dq,
    on_field: tm.onField,
    has_been_played: tm.match.hasBeenPlayed,
    scheduled_start: tm.match.scheduledStartTime ?? null,
    actual_start: tm.match.actualStartTime ?? null
  }
  return {
    ftcscoutId: tm.match.id,
    season: tm.match.season,
    eventCode: tm.match.eventCode.toUpperCase(),
    tournamentLevel: tm.match.tournamentLevel,
    series: tm.match.series,
    matchNum: tm.match.matchNum,
    description: tm.match.description,
    scheduledStartTime: tm.match.scheduledStartTime ?? null,
    actualStartTime: tm.match.actualStartTime ?? null,
    hasBeenPlayed: tm.match.hasBeenPlayed,
    match
  }
}

export function toLocalMatchType(level: string): string {
  switch (level) {
    case 'Quals':
      return 'qualification'
    case 'Semis':
      return 'semifinal'
    case 'Finals':
      return 'final'
    case 'DoubleElim':
      return 'playoff'
    default:
      return 'other'
  }
}

/**
 * FTCScout numbers a `DoubleElim` match by its bracket position in `series` — the
 * "M-5" of its description — and uses `matchNum` only as a replay counter (a
 * replayed M-14 is `matchNum: 2`, described as "M-14.2"). Every other level
 * numbers the match with `matchNum` and uses `series` for the round.
 */
export function matchNumberFor(level: string, series: number, matchNum: number): number {
  return level === 'DoubleElim' ? series : matchNum
}

/** The replay counter for a match, or null when this is its first (only) playing. */
export function replayNumberFor(level: string, matchNum: number): number | null {
  return level === 'DoubleElim' && matchNum > 1 ? matchNum : null
}

export function toLabel(level: string, series: number, matchNum: number): string {
  switch (level) {
    case 'Quals':
      return `Q${matchNum}`
    case 'Semis':
      return `SF${series}-${matchNum}`
    case 'Finals':
      return `F${matchNum}`
    case 'DoubleElim':
      return matchNum > 1 ? `DE${series}.${matchNum}` : `DE${series}`
    default:
      return `M${matchNum}`
  }
}

function toStation(alliance: string, station: string): string {
  const a = alliance === 'Blue' ? 'B' : alliance === 'Red' ? 'R' : ''
  const s = station === 'One' ? '1' : station === 'Two' ? '2' : ''
  return a || s ? `${a}${s}` : station
}

function compareMatches(a: FtcScoutMatch, b: FtcScoutMatch): number {
  const rank = (level: string): number =>
    level === 'Quals' ? 0 : level === 'Semis' ? 1 : level === 'DoubleElim' ? 2 : level === 'Finals' ? 3 : 9
  const ar = rank(a.tournamentLevel)
  const br = rank(b.tournamentLevel)
  if (ar !== br) return ar - br
  if (a.series !== b.series) return a.series - b.series
  return a.matchNum - b.matchNum
}
