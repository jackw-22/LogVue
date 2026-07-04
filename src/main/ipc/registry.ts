import { app, ipcMain } from 'electron'
import type { AppInfo, IpcApi } from '@shared/types/ipc'

/** Every channel in the contract must have exactly one handler here. */
type Handlers = {
  [K in keyof IpcApi]: (
    ...args: Parameters<IpcApi[K]>
  ) => Awaited<ReturnType<IpcApi[K]>> | ReturnType<IpcApi[K]>
}

const handlers: Handlers = {
  'app:ping': async (msg) => `pong: ${msg}`,

  'app:getInfo': async (): Promise<AppInfo> => ({
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform
  })
}

/** Wire every contract channel to its handler. Call once on app ready. */
export function registerIpcHandlers(): void {
  for (const channel of Object.keys(handlers) as (keyof IpcApi)[]) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    ipcMain.handle(channel, (_event, ...args) => handler(...args))
  }
}
