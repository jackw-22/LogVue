import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatBytes } from '@shared/format/bytes'
import type { Task, TaskItem } from '@shared/types/tasks'
import { api } from '../api/client'
import { useAppStore } from '../stores/appStore'
import { AUTO_DISMISS_MS, autoDismissAt, taskFraction, useTaskStore } from '../stores/taskStore'

/**
 * The activity toast stack: one card per background operation, bottom-right, each
 * appearing and clearing on its own.
 *
 * Cards are pure functions of the {@link Task} snapshots main pushes — this component
 * owns no progress state, only which file lists are open and the auto-dismiss countdown.
 */
export default function ActivityToasts(): JSX.Element | null {
  const tasks = useTaskStore((s) => s.tasks)
  const expanded = useTaskStore((s) => s.expanded)
  const hydrate = useTaskStore((s) => s.hydrate)
  const upsert = useTaskStore((s) => s.upsert)
  const dismiss = useTaskStore((s) => s.dismiss)

  // Replay whatever is already in flight (a reload mid-import), then follow the stream.
  useEffect(() => {
    void api.tasks.list().then(hydrate)
    return window.api.onTaskUpdate(upsert)
  }, [hydrate, upsert])

  useAutoDismiss(tasks, expanded, dismiss)
  useRefreshOnFinish(tasks)

  if (tasks.length === 0) return null

  return (
    <div className="toasts" role="status" aria-live="polite">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  )
}

function TaskCard({ task }: { task: Task }): JSX.Element {
  const expanded = useTaskStore((s) => s.expanded[task.id] ?? false)
  const toggleExpanded = useTaskStore((s) => s.toggleExpanded)
  const dismiss = useTaskStore((s) => s.dismiss)
  const openSession = useAppStore((s) => s.openSession)

  const running = task.status === 'running'
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
        {!running && (
          <TaskCloseButton task={task} expanded={expanded} onDismiss={() => dismiss(task.id)} />
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
          onOpen={task.targetPath ? () => openSession(task.targetPath as string) : null}
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
  onOpen
}: {
  task: Task
  onOpen: (() => void) | null
}): JSX.Element | null {
  if (!onOpen) return null

  return (
    <div className="toast-footer">
      <button className="toast-link" onClick={onOpen}>
        {task.kind === 'ftcscout' ? 'View event →' : 'View session →'}
      </button>
    </div>
  )
}

function TaskCloseButton({
  task,
  expanded,
  onDismiss
}: {
  task: Task
  expanded: boolean
  onDismiss: () => void
}): JSX.Element {
  const progress = useAutoDismissProgress(task, expanded)
  const circumference = 44

  return (
    <button className="toast-close" onClick={onDismiss} aria-label="Dismiss">
      {progress !== null && (
        <svg className="toast-close-ring" viewBox="0 0 18 18" aria-hidden="true">
          <circle className="toast-close-track" cx="9" cy="9" r="7" />
          <circle
            className="toast-close-progress"
            cx="9"
            cy="9"
            r="7"
            pathLength={circumference}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
      )}
      <span aria-hidden="true">✕</span>
    </button>
  )
}

/** Remaining auto-dismiss progress, from 1 to 0, or null when it is paused/disabled. */
function useAutoDismissProgress(task: Task, expanded: boolean): number | null {
  const at = autoDismissAt(task)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (at === null || expanded) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [at, expanded])

  if (at === null || expanded) return null
  return Math.min(1, Math.max(0, (at - now) / AUTO_DISMISS_MS))
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
