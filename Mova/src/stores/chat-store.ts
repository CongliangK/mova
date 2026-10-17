import { invoke } from "@tauri-apps/api/core"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ChatMessage } from "../types/ai"

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

/** Map of projectId -> conversations. "general" is used when no project is active. */
type ProjectConversationsMap = Record<string, Conversation[]>

interface ProjectConversationsFile {
  version: number
  conversations: Conversation[]
  activeConversationId: string | null
}

interface ChatState {
  /** ID of the currently active project, or null if none */
  activeProjectId: string | null
  /** Conversations for the currently active project */
  conversations: Conversation[]
  activeConversationId: string | null
  isLoading: boolean
  /** All conversations grouped by projectId ("general" when no project is active) */
  projectConversations: ProjectConversationsMap

  createConversation: () => string
  deleteConversation: (id: string) => void
  setActiveConversation: (id: string) => void
  addMessage: (message: ChatMessage, conversationId?: string) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>, conversationId?: string) => void
  setLoading: (loading: boolean) => void

  /** Load conversations for a specific project into active state from local fallback state */
  loadProjectConversations: (projectId: string) => void
  /** Load conversations for a specific project from the project folder when available */
  loadProjectConversationsFromStorage: (projectId: string) => Promise<void>
  /** Persist a project's conversations into project storage when available */
  persistProjectConversations: (projectId?: string) => Promise<void>
  /** Save current conversations back to storage and clear active state */
  saveCurrentConversations: () => void
}

function getActiveConv(state: ChatState): Conversation | undefined {
  return state.conversations.find((c) => c.id === state.activeConversationId)
}

function deriveTitle(firstMessage: string): string {
  const text = firstMessage.trim().slice(0, 40)
  return text.length < firstMessage.trim().length ? text + "..." : text
}

function getValidActiveConversationId(
  conversations: Conversation[],
  activeConversationId: string | null,
): string | null {
  if (activeConversationId && conversations.some((c) => c.id === activeConversationId)) {
    return activeConversationId
  }
  return conversations[0]?.id ?? null
}

function getProjectSnapshot(
  state: ChatState,
  projectId: string,
): ProjectConversationsFile {
  const conversations = state.activeProjectId === projectId
    ? state.conversations
    : state.projectConversations[projectId] ?? []
  const activeConversationId = state.activeProjectId === projectId
    ? state.activeConversationId
    : conversations[0]?.id ?? null

  return {
    version: 1,
    conversations,
    activeConversationId: getValidActiveConversationId(conversations, activeConversationId),
  }
}

type ProjectConversationsLoadResult =
  | { status: "loaded"; data: ProjectConversationsFile }
  | { status: "missing" }
  | { status: "unavailable" }

function normalizeProjectConversationsFile(
  data: ProjectConversationsFile | null,
): ProjectConversationsLoadResult {
  if (!data) return { status: "missing" }
  if (!Array.isArray(data.conversations)) return { status: "unavailable" }
  return {
    status: "loaded",
    data: {
      version: data.version || 1,
      conversations: data.conversations,
      activeConversationId: getValidActiveConversationId(
        data.conversations,
        data.activeConversationId ?? null,
      ),
    },
  }
}

async function readProjectConversationsFile(
  projectId: string,
): Promise<ProjectConversationsLoadResult> {
  try {
    const data = await invoke<ProjectConversationsFile | null>("load_project_conversations", {
      path: projectId,
    })
    return normalizeProjectConversationsFile(data)
  } catch {
    return { status: "unavailable" }
  }
}

let onAutoSaveError: ((message: string) => void) | null = null

export function setChatAutoSaveErrorHandler(
  handler: ((message: string) => void) | null,
) {
  onAutoSaveError = handler
}

async function writeProjectConversationsFile(
  projectId: string,
  data: ProjectConversationsFile,
): Promise<boolean> {
  try {
    await invoke("save_project_conversations", {
      path: projectId,
      data,
    })
    return true
  } catch (err) {
    console.error("Auto-save failed:", err)
    onAutoSaveError?.(
      "Auto-save failed: " +
        (err instanceof Error ? err.message : String(err)),
    )
    return false
  }
}

