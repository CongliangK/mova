import { describe, it, expect, beforeEach } from "vitest"
import { useChatStore } from "../../src/stores/chat-store"
import type { ToolCallResult } from "../../src/types/ai"

describe("chat-store-fix", () => {
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

  it("partialize returns correct projectConversations map with current project data", () => {
    useChatStore.getState().loadProjectConversations("proj-x")
    useChatStore.getState().createConversation()
    useChatStore.getState().addMessage({
      id: "msg-1",
      role: "user",
      content: "Test message in proj-x",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    const state = useChatStore.getState()
    const partialized = useChatStore.persist.getOptions().partialize?.(state)

    expect(partialized).toBeDefined()
    expect((partialized as { projectConversations: Record<string, unknown[]> }).projectConversations["proj-x"]).toHaveLength(1)
  })

  it("multi-project switching preserves data: A(3) → B(2) → C(1) → A(verify 3)", () => {
    // Project A with 3 conversations
    useChatStore.getState().loadProjectConversations("project-A")
    for (let i = 0; i < 3; i++) {
      useChatStore.getState().createConversation()
      useChatStore.getState().addMessage({
        id: `msg-a-${i}`,
        role: "user",
        content: `Message ${i} in A`,
        artifacts: [],
        toolCalls: null,
        timestamp: new Date().toISOString(),
      })
    }
    expect(useChatStore.getState().conversations).toHaveLength(3)

    useChatStore.getState().saveCurrentConversations()

    // Project B with 2 conversations
    useChatStore.getState().loadProjectConversations("project-B")
    for (let i = 0; i < 2; i++) {
      useChatStore.getState().createConversation()
      useChatStore.getState().addMessage({
        id: `msg-b-${i}`,
        role: "user",
        content: `Message ${i} in B`,
        artifacts: [],
        toolCalls: null,
        timestamp: new Date().toISOString(),
      })
    }
    expect(useChatStore.getState().conversations).toHaveLength(2)

    useChatStore.getState().saveCurrentConversations()

    // Project C with 1 conversation
    useChatStore.getState().loadProjectConversations("project-C")
    useChatStore.getState().createConversation()
    useChatStore.getState().addMessage({
      id: "msg-c-0",
      role: "user",
      content: "Message 0 in C",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })
    expect(useChatStore.getState().conversations).toHaveLength(1)

    useChatStore.getState().saveCurrentConversations()

    // Switch back to A and verify 3 conversations are preserved
    // createConversation prepends, so oldest is at index 2
    useChatStore.getState().loadProjectConversations("project-A")
    expect(useChatStore.getState().conversations).toHaveLength(3)
    expect(useChatStore.getState().conversations[2].messages[0].content).toBe("Message 0 in A")
    expect(useChatStore.getState().conversations[1].messages[0].content).toBe("Message 1 in A")
    expect(useChatStore.getState().conversations[0].messages[0].content).toBe("Message 2 in A")
  })

  it("empty conversations do not cause errors", () => {
    useChatStore.getState().loadProjectConversations("proj-empty")
    // Switch away without creating any conversation
    useChatStore.getState().saveCurrentConversations()

    // Load another project
    useChatStore.getState().loadProjectConversations("proj-other")
    useChatStore.getState().createConversation()

    // Load back empty project
    useChatStore.getState().loadProjectConversations("proj-empty")
    expect(useChatStore.getState().conversations).toHaveLength(0)

    // Switch away again - should not throw
    useChatStore.getState().saveCurrentConversations()
    expect(useChatStore.getState().activeProjectId).toBeNull()
  })

  it("saveCurrentConversations does not throw when activeProjectId is null", () => {
    // Ensure no project is active
    expect(useChatStore.getState().activeProjectId).toBeNull()

    // Should not throw
    expect(() => useChatStore.getState().saveCurrentConversations()).not.toThrow()

    // State should remain clean
    expect(useChatStore.getState().activeProjectId).toBeNull()
    expect(useChatStore.getState().conversations).toHaveLength(0)
  })

  it("localStorage has only one key 'mova-chat-v3'", async () => {
    useChatStore.getState().loadProjectConversations("proj-y")
    useChatStore.getState().createConversation()
    useChatStore.getState().addMessage({
      id: "msg-y",
      role: "user",
      content: "Y message",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    useChatStore.getState().saveCurrentConversations()
    await new Promise((resolve) => setTimeout(resolve, 50))

    const keys = Object.keys(localStorage)
    const chatKeys = keys.filter((k) => k.includes("mova-chat"))
    expect(chatKeys).toHaveLength(1)
    expect(chatKeys[0]).toBe("mova-chat-v3")

    const stored = localStorage.getItem("mova-chat-v3")
    expect(stored).toBeDefined()
    expect(() => JSON.parse(stored ?? "")).not.toThrow()
    const parsed = JSON.parse(stored ?? "{}")
    expect(parsed.version).toBe(3)
  })

  it("updateMessage preserves toolCalls when updating content only", () => {
    useChatStore.getState().loadProjectConversations("proj-tc")
    useChatStore.getState().createConversation()

    const toolCalls: ToolCallResult[] = [
      {
        id: "tc-1",
        name: "generate_image",
        arguments: { prompt: "a warrior" },
        result: { success: true, data: { imageUrl: "/assets/test.png" } },
      },
    ]

    // Add assistant message with toolCalls
    const msgId = "msg-tc-1"
    useChatStore.getState().addMessage({
      id: msgId,
      role: "assistant",
      content: "",
      artifacts: [],
      toolCalls,
      timestamp: new Date().toISOString(),
    })

    // Update content only (simulating onTextDelta or onComplete)
    useChatStore.getState().updateMessage(msgId, { content: "Here is your warrior image." })

    // Verify toolCalls is preserved
    const conv = useChatStore.getState().conversations.find((c) =>
      c.messages.some((m) => m.id === msgId)
    )
    const msg = conv?.messages.find((m) => m.id === msgId)
    expect(msg).toBeDefined()
    expect(msg!.content).toBe("Here is your warrior image.")
    expect(msg!.toolCalls).toHaveLength(1)
    expect(msg!.toolCalls![0].name).toBe("generate_image")
  })

  it("updateMessage can set toolCalls on a message that previously had null", () => {
    useChatStore.getState().loadProjectConversations("proj-tc-set")
    useChatStore.getState().createConversation()

    const msgId = "msg-tc-set"
    useChatStore.getState().addMessage({
      id: msgId,
      role: "assistant",
      content: "",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    const toolCalls: ToolCallResult[] = [
      {
        id: "tc-2",
        name: "resize_image",
        arguments: { width: 64, height: 64 },
        result: { success: true },
      },
    ]

    // Update with toolCalls (simulating onComplete)
    useChatStore.getState().updateMessage(msgId, {
      content: "Done resizing.",
      toolCalls,
    })

    const conv = useChatStore.getState().conversations.find((c) =>
      c.messages.some((m) => m.id === msgId)
    )
    const msg = conv?.messages.find((m) => m.id === msgId)
    expect(msg!.toolCalls).toHaveLength(1)
    expect(msg!.toolCalls![0].name).toBe("resize_image")
    expect(msg!.content).toBe("Done resizing.")
  })
})
