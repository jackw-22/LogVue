import type { MatchInfo } from './session'

export interface FtcScoutSyncRequest {
  eventPath: string
  season: number
  eventCode: string
  teamNumber: number
  /**
   * When true, use cached event data if the network fetch fails. Explicitly part
   * of the request so future UI can choose strict-online preview vs resilient sync.
   */
  allowCacheFallback?: boolean
}

export interface FtcScoutEventSearchRequest {
  season: number
  searchText: string
  teamNumber?: number | null
  onlyTeamEvents?: boolean
  hasMatches?: boolean
  limit?: number
}

export interface FtcScoutEventSearchResult {
  season: number
  code: string
  name: string
  type: string
  start: string | null
  end: string | null
  timezone: string | null
  locationLabel: string | null
  hasMatches: boolean
}

export interface FtcScoutMatch {
  ftcscoutId: number
  season: number
  eventCode: string
  tournamentLevel: string
  series: number
  matchNum: number
  description: string
  scheduledStartTime: string | null
  actualStartTime: string | null
  hasBeenPlayed: boolean
  match: MatchInfo
}

export interface FtcScoutEventPayload {
  season: number
  code: string
  name: string
  timezone: string | null
  start: string | null
  end: string | null
  hasMatches: boolean
  lastSynced: string
  matches: FtcScoutMatch[]
}

export interface FtcScoutSyncResult {
  event: FtcScoutEventPayload
  teamNumber: number
  fromCache: boolean
  created: number
  updated: number
  unchanged: number
}
