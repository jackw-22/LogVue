import { basename } from 'path'
import { BrowserWindow } from 'electron'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import type { ArchiveChangedEvent } from '@shared/types/ipc'
import { rebuild } from '../index/indexService'
import { INDEX_FILE, INTERNAL_DIR } from '../archive/paths'

const DEBOUNCE_MS = 400

interface WatcherState {
  root: string
  watcher: FSWatcher
  timer: NodeJS.Timeout | null
  paths: Set<string>
}

let current: WatcherState | null = null
let pauseDepth = 0

function scheduleFlush(state: WatcherState): void {
  if (state.timer) clearTimeout(state.timer)
  if (pauseDepth > 0) {
    state.timer = null
    return
  }
  state.timer = setTimeout(() => flush(state), DEBOUNCE_MS)
}

/**
 * Hold watcher rebuilds during an app-owned multi-file mutation. Chokidar events
 * are retained and coalesced into one rebuild after the outermost mutation ends.
 */
export function pauseArchiveWatcher(): () => void {
  pauseDepth += 1
  if (current?.timer) {
    clearTimeout(current.timer)
    current.timer = null
  }
  let resumed = false
  return () => {
    if (resumed) return
    resumed = true
    pauseDepth = Math.max(0, pauseDepth - 1)
    if (pauseDepth === 0 && current && current.paths.size > 0) scheduleFlush(current)
  }
}

export function shouldIgnoreArchivePath(path: string): boolean {
  if (path.split(/[\\/]+/).includes(INTERNAL_DIR)) return true
  const name = basename(path)
  if (!name) return false
  if (name === INDEX_FILE || name === `${INDEX_FILE}-wal` || name === `${INDEX_FILE}-shm`) return true
  if (name.endsWith('.tmp') || name.endsWith('~')) return true
  return false
}

export function startArchiveWatcher(root: string | null | undefined): void {
  stopArchiveWatcher()
  if (!root) return

  const state: WatcherState = {
    root,
    watcher: chokidar.watch(root, {
      ignoreInitial: true,
      ignored: shouldIgnoreArchivePath,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 }
    }),
    timer: null,
    paths: new Set<string>()
  }

  const queue = (path: string) => {
    if (shouldIgnoreArchivePath(path)) return
    state.paths.add(path)
    scheduleFlush(state)
  }

  state.watcher
    .on('add', queue)
    .on('change', queue)
    .on('unlink', queue)
    .on('addDir', queue)
    .on('unlinkDir', queue)
    .on('error', (err: unknown) => console.error('Archive watcher error:', err))

  current = state
}

export function stopArchiveWatcher(): void {
  if (!current) return
  if (current.timer) clearTimeout(current.timer)
  void current.watcher.close()
  current = null
  pauseDepth = 0
}

function flush(state: WatcherState): void {
  state.timer = null
  const paths = [...state.paths]
  state.paths.clear()
  try {
    rebuild(state.root)
  } catch (err) {
    console.error('Archive watcher rebuild failed:', err)
  }
  notifyArchiveChanged(state.root, paths)
}

/** Immediately tell renderers about a service-owned archive mutation. */
export function notifyArchiveChanged(root: string, paths: string[]): void {
  const payload: ArchiveChangedEvent = { root, paths, reason: 'archive_changed' }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('archive:changed', payload)
  }
}
