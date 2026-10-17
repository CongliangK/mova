import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"

export interface FileStatus {
  path: string
  status: string
}

export interface GitStatus {
  is_repo: boolean
  branch: string
  files: FileStatus[]
}

export interface CommitEntry {
  hash: string
  message: string
  author: string
  date: string
}

export const GIT_WORKFLOW_DEFERRED_REASON =
  "Git add, commit, and log commands exist in the backend store but need a dedicated history/staging workflow before they can safely modify project repositories."

interface GitState {
  isRepo: boolean
  branch: string
  files: FileStatus[]
  log: CommitEntry[]
  isLoading: boolean
  error: string | null

  initRepo: (path: string) => Promise<void>
  loadStatus: (path: string) => Promise<void>
  addFiles: (path: string, files: string[]) => Promise<void>
  commit: (path: string, message: string) => Promise<string>
  loadLog: (path: string, count?: number) => Promise<void>
}

export const useGitStore = create<GitState>((set) => ({
  isRepo: false,
  branch: "",
  files: [],
  log: [],
  isLoading: false,
  error: null,

  initRepo: async (path: string) => {
    set({ isLoading: true, error: null })
    try {
      await invoke("git_init", { path })
      set({ isRepo: true, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
    }
  },

  loadStatus: async (path: string) => {
    set({ isLoading: true, error: null })
    try {
      const status = await invoke<GitStatus>("git_status", { path })
      set({
        isRepo: status.is_repo,
        branch: status.branch,
        files: status.files,
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
    }
  },

  addFiles: async (path: string, files: string[]) => {
    set({ isLoading: true, error: null })
    try {
      await invoke("git_add", { path, files })
      set({ isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
    }
  },

  commit: async (path: string, message: string) => {
    set({ isLoading: true, error: null })
    try {
      const hash = await invoke<string>("git_commit", { path, message })
      set({ isLoading: false })
      return hash
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  loadLog: async (path: string, count?: number) => {
    set({ isLoading: true, error: null })
    try {
      const log = await invoke<CommitEntry[]>("git_log", {
        path,
        count: count ?? 20,
      })
      set({ log, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
    }
  },
}))
