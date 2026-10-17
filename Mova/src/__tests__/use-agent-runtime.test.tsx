import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import React from "react"
import { useAgent } from "../hooks/use-agent"
import { createLlmProvider } from "../services/ai/providers/llm/provider-registry"
import { createAgentRuntime } from "../services/ai/runtimes/agent-runtime-factory"
import { useChatStore } from "../stores/chat-store"
import { useSettingsStore } from "../stores/settings-store"
import { skillRegistry } from "../services/ai/skills/skill-registry"
import { ToastContext } from "../components/ui/toast-context"
import type { ToastContextValue } from "../components/ui/toast-context"
import type { AgentRuntimeCallbacks, AgentRuntimeConfig, MovaAgentRuntime } from "../services/ai/runtimes/agent-runtime"
import type { ChatMessage, LLMConfig, LLMProvider } from "../types/ai"

const providerState = vi.hoisted(() => ({
  provider: {} as LLMProvider,
  error: null as string | null,
}))

vi.mock("../services/ai/providers/llm/provider-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ai/providers/llm/provider-registry")>()
  return {
    ...actual,
    createLlmProvider: vi.fn(() => ({ provider: providerState.provider, error: providerState.error })),
  }
})

vi.mock("../services/ai/runtimes/agent-runtime-factory", () => ({
  createAgentRuntime: vi.fn(),
}))

function createConfiguredLlm(): LLMConfig {
  return {
    provider: "openai",
    model: "gpt-test",
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 512,
    frequencyPenalty: 0,
    systemPrompt: null,
  }
}

function createUserMessage(id: string, content: string): ChatMessage {
  return {
    id,
    role: "user",
    content,
    artifacts: [],
    toolCalls: null,
    timestamp: new Date().toISOString(),
  }
}

function createAssistantMessage(content: string, toolCalls: ChatMessage["toolCalls"] = null): ChatMessage {
  return {
    id: "assistant-final",
    role: "assistant",
    content,
    artifacts: [],
    toolCalls,
    timestamp: new Date().toISOString(),
  }
}

function resetStores() {
  localStorage.clear()
  skillRegistry.setActiveSkill(null)
  useChatStore.setState({
    activeProjectId: null,
    conversations: [],
    activeConversationId: null,
    isLoading: false,
    projectConversations: {},
  })
  useSettingsStore.setState({
    llmConfigs: [createConfiguredLlm()],
    activeLlmIndex: 0,
  })
}

function getMessages(): ChatMessage[] {
  const state = useChatStore.getState()
  const activeConversation = state.conversations.find((conversation) => conversation.id === state.activeConversationId)
  return activeConversation?.messages ?? []
}

function getConversationMessages(conversationId: string): ChatMessage[] {
  return useChatStore
    .getState()
    .conversations.find((conversation) => conversation.id === conversationId)
    ?.messages ?? []
}

