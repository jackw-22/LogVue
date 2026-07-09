import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import type { AppInfo, IpcApi } from '@shared/types/ipc'
import { getSettings, saveSettings } from '../config/settings'
import * as archive from '../services/archive/ArchiveService'
import { readNotes, writeNotes } from '../services/archive/SessionStore'
import {
  ensureIndexBuilt,
  getIndexStore,
  queryLogs,
  querySessions,
  rebuild,
  reindexSession
} from '../services/index/indexService'
import { createAdbClient } from '../services/adb/createAdbClient'
import { listHubLogs } from '../services/adb/hublogs'
import { importToNewSession, importToSession } from '../services/import/ImportService'
import { FtcScoutClient } from '../services/ftcscout/FtcScoutClient'
import { syncFtcScoutEvent } from '../services/ftcscout/syncEvent'
import { startArchiveWatcher } from '../services/watcher/Watcher'

/** One hub-log source wrapper for the app's lifetime; refreshed when source settings change. */
let adb = createAdbClient(getSettings())
const ftcScout = new FtcScoutClient()

function refreshAdbClient() {
  adb = createAdbClient(getSettings())
}

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
      title: 'Choose FTC log library folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  },
  'settings:setArchiveRoot': async (path) => {
    const next = saveSettings({ archiveRoot: path })
    // A new root gets a fresh index built from its contents (§6.2).
    ensureIndexBuilt(next.archiveRoot)
    startArchiveWatcher(next.archiveRoot)
    return next
  },
  'settings:setTeamNumber': async (teamNumber) => saveSettings({ teamNumber }),
  'settings:pickHubLogFolder': async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose hub log folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  },
  'settings:setHubDataSource': async (source) => {
    const next = saveSettings({ hubDataSource: source })
    refreshAdbClient()
    return next
  },
  'settings:setHubLogFolder': async (path) => {
    const next = saveSettings({ hubLogFolder: path })
    refreshAdbClient()
    return next
  },

  // ── archive / sessions ──
  'archive:tree': async () => archive.scanTree(getSettings().archiveRoot ?? ''),
  'archive:getSession': async (path) => archive.getSession(path),
  'archive:listFiles': async (path) => archive.listFolderFiles(path),
  'archive:showFolder': async (path) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  },
  'archive:showFile': async (path, filename) => {
    shell.showItemInFolder(join(path, filename))
  },
  'archive:openFile': async (path, filename) => {
    const error = await shell.openPath(join(path, filename))
    if (error) throw new Error(error)
  },
  'archive:createSession': async (input) => {
    const session = archive.createSession(input)
    reindexSession(getSettings().archiveRoot, session.path)
    return session
  },
  'archive:updateMeta': async (path, patch) => {
    const session = archive.updateMeta(path, patch)
    // Keep the index in step so type/tag/name edits are reflected in filters (spec §12).
    reindexSession(getSettings().archiveRoot, path)
    return session
  },
  'archive:promoteFolder': async (path) => {
    const session = archive.promoteFolder(path)
    reindexSession(getSettings().archiveRoot, path)
    return session
  },
  'archive:readNotes': async (path) => readNotes(path),
  'archive:writeNotes': async (path, md) => writeNotes(path, md),
  'archive:rebuildIndex': async () => rebuild(getSettings().archiveRoot),
  'index:query': async (query) => querySessions(getSettings().archiveRoot, query),
  'index:queryLogs': async (query) => queryLogs(getSettings().archiveRoot, query),

  // ── ADB / Control Hub ──
  'adb:status': async () => adb.getStatus(),
  'adb:listHubLogs': async () => listHubLogs(adb, getSettings().archiveRoot),
  'adb:getHubTime': async () => {
    const sample = await adb.getTimeSample()
    const localMidpointMs = sample.localBeforeMs + (sample.localAfterMs - sample.localBeforeMs) / 2
    return {
      ...sample,
      offsetMs: Math.round(localMidpointMs - sample.hubNowMs),
      roundTripMs: sample.localAfterMs - sample.localBeforeMs
    }
  },
  'adb:ignoreHubLog': async (entry) => {
    getIndexStore(getSettings().archiveRoot)?.ignoreHubLog(entry)
  },
  'adb:unignoreHubLog': async (remotePath) => {
    getIndexStore(getSettings().archiveRoot)?.unignoreHubLog(remotePath)
  },

  // ── import ──
  'import:toSession': async (req) => importToSession(adb, getSettings().archiveRoot, req),
  'import:toNewSession': async (req) => importToNewSession(adb, getSettings().archiveRoot, req),

  // ── FTCScout ──
  'ftcscout:searchEvents': async (req) => ftcScout.searchEvents(req),
  'ftcscout:syncEvent': async (req) => syncFtcScoutEvent(ftcScout, req)
}

/** Wire every contract channel to its handler. Call once on app ready. */
export function registerIpcHandlers(): void {
  for (const channel of Object.keys(handlers) as (keyof IpcApi)[]) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    ipcMain.handle(channel, (_event, ...args) => handler(...args))
  }
}
