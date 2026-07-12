import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createSession,
  deleteSession,
  deleteSessionSummary,
  getSession,
  listFolderFiles,
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
    writeSession(q4, {
      schema_version: 1,
      session_type: 'official_match',
      display_name: 'Q4 Blue B2',
      match: { label: 'Q4', alliance: 'blue', station: 'B2', team_number: 12345 }
    })
    writeFileSync(join(q4, 'AutoOpMode_log_1.rlog'), 'x')
    writeFileSync(join(q4, 'TeleOp_log_2.rlog'), 'x')

    const tree = scanTree(root)
    const year = tree.find((n) => n.name === '2026')!
    expect(year.hasSessionJson).toBe(false) // bare grouping folder
    expect(year.match).toBeNull() // grouping folder carries no match block
    const event = year.children[0]
    expect(event.displayName).toBe('APOC26')
    expect(event.sessionType).toBe('competition_event')
    const match = event.children[0]
    expect(match.displayName).toBe('Q4 Blue B2')
    expect(match.logCount).toBe(2)
    expect(match.match).toMatchObject({ alliance: 'blue', station: 'B2', team_number: 12345 })
  })

  it('returns [] for a missing root', () => {
    expect(scanTree(join(root, 'nope'))).toEqual([])
  })

  it('does not expose the .logvue app-data directory as a session', () => {
    writeSession(join(root, 'Visible'), { display_name: 'Visible' })
    mkdirSync(join(root, '.logvue'), { recursive: true })
    writeFileSync(join(root, '.logvue', 'index.sqlite'), 'internal')

    expect(scanTree(root).map((node) => node.name)).toEqual(['Visible'])
  })
})

describe('listFolderFiles', () => {
  it('lists loose files with guessed kinds, skipping plumbing', () => {
    const dir = join(root, 'Unsorted_Dump')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'AutoOpMode_log_1.rlog'), 'x')
    writeFileSync(join(dir, 'TeleOp_log_2.rlog'), 'xy')
    writeFileSync(join(dir, 'notes.md'), '# hi') // plumbing → skipped
    writeFileSync(join(dir, 'session.json'), '{}') // plumbing → skipped

    const files = listFolderFiles(dir)
    expect(files.map((f) => f.filename)).toEqual(['AutoOpMode_log_1.rlog', 'TeleOp_log_2.rlog'])
    expect(files[0]).toMatchObject({ kind: 'auto_log', sizeBytes: 1, tracked: false })
    expect(files[1]).toMatchObject({ kind: 'teleop_log', sizeBytes: 2, tracked: false })
  })

  it('marks files present in session.json as tracked and uses their curated kind', () => {
    const dir = join(root, 'Q4_Blue_B2')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'DriveTest_log_9.rlog'), 'x')
    writeFileSync(
      join(dir, 'session.json'),
      JSON.stringify({
        schema_version: 1,
        session_type: 'official_match',
        display_name: 'Q4',
        files: [{ filename: 'DriveTest_log_9.rlog', kind: 'tuning_log', source: 'control_hub' }]
      })
    )
    const files = listFolderFiles(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ kind: 'tuning_log', tracked: true })
  })

  it('returns [] for a missing folder', () => {
    expect(listFolderFiles(join(root, 'nope'))).toEqual([])
  })

  it('drops session.json entries whose files were deleted from disk', () => {
    const dir = join(root, 'Q4_Blue_B2')
    writeSession(dir, {
      session_id: 'q4',
      session_type: 'official_match',
      display_name: 'Q4',
      files: [
        { filename: 'Present_log.rlog', kind: 'auto_log', source: 'control_hub' },
        { filename: 'Deleted_log.rlog', kind: 'teleop_log', source: 'control_hub' }
      ]
    })
    writeFileSync(join(dir, 'Present_log.rlog'), 'log')

    const session = getSession(dir)

    expect(session.metadata.files.map((file) => file.filename)).toEqual(['Present_log.rlog'])
    expect(scanTree(root)[0].logCount).toBe(1)
    // Passive reconciliation must not silently rewrite user-owned sidecars.
    expect(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf-8')).files).toHaveLength(2)
  })
})

describe('createSession', () => {
  it('creates a folder-safe dir and session.json without placeholder notes', () => {
    const s = createSession({ parentPath: root, displayName: 'Q4 Blue B2', sessionType: 'official_match' })
    expect(s.name).toBe('Q4_Blue_B2')
    expect(s.metadata.display_name).toBe('Q4 Blue B2')
    expect(s.metadata.session_type).toBe('official_match')
    expect(s.hasSessionJson).toBe(true)
    const onDisk = JSON.parse(readFileSync(join(s.path, 'session.json'), 'utf-8'))
    expect(onDisk.session_id).toBeTruthy()
    expect(existsSync(join(s.path, 'notes.md'))).toBe(false)
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
    expect(existsSync(join(bare, 'notes.md'))).toBe(false)
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

describe('deleteSession', () => {
  it('summarises and recursively deletes files, notes, and child folders', () => {
    const parent = createSession({
      parentPath: root,
      displayName: 'Heading PID',
      sessionType: 'tuning_session'
    })
    writeFileSync(join(parent.path, 'heading.rlog'), 'log')
    writeFileSync(join(parent.path, 'notes.md'), '# findings')
    const child = createSession({
      parentPath: parent.path,
      displayName: 'Child',
      sessionType: 'test_session'
    })
    writeFileSync(join(child.path, 'child.rlog'), 'log')

    expect(deleteSessionSummary(root, parent.path)).toMatchObject({
      path: parent.path,
      displayName: 'Heading PID',
      fileCount: 3,
      childFolderCount: 1
    })

    const deleted = deleteSession(root, parent.path)
    expect(deleted.fileCount).toBe(3)
    expect(existsSync(parent.path)).toBe(false)
  })

  it('reports an empty session without counting session.json as user data', () => {
    const session = createSession({
      parentPath: root,
      displayName: 'Empty',
      sessionType: 'general_session'
    })
    expect(deleteSessionSummary(root, session.path)).toMatchObject({
      fileCount: 0,
      childFolderCount: 0
    })
  })

  it('refuses to delete the archive root or a folder outside it', () => {
    const outside = mkdtempSync(join(tmpdir(), 'logvue-outside-'))
    try {
      expect(() => deleteSessionSummary(root, root)).toThrow(/outside the archive root/)
      expect(() => deleteSessionSummary(root, outside)).toThrow(/outside the archive root/)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
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
