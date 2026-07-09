import type { SessionNode } from '@shared/types/session'
import { formatLogCount } from '@shared/format/match'
import { useArchiveTree } from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { allianceClass } from '../lib/alliance'

function RootRow(): JSX.Element {
  const selectedPath = useAppStore((s) => s.selectedPath)
  const select = useAppStore((s) => s.select)

  return (
    <div
      className={`tree-root${selectedPath === null ? ' selected' : ''}`}
      onClick={() => select(null)}
      title="Show all sessions and logs"
    >
      <span className="tree-root-icon">⌂</span>
      <span className="tree-name">Library</span>
      <span className="chip count">all</span>
    </div>
  )
}

function TreeRow({ node, depth }: { node: SessionNode; depth: number }): JSX.Element {
  const selectedPath = useAppStore((s) => s.selectedPath)
  const select = useAppStore((s) => s.select)
  const shade = useAppStore((s) => s.shade)

  const isFolder = !node.hasSessionJson
  const colour = allianceClass(node.match?.alliance ?? null)
  const tint = shade === 'tint' && !isFolder ? ` tint-${colour}` : ''

  return (
    <>
      <div
        className={`tree-row${selectedPath === node.path ? ' selected' : ''}${tint}`}
        style={{ '--tree-depth': depth } as React.CSSProperties}
        onClick={() => select(node.path)}
        title={node.path}
      >
        <span className="tree-indent" aria-hidden="true" />
        <span className={`stripe ${isFolder ? 'none' : colour}`} />
        <span className={`tree-name${isFolder ? ' folder' : ''}`}>{node.displayName}</span>
        {(node.hasSessionJson || node.logCount > 0) && (
          <span className="chip count">{formatLogCount(node.logCount)}</span>
        )}
      </div>
      {node.children.map((child) => (
        <TreeRow key={child.path} node={child} depth={depth + 1} />
      ))}
    </>
  )
}

export default function SessionTree(): JSX.Element {
  const { data: tree, isLoading } = useArchiveTree(true)

  if (isLoading) return <div className="tree-empty">Scanning…</div>
  if (!tree || tree.length === 0)
    return <div className="tree-empty">No folders yet. Create a session to begin.</div>

  return (
    <div className="tree">
      <RootRow />
      {tree.map((node) => (
        <TreeRow key={node.path} node={node} depth={0} />
      ))}
    </div>
  )
}
