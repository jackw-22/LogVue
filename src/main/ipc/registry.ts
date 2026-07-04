import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { AppInfo, IpcApi } from '@shared/types/ipc'
import { getSettings, saveSettings } from '../config/settings'
import * as archive from '../services/archive/ArchiveService'
import { readNotes, writeNotes } from '../services/archive/SessionStore'
import { ensureIndexBuilt, rebuild } from '../services/index/indexService'

/** Every channel in the contract must have exactly one handler here. */
type Handlers = {
  [K in keyof IpcApi]: (
    ...args: Parameters<IpcApi[K]>
  ) => Awaited<ReturnType<IpcApi[K]>> | ReturnType<IpcApi[K]>
}

const handlers: Handlers = {
  // ── app ──
  'app:ping': async (msg) => `pong: ${msg}`,
  'app:getInfo': async (): Promise<AppInfo> => ({
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform
  }),

  // ── settings / archive root ──
  'settings:get': async () => getSettings(),
  'settings:pickArchiveRoot': async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose FTC log archive folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  },
  'settings:setArchiveRoot': async (path) => {
    const next = saveSettings({ archiveRoot: path })
    // A new root gets a fresh index built from its contents (§6.2).
    ensureIndexBuilt(next.archiveRoot)
    return next
  },

  // ── archive / sessions ──
  'archive:tree': async () => archive.scanTree(getSettings().archiveRoot ?? ''),
  'archive:getSession': async (path) => archive.getSession(path),
  'archive:createSession': async (input) => archive.createSession(input),
  'archive:updateMeta': async (path, patch) => archive.updateMeta(path, patch),
  'archive:promoteFolder': async (path) => archive.promoteFolder(path),
  'archive:readNotes': async (path) => readNotes(path),
  'archive:writeNotes': async (path, md) => writeNotes(path, md),
  'archive:rebuildIndex': async () => rebuild(getSettings().archiveRoot)
}

/** Wire every contract channel to its handler. Call once on app ready. */
export function registerIpcHandlers(): void {
  for (const channel of Object.keys(handlers) as (keyof IpcApi)[]) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    ipcMain.handle(channel, (_event, ...args) => handler(...args))
  }
}
