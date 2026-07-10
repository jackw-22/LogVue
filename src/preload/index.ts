import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/types/api'
import type { IpcApi } from '@shared/types/ipc'

/**
 * The entire bridge: one generic, typed `invoke`. No raw `ipcRenderer`, `fs`, or
 * `child_process` is ever handed to the renderer (ARCHITECTURE.md §2).
 */
const api: Api = {
  invoke<K extends keyof IpcApi>(channel: K, ...args: Parameters<IpcApi[K]>) {
    return ipcRenderer.invoke(channel, ...args) as ReturnType<IpcApi[K]>
  },
  onArchiveChanged(handler) {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof handler>[0]) => {
      handler(payload)
    }
    ipcRenderer.on('archive:changed', listener)
    return () => ipcRenderer.off('archive:changed', listener)
  },
  onTaskUpdate(handler) {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof handler>[0]) => {
      handler(payload)
    }
    ipcRenderer.on('tasks:update', listener)
    return () => ipcRenderer.off('tasks:update', listener)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // Should never happen (contextIsolation is on) — fail loud rather than
  // silently leaking a less-safe path.
  throw new Error('contextIsolation must be enabled')
}
