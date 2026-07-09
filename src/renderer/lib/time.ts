const EXPLICIT_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i
const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Format for display. Explicit-zone timestamps are converted to this computer's local time. */
export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—'
  if (EXPLICIT_ZONE.test(ts)) {
    const d = new Date(ts)
    if (!Number.isNaN(d.getTime())) return formatLocalDate(d)
  }
  return ts.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '')
}

/** Coarse relative age — `12m ago`, `3h ago`, `5d ago` — for the "Latest" jump button. */
export function formatRelative(ts: string): string {
  const then = new Date(ts).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Show recent timestamps as age, otherwise the normal absolute timestamp. */
export function formatRecentTimestamp(
  ts: string | null | undefined,
  thresholdMs = 8 * 60 * 60 * 1000,
  nowMs = Date.now()
): string {
  if (!ts) return formatTimestamp(ts)
  const then = Date.parse(ts)
  if (Number.isNaN(then)) return formatTimestamp(ts)
  const ageMs = nowMs - then
  if (ageMs >= 0 && ageMs < thresholdMs) return formatRelativeFromMs(ageMs)
  return formatTimestamp(ts)
}

function formatRelativeFromMs(ageMs: number): string {
  const mins = Math.floor(ageMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export function correctedTimestamp(ts: string | null | undefined, offsetMs: number): string | null {
  const ms = parseTimestampMs(ts, null)
  if (ms == null) return ts ?? null
  return new Date(ms + offsetMs).toISOString()
}

export function correctedHubTimestamp(
  ts: string | null | undefined,
  hubTimezoneOffsetMinutes: number | null | undefined,
  offsetMs: number
): string | null {
  const ms = parseTimestampMs(ts, hubTimezoneOffsetMinutes ?? null)
  if (ms == null) return ts ?? null
  return new Date(ms + offsetMs).toISOString()
}

export function parseTimestampMs(
  ts: string | null | undefined,
  timezoneOffsetMinutes: number | null
): number | null {
  if (!ts) return null
  if (EXPLICIT_ZONE.test(ts) || timezoneOffsetMinutes == null) {
    const ms = Date.parse(ts)
    return Number.isNaN(ms) ? null : ms
  }
  const match = LOCAL_ISO.exec(ts)
  if (!match) {
    const ms = Date.parse(ts)
    return Number.isNaN(ms) ? null : ms
  }
  const [, y, mo, d, h, mi, s, msRaw = '0'] = match
  const millis = Number(msRaw.padEnd(3, '0'))
  return (
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), millis) -
    timezoneOffsetMinutes * 60_000
  )
}

export function formatHubOffset(offsetMs: number | null | undefined): string {
  if (offsetMs == null) return ''
  const minutes = Math.round(Math.abs(offsetMs) / 60_000)
  if (minutes === 0) return '~0 min'
  return offsetMs > 0 ? `~${minutes} min slow` : `~${minutes} min fast`
}
