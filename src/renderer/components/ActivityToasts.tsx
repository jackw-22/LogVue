import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatBytes } from '@shared/format/bytes'
import type { Task, TaskItem } from '@shared/types/tasks'
import { api } from '../api/client'
import { useAppStore } from '../stores/appStore'
import { aggregateFraction, autoDismissAt, taskFraction, useTaskStore } from '../stores/taskStore'

/**
 * The activity toast stack: one card per background operation, bottom-right, each
 * appearing and clearing on its own. Collapses to a pill with an aggregate ring.
 *
 * Cards are pure functions of the {@link Task} snapshots main pushes — this component
 * owns no progress state, only what's local to the UI (collapse, which file lists are
 * open, and the auto-dismiss countdown).
 */
export default function ActivityToasts(): JSX.Element | null {
  const tasks = useTaskStore((s) => s.tasks)
  const collapsed = useTaskStore((s) => s.collapsed)
  const expanded = useTaskStore((s) => s.expanded)
  const hydrate = useTaskStore((s) => s.hydrate)
  const upsert = useTaskStore((s) => s.upsert)
  const dismiss = useTaskStore((s) => s.dismiss)
  const toggleCollapsed = useTaskStore((s) => s.toggleCollapsed)

  // Replay whatever is already in flight (a reload mid-import), then follow the stream.
  useEffect(() => {
    void api.tasks.list().then(hydrate)
    return window.api.onTaskUpdate(upsert)
  }, [hydrate, upsert])

  useAutoDismiss(tasks, expanded, dismiss)
  useRefreshOnFinish(tasks)

  if (tasks.length === 0) return null

  if (collapsed) {
    return <CollapsedPill tasks={tasks} onExpand={toggleCollapsed} />
  }

  return (
    <div className="toasts" role="status" aria-live="polite">
      <div className="toasts-head">
        <span className="toasts-title">Activity</span>
        <button className="toasts-collapse" onClick={toggleCollapsed}>
          Collapse ▾
        </button>
      </div>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  )
}

function CollapsedPill({ tasks, onExpand }: { tasks: Task[]; onExpand: () => void }): JSX.Element {
  const running = tasks.filter((t) => t.status === 'running')
  const failed = tasks.some((t) => t.status === 'error' || t.items.some((i) => i.status === 'failed'))
  const pct = Math.round(aggregateFraction(tasks) * 100)

  const ringColor = running.length > 0 ? 'var(--accent)' : failed ? 'var(--red)' : 'var(--good)'
  const text =
    running.length === 1
      ? running[0].title
      : running.length > 1
        ? `${running.length} tasks running`
        : failed
          ? 'Finished with errors'
          : 'All done'
  const sub =
    running.length > 0 ? `${running.length} task${running.length > 1 ? 's' : ''} · ${pct}%` : ''

  return (
    <button className="toast-pill" onClick={onExpand}>
      <span
        className="ring ring-sm"
        style={{
          background: `conic-gradient(${ringColor} 0 ${pct}%, var(--border) ${pct}% 100%)`
        }}
      >
        <span className="ring-hole" />
      </span>
      <span className="toast-pill-text">{text}</span>
      {sub && <span className="toast-pill-sub">{sub}</span>}
      <span className="toast-pill-caret">▴</span>
    </button>
  )
}

