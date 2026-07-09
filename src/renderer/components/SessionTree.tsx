import { useEffect, useMemo, useState } from 'react'
import type { SessionNode } from '@shared/types/session'
import { formatLogCount } from '@shared/format/match'
import { formatBytes } from '@shared/format/bytes'
import { useArchiveTree, useLibrarySize } from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { allianceClass } from '../lib/alliance'
import { normalizePathKey, pathsEqual } from '../lib/tree'

function totalLogCount(nodes: SessionNode[]): number {
  return nodes.reduce((sum, node) => sum + node.logCount + totalLogCount(node.children), 0)
}

function containsPath(node: SessionNode, path: string | null): boolean {
  if (!path) return false
  if (pathsEqual(node.path, path)) return true
  return node.children.some((child) => containsPath(child, path))
}

function RootRow({ logCount }: { logCount: number }): JSX.Element {
  const selectedPath = useAppStore((s) => s.selectedPath)
  const select = useAppStore((s) => s.select)
  const { data: sizeBytes } = useLibrarySize()

  return (
    <div
      className={`tree-root${selectedPath === null ? ' selected' : ''}`}
      onClick={() => select(null)}
      title="Show all sessions and logs"
    >
      <span className="tree-root-icon">⌂</span>
      <span className="tree-name">Library</span>
      {sizeBytes != null && sizeBytes > 0 && (
        <span className="chip count" title="Total size of indexed files">
          {formatBytes(sizeBytes)}
        </span>
      )}
      <span className="chip count">{formatLogCount(logCount)}</span>
    </div>
  )
}

function TreeRow({
  node,
  depth,
  collapsed,
  toggle
}: {
  node: SessionNode
  depth: number
  collapsed: Set<string>
  toggle: (node: SessionNode) => void
}): JSX.Element {
  const selectedPath = useAppStore((s) => s.selectedPath)
  const select = useAppStore((s) => s.select)
  const shade = useAppStore((s) => s.shade)

  const isFolder = !node.hasSessionJson
  const colour = allianceClass(node.match?.alliance ?? null)
  const tint = shade === 'tint' && !isFolder ? ` tint-${colour}` : ''
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(normalizePathKey(node.path)) && !containsPath(node, selectedPath)

  return (
    <>
      <div
        className={`tree-row${selectedPath && pathsEqual(selectedPath, node.path) ? ' selected' : ''}${tint}`}
        style={{ '--tree-depth': depth } as React.CSSProperties}
        onClick={() => select(node.path)}
        title={node.path}
      >
        <span className="tree-indent" aria-hidden="true" />
        <button
          type="button"
          className={`tree-toggle${!hasChildren ? ' empty' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) toggle(node)
          }}
          aria-label={hasChildren ? `${isCollapsed ? 'Expand' : 'Collapse'} ${node.displayName}` : undefined}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (isCollapsed ? '▸' : '▾') : ''}
        </button>
        <span className={`stripe ${isFolder ? 'none' : colour}`} />
        <span className={`tree-name${isFolder ? ' folder' : ''}`}>{node.displayName}</span>
        {(node.hasSessionJson || node.logCount > 0) && (
          <span
            className={`chip count${isFolder ? ' bare' : ''}`}
            title={isFolder ? 'Folder is not recognised as a session' : undefined}
          >
            {isFolder && <span className="chip-warning">⚠️</span>}
            {formatLogCount(node.logCount)}
          </span>
        )}
      </div>
      {!isCollapsed &&
        node.children.map((child) => (
          <TreeRow key={child.path} node={child} depth={depth + 1} collapsed={collapsed} toggle={toggle} />
        ))}
    </>
  )
}

export default function SessionTree(): JSX.Element {
  const { data: tree, isLoading } = useArchiveTree(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const logCount = useMemo(() => totalLogCount(tree ?? []), [tree])

  useEffect(() => {
    if (!tree) return
    const live = new Set<string>()
    const collect = (nodes: SessionNode[]) => {
      for (const node of nodes) {
        live.add(normalizePathKey(node.path))
        collect(node.children)
      }
    }
    collect(tree)
    setCollapsed((prev) => new Set([...prev].filter((path) => live.has(path))))
  }, [tree])

  function toggle(node: SessionNode) {
    const key = normalizePathKey(node.path)
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (isLoading) return <div className="tree-empty">Scanning…</div>
  if (!tree || tree.length === 0)
    return <div className="tree-empty">No folders yet. Create a session to begin.</div>

  return (
    <div className="tree">
      <RootRow logCount={logCount} />
      {tree.map((node) => (
        <TreeRow key={node.path} node={node} depth={0} collapsed={collapsed} toggle={toggle} />
      ))}
    </div>
  )
}
