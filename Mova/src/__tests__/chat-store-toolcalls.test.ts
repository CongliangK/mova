import { describe, it, expect, beforeEach } from "vitest"
import { useChatStore } from "../../src/stores/chat-store"
import type { ToolCallResult } from "../../src/types/ai"

describe("chat-store toolCalls preservation", () => {
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

  const makeToolCalls = (): ToolCallResult[] => [
    {
      id: "tc-1",
      name: "generate_image",
      arguments: { prompt: "a warrior" },
      result: { success: true, data: { imageUrl: "/assets/test.png" } },
    },
  ]

  it("preserves toolCalls across multiple sequential content-only updates", () => {
    useChatStore.getState().loadProjectConversations("proj-seq")
    useChatStore.getState().createConversation()

    const msgId = "msg-seq"
    const toolCalls = makeToolCalls()

    useChatStore.getState().addMessage({
      id: msgId,
      role: "assistant",
      content: "",
      artifacts: [],
      toolCalls,
      timestamp: new Date().toISOString(),
    })

    // Multiple sequential content updates
    useChatStore.getState().updateMessage(msgId, { content: "Step 1" })
    useChatStore.getState().updateMessage(msgId, { content: "Step 2" })
    useChatStore.getState().updateMessage(msgId, { content: "Final result" })

    const conv = useChatStore.getState().conversations[0]
    const msg = conv.messages.find((m) => m.id === msgId)!
    expect(msg.content).toBe("Final result")
    expect(msg.toolCalls).toHaveLength(1)
    expect(msg.toolCalls![0].name).toBe("generate_image")
  })

  it("preserves toolCalls when updating artifacts field", () => {
    useChatStore.getState().loadProjectConversations("proj-art")
    useChatStore.getState().createConversation()

    const msgId = "msg-art"
    useChatStore.getState().addMessage({
      id: msgId,
      role: "assistant",
      content: "",
      artifacts: [],
      toolCalls: makeToolCalls(),
      timestamp: new Date().toISOString(),
    })

    // Update only artifacts
    useChatStore.getState().updateMessage(msgId, {
      artifacts: [{ type: "image", id: "art-1", label: "Generated Image" }],
    })

    const conv = useChatStore.getState().conversations[0]
    const msg = conv.messages.find((m) => m.id === msgId)!
    expect(msg.artifacts).toHaveLength(1)
    expect(msg.artifacts[0].label).toBe("Generated Image")
    expect(msg.toolCalls).toHaveLength(1)
    expect(msg.toolCalls![0].name).toBe("generate_image")
  })

  it("does not affect toolCalls on other messages in the same conversation", () => {
    useChatStore.getState().loadProjectConversations("proj-other-msg")
    useChatStore.getState().createConversation()

    // Add a user message (no toolCalls)
    useChatStore.getState().addMessage({
      id: "msg-user",
      role: "user",
      content: "Generate a character",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    // Add an assistant message with toolCalls
    useChatStore.getState().addMessage({
      id: "msg-assistant",
      role: "assistant",
      content: "",
      artifacts: [],
      toolCalls: makeToolCalls(),
      timestamp: new Date().toISOString(),
    })

    // Update the user message content
    useChatStore.getState().updateMessage("msg-user", {
      content: "Generate a warrior character",
    })

    const conv = useChatStore.getState().conversations[0]
    const userMsg = conv.messages.find((m) => m.id === "msg-user")!
    const asstMsg = conv.messages.find((m) => m.id === "msg-assistant")!

    expect(userMsg.toolCalls).toBeNull()
    expect(asstMsg.toolCalls).toHaveLength(1)
    expect(asstMsg.toolCalls![0].name).toBe("generate_image")
  })

  it("preserves toolCalls when updateMessage is called with empty content", () => {
    useChatStore.getState().loadProjectConversations("proj-empty-update")
    useChatStore.getState().createConversation()

    const msgId = "msg-empty-upd"
    useChatStore.getState().addMessage({
      id: msgId,
      role: "assistant",
      content: "initial",
      artifacts: [],
      toolCalls: makeToolCalls(),
      timestamp: new Date().toISOString(),
    })

    // Update with empty content (simulating streaming clear + replace)
    useChatStore.getState().updateMessage(msgId, { content: "" })
    useChatStore.getState().updateMessage(msgId, { content: "new content" })

    const msg = useChatStore.getState().conversations[0].messages[0]
    expect(msg.content).toBe("new content")
    expect(msg.toolCalls).toHaveLength(1)
  })

  it("preserves multiple toolCalls on the same message", () => {
    useChatStore.getState().loadProjectConversations("proj-multi-tc")
    useChatStore.getState().createConversation()

    const msgId = "msg-multi-tc"
    const multiToolCalls: ToolCallResult[] = [
      {
        id: "tc-a",
        name: "generate_image",
        arguments: { prompt: "front view" },
        result: { success: true },
      },
      {
        id: "tc-b",
        name: "generate_image",
        arguments: { prompt: "side view" },
        result: { success: true },
      },
      {
        id: "tc-c",
        name: "resize_image",
        arguments: { width: 64, height: 64 },
        result: { success: true },
      },
    ]

    useChatStore.getState().addMessage({
      id: msgId,
      role: "assistant",
      content: "",
      artifacts: [],
      toolCalls: multiToolCalls,
      timestamp: new Date().toISOString(),
    })

    // Update content
    useChatStore.getState().updateMessage(msgId, { content: "Generated all views." })

    const msg = useChatStore.getState().conversations[0].messages[0]
    expect(msg.toolCalls).toHaveLength(3)
    expect(msg.toolCalls![0].id).toBe("tc-a")
    expect(msg.toolCalls![1].id).toBe("tc-b")
    expect(msg.toolCalls![2].id).toBe("tc-c")
    expect(msg.content).toBe("Generated all views.")
  })

  it("handles updateMessage when no conversation is active (no-op)", () => {
    useChatStore.getState().loadProjectConversations("proj-noop")
    useChatStore.getState().createConversation()

    // Save and clear active state
    useChatStore.getState().saveCurrentConversations()

    // updateMessage should be a no-op when no active conversation
    expect(() => {
      useChatStore.getState().updateMessage("some-msg", { content: "test" })
    }).not.toThrow()

    expect(useChatStore.getState().conversations).toHaveLength(0)
  })

  it("preserves null toolCalls when updating user message content", () => {
    useChatStore.getState().loadProjectConversations("proj-null-tc")
    useChatStore.getState().createConversation()

    const msgId = "msg-null-tc"
    useChatStore.getState().addMessage({
      id: msgId,
      role: "user",
      content: "hi",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    useChatStore.getState().updateMessage(msgId, { content: "hello there" })

    const msg = useChatStore.getState().conversations[0].messages[0]
    expect(msg.content).toBe("hello there")
    expect(msg.toolCalls).toBeNull()
  })

  it("preserves toolCalls across project switches", () => {
    // Setup project A with a message that has toolCalls
    useChatStore.getState().loadProjectConversations("proj-A")
    useChatStore.getState().createConversation()
    const msgId = "msg-switch"
    useChatStore.getState().addMessage({
      id: msgId,
      role: "assistant",
      content: "initial",
      artifacts: [],
      toolCalls: makeToolCalls(),
      timestamp: new Date().toISOString(),
    })
    useChatStore.getState().saveCurrentConversations()

    // Switch to project B and back
    useChatStore.getState().loadProjectConversations("proj-B")
    useChatStore.getState().createConversation()
    useChatStore.getState().saveCurrentConversations()

    // Back to A
    useChatStore.getState().loadProjectConversations("proj-A")
    const msg = useChatStore.getState().conversations[0].messages[0]
    expect(msg.toolCalls).toHaveLength(1)
    expect(msg.toolCalls![0].name).toBe("generate_image")
  })
})
