import { describe, expect, it } from 'vitest'
import { shouldIgnoreArchivePath } from '../src/main/services/watcher/Watcher'

describe('archive watcher path filters', () => {
  it('ignores sqlite index files and transient editor files', () => {
    expect(shouldIgnoreArchivePath('/archive/index.sqlite')).toBe(true)
    expect(shouldIgnoreArchivePath('/archive/index.sqlite-wal')).toBe(true)
    expect(shouldIgnoreArchivePath('/archive/index.sqlite-shm')).toBe(true)
    expect(shouldIgnoreArchivePath('/archive/session.json.tmp')).toBe(true)
    expect(shouldIgnoreArchivePath('/archive/notes.md~')).toBe(true)
  })

  it('keeps session and content files visible to the watcher', () => {
    expect(shouldIgnoreArchivePath('/archive/APOC/session.json')).toBe(false)
    expect(shouldIgnoreArchivePath('/archive/APOC/notes.md')).toBe(false)
    expect(shouldIgnoreArchivePath('/archive/APOC/Q4/Auto_log_1.rlog')).toBe(false)
  })
})
