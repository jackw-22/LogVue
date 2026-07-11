import { describe, expect, it } from 'vitest'
import type { FolderFile, SessionFile } from '../src/shared/types/session'
import { sortSessionFiles } from '../src/renderer/lib/sessionFiles'

function file(filename: string, modifiedAt: string | null = null): FolderFile {
  return { filename, kind: 'match_log', sizeBytes: 1, modifiedAt, tracked: true, metadata: null }
}

function tracked(filename: string, recordedAt: string | null, importedAt: string): SessionFile {
  return {
    filename,
    kind: 'match_log',
    source: 'control_hub',
    imported_at: importedAt,
    recorded_at: recordedAt
  }
}

describe('session file sorting', () => {
  it('sorts alphabetically without mutating the source list', () => {
    const source = [file('Z.rlog'), file('A.rlog')]
    expect(sortSessionFiles(source, [], 'alphabetical').map((item) => item.filename)).toEqual([
      'A.rlog',
      'Z.rlog'
    ])
    expect(source[0].filename).toBe('Z.rlog')
  })

  it('sorts oldest-first using recorded, filename, import, then modified timestamps', () => {
    const files = [
      file('Recorded.rlog'),
      file('TeleOp_log_20260711_100000_000.rlog'),
      file('Imported.rlog'),
      file('Loose.rlog', '2026-07-11T13:00:00.000Z')
    ]
    const trackedFiles = [
      tracked('Recorded.rlog', '2026-07-11T09:00:00.000Z', '2026-07-11T14:00:00.000Z'),
      tracked('Imported.rlog', null, '2026-07-11T12:00:00.000Z')
    ]

    expect(sortSessionFiles(files, trackedFiles, 'oldest').map((item) => item.filename)).toEqual([
      'Recorded.rlog',
      'TeleOp_log_20260711_100000_000.rlog',
      'Imported.rlog',
      'Loose.rlog'
    ])
  })
})
