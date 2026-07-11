import { create } from 'zustand'
import type { Task } from '@shared/types/tasks'
import { isCleanSuccess } from '@shared/types/tasks'

/**
 * Mirror of main's task registry (see main/services/tasks/TaskService.ts), plus the
 * bits of state that only the toast stack cares about: whether the stack is collapsed
 * to its pill, which cards have their file list open, and what the user has dismissed.
 *
 * Main pushes whole snapshots, so `upsert` is a straight replace-by-id.
 */

/** A cleanly-finished task clears itself; anything with a failure waits for the user. */
export const AUTO_DISMISS_MS = 4000

interface TaskState {
  tasks: Task[]
  collapsed: boolean
  expanded: Record<string, boolean>

  hydrate: (tasks: Task[]) => void
  upsert: (task: Task) => void
  dismiss: (id: string) => void
  clearFinished: () => void
  toggleCollapsed: () => void
  toggleExpanded: (id: string) => void
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  collapsed: false,
  expanded: {},

  hydrate: (tasks) => set({ tasks: [...tasks].sort((a, b) => a.startedAt - b.startedAt) }),

  upsert: (task) =>
    set((s) => {
      const i = s.tasks.findIndex((t) => t.id === task.id)
      if (i === -1) return { tasks: [...s.tasks, task] }
      const tasks = [...s.tasks]
      tasks[i] = task
      return { tasks }
    }),

  dismiss: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      expanded: { ...s.expanded, [id]: false }
    })),

  clearFinished: () => set((s) => ({ tasks: s.tasks.filter((t) => t.status === 'running') })),

  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),

  toggleExpanded: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } }))
}))

/**
 * How far along a task is, 0–1. Prefers bytes; falls back to settled items.
 * A finished task is complete whether or not we could measure it on the way —
 * status is checked before `determinate`, or a done rebuild would read as 0%.
 */
export function taskFraction(task: Task): number {
  if (task.status !== 'running') return 1
  if (!task.determinate) return 0
  if (task.bytesTotal > 0) return clamp(task.bytesDone / task.bytesTotal)
  if (task.total > 0) return clamp(task.done / task.total)
  return 0
}

/**
 * The pill's ring. A *running* indeterminate task contributes nothing measurable, so
 * it's left out; once finished it counts, otherwise a stack holding only a completed
 * rebuild would draw an empty ring beside "All done".
 */
export function aggregateFraction(tasks: Task[]): number {
  const measurable = tasks.filter((t) => t.determinate || t.status !== 'running')
  if (measurable.length === 0) return 0
  const sum = measurable.reduce((acc, t) => acc + taskFraction(t), 0)
  return clamp(sum / measurable.length)
}

/** Tasks eligible to disappear on their own, and when. */
export function autoDismissAt(task: Task): number | null {
  if (!task.endedAt || !isCleanSuccess(task)) return null
  return task.endedAt + AUTO_DISMISS_MS
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))
}