function TaskCard({ task }: { task: Task }): JSX.Element {
  const expanded = useTaskStore((s) => s.expanded[task.id] ?? false)
  const toggleExpanded = useTaskStore((s) => s.toggleExpanded)
  const dismiss = useTaskStore((s) => s.dismiss)
  const openSession = useAppStore((s) => s.openSession)

  const running = task.status === 'running'
  const failedCount = task.items.filter((i) => i.status === 'failed').length
  const hasItems = task.items.length > 0

  return (
    <div className={`toast toast-${task.status}`}>
      <div className="toast-row">
        {running ? (
          <span className={`spinner spinner-${task.kind}`} />
        ) : (
          <span className={`toast-icon toast-icon-${task.status}`}>
            {task.status === 'success' ? '✓' : '✕'}
          </span>
        )}

        <div className="toast-body">
          <div className="toast-title-row">
            <span className="toast-title">{task.title}</span>
            {task.badge && <span className="toast-badge">{task.badge}</span>}
          </div>
          <div className="toast-sub">
            {task.status === 'error' ? (
              <span className="toast-fail">{task.error}</span>
            ) : task.status === 'success' ? (
              <Summary summary={task.summary} />
            ) : (
              task.subtitle
            )}
          </div>
        </div>

        {running && task.determinate && task.total > 0 && (
          <span className="toast-count mono">
            {task.done} / {task.total}
          </span>
        )}
        {hasItems && (
          <button
            className="toast-caret"
            onClick={() => toggleExpanded(task.id)}
            aria-label={expanded ? 'Hide files' : 'Show files'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        )}
        {!running && !hasItems && (
          <button className="toast-caret" onClick={() => dismiss(task.id)} aria-label="Dismiss">
            ✕
          </button>
        )}
      </div>

      {running && <ProgressBar task={task} />}
      {running && task.bytesPerSec !== null && task.bytesTotal > 0 && (
        <div className="toast-meta mono">
          <span>{formatBytes(task.bytesPerSec)}/s</span>
          {task.etaSeconds !== null && <span>~{formatEta(task.etaSeconds)} left</span>}
        </div>
      )}
      {expanded && hasItems && (
        <ul className="toast-files">
          {task.items.map((item) => (
            <FileRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {!running && (
        <TaskFooter
          task={task}
          failedCount={failedCount}
          onOpen={task.targetPath ? () => openSession(task.targetPath as string) : null}
          onDismiss={() => dismiss(task.id)}
        />
      )}
    </div>
  )
}

function ProgressBar({ task }: { task: Task }): JSX.Element {
  if (!task.determinate) {
    return (
      <div className="bar">
        <div className={`bar-shimmer bar-shimmer-${task.kind}`} />
      </div>
    )
  }
  return (
    <div className="bar">
      <div
        className={`bar-fill bar-fill-${task.kind}`}
        style={{ width: `${Math.round(taskFraction(task) * 100)}%` }}
      />
    </div>
  )
}

/** Renders `11 imported · 1 failed`, reddening only the failure clause. */
function Summary({ summary }: { summary: string | null }): JSX.Element | null {
  if (!summary) return null
  const parts = summary.split(' · ')
  return (
    <>
      {parts.map((part, i) => (
        <span key={part}>
          {i > 0 && ' · '}
          <span className={/failed/.test(part) ? 'toast-fail' : undefined}>{part}</span>
        </span>
      ))}
    </>
  )
}

const ITEM_GLYPH: Record<TaskItem['status'], string> = {
  queued: '○',
  active: '⟳',
  done: '✓',
  failed: '✕',
  duplicate: '≡'
}

function FileRow({ item }: { item: TaskItem }): JSX.Element {
  const [retrying, setRetrying] = useState(false)

  async function retry(): Promise<void> {
    if (!item.retry) return
    setRetrying(true)
    const { sessionPath, remotePath, filename, fileSize, recordedAt } = item.retry
    try {
      // A retry is its own forced batch-of-one, so it gets its own toast to watch.
      await api.import.batchToSession({
        sessionPath,
        logs: [{ remotePath, filename, fileSize, recordedAt }],
        force: true
      })
    } finally {
      setRetrying(false)
    }
  }

  return (
    <li className={`toast-file toast-file-${item.status}`}>
      <span className="toast-file-glyph">{ITEM_GLYPH[item.status]}</span>
      <span className="toast-file-name mono">{item.label}</span>
      {item.detail && <span className="toast-file-meta mono">{item.detail}</span>}
      {item.retry && (
        <button className="toast-retry" onClick={retry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </li>
  )
}

function TaskFooter({
  task,
  failedCount,
  onOpen,
  onDismiss
}: {
  task: Task
  failedCount: number
  onOpen: (() => void) | null
  onDismiss: () => void
}): JSX.Element | null {
  const expanded = useTaskStore((s) => s.expanded[task.id] ?? false)
  const countdown = useCountdown(task, expanded)

  if (!onOpen && countdown === null && failedCount === 0) return null

  return (
    <div className="toast-footer">
      {onOpen && (
        <button className="toast-link" onClick={onOpen}>
          {task.kind === 'ftcscout' ? 'View event →' : 'View session →'}
        </button>
      )}
      <span className="toast-spacer" />
      {countdown !== null ? (
        <span className="toast-dismiss-note">Auto-dismiss in {countdown}s</span>
      ) : (
        <button className="toast-link muted" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}

/** Seconds until this card clears itself, or null when it's staying put. */
function useCountdown(task: Task, expanded: boolean): number | null {
  const at = autoDismissAt(task)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (at === null || expanded) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [at, expanded])

  if (at === null || expanded) return null
  return Math.max(0, Math.ceil((at - now) / 1000))
}

/**
 * Clean successes clear themselves. Opening a card's file list cancels that — the
 * user is reading it, and a toast that vanishes mid-read is worse than one that stays.
 */
function useAutoDismiss(
  tasks: Task[],
  expanded: Record<string, boolean>,
  dismiss: (id: string) => void
): void {
  // Keyed by id+deadline, not by the task array: a snapshot from some *other* still-
  // running task must not restart this card's countdown.
  const key = tasks
    .filter((t) => !expanded[t.id] && autoDismissAt(t) !== null)
    .map((t) => `${t.id}@${autoDismissAt(t)}`)
    .join('|')

  useEffect(() => {
    if (!key) return
    const timers = key.split('|').map((entry) => {
      const [id, at] = entry.split('@')
      return setTimeout(() => dismiss(id), Math.max(0, Number(at) - Date.now()))
    })
    return () => timers.forEach(clearTimeout)
  }, [key, dismiss])
}

/**
 * A finished task means the archive moved underneath the cached queries. The watcher
 * covers file writes, but a duplicate-only import or an FTCScout no-op writes nothing,
 * so refresh once per task as it settles.
 */
function useRefreshOnFinish(tasks: Task[]): void {
  const qc = useQueryClient()
  const seen = useRef(new Set<string>())

  useEffect(() => {
    for (const task of tasks) {
      if (task.status === 'running' || seen.current.has(task.id)) continue
      seen.current.add(task.id)
      qc.invalidateQueries({ queryKey: ['archive'] })
      qc.invalidateQueries({ queryKey: ['index'] })
      qc.invalidateQueries({ queryKey: ['adb', 'hubLogs'] })
    }
  }, [tasks, qc])
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}
