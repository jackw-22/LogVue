import type { HubLog } from '@shared/types/hublog'
import type { MatchInfo } from '@shared/types/session'
import { parseTimestampMs } from './time'

export interface SuggestedLog {
  log: HubLog
  correctedTimeMs: number
  deltaMs: number
  strength: 'strong' | 'weak' | 'context'
  imported: boolean
}

export interface MatchTimeChoice {
  value: string
  source: 'actual' | 'scheduled'
}

const STRONG_WINDOW_MS = 5 * 60_000
const MAX_STRONG_CANDIDATES = 8
const CONTEXT_AROUND_MATCHES = 1

export function matchTimeChoice(match: MatchInfo | null | undefined): MatchTimeChoice | null {
  const actual = typeof match?.actual_start === 'string' ? match.actual_start : null
  if (actual) return { value: actual, source: 'actual' }
  const scheduled = typeof match?.scheduled_start === 'string' ? match.scheduled_start : null
  if (scheduled) return { value: scheduled, source: 'scheduled' }
  return null
}

export function suggestLogsForMatch(
  logs: HubLog[],
  match: MatchInfo | null | undefined,
  hubOffsetMs: number,
  hubTimezoneOffsetMinutes: number | null = null
): SuggestedLog[] {
  const choice = matchTimeChoice(match)
  if (!choice) return []
  const matchMs = Date.parse(choice.value)
  if (Number.isNaN(matchMs)) return []

  const timed = logs
    .filter((log) => log.import_status.state !== 'ignored' && !!log.parsed_timestamp)
    .map((log): SuggestedLog | null => {
      const hubLogMs = parseTimestampMs(log.parsed_timestamp, hubTimezoneOffsetMinutes)
      if (hubLogMs == null) return null
      const correctedTimeMs = hubLogMs + hubOffsetMs
      const deltaMs = correctedTimeMs - matchMs
      const imported = log.import_status.state === 'imported'
      return { log, correctedTimeMs, deltaMs, strength: 'context', imported }
    })
    .filter((x): x is SuggestedLog => !!x)
    .sort((a, b) => a.correctedTimeMs - b.correctedTimeMs)

  // Strength and list membership deliberately ignore import status: importing a log
  // must not reshuffle the view, it only flips that row's badge.
  const byClosest = (a: SuggestedLog, b: SuggestedLog) => Math.abs(a.deltaMs) - Math.abs(b.deltaMs)
  const strongCandidates = timed
    .filter((item) => Math.abs(item.deltaMs) <= STRONG_WINDOW_MS)
    .sort(byClosest)
    .slice(0, MAX_STRONG_CANDIDATES)
  const anchors = strongCandidates.length > 0 ? strongCandidates : timed.slice().sort(byClosest).slice(0, 1)
  if (anchors.length === 0) return []
  for (const anchor of anchors) {
    anchor.strength = Math.abs(anchor.deltaMs) <= STRONG_WINDOW_MS ? 'strong' : 'weak'
  }

  const keep = new Set<number>()
  for (const anchor of anchors) {
    const index = timed.findIndex((item) => item.log.remote_path === anchor.log.remote_path)
    if (index < 0) continue
    for (
      let i = Math.max(0, index - CONTEXT_AROUND_MATCHES);
      i <= Math.min(timed.length - 1, index + CONTEXT_AROUND_MATCHES);
      i += 1
    ) {
      keep.add(i)
    }
  }

  return [...keep].sort((a, b) => a - b).map((i) => timed[i])
}

export function formatDelta(ms: number): string {
  const seconds = Math.round(Math.abs(ms) / 1000)
  if (seconds === 0) return 'at match time'
  const text = formatDuration(seconds)
  return ms < 0 ? `${text} before` : `${text} after`
}

export function formatDeltaSeconds(ms: number): string {
  const seconds = Math.round(Math.abs(ms) / 1000)
  if (seconds === 0) return 'exactly at match time'
  return ms < 0 ? `${seconds}s before match time` : `${seconds}s after match time`
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}