describe("useAgent runtime integration", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/")
    resetStores()
    providerState.provider = {} as LLMProvider
    providerState.error = null
    vi.mocked(createAgentRuntime).mockReset()
    vi.mocked(createLlmProvider).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.history.pushState({}, "", "/")
  })

  it("does not create a runtime when provider setup fails and leaves loading false", async () => {
    providerState.provider = null as unknown as LLMProvider
    providerState.error = "Provider is not configured"
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("hello")
    })

    const messages = getMessages()
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: "user", content: "hello" })
    expect(messages[1]).toMatchObject({ role: "assistant", content: "Provider is not configured" })
    expect(useChatStore.getState().isLoading).toBe(false)
    expect(createAgentRuntime).not.toHaveBeenCalled()
  })

  it("uses the configured provider path when demo workspace is enabled without the mock flag", async () => {
    window.history.pushState({}, "", "/?demoWorkspace=1")
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onComplete(createAssistantMessage("real provider path complete"))
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("hello")
    })

    expect(createLlmProvider).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai" }))
    expect(createAgentRuntime).toHaveBeenCalledWith("piagent-core")
    expect(runtime.configure).toHaveBeenCalledWith(
      expect.objectContaining({ provider: providerState.provider }) satisfies Partial<AgentRuntimeConfig>,
    )
    expect(getMessages()[1]).toMatchObject({ role: "assistant", content: "real provider path complete" })
  })

  it("selects pi-agent core by default, updates the assistant placeholder while streaming, and clears loading on complete", async () => {
    vi.useFakeTimers()
    let completeStream: (() => void) | null = null
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onTextDelta("Hel")
        await new Promise<void>((resolve) => {
          completeStream = resolve
        })
        callbacks.onTextDelta("lo")
        callbacks.onComplete(createAssistantMessage("Hello"))
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent())

    let sendPromise: Promise<void> | null = null
    await act(async () => {
      sendPromise = result.current.sendMessage("hello")
      await Promise.resolve()
    })

    expect(completeStream).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(getMessages()[1]?.content).toBe("Hel")
    expect(useChatStore.getState().isLoading).toBe(true)

    await act(async () => {
      completeStream?.()
      await sendPromise
    })

    expect(createAgentRuntime).toHaveBeenCalledWith("piagent-core")
    expect(runtime.configure).toHaveBeenCalledWith(
      expect.objectContaining({ provider: providerState.provider }) satisfies Partial<AgentRuntimeConfig>,
    )
    const messages = getMessages()
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({ role: "assistant", content: "Hello", toolCalls: null })
    expect(useChatStore.getState().isLoading).toBe(false)
  })

  it("keeps streaming updates on the originating conversation when the active chat changes before completion", async () => {
    vi.useFakeTimers()
    const runtimeHarness: {
      callbacks?: AgentRuntimeCallbacks
      finish?: () => void
    } = {}
    const toolCalls: ChatMessage["toolCalls"] = [
      { id: "call-1", name: "generate_image", arguments: {}, result: { success: true } },
    ]
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        runtimeHarness.callbacks = callbacks
        await new Promise<void>((resolve) => {
          runtimeHarness.finish = resolve
        })
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent())

    let sendPromise: Promise<void> | null = null
    await act(async () => {
      sendPromise = result.current.sendMessage("generate an image")
      await Promise.resolve()
    })

    const callbacks = runtimeHarness.callbacks
    const resolveRuntime = runtimeHarness.finish
    if (!callbacks || !resolveRuntime) {
      throw new Error("runtime did not start")
    }
    const originalConversationId = useChatStore.getState().activeConversationId
    if (!originalConversationId) {
      throw new Error("sendMessage did not create a conversation")
    }

    const newConversationId = useChatStore.getState().createConversation()

    act(() => {
      callbacks.onToolCalls(toolCalls)
    })
    expect(getConversationMessages(originalConversationId)[1]?.content).toBe("Generating image...")
    expect(getConversationMessages(newConversationId)).toEqual([])

    act(() => {
      callbacks.onTextDelta("Streaming draft")
      vi.advanceTimersByTime(50)
    })
    expect(getConversationMessages(originalConversationId)[1]?.content).toBe("Streaming draft")
    expect(getConversationMessages(newConversationId)).toEqual([])

    await act(async () => {
      callbacks.onComplete(createAssistantMessage("Final answer", toolCalls))
      resolveRuntime()
      await sendPromise
    })

    const originalMessages = getConversationMessages(originalConversationId)
    expect(originalMessages).toHaveLength(2)
    expect(originalMessages[1]).toMatchObject({
      role: "assistant",
      content: "Final answer",
      toolCalls,
    })
    expect(getConversationMessages(newConversationId)).toEqual([])
    expect(useChatStore.getState().activeConversationId).toBe(newConversationId)
    expect(useChatStore.getState().isLoading).toBe(false)
  })

  it("passes only the selected conversation history to the runtime when chats switch", async () => {
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onComplete(createAssistantMessage(`reply to ${text}`))
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("alpha")
    })
    const firstConversationId = useChatStore.getState().activeConversationId
    if (!firstConversationId) throw new Error("first conversation was not created")

    act(() => {
      useChatStore.getState().createConversation()
    })
    const secondConversationId = useChatStore.getState().activeConversationId
    if (!secondConversationId) throw new Error("second conversation was not created")

    await act(async () => {
      await result.current.sendMessage("bravo")
    })
    act(() => {
      useChatStore.getState().setActiveConversation(firstConversationId)
    })
    await act(async () => {
      await result.current.sendMessage("charlie")
    })

    const configure = vi.mocked(runtime.configure)
    expect(configure).toHaveBeenNthCalledWith(1, expect.objectContaining({
      conversationKey: `general:${firstConversationId}`,
      conversationHistory: [],
    }) satisfies Partial<AgentRuntimeConfig>)
    expect(configure).toHaveBeenNthCalledWith(2, expect.objectContaining({
      conversationKey: `general:${secondConversationId}`,
      conversationHistory: [],
    }) satisfies Partial<AgentRuntimeConfig>)
    expect(configure).toHaveBeenNthCalledWith(3, expect.objectContaining({
      conversationKey: `general:${firstConversationId}`,
      conversationHistory: [
        { role: "user", content: "alpha" },
        { role: "assistant", content: "reply to alpha" },
      ],
    }) satisfies Partial<AgentRuntimeConfig>)
  })

  it("preserves prior assistant tool calls and tool results in runtime history", async () => {
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onComplete(createAssistantMessage("follow-up complete"))
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const imagePath = "/project/assets/characters/image-1.png"
    const toolCalls: ChatMessage["toolCalls"] = [
      {
        id: "call-image",
        name: "generate_image",
        arguments: { prompt: "blue mage" },
        result: { success: true, data: { imagePath, imageId: "image-1" } },
      },
      {
        id: "call-character",
        name: "create_character",
        arguments: { name: "Blue Mage", baseImagePath: imagePath },
        result: { success: true, data: { characterId: "character-1", name: "Blue Mage" } },
      },
    ]
    useChatStore.setState({
      activeProjectId: "project-a",
      activeConversationId: "conversation-a",
      conversations: [{
        id: "conversation-a",
        title: "Project A chat",
        messages: [
          createUserMessage("user-1", "make a blue mage"),
          createAssistantMessage("Generated a base image and character.", toolCalls),
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      projectConversations: {},
    })
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("use that character for an idle animation")
    })

    const configure = vi.mocked(runtime.configure)
    const history = configure.mock.calls[0]?.[0].conversationHistory
    expect(history).toEqual([
      { role: "user", content: "make a blue mage" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call-image", name: "generate_image", arguments: JSON.stringify({ prompt: "blue mage" }) },
          {
            id: "call-character",
            name: "create_character",
            arguments: JSON.stringify({ name: "Blue Mage", baseImagePath: imagePath }),
          },
        ],
      },
      {
        role: "tool",
        content: JSON.stringify(toolCalls[0]?.result),
        toolCallId: "call-image",
      },
      {
        role: "tool",
        content: JSON.stringify(toolCalls[1]?.result),
        toolCallId: "call-character",
      },
      {
        role: "assistant",
        content: "Generated a base image and character.",
      },
    ])
    expect(JSON.parse(history?.[2]?.content ?? "{}")).toMatchObject({
      success: true,
      data: { imagePath },
    })
  })

  it("passes only the active project's conversation history to the runtime", async () => {
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onComplete(createAssistantMessage(`reply to ${text}`))
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    useChatStore.setState({
      activeProjectId: "project-a",
      activeConversationId: "conversation-a",
      conversations: [{
        id: "conversation-a",
        title: "Project A chat",
        messages: [
          createUserMessage("a-user", "project A prior"),
          createAssistantMessage("project A answer"),
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      projectConversations: {},
    })
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("ask project A")
    })
    useChatStore.setState({
      activeProjectId: "project-b",
      activeConversationId: "conversation-b",
      conversations: [{
        id: "conversation-b",
        title: "Project B chat",
        messages: [
          createUserMessage("b-user", "project B prior"),
          createAssistantMessage("project B answer"),
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      projectConversations: {},
    })
    await act(async () => {
      await result.current.sendMessage("ask project B")
    })

    const configure = vi.mocked(runtime.configure)
    expect(configure).toHaveBeenNthCalledWith(1, expect.objectContaining({
      conversationKey: "project-a:conversation-a",
      conversationHistory: [
        { role: "user", content: "project A prior" },
        { role: "assistant", content: "project A answer" },
      ],
    }) satisfies Partial<AgentRuntimeConfig>)
    expect(configure).toHaveBeenNthCalledWith(2, expect.objectContaining({
      conversationKey: "project-b:conversation-b",
      conversationHistory: [
        { role: "user", content: "project B prior" },
        { role: "assistant", content: "project B answer" },
      ],
    }) satisfies Partial<AgentRuntimeConfig>)
  })

  it("honors the explicit legacy opt-out runtime flag", async () => {
    localStorage.setItem("mova.agentRuntime", "legacy")
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onComplete(createAssistantMessage("mock complete", [
          { id: "call-1", name: "generate_image", arguments: {}, result: { success: true } },
        ]))
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("hello")
    })

    expect(createAgentRuntime).toHaveBeenCalledWith("legacy")
    expect(getMessages()[1]).toMatchObject({
      content: "mock complete",
      toolCalls: [{ id: "call-1", name: "generate_image", result: { success: true } }],
    })
    expect(useChatStore.getState().isLoading).toBe(false)
  })

  it("resets the cached runtime when the internal runtime flag changes", async () => {
    const firstRuntime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onComplete(createAssistantMessage("legacy complete"))
      }),
    }
    const secondRuntime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onComplete(createAssistantMessage("mock complete"))
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValueOnce(firstRuntime).mockReturnValueOnce(secondRuntime)
    const { result } = renderHook(() => useAgent())

    localStorage.setItem("mova.agentRuntime", "legacy")
    await act(async () => {
      await result.current.sendMessage("first")
    })
    localStorage.setItem("mova.agentRuntime", "piagent-core")
    await act(async () => {
      await result.current.sendMessage("second")
    })

    expect(createAgentRuntime).toHaveBeenNthCalledWith(1, "legacy")
    expect(createAgentRuntime).toHaveBeenNthCalledWith(2, "piagent-core")
    expect(firstRuntime.reset).toHaveBeenCalledOnce()
    expect(secondRuntime.configure).toHaveBeenCalledOnce()
    expect(getMessages().map((message) => message.content)).toEqual([
      "first",
      "legacy complete",
      "second",
      "mock complete",
    ])
  })

  it("maps runtime errors into the assistant placeholder and clears loading", async () => {
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onError("runtime failed")
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("hello")
    })

    const messages = getMessages()
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({ role: "assistant", content: "Error: runtime failed" })
    expect(useChatStore.getState().isLoading).toBe(false)
  })

  it("catches rejected runtimes so loading cannot remain stuck", async () => {
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async () => {
        throw new Error("runtime rejected")
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("hello")
    })

    const messages = getMessages()
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({ role: "assistant", content: "Error: runtime rejected" })
    expect(useChatStore.getState().isLoading).toBe(false)
  })

  it("preserves partial tool call results in the assistant message when the runtime reports an error", async () => {
    const toolCalls: NonNullable<ChatMessage["toolCalls"]> = [
      { id: "call-sprite", name: "generate_sprite_sheet", arguments: { prompt: "mage idle" }, result: { success: true, data: { imagePath: "/project/sprites/mage.png" } } },
      { id: "call-split", name: "split_frames", arguments: { imagePath: "/project/sprites/mage.png" }, result: { success: false, error: "split failed" } },
    ]
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onError("provider API failed", toolCalls)
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("generate mage sprite")
    })

    const messages = getMessages()
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({ role: "assistant", content: "Error: provider API failed" })
    expect(messages[1].toolCalls).toEqual(toolCalls)
    expect(useChatStore.getState().isLoading).toBe(false)
  })

  it("aborts runtime, clears loading, and prevents stale text when project changes mid-stream", async () => {
    vi.useFakeTimers()
    useChatStore.setState({ activeProjectId: "project-a" })

    const runtimeHarness: {
      callbacks?: AgentRuntimeCallbacks
      finish?: () => void
    } = {}
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onTextDelta("Hel")
        runtimeHarness.callbacks = callbacks
        await new Promise<void>((resolve) => {
          runtimeHarness.finish = resolve
        })
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent())

    let sendPromise: Promise<void> | null = null
    await act(async () => {
      sendPromise = result.current.sendMessage("hello")
      await Promise.resolve()
    })

    const callbacks = runtimeHarness.callbacks
    if (!callbacks) throw new Error("runtime did not start")

    act(() => { vi.advanceTimersByTime(50) })
    expect(getMessages()[1]?.content).toBe("Hel")
    expect(useChatStore.getState().isLoading).toBe(true)

    // Switch project while streaming is in progress
    act(() => {
      useChatStore.setState({ activeProjectId: "project-b" })
    })

    // Send a delta that should be detected as stale
    act(() => {
      callbacks.onTextDelta("lo, should not land")
    })

    expect(runtime.abort).toHaveBeenCalled()
    expect(useChatStore.getState().isLoading).toBe(false)

    // Advance timers — stale flush must not update the message
    act(() => { vi.advanceTimersByTime(100) })
    expect(getMessages()[1]?.content).toBe("Hel")

    // Clean up the runtime Promise
    await act(async () => {
      runtimeHarness.finish?.()
      await sendPromise
    })
  })

  it("shows a toast warning when project is switched mid-generation", async () => {
    vi.useFakeTimers()
    useChatStore.setState({ activeProjectId: "project-a" })

    const mockShowToast = vi.fn()
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        ToastContext.Provider,
        { value: { showToast: mockShowToast } satisfies ToastContextValue },
        children,
      )

    const runtimeHarness: {
      callbacks?: AgentRuntimeCallbacks
      finish?: () => void
    } = {}
    const runtime: MovaAgentRuntime = {
      configure: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      processUserMessage: vi.fn(async (_text: string, callbacks: AgentRuntimeCallbacks) => {
        callbacks.onTextDelta("streaming")
        runtimeHarness.callbacks = callbacks
        await new Promise<void>((resolve) => {
          runtimeHarness.finish = resolve
        })
      }),
    }
    vi.mocked(createAgentRuntime).mockReturnValue(runtime)
    const { result } = renderHook(() => useAgent(), { wrapper })

    let sendPromise: Promise<void> | null = null
    await act(async () => {
      sendPromise = result.current.sendMessage("hello")
      await Promise.resolve()
    })

    const callbacks = runtimeHarness.callbacks
    if (!callbacks) throw new Error("runtime did not start")

    // Switch project mid-stream → next delta triggers toast
    act(() => {
      useChatStore.setState({ activeProjectId: "project-b" })
    })
    act(() => {
      callbacks.onTextDelta("stale")
    })

    expect(mockShowToast).toHaveBeenCalledWith(
      "warning",
      "AI response was interrupted because the project was switched.",
    )

    // Clean up
    await act(async () => {
      runtimeHarness.finish?.()
      await sendPromise
    })
  })
})
