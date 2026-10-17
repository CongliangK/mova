import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import type { FileNode } from "../types/file-tree"
import { useProjectStore } from "./project-store"

const EXPANDED_PATHS_KEY = "mova:file-tree:expandedPaths"

function loadExpandedPaths(): Set<string> {
  try {
    const stored = localStorage.getItem(EXPANDED_PATHS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as string[]
      return new Set(parsed)
    }
  } catch {
    // Ignore parse errors — start with empty set
  }
  return new Set()
}

function persistExpandedPaths(paths: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_PATHS_KEY, JSON.stringify([...paths]))
  } catch {
    // Ignore quota errors
  }
}

interface FileTreeState {
  tree: FileNode[]
  currentPath: string | null
  expandedPaths: Set<string>
  selectedPath: string | null
  searchQuery: string
  isLoading: boolean
  error: string | null

  loadTree: (path: string) => Promise<void>
  toggleExpand: (path: string) => void
  selectFile: (path: string | null) => void
  setSearch: (query: string) => void
  refresh: () => Promise<void>
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  tree: [],
  currentPath: null,
  expandedPaths: loadExpandedPaths(),
  selectedPath: null,
  searchQuery: "",
  isLoading: false,
  error: null,

  loadTree: async (path: string) => {
    set({ isLoading: true, error: null })
    try {
      const tree = await invoke<FileNode[]>("list_project_files", { path })
      set({ tree, currentPath: path, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
    }
  },

  toggleExpand: (path: string) => {
    set((state) => {
      const next = new Set(state.expandedPaths)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      persistExpandedPaths(next)
      return { expandedPaths: next }
    })
  },

  selectFile: (path: string | null) => {
    set({ selectedPath: path })
  },

  setSearch: (query: string) => {
    set({ searchQuery: query })
  },

  refresh: async () => {
    const { currentPath, expandedPaths } = get()
    const projectPath = currentPath ?? useProjectStore.getState().projectPath
    if (!projectPath) return
    try {
      const tree = await invoke<FileNode[]>("list_project_files", { path: projectPath })
      set({ tree, currentPath: projectPath, expandedPaths })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message })
    }
  },
}))
