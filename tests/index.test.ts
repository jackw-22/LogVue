import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectIndexRows } from '../src/main/services/index/rebuild'

let root: string

function writeSession(dir: string, meta: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.json'), JSON.stringify(meta, null, 2))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'logvue-idx-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('collectIndexRows', () => {
  it('flattens a nested archive into session + file rows', () => {
    const event = join(root, '2026', 'APOC26')
    writeSession(event, {
      schema_version: 1,
      session_id: 'evt-1',
      session_type: 'competition_event',
      display_name: 'APOC26',
      event: { display_code: 'APOC26', ftcscout_code: 'USAZAPOC' }
    })
    const match = join(event, 'Q4_Blue_B2')
    writeSession(match, {
      schema_version: 1,
      session_id: 'm-1',
      session_type: 'official_match',
      display_name: 'Q4 Blue B2',
      match: { alliance: 'blue', station: 'B2', team_number: 12345 },
      files: [
        { filename: 'AutoOpMode_log_1.rlog', kind: 'auto_log', source: 'control_hub', imported_at: '2026-07-04T10:00:00Z', file_size_bytes: 2048 }
      ]
    })

    const { sessions, files } = collectIndexRows(root)

    const evt = sessions.find((s) => s.session_id === 'evt-1')!
    expect(evt.event_code).toBe('APOC26') // display_code preferred over ftcscout_code

    const m = sessions.find((s) => s.session_id === 'm-1')!
    expect(m.session_type).toBe('official_match')
    expect(m.team_number).toBe(12345)
    expect(m.alliance).toBe('blue')

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      session_id: 'm-1',
      filename: 'AutoOpMode_log_1.rlog',
      kind: 'auto_log',
      file_size_bytes: 2048
    })
  })

  it('falls back event_code to ftcscout_code, and team_number to teams[0]', () => {
    writeSession(join(root, 'Evt'), {
      session_id: 'e2',
      session_type: 'competition_event',
      display_name: 'Evt',
      event: { ftcscout_code: 'USAZCMP' },
      teams: [98765]
    })
    const s = collectIndexRows(root).sessions.find((r) => r.session_id === 'e2')!
    expect(s.event_code).toBe('USAZCMP')
    expect(s.team_number).toBe(98765)
  })

  it('indexes bare folders with discovery defaults (rebuildable ids)', () => {
    mkdirSync(join(root, 'Random_Folder'), { recursive: true })
    const rows = collectIndexRows(root).sessions
    const bare = rows.find((s) => s.path.endsWith('Random_Folder'))!
    expect(bare.display_name).toBe('Random_Folder')
    expect(bare.session_type).toBe('general_session')
    expect(bare.session_id).toBeTruthy() // generated, disposable
  })

  it('projects deduped, trimmed tags into (session, tag) rows', () => {
    writeSession(join(root, 'Tuning'), {
      session_id: 'tag-1',
      session_type: 'tuning_session',
      display_name: 'Shooter tuning',
      tags: ['shooter', ' shooter ', 'vision', '  ']
    })
    const tags = collectIndexRows(root).tags.filter((t) => t.session_id === 'tag-1')
    expect(tags.map((t) => t.tag).sort()).toEqual(['shooter', 'vision'])
  })

  it('returns empty rows for a missing root', () => {
    expect(collectIndexRows(join(root, 'nope'))).toEqual({ sessions: [], files: [], tags: [] })
  })
})
