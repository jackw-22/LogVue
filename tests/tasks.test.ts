import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types/tasks'
import { isCleanSuccess } from '../src/shared/types/tasks'
import { aggregateFraction, autoDismissAt, taskFraction } from '../src/renderer/stores/taskStore'

function task(patch: Partial<Task> = {}): Task {
  return {
    id: 't1',
    kind: 'import',
    status: 'running',
    title: 'Importing',
    subtitle: null,
    determinate: true,
    done: 0,
    total: 0,
    items: [],
    bytesDone: 0,
    bytesTotal: 0,
    bytesPerSec: null,
    etaSeconds: null,
    badge: null,
    summary: null,
    error: null,
    targetPath: null,
    startedAt: 1000,
    endedAt: null,
    ...patch
  }
}

describe('taskFraction', () => {
  it('prefers bytes, falling back to settled item counts', () => {
    expect(taskFraction(task({ bytesDone: 5, bytesTotal: 20 }))).toBe(0.25)
    expect(taskFraction(task({ done: 3, total: 4 }))).toBe(0.75)
  })

  it('is zero while an indeterminate task runs (nothing observable)', () => {
    expect(taskFraction(task({ determinate: false, kind: 'reindex' }))).toBe(0)
  })

  it('is complete once finished, even when it was never measurable', () => {
    // Regression: the reindex card left the collapsed pill's ring empty beside "All done".
    expect(taskFraction(task({ determinate: false, status: 'success', endedAt: 2000 }))).toBe(1)
    expect(taskFraction(task({ status: 'error', endedAt: 2000 }))).toBe(1)
  })
})

describe('aggregateFraction', () => {
  it('ignores a running indeterminate task but counts a finished one', () => {
    const running = task({ id: 'a', determinate: false, kind: 'reindex' })
    const half = task({ id: 'b', bytesDone: 1, bytesTotal: 2 })
    expect(aggregateFraction([running, half])).toBe(0.5)

    const done = task({ id: 'a', determinate: false, status: 'success', endedAt: 2000 })
    expect(aggregateFraction([done])).toBe(1)
    expect(aggregateFraction([done, half])).toBe(0.75)
  })

  it('is zero when nothing is measurable', () => {
    expect(aggregateFraction([])).toBe(0)
    expect(aggregateFraction([task({ determinate: false })])).toBe(0)
  })
})

describe('autoDismissAt', () => {
  it('schedules only clean successes', () => {
    expect(autoDismissAt(task({ status: 'success', endedAt: 2000 }))).toBe(6000)
    expect(autoDismissAt(task({ status: 'running' }))).toBeNull()
    expect(autoDismissAt(task({ status: 'error', endedAt: 2000 }))).toBeNull()
  })

  it('keeps a success that contains a failed file on screen', () => {
    const withFailure = task({
      status: 'success',
      endedAt: 2000,
      items: [{ id: 'f', label: 'a.rlog', status: 'failed', detail: 'device busy' }]
    })
    expect(isCleanSuccess(withFailure)).toBe(false)
    expect(autoDismissAt(withFailure)).toBeNull()
  })
})