interface PendingProjectConversationsSave {
  timer: ReturnType<typeof setTimeout>
  projectId: string
  data: ProjectConversationsFile
}

let pendingProjectConversationsSave: PendingProjectConversationsSave | null = null

function flushPendingProjectConversationsSave(projectId?: string) {
  const pending = pendingProjectConversationsSave
  if (!pending || (projectId && pending.projectId !== projectId)) return

  clearTimeout(pending.timer)
  pendingProjectConversationsSave = null
  void writeProjectConversationsFile(pending.projectId, pending.data)
}

function clearPendingProjectConversationsSave(projectId: string) {
  if (pendingProjectConversationsSave?.projectId !== projectId) return

  clearTimeout(pendingProjectConversationsSave.timer)
  pendingProjectConversationsSave = null
}

function scheduleProjectConversationsSave(projectId: string, data: ProjectConversationsFile) {
  if (pendingProjectConversationsSave) {
    if (pendingProjectConversationsSave.projectId === projectId) {
      clearTimeout(pendingProjectConversationsSave.timer)
    } else {
      flushPendingProjectConversationsSave()
    }
  }

  const timer = setTimeout(() => {
    if (pendingProjectConversationsSave?.timer === timer) {
      pendingProjectConversationsSave = null
    }
    void writeProjectConversationsFile(projectId, data)
  }, 500)

  pendingProjectConversationsSave = { timer, projectId, data }
}

function scheduleActiveProjectConversationsSave(state: ChatState) {
  if (!state.activeProjectId) return
  scheduleProjectConversationsSave(
    state.activeProjectId,
    getProjectSnapshot(state, state.activeProjectId),
  )
}

/** The shape persisted to localStorage under "mova-chat-v3" */
interface PersistedChatV3 {
  version: number
  projectConversations: ProjectConversationsMap
  activeProjectId: string | null
  activeConversationId: string | null
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      activeProjectId: null,
      conversations: [],
      activeConversationId: null,
      isLoading: false,
      projectConversations: {},

