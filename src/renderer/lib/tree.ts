import type { SessionNode } from '@shared/types/session'

/** Depth-first search for the node at `path` in the tree served to the renderer. */
export function findNode(nodes: SessionNode[], path: string): SessionNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    const hit = findNode(node.children, path)
    if (hit) return hit
  }
  return null
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
    out.set(node.path, { label: node.displayName, parentLabel })
    buildPathLabels(node.children, node.displayName, out)
  }
  return out
}
