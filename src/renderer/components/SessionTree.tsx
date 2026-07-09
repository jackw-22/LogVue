import type { SessionNode } from '@shared/types/session'
import { formatLogCount } from '@shared/format/match'
import { useArchiveTree } from '../api/hooks'
import { useAppStore } from '../stores/appStore'
import { allianceClass } from '../lib/alliance'

/**
 * Top-level folders render as group headers (still selectable — they're often real
 * sessions like a competition event); everything beneath renders as stripe rows,
 * coloured by alliance, with a log-count chip.
 */
function GroupHeader({ node }: { node: SessionNode }): JSX.Element {
  const selectedPath = useAppStore((s) => s.selectedPath)
  const select = useAppStore((s) => s.select)
  return (
    <div
      className={`tree-group${selectedPath === node.path ? ' selected' : ''}`}
      onClick={() => select(node.path)}
      title={node.path}
    >
      {node.displayName}
      {node.sessionType === 'container' && <span className="chip folder">folder</span>}
    </div>
  )
}

function TreeRow({ node, depth }: { node: SessionNode; depth: number }): JSX.Element {
  const selectedPath = useAppStore((s) => s.selectedPath)
  const select = useAppStore((s) => s.select)
  const shade = useAppStore((s) => s.shade)

  const isContainer = node.sessionType === 'container'
  const isFolder = !node.hasSessionJson || isContainer
  const colour = allianceClass(node.match?.alliance ?? null)
  const tint = shade === 'tint' && !isFolder ? ` tint-${colour}` : ''

  return (
    <>
      <div
        className={`tree-row${selectedPath === node.path ? ' selected' : ''}${tint}`}
        style={{ paddingLeft: 10 + (depth - 1) * 14 }}
        onClick={() => select(node.path)}
        title={node.path}
      >
        <span className={`stripe ${isFolder ? 'none' : colour}`} />
        <span className={`tree-name${isFolder ? ' folder' : ''}`}>{node.displayName}</span>
        {isContainer && <span className="chip folder">folder</span>}
        {!isContainer && (node.hasSessionJson || node.logCount > 0) && (
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
      {tree.map((node) => (
        <div key={node.path} className="tree-section">
          <GroupHeader node={node} />
          {node.children.map((child) => (
            <TreeRow key={child.path} node={child} depth={1} />
          ))}
        </div>
      ))}
    </div>
  )
}
