import { describe, it, expect, beforeEach } from "vitest"
import { useChatStore } from "../../src/stores/chat-store"

describe("chat project isolation", () => {
  beforeEach(() => {
    const store = useChatStore.getState()
    store.saveCurrentConversations()
    useChatStore.setState({
      activeProjectId: null,
      conversations: [],
      activeConversationId: null,
      isLoading: false,
      projectConversations: {},
    })
    localStorage.removeItem("mova-chat-v3")
  })

  it("should store conversations separately per project", () => {
    useChatStore.getState().loadProjectConversations("project-a")
    useChatStore.getState().createConversation()
    useChatStore.getState().addMessage({
      id: "msg-1",
      role: "user",
      content: "Hello from project A",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    expect(useChatStore.getState().conversations).toHaveLength(1)
    expect(useChatStore.getState().conversations[0].messages[0].content).toBe("Hello from project A")

    useChatStore.getState().loadProjectConversations("project-b")
    expect(useChatStore.getState().conversations).toHaveLength(0)

    useChatStore.getState().createConversation()
    useChatStore.getState().addMessage({
      id: "msg-2",
      role: "user",
      content: "Hello from project B",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    expect(useChatStore.getState().conversations).toHaveLength(1)
    expect(useChatStore.getState().conversations[0].messages[0].content).toBe("Hello from project B")

    useChatStore.getState().loadProjectConversations("project-a")
    expect(useChatStore.getState().conversations).toHaveLength(1)
    expect(useChatStore.getState().conversations[0].messages[0].content).toBe("Hello from project A")
  })

  it("should persist conversations across project switches", () => {
    useChatStore.getState().loadProjectConversations("project-a")
    useChatStore.getState().createConversation()
    useChatStore.getState().addMessage({
      id: "msg-1",
      role: "user",
      content: "Project A message",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    useChatStore.getState().saveCurrentConversations()
    useChatStore.getState().loadProjectConversations("project-b")
    useChatStore.getState().createConversation()
    useChatStore.getState().addMessage({
      id: "msg-2",
      role: "user",
      content: "Project B message",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    useChatStore.getState().saveCurrentConversations()
    useChatStore.getState().loadProjectConversations("project-a")

    expect(useChatStore.getState().conversations).toHaveLength(1)
    expect(useChatStore.getState().conversations[0].messages[0].content).toBe("Project A message")
  })

  it("should clear state when closing project", () => {
    useChatStore.getState().loadProjectConversations("project-a")
    useChatStore.getState().createConversation()
    useChatStore.getState().addMessage({
      id: "msg-1",
      role: "user",
      content: "Hello",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    useChatStore.getState().saveCurrentConversations()

    expect(useChatStore.getState().conversations).toHaveLength(0)
    expect(useChatStore.getState().activeConversationId).toBeNull()
  })

  it("should migrate v2 global conversations to general space", () => {
    const oldState = {
      conversations: [
        {
          id: "old-conv-1",
          title: "Old Chat",
          messages: [
            {
              id: "msg-old",
              role: "user",
              content: "Legacy message",
              artifacts: [],
              toolCalls: null,
              timestamp: new Date().toISOString(),
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      activeConversationId: "old-conv-1",
      isLoading: false,
    }

    const migrated = useChatStore.persist.getOptions().migrate?.(oldState, 2)

    expect(migrated).toBeDefined()
    const persisted = migrated as unknown as {
      projectConversations: Record<string, unknown[]>
      activeProjectId: string | null
      activeConversationId: string | null
    }
    expect(persisted.projectConversations.general).toHaveLength(1)
    const firstConv = persisted.projectConversations.general[0] as { messages: Array<{ content: string }> }
    expect(firstConv.messages[0].content).toBe("Legacy message")
    expect(persisted.activeProjectId).toBeNull()
  })
})
