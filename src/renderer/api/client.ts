import '@shared/types/api' // registers the window.api global type
import type { CreateSessionInput, SessionMetadata } from '@shared/types/session'

/** Thin, typed wrappers over the preload bridge — one call site per channel. */
export const api = {
  getInfo: () => window.api.invoke('app:getInfo'),
  settings: {
    get: () => window.api.invoke('settings:get'),
    pickRoot: () => window.api.invoke('settings:pickArchiveRoot'),
    setRoot: (path: string) => window.api.invoke('settings:setArchiveRoot', path)
  },
  archive: {
    tree: () => window.api.invoke('archive:tree'),
    getSession: (path: string) => window.api.invoke('archive:getSession', path),
    createSession: (input: CreateSessionInput) => window.api.invoke('archive:createSession', input),
    updateMeta: (path: string, patch: Partial<SessionMetadata>) =>
      window.api.invoke('archive:updateMeta', path, patch),
    promoteFolder: (path: string) => window.api.invoke('archive:promoteFolder', path),
    readNotes: (path: string) => window.api.invoke('archive:readNotes', path),
    writeNotes: (path: string, md: string) => window.api.invoke('archive:writeNotes', path, md),
    rebuildIndex: () => window.api.invoke('archive:rebuildIndex')
  },
  adb: {
    status: () => window.api.invoke('adb:status'),
    listHubLogs: () => window.api.invoke('adb:listHubLogs')
  }
}
