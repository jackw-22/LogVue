import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateSessionInput, SessionMetadata } from '@shared/types/session'
import type {
  HubLogRef,
  ImportRequest,
  NewSessionImportRequest
} from '@shared/types/import'
import type { SessionQuery } from '@shared/types/query'
import { api } from './client'

const keys = {
  settings: ['settings'] as const,
  tree: ['archive', 'tree'] as const,
  session: (path: string) => ['archive', 'session', path] as const,
  files: (path: string) => ['archive', 'files', path] as const,
  notes: (path: string) => ['archive', 'notes', path] as const,
  adbStatus: ['adb', 'status'] as const,
  hubLogs: ['adb', 'hubLogs'] as const,
  query: (q: SessionQuery) => ['index', 'query', q] as const,
  logQuery: (q: SessionQuery) => ['index', 'queryLogs', q] as const
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.settings.get })
}

export function useArchiveTree(enabled: boolean) {
  return useQuery({ queryKey: keys.tree, queryFn: api.archive.tree, enabled })
}

export function useSession(path: string | null) {
  return useQuery({
    queryKey: keys.session(path ?? ''),
    queryFn: () => api.archive.getSession(path as string),
    enabled: !!path
  })
}

/** The files physically inside a folder/session on disk (spec §16 — see logs without importing). */
export function useFolderFiles(path: string | null) {
  return useQuery({
    queryKey: keys.files(path ?? ''),
    queryFn: () => api.archive.listFiles(path as string),
    enabled: !!path
  })
}

export function useNotes(path: string | null) {
  return useQuery({
    queryKey: keys.notes(path ?? ''),
    queryFn: () => api.archive.readNotes(path as string),
    enabled: !!path
  })
}

/**
 * Filter/search the session index (spec §12). `keepPreviousData` keeps the last
 * results on screen while a refined query is in flight, so the list doesn't flash
 * empty on each keystroke/toggle.
 */
export function useSessionQuery(query: SessionQuery, enabled: boolean) {
  return useQuery({
    queryKey: keys.query(query),
    queryFn: () => api.index.query(query),
    enabled,
    placeholderData: (prev) => prev
  })
}

/**
 * Log-level filter/search for the "All logs" dashboard. Same keepPreviousData
 * trick as {@link useSessionQuery} so rows don't flash away per keystroke.
 */
export function useLogQuery(query: SessionQuery, enabled = true) {
  return useQuery({
    queryKey: keys.logQuery(query),
    queryFn: () => api.index.queryLogs(query),
    enabled,
    placeholderData: (prev) => prev
  })
}

/** Open the native picker and persist the chosen archive root. */
export function usePickArchiveRoot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const path = await api.settings.pickRoot()
      if (!path) return null
      return api.settings.setRoot(path)
    },
    onSuccess: (settings) => {
      if (settings) {
        qc.setQueryData(keys.settings, settings)
        qc.invalidateQueries({ queryKey: keys.tree })
      }
    }
  })
}

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSessionInput) => api.archive.createSession(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.tree })
      qc.invalidateQueries({ queryKey: ['index'] })
    }
  })
}

export function useUpdateMeta(path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<SessionMetadata>) => api.archive.updateMeta(path, patch),
    onSuccess: (session) => {
      qc.setQueryData(keys.session(path), session)
      qc.invalidateQueries({ queryKey: keys.tree })
      qc.invalidateQueries({ queryKey: ['index'] })
    }
  })
}

export function usePromoteFolder(path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.archive.promoteFolder(path),
    onSuccess: (session) => {
      qc.setQueryData(keys.session(path), session)
      qc.invalidateQueries({ queryKey: keys.tree })
    }
  })
}

export function useWriteNotes(path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (md: string) => api.archive.writeNotes(path, md),
    onSuccess: (_r, md) => qc.setQueryData(keys.notes(path), md)
  })
}

/**
 * ADB connection status. Polled on an interval so plug/unplug transitions surface
 * without a manual refresh (a pragmatic stand-in for the `adb:changed` push event;
 * see ARCHITECTURE §5 — the push emitter is a later refinement).
 */
export function useAdbStatus() {
  return useQuery({
    queryKey: keys.adbStatus,
    queryFn: api.adb.status,
    refetchInterval: 4000,
    refetchOnWindowFocus: true
  })
}

/** List of hub `.rlog` files with import status. Only runs while `enabled` (device view + connected). */
export function useHubLogs(enabled: boolean) {
  return useQuery({ queryKey: keys.hubLogs, queryFn: api.adb.listHubLogs, enabled })
}

/**
 * After an import the hub-log statuses and the touched session change, so refresh
 * the log list, the tree (file counts), and any open session view.
 */
function useImportRefresh() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: keys.hubLogs })
    qc.invalidateQueries({ queryKey: keys.tree })
    qc.invalidateQueries({ queryKey: ['archive', 'session'] })
    qc.invalidateQueries({ queryKey: ['archive', 'files'] })
    qc.invalidateQueries({ queryKey: ['index'] })
  }
}

/** Import a remote log into an existing session (spec §7.4). May resolve to a duplicate warning. */
export function useImportToSession() {
  const refresh = useImportRefresh()
  return useMutation({
    mutationFn: (req: ImportRequest) => api.import.toSession(req),
    onSuccess: (res) => {
      if (res.status === 'imported') refresh()
    }
  })
}

/** Create a session from selected logs and import them into it (spec §10). */
export function useImportToNewSession() {
  const refresh = useImportRefresh()
  return useMutation({
    mutationFn: (req: NewSessionImportRequest) => api.import.toNewSession(req),
    onSuccess: () => refresh()
  })
}

export function useIgnoreHubLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entry: HubLogRef) => api.adb.ignoreHubLog(entry),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.hubLogs })
  })
}

export function useUnignoreHubLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (remotePath: string) => api.adb.unignoreHubLog(remotePath),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.hubLogs })
  })
}
