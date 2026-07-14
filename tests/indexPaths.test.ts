import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { join, sep } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  canonicalPath,
  ensureIndexLocation,
  fromArchiveKey,
  indexDirectory,
  indexPath,
  toArchiveKey
} from '../src/main/services/index/indexPaths'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'logvue-index-path-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('ensureIndexLocation', () => {
  it('creates .logvue for a new archive', () => {
    expect(ensureIndexLocation(root)).toBe(join(root, '.logvue', 'index.sqlite'))
    expect(existsSync(indexDirectory(root))).toBe(true)
  })

  it('migrates the legacy database and all SQLite sidecars', () => {
    const legacy = join(root, 'index.sqlite')
    const files = ['', '-wal', '-shm', '-journal']
    for (const suffix of files) writeFileSync(`${legacy}${suffix}`, `legacy${suffix}`)

    const current = ensureIndexLocation(root)

    expect(current).toBe(indexPath(root))
    for (const suffix of files) {
      expect(existsSync(`${legacy}${suffix}`)).toBe(false)
      expect(readFileSync(`${current}${suffix}`, 'utf-8')).toBe(`legacy${suffix}`)
    }
  })

  it('keeps an existing .logvue database authoritative', () => {
    mkdirSync(indexDirectory(root), { recursive: true })
    writeFileSync(indexPath(root), 'current')
    const legacy = join(root, 'index.sqlite')
    writeFileSync(legacy, 'legacy')

    expect(ensureIndexLocation(root)).toBe(indexPath(root))
    expect(readFileSync(indexPath(root), 'utf-8')).toBe('current')
    expect(readFileSync(legacy, 'utf-8')).toBe('legacy')
  })
})

describe('archive keys', () => {
  it('round-trips a nested session path as a /-separated relative key', () => {
    const abs = join(root, '2026', 'APOC26', 'Q4_Blue_B2')
    const key = toArchiveKey(root, abs)
    expect(key).toBe('2026/APOC26/Q4_Blue_B2')
    expect(fromArchiveKey(root, key)).toBe(abs)
  })

  it('uses / separators regardless of the platform separator', () => {
    const key = toArchiveKey(root, join(root, 'a', 'b'))
    expect(key).toBe('a/b')
    expect(key.includes(sep === '/' ? '\\' : sep)).toBe(false)
  })

  it('rejects the root itself and paths outside the root', () => {
    expect(() => toArchiveKey(root, root)).toThrow(/not inside the archive root/)
    expect(() => toArchiveKey(root, join(root, '..', 'elsewhere'))).toThrow(
      /not inside the archive root/
    )
  })
})

describe('canonicalPath', () => {
  it('resolves symlinks so aliased spellings collapse to one identity', () => {
    const real = join(root, 'RealArchive')
    mkdirSync(real, { recursive: true })
    const link = join(root, 'LinkedArchive')
    symlinkSync(real, link, 'dir')
    expect(canonicalPath(link)).toBe(canonicalPath(real))
  })

  it('falls back to plain resolution for paths that do not exist', () => {
    const missing = join(root, 'nope')
    expect(canonicalPath(missing)).toBe(missing)
  })
})
