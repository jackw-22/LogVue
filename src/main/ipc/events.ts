import { BrowserWindow } from 'electron'
import type { IpcEvents } from '@shared/types/ipc'

/** Broadcast one contract-checked push event to every live renderer. */
export function emitIpcEvent<K extends keyof IpcEvents>(
  channel: K,
  payload: IpcEvents[K]
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
