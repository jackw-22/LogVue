import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guessFileKind } from '../src/main/services/import/fileKind'
import { findDuplicates, type ImportIdentity } from '../src/main/services/import/identity'
import { importToNewSession, importToSession } from '../src/main/services/import/ImportService'
import { uniqueFilePath } from '../src/main/services/archive/paths'
import { createSession } from '../src/main/services/archive/ArchiveService'
import type { AdbClient } from '../src/main/services/adb/AdbClient'
import type { HubLogRef } from '../src/shared/types/import'

describe('guessFileKind', () => {
  it('maps op-mode keywords to log kinds', () => {
    expect(guessFileKind('AutoOpMode_log_1.rlog')).toBe('auto_log')
    expect(guessFileKind('BlueTeleOp_log_1.rlog')).toBe('teleop_log')
    expect(guessFileKind('ShooterTuning_log_1.rlog')).toBe('tuning_log')
    expect(guessFileKind('LocalizationTest_log_1.rlog')).toBe('test_log')
  })

  it('classifies non-rlog files by extension, crash wins everywhere', () => {
    expect(guessFileKind('crash_20260704.txt')).toBe('crash_log')
    expect(guessFileKind('CrashOpMode_log_1.rlog')).toBe('crash_log')
    expect(guessFileKind('match.mp4')).toBe('video')
    expect(guessFileKind('robot.PNG')).toBe('screenshot')
    expect(guessFileKind('notes.md')).toBe('notes')
    expect(guessFileKind('data.bin')).toBe('other')
  })

  it('defaults an unclassifiable rlog to match_log', () => {
    expect(guessFileKind('BlueOpMode_log_1.rlog')).toBe('match_log')
  })
})

describe('findDuplicates', () => {
  const ref: HubLogRef = {
    remotePath: '/sdcard/FIRST/PsiKit/A_log_1.rlog',
    filename: 'A_log_1.rlog',
    fileSize: 1024
  }
  const base: ImportIdentity = {
    remote_path: ref.remotePath,
    original_filename: ref.filename,
    file_size_bytes: 1024,
    filename: 'A_log_1.rlog',
    sessionPath: '/arch/Q4',
    sessionLabel: 'Q4 Blue B2'
  }

  it('matches on remote_path + name + size', () => {
    expect(findDuplicates(ref, [base])).toEqual([
      { sessionPath: '/arch/Q4', sessionLabel: 'Q4 Blue B2', filename: 'A_log_1.rlog' }
    ])
  })

  it('does not match a different remote path or size', () => {
    expect(findDuplicates(ref, [{ ...base, remote_path: '/other.rlog' }])).toEqual([])
    expect(findDuplicates(ref, [{ ...base, file_size_bytes: 2048 }])).toEqual([])
  })

  it('treats a missing size as a soft signal (find fallback)', () => {
    expect(findDuplicates({ ...ref, fileSize: null }, [base])).toHaveLength(1)
    expect(findDuplicates(ref, [{ ...base, file_size_bytes: null }])).toHaveLength(1)
  })
})

describe('uniqueFilePath', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'logvue-uf-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps the name when free, suffixes before the extension on collision', () => {
    expect(uniqueFilePath(dir, 'x.rlog')).toBe(join(dir, 'x.rlog'))
    writeFileSync(join(dir, 'x.rlog'), '1')
    expect(uniqueFilePath(dir, 'x.rlog')).toBe(join(dir, 'x_2.rlog'))
    writeFileSync(join(dir, 'x_2.rlog'), '1')
    expect(uniqueFilePath(dir, 'x.rlog')).toBe(join(dir, 'x_3.rlog'))
  })
})

/**
 * ImportService against a real archive dir but no index (root=null → getIndexStore
 * returns null), so these never touch the native better-sqlite3 binary — they stay
 * green under either ABI. adb.pull is mocked to write the destination file.
 */
