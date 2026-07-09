import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSession, scanTree } from '../src/main/services/archive/ArchiveService'
import {
  SELECTABLE_SESSION_TYPES,
  SESSION_TYPES,
  SESSION_TYPE_LABELS,
  toSelectableSessionType
} from '../src/shared/constants/sessionTypes'

describe('grouping sessions', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'logvue-grouping-'))
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('uses general_session for grouping folders', () => {
    const year = createSession({ parentPath: root, displayName: '2026', sessionType: 'general_session' })
    const event = createSession({
      parentPath: year.path,
      displayName: 'APOC26',
      sessionType: 'competition_event'
    })

    const tree = scanTree(root)
    expect(tree[0]).toMatchObject({
      displayName: '2026',
      sessionType: 'general_session',
      hasSessionJson: true
    })
    expect(tree[0].children[0]).toMatchObject({
      path: event.path,
      sessionType: 'competition_event'
    })
  })

  it('keeps legacy session types readable but trims the creation picker', () => {
    expect(SESSION_TYPES).not.toContain('container')
    expect(SESSION_TYPES).toEqual(
      expect.arrayContaining(['workshop_session', 'tuning_session', 'debug_session', 'test_session', 'replay'])
    )
    expect(SELECTABLE_SESSION_TYPES).toEqual([
      'general_session',
      'competition_event',
      'official_match',
      'practice_match'
    ])
    expect(SESSION_TYPE_LABELS.general_session).toBe('General')
    expect(SESSION_TYPE_LABELS.tuning_session).toBe('General')
    expect(SESSION_TYPE_LABELS.replay).toBe('Match')
    expect(toSelectableSessionType('debug_session')).toBe('general_session')
    expect(toSelectableSessionType('replay')).toBe('official_match')
  })
})
