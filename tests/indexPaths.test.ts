import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureIndexLocation,
  indexDirectory,
  indexPath
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