describe('importToSession', () => {
  let root: string
  const adb = { pull: vi.fn(async (_r: string, dest: string) => writeFileSync(dest, 'log')) }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'logvue-imp-'))
    adb.pull.mockClear()
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const ref = (filename: string): HubLogRef => ({
    remotePath: `/sdcard/FIRST/PsiKit/${filename}`,
    filename,
    fileSize: 3
  })

  it('pulls, copies into the folder and appends to session.json', async () => {
    const session = createSession({ parentPath: root, displayName: 'Q4', sessionType: 'official_match' })
    const before = JSON.parse(readFileSync(join(session.path, 'session.json'), 'utf-8')).updated_at
    await new Promise((r) => setTimeout(r, 5))

    const res = await importToSession(adb as unknown as AdbClient, null, {
      ...ref('AutoOpMode_log_20260704_115005_104.rlog'),
      sessionPath: session.path
    })

    expect(res.status).toBe('imported')
    expect(adb.pull).toHaveBeenCalledOnce()
    expect(existsSync(join(session.path, 'AutoOpMode_log_20260704_115005_104.rlog'))).toBe(true)

    const meta = JSON.parse(readFileSync(join(session.path, 'session.json'), 'utf-8'))
    expect(meta.files).toHaveLength(1)
    expect(meta.files[0]).toMatchObject({
      filename: 'AutoOpMode_log_20260704_115005_104.rlog',
      kind: 'auto_log',
      source: 'control_hub',
      remote_path: ref('AutoOpMode_log_20260704_115005_104.rlog').remotePath,
      original_filename: 'AutoOpMode_log_20260704_115005_104.rlog',
      file_size_bytes: 3
    })
    expect(meta.updated_at >= before).toBe(true)
  })

  it('appends (never replaces) and disambiguates a colliding filename', async () => {
    const session = createSession({ parentPath: root, displayName: 'Q4', sessionType: 'official_match' })
    await importToSession(adb as unknown as AdbClient, null, { ...ref('A_log_1.rlog'), sessionPath: session.path })
    await importToSession(adb as unknown as AdbClient, null, { ...ref('A_log_1.rlog'), sessionPath: session.path })

    const meta = JSON.parse(readFileSync(join(session.path, 'session.json'), 'utf-8'))
    expect(meta.files.map((f: { filename: string }) => f.filename)).toEqual(['A_log_1.rlog', 'A_log_1_2.rlog'])
    expect(existsSync(join(session.path, 'A_log_1_2.rlog'))).toBe(true)
  })

  it('promotes a bare folder into a session on import', async () => {
    const bare = join(root, 'loose')
    mkdirSync(bare, { recursive: true })

    const res = await importToSession(adb as unknown as AdbClient, null, {
      ...ref('B_log_1.rlog'),
      sessionPath: bare
    })
    expect(res.status).toBe('imported')
    expect(existsSync(join(bare, 'session.json'))).toBe(true)
  })
})

describe('importToNewSession', () => {
  let root: string
  const adb = { pull: vi.fn(async (_r: string, dest: string) => writeFileSync(dest, 'log')) }
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'logvue-imp2-'))
    adb.pull.mockClear()
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('creates a session and imports every selected log into it', async () => {
    const res = await importToNewSession(adb as unknown as AdbClient, null, {
      parentPath: root,
      displayName: '2026-07-04 Drivebase Tuning',
      sessionType: 'tuning_session',
      logs: [
        { remotePath: '/p/DriveTest_log_1.rlog', filename: 'DriveTest_log_1.rlog', fileSize: 1 },
        { remotePath: '/p/LocalizationTest_log_1.rlog', filename: 'LocalizationTest_log_1.rlog', fileSize: 2 }
      ]
    })

    expect(res.session.metadata.session_type).toBe('tuning_session')
    expect(res.results.every((r) => r.status === 'imported')).toBe(true)
    const meta = JSON.parse(readFileSync(join(res.session.path, 'session.json'), 'utf-8'))
    expect(meta.files).toHaveLength(2)
    expect(existsSync(join(res.session.path, 'DriveTest_log_1.rlog'))).toBe(true)
  })
})
