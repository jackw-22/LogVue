import { describe, expect, it } from 'vitest'
import { formatRecentTimestamp, parseTimestampMs } from '../src/renderer/lib/time'

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

  it('formats logs newer than eight hours as relative age', () => {
    expect(formatRecentTimestamp('2026-07-10T11:59:30.000Z', undefined, now)).toBe('just now')
    expect(formatRecentTimestamp('2026-07-10T11:15:00.000Z', undefined, now)).toBe('45m ago')
    expect(formatRecentTimestamp('2026-07-10T05:01:00.000Z', undefined, now)).toBe('6h ago')
  })

  it('uses the normal timestamp at eight hours or older', () => {
    expect(formatRecentTimestamp('2026-07-10T04:00:00.000Z', undefined, now)).toBe('2026-07-10 04:00:00')
  })

  it('uses the normal timestamp for future or unparseable values', () => {
    expect(formatRecentTimestamp('2026-07-10T12:01:00.000Z', undefined, now)).toBe('2026-07-10 12:01:00')
    expect(formatRecentTimestamp('not a date', undefined, now)).toBe('not a date')
  })
})
