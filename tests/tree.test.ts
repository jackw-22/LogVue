import { describe, expect, it } from 'vitest'
import type { SessionNode } from '../src/shared/types/session'
import { buildPathLabels, findNode, normalizePathKey, pathsEqual } from '../src/renderer/lib/tree'

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
    const canonical = 'C:\\Users\\Jack\\LogVue\\Event\\Q4'
    const variant = 'c:/users/jack/logvue/event/q4'

    expect(normalizePathKey(canonical)).toBe('c:/users/jack/logvue/event/q4')
    expect(pathsEqual(canonical, variant)).toBe(true)
  })

  it('finds the canonical tree node for a variant path', () => {
    const q4 = node('C:\\Users\\Jack\\LogVue\\Event\\Q4')
    const tree = [node('C:\\Users\\Jack\\LogVue\\Event', [q4])]

    expect(findNode(tree, 'c:/users/jack/logvue/event/q4')).toBe(q4)
  })

  it('keys breadcrumb labels by normalized path', () => {
    const tree = [node('C:\\Users\\Jack\\LogVue\\Event', [node('C:\\Users\\Jack\\LogVue\\Event\\Q4')])]
    const labels = buildPathLabels(tree)

    expect(labels.get('c:/users/jack/logvue/event/q4')?.parentLabel).toBe('Event')
  })
})
