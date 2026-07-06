import { create } from 'zustand'

/** Which top-level view the main pane shows. */
export type View = 'archive' | 'device' | 'search'

interface AppState {
  /** Absolute path of the currently selected session/folder, or null. */
  selectedPath: string | null
  select: (path: string | null) => void
  /** 'archive' = local sessions, 'device' = Control Hub logs, 'search' = filter/search. */
  view: View
  setView: (view: View) => void
  /** Select a session and jump to the Archive view (used from search results). */
  openSession: (path: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedPath: null,
  select: (path) => set({ selectedPath: path }),
  view: 'archive',
  setView: (view) => set({ view }),
  openSession: (path) => set({ selectedPath: path, view: 'archive' })
}))
