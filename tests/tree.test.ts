import { describe, expect, it } from 'vitest'
import type { SessionNode } from '../src/shared/types/session'
import {
  buildPathLabels,
  findNode,
  normalizePathKey,
  pathsEqual,
  subtreeLogCount
} from '../src/renderer/lib/tree'

function node(path: string, children: SessionNode[] = []): SessionNode {
  return {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    displayName: path.split(/[\\/]/).pop() ?? path,
    sessionType: 'official_match',
    hasSessionJson: true,
    fileCount: 0,
    logCount: 0,
    tags: [],
    sortKey: null,
    match: null,
    children
  }
}

describe('renderer tree path helpers', () => {
  it('matches Windows paths across slash and case variants', () => {
    const canonical = 'C:\\Users\\Example\\LogVue\\Event\\Q4'
    const variant = 'c:/users/example/logvue/event/q4'

    expect(normalizePathKey(canonical)).toBe('c:/users/example/logvue/event/q4')
    expect(pathsEqual(canonical, variant)).toBe(true)
  })

  it('finds the canonical tree node for a variant path', () => {
    const q4 = node('C:\\Users\\Example\\LogVue\\Event\\Q4')
    const tree = [node('C:\\Users\\Example\\LogVue\\Event', [q4])]

    expect(findNode(tree, 'c:/users/example/logvue/event/q4')).toBe(q4)
  })

  it('keys breadcrumb labels by normalized path', () => {
    const tree = [node('C:\\Users\\Example\\LogVue\\Event', [node('C:\\Users\\Example\\LogVue\\Event\\Q4')])]
    const labels = buildPathLabels(tree)

    expect(labels.get('c:/users/example/logvue/event/q4')?.parentLabel).toBe('Event')
  })

  it('includes descendant sessions in a tree node log count', () => {
    const event = node('/library/Event', [node('/library/Event/Q1'), node('/library/Event/Q2')])
    event.logCount = 1
    event.children[0].logCount = 2
    event.children[1].logCount = 3

    expect(subtreeLogCount(event)).toBe(6)
  })
})
