import { invoke } from "@tauri-apps/api/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useChatStore, setChatAutoSaveErrorHandler, type Conversation } from "../../src/stores/chat-store"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

const invokeMock = vi.mocked(invoke)

function makeConversation(id: string, content: string): Conversation {
  return {
    id,
    title: content,
    messages: [
      {
        id: `${id}-msg`,
        role: "user",
        content,
        artifacts: [],
        toolCalls: null,
        timestamp: "2026-01-01T00:00:00Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

function resetChatStore() {
  useChatStore.setState({
    activeProjectId: null,
    conversations: [],
    activeConversationId: null,
    isLoading: false,
    projectConversations: {},
  })
  localStorage.removeItem("mova-chat-v3")
  invokeMock.mockReset()
}

describe("chat project storage", () => {
  beforeEach(() => {
    resetChatStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("loads conversations from the project conversations file", async () => {
    const fileConversation = makeConversation("file-conv", "Loaded from project")
    invokeMock.mockResolvedValueOnce({
      version: 1,
      conversations: [fileConversation],
      activeConversationId: "file-conv",
    })

    useChatStore.getState().loadProjectConversations("/tmp/project-a")
    await useChatStore.getState().loadProjectConversationsFromStorage("/tmp/project-a")

    expect(invokeMock).toHaveBeenCalledWith("load_project_conversations", {
      path: "/tmp/project-a",
    })
    expect(useChatStore.getState().conversations).toEqual([fileConversation])
    expect(useChatStore.getState().activeConversationId).toBe("file-conv")
  })

  it("migrates a localStorage project bucket when no project file exists", async () => {
    const localConversation = makeConversation("local-conv", "Local fallback")
    invokeMock.mockResolvedValueOnce(null)
    useChatStore.setState({
      activeProjectId: "/tmp/project-a",
      conversations: [localConversation],
      activeConversationId: "local-conv",
      isLoading: false,
      projectConversations: {
        "/tmp/project-a": [localConversation],
      },
    })

    await useChatStore.getState().loadProjectConversationsFromStorage("/tmp/project-a")

    expect(invokeMock).toHaveBeenNthCalledWith(1, "load_project_conversations", {
      path: "/tmp/project-a",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_project_conversations", {
      path: "/tmp/project-a",
      data: {
        version: 1,
        conversations: [localConversation],
        activeConversationId: "local-conv",
      },
    })
    expect(useChatStore.getState().conversations).toEqual([localConversation])
  })

  it("persists the active project before switching to another project", () => {
    const projectAConversation = makeConversation("project-a-conv", "Project A")
    invokeMock.mockResolvedValue(undefined)
    useChatStore.setState({
      activeProjectId: "/tmp/project-a",
      conversations: [projectAConversation],
      activeConversationId: "project-a-conv",
      isLoading: false,
      projectConversations: {},
    })

    useChatStore.getState().loadProjectConversations("/tmp/project-b")

    expect(invokeMock).toHaveBeenCalledWith("save_project_conversations", {
      path: "/tmp/project-a",
      data: {
        version: 1,
        conversations: [projectAConversation],
        activeConversationId: "project-a-conv",
      },
    })
    expect(useChatStore.getState().activeProjectId).toBe("/tmp/project-b")
    expect(useChatStore.getState().conversations).toHaveLength(0)
  })

  it("autosaves new messages into an existing project file before close or switch", async () => {
    vi.useFakeTimers()
    const fileConversation = makeConversation("file-conv", "Loaded from project")
    const newMessage = {
      id: "new-msg",
      role: "user" as const,
      content: "Message after project file exists",
      artifacts: [],
      toolCalls: null,
      timestamp: "2026-01-01T00:01:00Z",
    }
    invokeMock.mockResolvedValueOnce({
      version: 1,
      conversations: [fileConversation],
      activeConversationId: "file-conv",
    })
    invokeMock.mockResolvedValue(undefined)

    useChatStore.getState().loadProjectConversations("/tmp/project-a")
    await useChatStore.getState().loadProjectConversationsFromStorage("/tmp/project-a")
    invokeMock.mockClear()

    useChatStore.getState().addMessage(newMessage)

    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_project_conversations",
      expect.anything(),
    )

    await vi.advanceTimersByTimeAsync(500)

    const saveCall = invokeMock.mock.calls.find(
      ([command]) => command === "save_project_conversations",
    )
    expect(saveCall).toBeDefined()
    expect(saveCall?.[1]).toMatchObject({
      path: "/tmp/project-a",
      data: {
        version: 1,
        conversations: [
          {
            ...fileConversation,
            messages: [...fileConversation.messages, newMessage],
            updatedAt: expect.any(String),
          },
        ],
        activeConversationId: "file-conv",
      },
    })
    const savedData = (saveCall?.[1] as {
      data: {
        version: number
        conversations: Conversation[]
        activeConversationId: string | null
      }
    }).data

    resetChatStore()
    invokeMock.mockResolvedValueOnce(savedData)
    useChatStore.getState().loadProjectConversations("/tmp/project-a")
    await useChatStore.getState().loadProjectConversationsFromStorage("/tmp/project-a")

    expect(useChatStore.getState().conversations[0].messages).toEqual([
      fileConversation.messages[0],
      newMessage,
    ])
  })

  it("keeps local conversations when Tauri project storage is unavailable", async () => {
    const localConversation = makeConversation("local-conv", "Browser fallback")
    invokeMock.mockRejectedValueOnce(new Error("Tauri unavailable"))
    useChatStore.setState({
      activeProjectId: "/tmp/project-a",
      conversations: [localConversation],
      activeConversationId: "local-conv",
      isLoading: false,
      projectConversations: {
        "/tmp/project-a": [localConversation],
      },
    })

    await expect(
      useChatStore.getState().loadProjectConversationsFromStorage("/tmp/project-a"),
    ).resolves.toBeUndefined()

    expect(useChatStore.getState().conversations).toEqual([localConversation])
    expect(useChatStore.getState().activeConversationId).toBe("local-conv")
  })

  it("does not overwrite conversations when a message is added during disk read", async () => {
    // Simulate existing localStorage data so loadProjectConversations has
    // conversations to populate (mimics a project that was opened before)
    const localConversation = makeConversation("local-conv", "Previous session")
    useChatStore.setState({
      projectConversations: {
        "/tmp/project-a": [localConversation],
      },
    })

    const fileConversation = makeConversation("file-conv", "Loaded from project")
    const newMessage = {
      id: "concurrent-msg",
      role: "user" as const,
      content: "Message added during load",
      artifacts: [],
      toolCalls: null,
      timestamp: "2026-01-01T00:00:01Z",
    }
    invokeMock.mockResolvedValueOnce({
      version: 1,
      conversations: [fileConversation],
      activeConversationId: "file-conv",
    })

    useChatStore.getState().loadProjectConversations("/tmp/project-a")
    const loadPromise =
      useChatStore.getState().loadProjectConversationsFromStorage("/tmp/project-a")
    // Add message concurrently — before the disk read completes
    useChatStore.getState().addMessage(newMessage, "local-conv")

    await loadPromise

    // The concurrently added message must be preserved, not overwritten by disk data
    const localConv = useChatStore
      .getState()
      .conversations.find((c) => c.id === "local-conv")
    expect(localConv).toBeDefined()
    expect(localConv!.messages).toContainEqual(newMessage)
  })

  it("calls error handler when auto-save invoke rejects", async () => {
    vi.useFakeTimers()
    const errorHandler = vi.fn()
    setChatAutoSaveErrorHandler(errorHandler)

    useChatStore.setState({
      activeProjectId: "/tmp/project-a",
      conversations: [makeConversation("c1", "test")],
      activeConversationId: "c1",
      isLoading: false,
      projectConversations: {},
    })

    invokeMock.mockRejectedValueOnce(new Error("Disk full"))

    useChatStore.getState().addMessage({
      id: "msg-err",
      role: "user",
      content: "trigger save failure",
      artifacts: [],
      toolCalls: null,
      timestamp: "2026-01-01T00:00:00Z",
    }, "c1")

    await vi.advanceTimersByTimeAsync(500)

    expect(errorHandler).toHaveBeenCalledWith("Auto-save failed: Disk full")
  })
})
