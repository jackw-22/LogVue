import type { SessionNode } from '@shared/types/session'

/** Stable comparison key for absolute paths that may arrive with Windows slash/case variants. */
export function normalizePathKey(path: string): string {
  let normal = path.replace(/\\/g, '/')
  normal = normal.replace(/\/+$/, '')
  if (/^[a-z]:\//i.test(normal) || normal.startsWith('//')) return normal.toLowerCase()
  return normal
}

export function pathsEqual(a: string, b: string): boolean {
  return normalizePathKey(a) === normalizePathKey(b)
}

/** Depth-first search for the node at `path` in the tree served to the renderer. */
export function findNode(nodes: SessionNode[], path: string): SessionNode | null {
  for (const node of nodes) {
    if (pathsEqual(node.path, path)) return node
    const hit = findNode(node.children, path)
    if (hit) return hit
  }
  return null
}

/** Number of logs directly in this node and in every descendant session. */
export function subtreeLogCount(node: SessionNode): number {
  return node.logCount + node.children.reduce((sum, child) => sum + subtreeLogCount(child), 0)
}

/** What the dashboard shows next to a session: its display name and its parent's. */
export interface PathLabels {
  label: string
  /** Display name of the enclosing folder/session, or null at the top level. */
  parentLabel: string | null
}

/** Flatten the tree into a path → labels map, for "Group / Session" breadcrumbs. */
export function buildPathLabels(
  nodes: SessionNode[],
  parentLabel: string | null = null,
  out: Map<string, PathLabels> = new Map()
): Map<string, PathLabels> {
  for (const node of nodes) {
    out.set(normalizePathKey(node.path), { label: node.displayName, parentLabel })
    buildPathLabels(node.children, node.displayName, out)
  }
  return out
}
