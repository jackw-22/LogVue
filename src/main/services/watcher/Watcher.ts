import { basename } from 'path'
import { BrowserWindow } from 'electron'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import type { ArchiveChangedEvent } from '@shared/types/ipc'
import { rebuild } from '../index/indexService'
import { INDEX_FILE } from '../archive/paths'

const DEBOUNCE_MS = 400

interface WatcherState {
  root: string
  watcher: FSWatcher
  timer: NodeJS.Timeout | null
  paths: Set<string>
}

let current: WatcherState | null = null

export function shouldIgnoreArchivePath(path: string): boolean {
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
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => flush(state), DEBOUNCE_MS)
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
  const payload: ArchiveChangedEvent = { root: state.root, paths, reason: 'archive_changed' }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('archive:changed', payload)
  }
}
