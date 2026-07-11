import { describe, expect, it } from 'vitest'
import type { FolderFile } from '../src/shared/types/session'
import {
  logMentionMarkdown,
  parseLogMentionMarkdown,
  suggestLogMentions,
  toLogMentionCandidate
} from '../src/renderer/lib/logMentions'

function file(filename: string): FolderFile {
  return { filename, kind: 'match_log', sizeBytes: 1, modifiedAt: null, tracked: true, metadata: null }
}

describe('log mentions', () => {
  it('round-trips filenames safely through the Markdown target', () => {
    const markdown = logMentionMarkdown('Red Op (final).rlog', 'Red Op')
    expect(parseLogMentionMarkdown(`See ${markdown}.`)).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'mention', filename: 'Red Op (final).rlog', label: 'Red Op' },
      { type: 'text', value: '.' }
    ])
  })

  it('uses op-mode and precise recorded time to distinguish similar filenames', () => {
    expect(toLogMentionCandidate(file('RedOp_log_20260711_153012_145.rlog'))).toMatchObject({
      opmode: 'RedOp',
      label: 'RedOp · 07-11 15:30:12.145'
    })
  })

  it('ranks op-mode prefix matches and excludes non-logs', () => {
    const suggestions = suggestLogMentions([
      file('BlueOp_log_20260711_153012_145.rlog'),
      file('RedOp_log_20260711_153100_000.rlog'),
      file('AnotherRedOp_log_20260711_153200_000.rlog'),
      file('notes.txt')
    ], 'Red')

    expect(suggestions.map((item) => item.opmode)).toEqual(['RedOp', 'AnotherRedOp'])
  })
})
