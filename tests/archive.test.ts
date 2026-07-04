import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createSession,
  getSession,
  promoteFolder,
  scanTree,
  updateMeta
} from '../src/main/services/archive/ArchiveService'
import { parseSessionJson, makeDefaultMetadata } from '../src/shared/schema/sessionJson'
import { toFolderName } from '../src/main/services/archive/paths'

let root: string

function writeSession(dir: string, meta: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.json'), JSON.stringify(meta, null, 2))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'logvue-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('scanTree', () => {
  it('nests sessions and counts logs from disk', () => {
    const apoc = join(root, '2026', 'APOC26')
    writeSession(apoc, { schema_version: 1, session_type: 'competition_event', display_name: 'APOC26' })
    const q4 = join(apoc, 'Q4_Blue_B2')
    writeSession(q4, { schema_version: 1, session_type: 'official_match', display_name: 'Q4 Blue B2' })
    writeFileSync(join(q4, 'AutoOpMode_log_1.rlog'), 'x')
    writeFileSync(join(q4, 'TeleOp_log_2.rlog'), 'x')

    const tree = scanTree(root)
    const year = tree.find((n) => n.name === '2026')!
    expect(year.hasSessionJson).toBe(false) // bare grouping folder
    const event = year.children[0]
    expect(event.displayName).toBe('APOC26')
    expect(event.sessionType).toBe('competition_event')
    const match = event.children[0]
    expect(match.displayName).toBe('Q4 Blue B2')
    expect(match.logCount).toBe(2)
  })

  it('returns [] for a missing root', () => {
    expect(scanTree(join(root, 'nope'))).toEqual([])
  })
})

describe('createSession', () => {
  it('creates a folder-safe dir, session.json and notes.md', () => {
    const s = createSession({ parentPath: root, displayName: 'Q4 Blue B2', sessionType: 'official_match' })
    expect(s.name).toBe('Q4_Blue_B2')
    expect(s.metadata.display_name).toBe('Q4 Blue B2')
    expect(s.metadata.session_type).toBe('official_match')
    expect(s.hasSessionJson).toBe(true)
    const onDisk = JSON.parse(readFileSync(join(s.path, 'session.json'), 'utf-8'))
    expect(onDisk.session_id).toBeTruthy()
  })

  it('disambiguates colliding names', () => {
    const a = createSession({ parentPath: root, displayName: 'Test', sessionType: 'test_session' })
    const b = createSession({ parentPath: root, displayName: 'Test', sessionType: 'test_session' })
    expect(a.name).toBe('Test')
    expect(b.name).toBe('Test_2')
  })
})

describe('promoteFolder', () => {
  it('writes discovery-default metadata for a bare folder', () => {
    const bare = join(root, 'Random_Folder')
    mkdirSync(bare, { recursive: true })
    expect(getSession(bare).hasSessionJson).toBe(false)
    const promoted = promoteFolder(bare)
    expect(promoted.hasSessionJson).toBe(true)
    expect(promoted.metadata.display_name).toBe('Random_Folder')
    expect(promoted.metadata.session_type).toBe('general_session')
  })
})

describe('updateMeta', () => {
  it('merges a patch and bumps updated_at', async () => {
    const s = createSession({ parentPath: root, displayName: 'Tuning', sessionType: 'tuning_session' })
    const before = s.metadata.updated_at
    await new Promise((r) => setTimeout(r, 5))
    const updated = updateMeta(s.path, { tags: ['swerve', 'heading-pid'] })
    expect(updated.metadata.tags).toEqual(['swerve', 'heading-pid'])
    expect(updated.metadata.updated_at >= before).toBe(true)
    expect(updated.metadata.display_name).toBe('Tuning') // preserved
  })
})

describe('schema resilience', () => {
  it('falls back unknown enums to "other" and preserves unknown keys', () => {
    const m = parseSessionJson(
      { session_type: 'martian_session', display_name: 'X', custom_future_field: 42 },
      'Folder'
    )
    expect(m.session_type).toBe('other')
    expect((m as Record<string, unknown>).custom_future_field).toBe(42)
  })

  it('makeDefaultMetadata seeds display_name from folder name', () => {
    expect(makeDefaultMetadata('My_Folder').display_name).toBe('My_Folder')
  })
})

describe('toFolderName', () => {
  it('keeps names readable and filesystem-safe', () => {
    expect(toFolderName('Q4 Blue B2')).toBe('Q4_Blue_B2')
    expect(toFolderName('Drive: test/run?')).toBe('Drive_testrun')
    expect(toFolderName('  spaced  out  ')).toBe('spaced_out')
  })
})
