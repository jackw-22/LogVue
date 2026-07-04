import type { SessionNode } from '@shared/types/session'
import { useArchiveTree } from '../api/hooks'
import { useAppStore } from '../stores/appStore'

function logBadge(node: SessionNode): string | null {
  if (node.logCount === 0) return node.hasSessionJson ? 'no logs' : null
  return node.logCount === 1 ? '1 log' : `${node.logCount} logs`
}

function TreeRow({ node, depth }: { node: SessionNode; depth: number }): JSX.Element {
  const selectedPath = useAppStore((s) => s.selectedPath)
  const select = useAppStore((s) => s.select)
  const badge = logBadge(node)

  return (
    <>
      <div
        className={`tree-row${selectedPath === node.path ? ' selected' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => select(node.path)}
        title={node.path}
      >
        <span className="tree-name">{node.displayName}</span>
        {!node.hasSessionJson && <span className="chip bare">unrecognised</span>}
        {badge && <span className="chip count">{badge}</span>}
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
      {tree.map((node) => (
        <TreeRow key={node.path} node={node} depth={0} />
      ))}
    </div>
  )
}
