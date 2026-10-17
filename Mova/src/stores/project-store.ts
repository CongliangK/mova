import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import type { Project, Character, ProjectSettings } from "../types/project"
import { serializeProjectForRust } from "../types/project"

export interface AddCharacterResult {
  success: boolean
  characterId: string
  name: string
}

interface ProjectState {
  project: Project | null
  projectPath: string | null
  isLoaded: boolean

  loadProject: (project: Project, path: string) => void
  closeProject: () => void
  updateSettings: (settings: Partial<ProjectSettings>) => void
  addCharacter: (character: Character) => AddCharacterResult
  removeCharacter: (id: string) => void
  updateCharacter: (id: string, updates: Partial<Character>) => void
  updateCharacterTags: (id: string, tags: string[]) => void
  setActiveCharacter: (id: string | null) => void
}

interface PendingAutoSave {
  timer: ReturnType<typeof setTimeout>
  projectPath: string
  project: Project
}

let onAutoSaveError: ((message: string) => void) | null = null

export function setProjectAutoSaveErrorHandler(
  handler: ((message: string) => void) | null,
) {
  onAutoSaveError = handler
}

let pendingAutoSave: PendingAutoSave | null = null

function saveProjectSnapshot(projectPath: string, project: Project) {
  invoke("save_project", {
    path: projectPath,
    project: serializeProjectForRust(project),
  }).catch((err: unknown) => {
    console.error("Auto-save failed:", err)
    onAutoSaveError?.(
      "Auto-save failed: " +
        (err instanceof Error ? err.message : String(err)),
    )
  })
}

function flushPendingAutoSave() {
  const pending = pendingAutoSave
  if (!pending) return

  clearTimeout(pending.timer)
  pendingAutoSave = null
  saveProjectSnapshot(pending.projectPath, pending.project)
}

function scheduleAutoSave(projectPath: string, project: Project) {
  if (pendingAutoSave) {
    if (pendingAutoSave.projectPath === projectPath) {
      clearTimeout(pendingAutoSave.timer)
    } else {
      flushPendingAutoSave()
    }
  }

  const timer = setTimeout(() => {
    if (pendingAutoSave?.timer === timer) {
      pendingAutoSave = null
    }
    saveProjectSnapshot(projectPath, project)
  }, 500)

  pendingAutoSave = { timer, projectPath, project }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  projectPath: null,
  isLoaded: false,

  loadProject: (project, path) => {
    flushPendingAutoSave()
    set({ project, projectPath: path, isLoaded: true })
  },

  closeProject: () => {
    flushPendingAutoSave()
    set({ project: null, projectPath: null, isLoaded: false })
  },

  updateSettings: (settings) => {
    set((state) => ({
      project: state.project
        ? { ...state.project, settings: { ...state.project.settings, ...settings } }
        : null,
    }))
    const { project, projectPath } = get()
    if (project && projectPath) scheduleAutoSave(projectPath, project)
  },

  addCharacter: (character) => {
    set((state) => ({
      project: state.project
        ? { ...state.project, characters: [...state.project.characters, character] }
        : null,
    }))
    const { project, projectPath } = get()
    if (project && projectPath) scheduleAutoSave(projectPath, project)
    return { success: true, characterId: character.id, name: character.name }
  },

  removeCharacter: (id) => {
    set((state) => ({
      project: state.project
        ? { ...state.project, characters: state.project.characters.filter((c) => c.id !== id) }
        : null,
    }))
    const { project, projectPath } = get()
    if (project && projectPath) scheduleAutoSave(projectPath, project)
  },

  updateCharacter: (id, updates) => {
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            characters: state.project.characters.map((c) =>
              c.id === id ? { ...c, ...updates } : c
            ),
          }
        : null,
    }))
    const { project, projectPath } = get()
    if (project && projectPath) scheduleAutoSave(projectPath, project)
  },

  updateCharacterTags: (id, tags) => {
    set((state) => ({
      project: state.project
        ? {
            ...state.project,
            characters: state.project.characters.map((c) =>
              c.id === id ? { ...c, tags } : c
            ),
          }
        : null,
    }))
    const { project, projectPath } = get()
    if (project && projectPath) scheduleAutoSave(projectPath, project)
  },

  setActiveCharacter: (id) => {
    set((state) => ({
      project: state.project
        ? { ...state.project, activeCharacterId: id }
        : null,
    }))
    const { project, projectPath } = get()
    if (project && projectPath) scheduleAutoSave(projectPath, project)
  },
}))
