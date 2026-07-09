import '@shared/types/api' // registers the window.api global type
import type { CreateSessionInput, SessionMetadata } from '@shared/types/session'
import type { HubLogRef, ImportRequest, NewSessionImportRequest } from '@shared/types/import'
import type { SessionQuery } from '@shared/types/query'
import type { FtcScoutEventSearchRequest, FtcScoutSyncRequest } from '@shared/types/ftcscout'

/** Thin, typed wrappers over the preload bridge — one call site per channel. */
export const api = {
  getInfo: () => window.api.invoke('app:getInfo'),
  settings: {
    get: () => window.api.invoke('settings:get'),
    pickRoot: () => window.api.invoke('settings:pickArchiveRoot'),
    setRoot: (path: string) => window.api.invoke('settings:setArchiveRoot', path),
    setTeamNumber: (teamNumber: number | null) =>
      window.api.invoke('settings:setTeamNumber', teamNumber),
    pickHubLogFolder: () => window.api.invoke('settings:pickHubLogFolder'),
    setHubDataSource: (source: 'adb' | 'folder') =>
      window.api.invoke('settings:setHubDataSource', source),
    setHubLogFolder: (path: string | null) => window.api.invoke('settings:setHubLogFolder', path)
  },
  archive: {
    tree: () => window.api.invoke('archive:tree'),
    getSession: (path: string) => window.api.invoke('archive:getSession', path),
    listFiles: (path: string) => window.api.invoke('archive:listFiles', path),
    showFolder: (path: string) => window.api.invoke('archive:showFolder', path),
    showFile: (path: string, filename: string) => window.api.invoke('archive:showFile', path, filename),
    openFile: (path: string, filename: string) => window.api.invoke('archive:openFile', path, filename),
    createSession: (input: CreateSessionInput) => window.api.invoke('archive:createSession', input),
    updateMeta: (path: string, patch: Partial<SessionMetadata>) =>
      window.api.invoke('archive:updateMeta', path, patch),
    promoteFolder: (path: string) => window.api.invoke('archive:promoteFolder', path),
    readNotes: (path: string) => window.api.invoke('archive:readNotes', path),
    writeNotes: (path: string, md: string) => window.api.invoke('archive:writeNotes', path, md),
    rebuildIndex: () => window.api.invoke('archive:rebuildIndex')
  },
  index: {
    query: (query: SessionQuery) => window.api.invoke('index:query', query),
    queryLogs: (query: SessionQuery) => window.api.invoke('index:queryLogs', query),
    librarySize: () => window.api.invoke('index:librarySize')
  },
  adb: {
    status: () => window.api.invoke('adb:status'),
    listHubLogs: () => window.api.invoke('adb:listHubLogs'),
    getHubTime: () => window.api.invoke('adb:getHubTime'),
    ignoreHubLog: (entry: HubLogRef) => window.api.invoke('adb:ignoreHubLog', entry),
    unignoreHubLog: (remotePath: string) => window.api.invoke('adb:unignoreHubLog', remotePath)
  },
  import: {
    toSession: (req: ImportRequest) => window.api.invoke('import:toSession', req),
    toNewSession: (req: NewSessionImportRequest) => window.api.invoke('import:toNewSession', req)
  },
  ftcscout: {
    searchEvents: (req: FtcScoutEventSearchRequest) => window.api.invoke('ftcscout:searchEvents', req),
    syncEvent: (req: FtcScoutSyncRequest) => window.api.invoke('ftcscout:syncEvent', req)
  }
}
