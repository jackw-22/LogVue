import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanTree } from '../src/main/services/archive/ArchiveService'
import {
  CONTAINER_TYPE,
  SELECTABLE_SESSION_TYPES,
  SESSION_TYPES,
  SESSION_TYPE_LABELS,
  isContainerType
} from '../src/shared/constants/sessionTypes'

describe('container session type', () => {
  it('is a valid session type with a label but is not selectable', () => {
    expect(SESSION_TYPES).toContain(CONTAINER_TYPE)
    expect(SESSION_TYPE_LABELS[CONTAINER_TYPE]).toBe('Folder')
    expect(SELECTABLE_SESSION_TYPES).not.toContain(CONTAINER_TYPE)
    // Everything else remains selectable.
    expect(SELECTABLE_SESSION_TYPES).toContain('official_match')
    expect(SELECTABLE_SESSION_TYPES.length).toBe(SESSION_TYPES.length - 1)
  })

  it('isContainerType recognises the sentinel', () => {
    expect(isContainerType('container')).toBe(true)
    expect(isContainerType('general_session')).toBe(false)
  })
})

describe('scanTree with containers', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'logvue-container-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('surfaces an explicit container type and keeps children', () => {
    const box = join(root, '2026')
    mkdirSync(box, { recursive: true })
    writeFileSync(
      join(box, 'session.json'),
      JSON.stringify({ schema_version: 1, session_type: 'container', display_name: '2026' })
    )
    const child = join(box, 'APOC26')
    mkdirSync(child, { recursive: true })
    writeFileSync(
      join(child, 'session.json'),
      JSON.stringify({ schema_version: 1, session_type: 'competition_event', display_name: 'APOC26' })
    )

    const tree = scanTree(root)
    const container = tree.find((n) => n.name === '2026')!
    expect(container.hasSessionJson).toBe(true)
    expect(container.sessionType).toBe('container')
    expect(container.children[0].sessionType).toBe('competition_event')
  })
})
