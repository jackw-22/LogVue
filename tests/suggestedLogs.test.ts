import { describe, expect, it } from 'vitest'
import type { HubLog } from '../src/shared/types/hublog'
import { formatDelta, matchTimeChoice, suggestLogsForMatch } from '../src/renderer/lib/suggestedLogs'

function log(filename: string, parsed: string): HubLog {
  return {
    remote_path: `/sdcard/${filename}`,
    filename,
    opmode: 'TeleOp',
    parsed_timestamp: parsed,
    file_size_bytes: 1,
    import_status: { state: 'not_imported' }
  }
}

function importedLog(filename: string, parsed: string): HubLog {
  return {
    ...log(filename, parsed),
    import_status: { state: 'imported', sessionPath: '/sessions/q1', sessionLabel: 'Q1' }
  }
}

describe('suggested match logs', () => {
  it('prefers actual match time over scheduled time', () => {
    expect(
      matchTimeChoice({
        scheduled_start: '2026-07-04T10:00:00.000Z',
        actual_start: '2026-07-04T10:12:00.000Z'
      })
    ).toEqual({ value: '2026-07-04T10:12:00.000Z', source: 'actual' })
  })

  it('applies hub clock offset before matching logs', () => {
    const hubLogTime = '2026-07-04T09:58:00.000'
    const offsetMs = 30 * 60_000
    const matchTime = new Date(Date.parse(hubLogTime) + offsetMs).toISOString()
    const suggestions = suggestLogsForMatch(
      [
        log('TeleOp_log_20260704_095800_000.rlog', hubLogTime),
        log('Old_log_20260704_080000_000.rlog', '2026-07-04T08:00:00.000')
      ],
      { scheduled_start: matchTime },
      offsetMs
    )

    expect(suggestions.map((s) => s.log.filename)).toEqual([
      'Old_log_20260704_080000_000.rlog',
      'TeleOp_log_20260704_095800_000.rlog'
    ])
    expect(suggestions[1].strength).toBe('strong')
  })

  it('includes nearby context logs around the top match', () => {
    const suggestions = suggestLogsForMatch(
      [
        log('A_log_20260704_093000_000.rlog', '2026-07-04T09:30:00.000'),
        log('B_log_20260704_094000_000.rlog', '2026-07-04T09:40:00.000'),
        log('C_log_20260704_095000_000.rlog', '2026-07-04T09:50:00.000'),
        log('D_log_20260704_100100_000.rlog', '2026-07-04T10:01:00.000'),
        log('E_log_20260704_101000_000.rlog', '2026-07-04T10:10:00.000'),
        log('F_log_20260704_110000_000.rlog', '2026-07-04T11:00:00.000')
      ],
      { scheduled_start: new Date(Date.parse('2026-07-04T10:00:00.000')).toISOString() },
      0
    )

    expect(suggestions.map((s) => s.log.filename[0])).toEqual(['C', 'D', 'E'])
    expect(suggestions.find((s) => s.log.filename.startsWith('D_'))?.strength).toBe('strong')
    expect(suggestions.find((s) => s.log.filename.startsWith('C_'))?.strength).toBe('context')
    expect(suggestions.find((s) => s.log.filename.startsWith('E_'))?.strength).toBe('context')
  })

  it('marks every log within five minutes as a strong candidate', () => {
    const suggestions = suggestLogsForMatch(
      [
        log('A_log_20260704_095400_000.rlog', '2026-07-04T09:54:00.000'),
        log('B_log_20260704_095700_000.rlog', '2026-07-04T09:57:00.000'),
        log('C_log_20260704_100000_000.rlog', '2026-07-04T10:00:00.000'),
        log('D_log_20260704_100400_000.rlog', '2026-07-04T10:04:00.000'),
        log('E_log_20260704_101000_000.rlog', '2026-07-04T10:10:00.000')
      ],
      { scheduled_start: new Date(Date.parse('2026-07-04T10:00:00.000')).toISOString() },
      0
    )

    expect(
      suggestions.filter((s) => s.strength === 'strong').map((s) => s.log.filename[0])
    ).toEqual(['B', 'C', 'D'])
  })

  it('caps strong candidates at eight closest logs', () => {
    const logs = Array.from({ length: 10 }, (_v, i) => {
      const seconds = String(i).padStart(2, '0')
      return log(`L${i}_log_20260704_1000${seconds}_000.rlog`, `2026-07-04T10:00:${seconds}.000`)
    })
    const suggestions = suggestLogsForMatch(
      logs,
      { scheduled_start: new Date(Date.parse('2026-07-04T10:00:00.000')).toISOString() },
      0
    )

    expect(suggestions.filter((s) => s.strength === 'strong')).toHaveLength(8)
  })

  it('marks the best candidate amber when it is more than five minutes away', () => {
    const suggestions = suggestLogsForMatch(
      [
        log('A_log_20260704_094000_000.rlog', '2026-07-04T09:40:00.000'),
        log('B_log_20260704_095000_000.rlog', '2026-07-04T09:50:00.000'),
        log('C_log_20260704_102000_000.rlog', '2026-07-04T10:20:00.000')
      ],
      { scheduled_start: new Date(Date.parse('2026-07-04T10:00:00.000')).toISOString() },
      0
    )

    expect(suggestions.map((s) => s.log.filename[0])).toEqual(['A', 'B', 'C'])
    expect(suggestions.find((s) => s.log.filename.startsWith('B_'))?.strength).toBe('weak')
  })

  it('leaves the view unchanged when a suggested log becomes imported', () => {
    const logs = [
      log('A_log_20260704_095000_000.rlog', '2026-07-04T09:50:00.000'),
      log('B_log_20260704_100000_000.rlog', '2026-07-04T10:00:00.000'),
      log('C_log_20260704_101000_000.rlog', '2026-07-04T10:10:00.000')
    ]
    const match = { scheduled_start: new Date(Date.parse('2026-07-04T10:00:00.000')).toISOString() }
    const before = suggestLogsForMatch(logs, match, 0)
    const after = suggestLogsForMatch(
      [logs[0], importedLog('B_log_20260704_100000_000.rlog', '2026-07-04T10:00:00.000'), logs[2]],
      match,
      0
    )

    expect(after.map((s) => s.log.filename)).toEqual(before.map((s) => s.log.filename))
    expect(after.map((s) => s.strength)).toEqual(before.map((s) => s.strength))
    expect(after.map((s) => s.imported)).toEqual([false, true, false])
  })

  it('keeps an imported log centred between its context logs', () => {
    const suggestions = suggestLogsForMatch(
      [
        log('A_log_20260704_095000_000.rlog', '2026-07-04T09:50:00.000'),
        importedLog('B_log_20260704_100000_000.rlog', '2026-07-04T10:00:00.000'),
        log('C_log_20260704_101000_000.rlog', '2026-07-04T10:10:00.000')
      ],
      { scheduled_start: new Date(Date.parse('2026-07-04T10:00:00.000')).toISOString() },
      0
    )

    expect(suggestions.map((s) => s.log.filename[0])).toEqual(['A', 'B', 'C'])
    expect(suggestions[1].strength).toBe('strong')
  })

  it('still suggests the next unimported log alongside imported ones', () => {
    const suggestions = suggestLogsForMatch(
      [
        importedLog('A_log_20260704_100000_000.rlog', '2026-07-04T10:00:00.000'),
        log('B_log_20260704_100200_000.rlog', '2026-07-04T10:02:00.000')
      ],
      { scheduled_start: new Date(Date.parse('2026-07-04T10:00:00.000')).toISOString() },
      0
    )

    expect(suggestions.map((s) => s.strength)).toEqual(['strong', 'strong'])
    expect(suggestions.filter((s) => !s.imported).map((s) => s.log.filename[0])).toEqual(['B'])
  })

  it('formats delta chips with seconds instead of hiding near-match offsets', () => {
    expect(formatDelta(0)).toBe('at match time')
    expect(formatDelta(14_000)).toBe('14s after')
    expect(formatDelta(-74_000)).toBe('1m 14s before')
    expect(formatDelta(3_660_000)).toBe('1h 1m after')
  })
})
