import { describe, expect, it } from 'vitest'
import { parseRlogFilename } from '../src/main/services/adb/rlogFilename'
import { parseFindOutput, parseLsOutput, remoteBasename } from '../src/main/services/adb/parseLs'
import { assembleHubLogs } from '../src/main/services/adb/hublogs'
import type { ImportStatus } from '../src/shared/types/hublog'
import type { RemoteFile } from '../src/main/services/adb/AdbClient'

describe('parseRlogFilename', () => {
  it('parses opmode and timestamp from a canonical name', () => {
    expect(parseRlogFilename('BlueOpMode_log_20260704_115005_104.rlog')).toEqual({
      opmode: 'BlueOpMode',
      parsed_timestamp: '2026-07-04T11:50:05.104'
    })
  })

  it('keeps underscore-laden opmodes intact (splits on the last _log_)', () => {
    expect(parseRlogFilename('Shooter_Tuning_log_20260708_190211_441.rlog')).toEqual({
      opmode: 'Shooter_Tuning',
      parsed_timestamp: '2026-07-08T19:02:11.441'
    })
  })

  it('falls back to opmode-only when the timestamp is malformed', () => {
    expect(parseRlogFilename('DriveTest_log_weirdstamp.rlog')).toEqual({
      opmode: 'DriveTest',
      parsed_timestamp: null
    })
  })

  it('handles a bare .rlog name with no _log_ marker', () => {
    expect(parseRlogFilename('capture.rlog')).toEqual({ opmode: 'capture', parsed_timestamp: null })
  })

  it('returns nulls for a non-rlog name', () => {
    expect(parseRlogFilename('crash_report.txt')).toEqual({ opmode: null, parsed_timestamp: null })
  })
})

describe('parseLsOutput', () => {
  it('parses toybox `ls -l` rows with a link count', () => {
    const out = [
      'total 40',
      '-rw-rw---- 1 root sdcard_rw 1048576 2026-07-04 11:50 AutoOpMode_log_20260704_115005_104.rlog',
      '-rw-rw---- 1 root sdcard_rw  524288 2026-07-04 11:53 TeleOp_log_20260704_115327_882.rlog'
    ].join('\n')
    expect(parseLsOutput(out)).toEqual([
      { filename: 'AutoOpMode_log_20260704_115005_104.rlog', file_size_bytes: 1048576 },
      { filename: 'TeleOp_log_20260704_115327_882.rlog', file_size_bytes: 524288 }
    ])
  })

  it('parses rows without a link count and with seconds in the time', () => {
    const out = '-rw-rw---- root sdcard_rw 2048 2026-07-08 19:02:11 ShooterTuning_log_20260708_190211_441.rlog'
    expect(parseLsOutput(out)).toEqual([
      { filename: 'ShooterTuning_log_20260708_190211_441.rlog', file_size_bytes: 2048 }
    ])
  })

  it('skips directories, symlinks and the total header', () => {
    const out = [
      'total 8',
      'drwxrwx--- 2 root sdcard_rw 4096 2026-07-04 11:50 subdir',
      'lrwxrwxrwx 1 root root 10 2026-07-04 11:50 link -> target',
      '-rw-rw---- 1 root sdcard_rw 512 2026-07-04 11:50 keep.rlog'
    ].join('\n')
    expect(parseLsOutput(out)).toEqual([{ filename: 'keep.rlog', file_size_bytes: 512 }])
  })

  it('falls back to last-token name / last-int size when there is no date column', () => {
    const out = '-rw-rw---- 1 root sdcard_rw 777 weird_no_date.rlog'
    expect(parseLsOutput(out)).toEqual([{ filename: 'weird_no_date.rlog', file_size_bytes: 777 }])
  })
})

describe('parseFindOutput', () => {
  it('keeps absolute paths and drops blanks/noise', () => {
    const out = [
      '/sdcard/FIRST/PsiKit/AutoOpMode_log_20260704_115005_104.rlog',
      '',
      '/sdcard/FIRST/PsiKit/TeleOp_log_20260704_115327_882.rlog',
      'find: permission denied'
    ].join('\n')
    expect(parseFindOutput(out)).toEqual([
      '/sdcard/FIRST/PsiKit/AutoOpMode_log_20260704_115005_104.rlog',
      '/sdcard/FIRST/PsiKit/TeleOp_log_20260704_115327_882.rlog'
    ])
  })
})

describe('remoteBasename', () => {
  it('takes the last path segment', () => {
    expect(remoteBasename('/sdcard/FIRST/PsiKit/x.rlog')).toBe('x.rlog')
    expect(remoteBasename('x.rlog')).toBe('x.rlog')
  })
})

describe('assembleHubLogs', () => {
  const files: RemoteFile[] = [
    { remote_path: '/p/A_log_20260704_115005_104.rlog', filename: 'A_log_20260704_115005_104.rlog', file_size_bytes: 10 },
    { remote_path: '/p/B_log_20260704_120000_000.rlog', filename: 'B_log_20260704_120000_000.rlog', file_size_bytes: 20 },
    { remote_path: '/p/noext.rlog', filename: 'noext.rlog', file_size_bytes: 30 }
  ]

  it('parses metadata, resolves status, and sorts newest-first (nulls last)', () => {
    const resolve = (rp: string): ImportStatus =>
      rp.includes('/A_') ? { state: 'imported', sessionPath: '/arch/Q4', sessionLabel: 'Q4 Blue B2' } : { state: 'not_imported' }

    const logs = assembleHubLogs(files, resolve)

    expect(logs.map((l) => l.filename)).toEqual([
      'B_log_20260704_120000_000.rlog', // 12:00 newest
      'A_log_20260704_115005_104.rlog', // 11:50
      'noext.rlog' // no timestamp → last
    ])
    const a = logs.find((l) => l.opmode === 'A')!
    expect(a.import_status).toEqual({ state: 'imported', sessionPath: '/arch/Q4', sessionLabel: 'Q4 Blue B2' })
    expect(logs.find((l) => l.filename === 'noext.rlog')!.parsed_timestamp).toBeNull()
  })
})
