import { create } from 'zustand'
import type { SessionType } from '@shared/types/session'
import type { SessionQuery } from '@shared/types/query'

/** Which top-level view the main pane shows. */
export type View = 'archive' | 'device'

/** Quick-find alliance chip. */
export type AllianceFilter = 'all' | 'red' | 'blue' | 'none'
/** Quick-find type chip — 'all' or one concrete session type. */
export type TypeFilter = 'all' | SessionType
/** How alliance colour is painted on rows: a left stripe, or a full row tint. */
export type ShadeMode = 'stripe' | 'tint'
/** The "All logs" dashboard layout. */
export type DashboardMode = 'flat' | 'grouped'

interface AppState {
  /** Absolute path of the currently selected session/folder, or null. */
  selectedPath: string | null
  select: (path: string | null) => void
  /** 'archive' = local sessions, 'device' = Control Hub logs. */
  view: View
  setView: (view: View) => void
  /** Select a session and jump to the Archive view (used from log rows / hub links). */
  openSession: (path: string) => void

  // ── quick-find (spec §12, prototype quick-find bar) ────────
  search: string
  setSearch: (search: string) => void
  alliance: AllianceFilter
  setAlliance: (alliance: AllianceFilter) => void
  typeFilter: TypeFilter
  setTypeFilter: (typeFilter: TypeFilter) => void
  shade: ShadeMode
  setShade: (shade: ShadeMode) => void
  dashboardMode: DashboardMode
  setDashboardMode: (dashboardMode: DashboardMode) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedPath: null,
  select: (path) => set({ selectedPath: path }),
  view: 'archive',
  setView: (view) => set({ view }),
  openSession: (path) => set({ selectedPath: path, view: 'archive' }),

  search: '',
  setSearch: (search) => set({ search }),
  alliance: 'all',
  setAlliance: (alliance) => set({ alliance }),
  typeFilter: 'all',
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  shade: 'stripe',
  setShade: (shade) => set({ shade }),
  dashboardMode: 'flat',
  setDashboardMode: (dashboardMode) => set({ dashboardMode })
}))

/** The quick-find state as a structured index query (shared by dashboard + hub view). */
export function toSessionQuery(
  search: string,
  alliance: AllianceFilter,
  typeFilter: TypeFilter
): SessionQuery {
  return {
    text: search.trim() || undefined,
    alliances: alliance === 'red' || alliance === 'blue' ? [alliance] : undefined,
    noAlliance: alliance === 'none' || undefined,
    sessionTypes: typeFilter === 'all' ? undefined : [typeFilter]
  }
}
