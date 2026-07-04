import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateSessionInput, SessionMetadata } from '@shared/types/session'
import { api } from './client'

const keys = {
  settings: ['settings'] as const,
  tree: ['archive', 'tree'] as const,
  session: (path: string) => ['archive', 'session', path] as const,
  notes: (path: string) => ['archive', 'notes', path] as const,
  adbStatus: ['adb', 'status'] as const,
  hubLogs: ['adb', 'hubLogs'] as const
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

export function useNotes(path: string | null) {
  return useQuery({
    queryKey: keys.notes(path ?? ''),
    queryFn: () => api.archive.readNotes(path as string),
    enabled: !!path
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
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tree })
  })
}

export function useUpdateMeta(path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<SessionMetadata>) => api.archive.updateMeta(path, patch),
    onSuccess: (session) => {
      qc.setQueryData(keys.session(path), session)
      qc.invalidateQueries({ queryKey: keys.tree })
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
