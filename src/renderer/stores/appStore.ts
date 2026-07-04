import { create } from 'zustand'

/** Which top-level view the main pane shows. */
export type View = 'archive' | 'device'

interface AppState {
  /** Absolute path of the currently selected session/folder, or null. */
  selectedPath: string | null
  select: (path: string | null) => void
  /** 'archive' = local sessions, 'device' = Control Hub logs over ADB. */
  view: View
  setView: (view: View) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedPath: null,
  select: (path) => set({ selectedPath: path }),
  view: 'archive',
  setView: (view) => set({ view })
}))