      createConversation: () => {
        const id = crypto.randomUUID()
        const conv: Conversation = {
          id,
          title: "New Chat",
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeConversationId: id,
        }))
        scheduleActiveProjectConversationsSave(get())
        return id
      },

      deleteConversation: (id) => {
        set((s) => {
          const remaining = s.conversations.filter((c) => c.id !== id)
          const newActive =
            s.activeConversationId === id
              ? remaining[0]?.id ?? null
              : s.activeConversationId
          return { conversations: remaining, activeConversationId: newActive }
        })
        scheduleActiveProjectConversationsSave(get())
      },

      setActiveConversation: (id) => {
        set({ activeConversationId: id })
        scheduleActiveProjectConversationsSave(get())
      },

      addMessage: (message, conversationId) => {
        set((s) => {
          const targetConversationId = conversationId ?? s.activeConversationId
          if (!targetConversationId) return s
          return {
            conversations: s.conversations.map((c) => {
              if (c.id !== targetConversationId) return c
              const isFirstUser = message.role === "user" && c.messages.length === 0
              return {
                ...c,
                title: isFirstUser ? deriveTitle(message.content) : c.title,
                messages: [...c.messages, message],
                updatedAt: new Date().toISOString(),
              }
            }),
          }
        })
        scheduleActiveProjectConversationsSave(get())
      },

      updateMessage: (id, updates, conversationId) => {
        set((s) => {
          const targetConversationId = conversationId ?? s.activeConversationId
          if (!targetConversationId) return s
          return {
            conversations: s.conversations.map((c) => {
              if (c.id !== targetConversationId) return c
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === id ? { ...m, ...updates } : m
                ),
                updatedAt: new Date().toISOString(),
              }
            }),
          }
        })
        scheduleActiveProjectConversationsSave(get())
      },

      setLoading: (loading) => set({ isLoading: loading }),

      loadProjectConversations: (projectId) => {
        const state = get()
        if (state.activeProjectId === projectId) return
        if (state.activeProjectId !== null) {
          void get().persistProjectConversations(state.activeProjectId)
        }

        set((s) => {
          const nextProjectConversations =
            s.activeProjectId !== null
              ? { ...s.projectConversations, [s.activeProjectId]: s.conversations }
              : s.projectConversations

          const projectConvs = nextProjectConversations[projectId] ?? []

          return {
            projectConversations: nextProjectConversations,
            activeProjectId: projectId,
            conversations: projectConvs,
            activeConversationId: projectConvs[0]?.id ?? null,
          }
        })
      },

      loadProjectConversationsFromStorage: async (projectId) => {
        const conversationsBeforeAwait = get().conversations
        const result = await readProjectConversationsFile(projectId)
        const state = get()
        if (state.activeProjectId !== projectId) return
        if (state.conversations !== conversationsBeforeAwait) return

        if (result.status === "loaded") {
          const activeConversationId = getValidActiveConversationId(
            result.data.conversations,
            result.data.activeConversationId,
          )
          set((s) => ({
            projectConversations: {
              ...s.projectConversations,
              [projectId]: result.data.conversations,
            },
            conversations: result.data.conversations,
            activeConversationId,
          }))
          return
        }

        if (result.status === "missing") {
          const snapshot = getProjectSnapshot(state, projectId)
          if (snapshot.conversations.length > 0) {
            await writeProjectConversationsFile(projectId, snapshot)
          }
        }
      },

      persistProjectConversations: async (projectId) => {
        const state = get()
        const targetProjectId = projectId ?? state.activeProjectId
        if (!targetProjectId) return

        clearPendingProjectConversationsSave(targetProjectId)
        const snapshot = getProjectSnapshot(state, targetProjectId)
        await writeProjectConversationsFile(targetProjectId, snapshot)
      },

      saveCurrentConversations: () => {
        const state = get()
        if (state.activeProjectId === null) {
          set({ activeProjectId: null, conversations: [], activeConversationId: null })
          return
        }

        const projectId = state.activeProjectId
        void get().persistProjectConversations(projectId)
        set((s) => ({
          projectConversations: {
            ...s.projectConversations,
            [projectId]: state.conversations,
          },
          activeProjectId: null,
          conversations: [],
          activeConversationId: null,
        }))
      },
    }),
    {
      name: "mova-chat-v3",
      version: 3,
      partialize: (state) => {
        const projectConversations =
          state.activeProjectId !== null
            ? { ...state.projectConversations, [state.activeProjectId]: state.conversations }
            : state.projectConversations

        return {
          version: 3,
          projectConversations,
          activeProjectId: state.activeProjectId,
          activeConversationId: state.activeConversationId,
        } as unknown as ChatState
      },
      migrate: (persisted: unknown, version: number) => {
        if (version < 3) {
          const oldState = persisted as { conversations?: Conversation[]; activeConversationId?: string | null }
          const oldConversations = oldState.conversations ?? []

          const migrated: PersistedChatV3 = {
            version: 3,
            projectConversations: {
              general: oldConversations,
            },
            activeProjectId: null,
            activeConversationId: oldState.activeConversationId ?? null,
          }

          return migrated as unknown as ChatState
        }
        return persisted as ChatState
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!state.projectConversations) {
          state.projectConversations = {}
        }
        if (state.activeProjectId && state.projectConversations[state.activeProjectId]) {
          state.conversations = state.projectConversations[state.activeProjectId]
        } else {
          state.conversations = []
          state.activeConversationId = null
          state.activeProjectId = null
        }
      },
    }
  )
)

/** 稳定的空数组引用，避免选择器每次渲染创建新引用导致无限重渲染 */
const EMPTY_MESSAGES: ChatMessage[] = []

export const useActiveMessages = (): ChatMessage[] => {
  return useChatStore((s) => {
    const conv = getActiveConv(s)
    return conv?.messages ?? EMPTY_MESSAGES
  })
}
