import { describe, expect, it } from 'vitest'
import type { HubLog, ImportStatus } from '../src/shared/types/hublog'
import type { SessionFile } from '../src/shared/types/session'
import {
  dateSessionKey,
  latestSessionLogTime,
  logsForQuickCatchUp,
  sessionLogIsFromEarlierDay
} from '../src/renderer/lib/hubLogSelection'

function log(name: string, import_status: ImportStatus): HubLog {
  return {
    remote_path: `/hub/${name}.rlog`,
    filename: `${name}.rlog`,
    opmode: name,
    parsed_timestamp: null,
    file_size_bytes: 1,
    import_status
  }
}

function sessionFile(filename: string, recordedAt: string | null, importedAt: string): SessionFile {
  return {
    filename,
    kind: 'match_log',
    source: 'control_hub',
    recorded_at: recordedAt,
    imported_at: importedAt
  }
}

describe('quick catch-up log selection', () => {
  it('formats the local date-session key', () => {
    expect(dateSessionKey(new Date(2026, 6, 11))).toBe('2026-07-11')
  })

  it('selects untouched logs newer than the latest imported log', () => {
    const selected = logsForQuickCatchUp([
      log('newest', { state: 'not_imported' }),
      log('ignored', { state: 'ignored' }),
      log('newer', { state: 'not_imported' }),
      log('boundary', { state: 'imported', sessionPath: '/sessions/a', sessionLabel: 'A' }),
      log('older', { state: 'not_imported' })
    ])

    expect(selected.map((item) => item.opmode)).toEqual(['newest', 'newer'])
  })

  it('selects only the latest untouched log when there is no import history', () => {
    const selected = logsForQuickCatchUp([
      log('ignored', { state: 'ignored' }),
      log('latest', { state: 'not_imported' }),
      log('older', { state: 'not_imported' })
    ])

    expect(selected.map((item) => item.opmode)).toEqual(['latest'])
  })

  it('is empty when no untouched log is newer than the latest imported log', () => {
    const selected = logsForQuickCatchUp([
      log('boundary', { state: 'imported', sessionPath: '/sessions/a', sessionLabel: 'A' }),
      log('older', { state: 'not_imported' })
    ])

    expect(selected).toEqual([])
  })

  it('warns when the newest session log is from an earlier local calendar day', () => {
    const files = [
      sessionFile('older.rlog', '2026-07-09T23:00:00.000Z', '2026-07-09T23:05:00.000Z'),
      sessionFile('latest.rlog', '2026-07-10T13:00:00.000Z', '2026-07-10T13:05:00.000Z'),
      sessionFile('today.txt', null, '2026-07-11T01:00:00.000Z')
    ]

    expect(latestSessionLogTime(files)).toBe(Date.parse('2026-07-10T13:00:00.000Z'))
    expect(sessionLogIsFromEarlierDay(files, new Date(2026, 6, 11, 9))).toBe(true)
  })

  it('does not warn for an empty session or one with a log from today', () => {
    const now = new Date(2026, 6, 11, 9)
    const today = new Date(2026, 6, 11, 1).toISOString()

    expect(sessionLogIsFromEarlierDay([], now)).toBe(false)
    expect(sessionLogIsFromEarlierDay([sessionFile('today.rlog', today, today)], now)).toBe(false)
  })
})
