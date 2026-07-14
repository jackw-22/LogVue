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
    writeFileSync(join(match, 'AutoOpMode_log_1.rlog'), 'log')

    const { sessions, files } = collectIndexRows(root)

    const evt = sessions.find((s) => s.session_id === 'evt-1')!
    expect(evt.event_code).toBe('APOC26') // display_code preferred over ftcscout_code

    const m = sessions.find((s) => s.session_id === 'm-1')!
    expect(m.session_type).toBe('official_match')
    expect(m.team_number).toBe(12345)
    expect(m.alliance).toBe('blue')

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      session_path: match,
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

  it('indexes bare folders with discovery defaults keyed by path (no minted id)', () => {
    mkdirSync(join(root, 'Random_Folder'), { recursive: true })
    const rows = collectIndexRows(root).sessions
    const bare = rows.find((s) => s.path.endsWith('Random_Folder'))!
    expect(bare.display_name).toBe('Random_Folder')
    expect(bare.session_type).toBe('general_session')
    // Reads never mint ids: rescanning a bare folder must be idempotent.
    expect(bare.session_id).toBeNull()
  })

  it('keeps both sessions when a folder was copied (duplicate session_id)', () => {
    const meta = { session_id: 'dup-1', session_type: 'official_match', display_name: 'Q4' }
    writeSession(join(root, 'Q4'), meta)
    writeSession(join(root, 'Q4 - Copy'), meta)
    const rows = collectIndexRows(root).sessions
    expect(rows.filter((s) => s.session_id === 'dup-1')).toHaveLength(2)
    expect(new Set(rows.map((s) => s.path)).size).toBe(2)
  })

  it('degrades a corrupt session.json to bare-folder defaults instead of failing the walk', () => {
    const dir = join(root, 'Broken')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'session.json'), '{ this is not json')
    writeSession(join(root, 'Fine'), { session_id: 'ok-1', display_name: 'Fine' })

    const rows = collectIndexRows(root).sessions
    const broken = rows.find((s) => s.path === dir)!
    expect(broken.display_name).toBe('Broken')
    expect(broken.session_id).toBeNull()
    expect(rows.some((s) => s.session_id === 'ok-1')).toBe(true)
  })

  it('degrades a non-object session.json (valid JSON, wrong shape) the same way', () => {
    const dir = join(root, 'ArrayJson')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'session.json'), '["not", "an", "object"]')

    const rows = collectIndexRows(root).sessions
    expect(rows.find((s) => s.path === dir)!.display_name).toBe('ArrayJson')
  })

  it('indexes loose files physically present in session folders', () => {
    const dir = join(root, 'General')
    writeSession(dir, {
      session_id: 'general-1',
      session_type: 'general_session',
      display_name: 'General'
    })
    writeFileSync(join(dir, 'TeleOp_log_1.rlog'), 'abc')

    const files = collectIndexRows(root).files

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      session_path: dir,
      filename: 'TeleOp_log_1.rlog',
      kind: 'teleop_log',
      file_size_bytes: 3,
      remote_path: null
    })
  })

  it('does not index transient artifacts left by interrupted writes', () => {
    const dir = join(root, 'General')
    writeSession(dir, { session_id: 'g-1', display_name: 'General' })
    writeFileSync(join(dir, 'Real_log.rlog'), 'log')
    writeFileSync(join(dir, 'session.json.4242.tmp'), '{ half-written')

    expect(collectIndexRows(root).files.map((f) => f.filename)).toEqual(['Real_log.rlog'])
  })

  it('does not index tracked files that no longer exist on disk', () => {
    const dir = join(root, 'General')
    writeSession(dir, {
      session_id: 'general-1',
      session_type: 'general_session',
      display_name: 'General',
      files: [
        { filename: 'Present_log.rlog', kind: 'auto_log', source: 'control_hub' },
        { filename: 'Deleted_log.rlog', kind: 'teleop_log', source: 'control_hub' }
      ]
    })
    writeFileSync(join(dir, 'Present_log.rlog'), 'log')

    expect(collectIndexRows(root).files.map((file) => file.filename)).toEqual(['Present_log.rlog'])
  })

  it('projects deduped, trimmed tags into (session, tag) rows', () => {
    const dir = join(root, 'Tuning')
    writeSession(dir, {
      session_id: 'tag-1',
      session_type: 'tuning_session',
      display_name: 'Shooter tuning',
      tags: ['shooter', ' shooter ', 'vision', '  ']
    })
    const tags = collectIndexRows(root).tags.filter((t) => t.session_path === dir)
    expect(tags.map((t) => t.tag).sort()).toEqual(['shooter', 'vision'])
  })

  it('returns empty rows for a missing root', () => {
    expect(collectIndexRows(join(root, 'nope'))).toEqual({ sessions: [], files: [], tags: [], fileMeta: [] })
  })

  it('does not index the .logvue app-data directory', () => {
    mkdirSync(join(root, '.logvue'), { recursive: true })
    writeFileSync(join(root, '.logvue', 'index.sqlite'), 'internal')
    writeSession(join(root, 'Visible'), { session_id: 'visible', display_name: 'Visible' })

    const rows = collectIndexRows(root)
    expect(rows.sessions.map((session) => session.session_id)).toEqual(['visible'])
    expect(rows.files).toEqual([])
  })
})
