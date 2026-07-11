import { describe, expect, it } from 'vitest'
import { formatRecentTimestamp, parseTimestampMs } from '../src/renderer/lib/time'

function expectedLocalTimestamp(value: string): string {
  const date = new Date(value)
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

describe('parseTimestampMs', () => {
  it('interprets zone-less hub timestamps in the supplied hub timezone', () => {
    expect(parseTimestampMs('2026-07-04T11:50:05.000', 600)).toBe(
      Date.parse('2026-07-04T01:50:05.000Z')
    )
  })

  it('honours explicit timezone timestamps without applying the supplied offset', () => {
    expect(parseTimestampMs('2026-07-04T11:50:05.000Z', 600)).toBe(
      Date.parse('2026-07-04T11:50:05.000Z')
    )
  })
})

describe('formatRecentTimestamp', () => {
  const now = Date.parse('2026-07-10T12:00:00.000Z')

  it('formats logs newer than two hours as relative age', () => {
    expect(formatRecentTimestamp('2026-07-10T11:59:30.000Z', undefined, now)).toBe('just now')
    expect(formatRecentTimestamp('2026-07-10T11:15:00.000Z', undefined, now)).toBe('45m ago')
    expect(formatRecentTimestamp('2026-07-10T10:01:00.000Z', undefined, now)).toBe('1h 59m ago')
  })

  it('uses the normal timestamp at two hours or older', () => {
    const timestamp = '2026-07-10T10:00:00.000Z'
    expect(formatRecentTimestamp(timestamp, undefined, now)).toBe(expectedLocalTimestamp(timestamp))
  })

  it('uses the normal timestamp for future or unparseable values', () => {
    const futureTimestamp = '2026-07-10T12:01:00.000Z'
    expect(formatRecentTimestamp(futureTimestamp, undefined, now)).toBe(
      expectedLocalTimestamp(futureTimestamp)
    )
    expect(formatRecentTimestamp('not a date', undefined, now)).toBe('not a date')
  })
})
