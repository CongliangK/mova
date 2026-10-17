import { beforeEach, describe, expect, it } from "vitest"
import { useChatStore } from "../stores/chat-store"

function resetChatStore() {
  useChatStore.getState().saveCurrentConversations()
  useChatStore.setState({
    activeProjectId: null,
    conversations: [],
    activeConversationId: null,
    isLoading: false,
    projectConversations: {},
  })
  localStorage.removeItem("mova-chat-v3")
}

describe("chat-store conversation-scoped updates", () => {
  beforeEach(() => {
    resetChatStore()
  })

  it("updates a message in the specified conversation when another chat is active", () => {
    useChatStore.getState().loadProjectConversations("project-a")
    const originalConversationId = useChatStore.getState().createConversation()
    useChatStore.getState().addMessage({
      id: "assistant-1",
      role: "assistant",
      content: "",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    })

    const activeConversationId = useChatStore.getState().createConversation()
    expect(activeConversationId).not.toBe(originalConversationId)

    useChatStore.getState().updateMessage(
      "assistant-1",
      { content: "Finished in the original chat" },
      originalConversationId,
    )

    const originalConversation = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.id === originalConversationId)
    const activeConversation = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.id === activeConversationId)

    expect(originalConversation?.messages[0]?.content).toBe("Finished in the original chat")
    expect(activeConversation?.messages).toEqual([])
  })
})
