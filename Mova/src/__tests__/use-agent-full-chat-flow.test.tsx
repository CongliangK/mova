import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAgent } from "../hooks/use-agent"
import { resetLazyPiAgentCoreRuntimeLoaderForTests } from "../services/ai/runtimes/lazy-piagent-core-runtime"
import { resetPiAgentCoreRuntimeLoaderForTests } from "../services/ai/runtimes/piagent-core-runtime"
import { skillRegistry } from "../services/ai/skills/skill-registry"
import { useChatStore } from "../stores/chat-store"
import { useSettingsStore } from "../stores/settings-store"
import type { ChatMessage, LLMChunk, LLMConfig, LLMProvider, LLMRequest, Skill } from "../types/ai"

const providerState = vi.hoisted(() => ({
  provider: null as LLMProvider | null,
  error: null as string | null,
}))

vi.mock("../services/ai/providers/llm/provider-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ai/providers/llm/provider-registry")>()
  return {
    ...actual,
    createLlmProvider: vi.fn(() => ({ provider: providerState.provider, error: providerState.error })),
  }
})

class ScriptedProvider implements LLMProvider {
  requests: LLMRequest[] = []
  private readonly scripts: LLMChunk[][]

  constructor(scripts: LLMChunk[][]) {
    this.scripts = scripts
  }

  async *streamChat(request: LLMRequest): AsyncGenerator<LLMChunk> {
    this.requests.push(structuredClone(request))
    const script = this.scripts[this.requests.length - 1] ?? [{ type: "done" }]
    for (const chunk of script) {
      yield chunk
    }
  }

  async validateConnection() {
    return true
  }

  async listModels() {
    return []
  }
}

class ThrowingProvider implements LLMProvider {
  async *streamChat(): AsyncGenerator<LLMChunk> {
    yield { type: "text", delta: "partial" }
    throw new Error("stream broke")
  }

  async validateConnection() {
    return true
  }

  async listModels() {
    return []
  }
}

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

const CHAT_FLOW_SKILL_NAME = "chat-flow-test"

function createChatSkill(): Skill {
  return {
    name: CHAT_FLOW_SKILL_NAME,
    description: "Chat flow integration skill",
    systemPrompt: "Follow the chat flow contract.",
    buildContext: () => "chat flow context",
    tools: [
      {
        name: "echo_tool",
        description: "Echo a value",
        parameters: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
        },
        execute: async (args) => ({ success: true, data: args }),
      },
    ],
  }
}

function resetStores() {
  localStorage.clear()
  skillRegistry.setActiveSkill(null)
  skillRegistry.unregister(CHAT_FLOW_SKILL_NAME)
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
  providerState.provider = null
  providerState.error = null
  resetLazyPiAgentCoreRuntimeLoaderForTests()
  resetPiAgentCoreRuntimeLoaderForTests()
}

function getMessages(): ChatMessage[] {
  const state = useChatStore.getState()
  const activeConversation = state.conversations.find((conversation) => conversation.id === state.activeConversationId)
  return activeConversation?.messages ?? []
}

describe("useAgent full chat flow with real runtimes", () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    resetStores()
  })

  it.each(["legacy", "piagent-core"] as const)("completes text + tool chat flow in %s runtime", async (mode) => {
    localStorage.setItem("mova.agentRuntime", mode)
    skillRegistry.register(createChatSkill())
    skillRegistry.setActiveSkill(CHAT_FLOW_SKILL_NAME)
    const provider = new ScriptedProvider([
      [
        { type: "text", delta: "before " },
        { type: "tool_call", id: "call-1", name: "echo_tool", arguments: '{"value":"ok"}' },
        { type: "done" },
      ],
      [
        { type: "text", delta: "after" },
        { type: "done" },
      ],
    ])
    providerState.provider = provider
    const { result, unmount } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("run tool")
    })

    const messages = getMessages()
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: "user", content: "run tool" })
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "after",
      toolCalls: [{ id: "call-1", name: "echo_tool", result: { success: true, data: { value: "ok" } } }],
    })
    expect(provider.requests).toHaveLength(2)
    expect(useChatStore.getState().isLoading).toBe(false)

    unmount()
  })

  it.each(["legacy", "piagent-core"] as const)("surfaces provider errors without leaving loading stuck in %s runtime", async (mode) => {
    localStorage.setItem("mova.agentRuntime", mode)
    skillRegistry.register(createChatSkill())
    skillRegistry.setActiveSkill(CHAT_FLOW_SKILL_NAME)
    providerState.provider = new ThrowingProvider()
    const { result, unmount } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("explode")
    })

    const messages = getMessages()
    expect(messages).toHaveLength(2)
    expect(messages[1]?.content).toBe("Error: stream broke")
    expect(useChatStore.getState().isLoading).toBe(false)

    unmount()
  })
})
