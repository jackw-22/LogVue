import type { IpcApi, IpcEvents } from './ipc'

/**
 * The allow-listed surface exposed on `window.api` by the preload bridge.
 * A single generic `invoke` keeps the bridge tiny while staying fully typed
 * against the {@link IpcApi} contract.
 */
export interface Api {
  invoke<K extends keyof IpcApi>(
    channel: K,
    ...args: Parameters<IpcApi[K]>
  ): ReturnType<IpcApi[K]>
  onArchiveChanged(handler: (event: IpcEvents['archive:changed']) => void): () => void
  /** A full snapshot of one background task, pushed on every change. */
  onTaskUpdate(handler: (task: IpcEvents['tasks:update']) => void): () => void
}

declare global {
  interface Window {
    api: Api
  }
}
