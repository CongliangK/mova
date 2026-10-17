import { describe, expect, it, vi } from "vitest"
import { MockPiAgentRuntime } from "../services/ai/runtimes/mock-piagent-runtime"
import { dispatchPiAgentRuntimeEvent } from "../services/ai/runtimes/piagent-message-adapter"
import { adaptMovaToolsToPiAgentTools, executePiAgentToolCall } from "../services/ai/runtimes/piagent-tool-adapter"
import { skillRegistry } from "../services/ai/skills/skill-registry"
import type { ChatMessage, LLMChunk, LLMProvider, LLMRequest, Skill, ToolDefinition } from "../types/ai"

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

const allowedToolNames = ["echo_tool", "fail_tool"]
const forbiddenGenericToolNames = ["read", "write", "edit", "bash", "shell", "run_command"]

function createTools(): ToolDefinition[] {
  return [
    {
      name: "echo_tool",
      description: "Echo a value",
      parameters: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
      },
      execute: vi.fn(async (args) => ({ success: true, data: args })),
    },
    {
      name: "fail_tool",
      description: "Return a visible failure",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: vi.fn(async () => ({ success: false, error: "planned failure" })),
    },
  ]
}

function createSkill(tools = createTools()): Skill {
  return {
    name: "piagent-contract",
    description: "piAgent contract test skill",
    systemPrompt: "Use only Mova tools.",
    buildContext: () => "contract context",
    tools,
  }
}

describe("piAgent event adapter", () => {
  it("dispatches text, tool, complete, and error events to Mova callbacks", () => {
    const onTextDelta = vi.fn()
    const onToolCalls = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()
    const message: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "done",
      artifacts: [],
      toolCalls: null,
      timestamp: "2026-06-12T00:00:00.000Z",
    }

    dispatchPiAgentRuntimeEvent({ type: "message_update", delta: "hi" }, { onTextDelta, onToolCalls, onComplete, onError })
    dispatchPiAgentRuntimeEvent(
      {
        type: "tool_execution_end",
        calls: [{ id: "call-1", name: "echo_tool", arguments: {}, result: { success: true } }],
      },
      { onTextDelta, onToolCalls, onComplete, onError },
    )
    dispatchPiAgentRuntimeEvent({ type: "agent_end", message }, { onTextDelta, onToolCalls, onComplete, onError })
    dispatchPiAgentRuntimeEvent({ type: "agent_error", error: "boom" }, { onTextDelta, onToolCalls, onComplete, onError })

    expect(onTextDelta).toHaveBeenCalledWith("hi")
    expect(onToolCalls).toHaveBeenCalledWith([
      { id: "call-1", name: "echo_tool", arguments: {}, result: { success: true } },
    ])
    expect(onComplete).toHaveBeenCalledWith(message)
    expect(onError).toHaveBeenCalledWith("boom")
  })
})

describe("piAgent tool adapter", () => {
  it("exposes only active Mova skill tools and no generic coding tools", () => {
    const adaptedTools = adaptMovaToolsToPiAgentTools(createTools())
    const names = adaptedTools.map((tool) => tool.name)

    expect(names).toEqual(allowedToolNames)
    expect(names).not.toEqual(expect.arrayContaining(forbiddenGenericToolNames))
    expect(adaptedTools[0]).toMatchObject({
      name: "echo_tool",
      label: "echo_tool",
      description: "Echo a value",
      parameters: { type: "object" },
    })
  })

  it("does not expose generic coding tools from any registered Mova skill", () => {
    const adaptedToolNames = skillRegistry
      .getAvailableSkills()
      .flatMap((skill) => adaptMovaToolsToPiAgentTools(skill.tools).map((tool) => tool.name))

    expect(adaptedToolNames.length).toBeGreaterThan(0)
    expect(adaptedToolNames).not.toEqual(expect.arrayContaining(forbiddenGenericToolNames))
  })

  it("maps successful, returned-failure, thrown, unknown, and malformed tool calls to visible results", async () => {
    const throwingTool: ToolDefinition = {
      name: "throw_tool",
      description: "Throw",
      parameters: { type: "object", properties: {} },
      execute: vi.fn(async () => {
        throw new Error("thrown failure")
      }),
    }
    const adaptedTools = adaptMovaToolsToPiAgentTools([...createTools(), throwingTool])

    await expect(
      executePiAgentToolCall(adaptedTools, {
        id: "call-ok",
        name: "echo_tool",
        arguments: '{"value":"ok"}',
      }),
    ).resolves.toMatchObject({ result: { success: true, data: { value: "ok" } } })

    await expect(
      executePiAgentToolCall(adaptedTools, {
        id: "call-fail",
        name: "fail_tool",
        arguments: {},
      }),
    ).resolves.toMatchObject({ result: { success: false, error: "planned failure" } })

    await expect(
      executePiAgentToolCall(adaptedTools, {
        id: "call-throw",
        name: "throw_tool",
        arguments: {},
      }),
    ).resolves.toMatchObject({ result: { success: false, error: "thrown failure" } })

    await expect(
      executePiAgentToolCall(adaptedTools, {
        id: "call-unknown",
        name: "unknown_tool",
        arguments: {},
      }),
    ).resolves.toMatchObject({ result: { success: false, error: "Unknown tool: unknown_tool" } })

    await expect(
      executePiAgentToolCall(adaptedTools, {
        id: "call-bad-json",
        name: "echo_tool",
        arguments: "not-json",
      }),
    ).resolves.toMatchObject({ result: { success: false } })
  })
})

describe("MockPiAgentRuntime", () => {
  it("streams text and completes through the piAgent-compatible contract", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "text", delta: "Mock " },
        { type: "text", delta: "reply" },
        { type: "done" },
      ],
    ])
    const runtime = new MockPiAgentRuntime()
    const deltas: string[] = []
    let completedContent = ""

    runtime.configure({ provider, skill: createSkill() })
    await runtime.processUserMessage("hello", {
      onTextDelta: (delta) => deltas.push(delta),
      onToolCalls: () => {},
      onComplete: (message) => {
        completedContent = message.content
      },
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(deltas).toEqual(["Mock ", "reply"])
    expect(completedContent).toBe("Mock reply")
    expect(provider.requests[0].tools?.map((tool) => tool.name)).toEqual(allowedToolNames)
  })

  it("executes Mova skill tools and sends follow-up tool-result messages", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "tool_call", id: "call-1", name: "echo_tool", arguments: '{"value":"ok"}' },
        { type: "done" },
      ],
      [
        { type: "text", delta: "Done" },
        { type: "done" },
      ],
    ])
    const runtime = new MockPiAgentRuntime()
    const toolCalls: string[] = []
    let finalToolCallCount = 0

    runtime.configure({ provider, skill: createSkill() })
    await runtime.processUserMessage("run tool", {
      onTextDelta: () => {},
      onToolCalls: (calls) => toolCalls.push(...calls.map((call) => call.name)),
      onComplete: (message) => {
        finalToolCallCount = message.toolCalls?.length ?? 0
      },
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(toolCalls).toEqual(["echo_tool"])
    expect(finalToolCallCount).toBe(1)
    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[1].messages.some((message) => message.role === "tool" && message.toolCallId === "call-1")).toBe(true)
  })

  it("maps returned tool failures to visible runtime tool results", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "tool_call", id: "call-fail", name: "fail_tool", arguments: "{}" },
        { type: "done" },
      ],
      [
        { type: "text", delta: "Recovered" },
        { type: "done" },
      ],
    ])
    const runtime = new MockPiAgentRuntime()
    const toolErrors: string[] = []

    runtime.configure({ provider, skill: createSkill() })
    await runtime.processUserMessage("run failing tool", {
      onTextDelta: () => {},
      onToolCalls: (calls) => {
        toolErrors.push(...calls.map((call) => call.result?.error ?? ""))
      },
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(toolErrors).toEqual(["planned failure"])
  })

  it("maps malformed args and unknown tools to failed tool results without executing missing tools", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "tool_call", id: "call-bad", name: "echo_tool", arguments: "not-json" },
        { type: "tool_call", id: "call-unknown", name: "unknown_tool", arguments: "{}" },
        { type: "done" },
      ],
      [{ type: "done" }],
    ])
    const runtime = new MockPiAgentRuntime()
    const failedErrors: string[] = []

    runtime.configure({ provider, skill: createSkill() })
    await runtime.processUserMessage("bad tools", {
      onTextDelta: () => {},
      onToolCalls: (calls) => {
        failedErrors.push(...calls.map((call) => call.result?.error ?? ""))
      },
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(failedErrors).toEqual([
      expect.stringContaining("Malformed JSON tool arguments"),
      "Unknown tool: unknown_tool",
    ])
  })

  it("completes a done-only stream without hanging", async () => {
    const provider = new ScriptedProvider([[{ type: "done" }]])
    const runtime = new MockPiAgentRuntime()
    const onComplete = vi.fn()

    runtime.configure({ provider, skill: createSkill() })
    await runtime.processUserMessage("done only", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete,
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ content: "", toolCalls: null }))
    expect(provider.requests).toHaveLength(1)
  })

  it("reports an error after the max tool rounds instead of falsely completing", async () => {
    const repeatedToolCalls = Array.from({ length: 8 }, (_, index) => [
      { type: "tool_call" as const, id: `call-${index}`, name: "echo_tool", arguments: '{"value":"again"}' },
      { type: "done" as const },
    ])
    const provider = new ScriptedProvider(repeatedToolCalls)
    const runtime = new MockPiAgentRuntime()
    const toolBatchSizes: number[] = []
    const onComplete = vi.fn()
    const onError = vi.fn()

    runtime.configure({ provider, skill: createSkill() })
    await runtime.processUserMessage("loop tools", {
      onTextDelta: () => {},
      onToolCalls: (calls) => toolBatchSizes.push(calls.length),
      onComplete,
      onError,
    })

    expect(provider.requests).toHaveLength(5)
    expect(toolBatchSizes).toEqual([1, 1, 1, 1, 1])
    expect(onComplete).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      "Maximum tool rounds reached before a final assistant response.",
      expect.arrayContaining([expect.objectContaining({ name: "echo_tool" })]),
    )
  })

  it("uses configured conversation history as the boundary between selected chats", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "text", delta: "first reply" },
        { type: "done" },
      ],
      [
        { type: "text", delta: "second reply" },
        { type: "done" },
      ],
      [
        { type: "text", delta: "third reply" },
        { type: "done" },
      ],
    ])
    const runtime = new MockPiAgentRuntime()

    runtime.configure({ provider, skill: createSkill(), conversationKey: "chat-a", conversationHistory: [] })
    await runtime.processUserMessage("first prompt", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })
    runtime.configure({ provider, skill: createSkill(), conversationKey: "chat-b", conversationHistory: [] })
    await runtime.processUserMessage("second prompt", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })
    runtime.configure({
      provider,
      skill: createSkill(),
      conversationKey: "chat-a",
      conversationHistory: [
        { role: "user", content: "first prompt" },
        { role: "assistant", content: "first reply" },
      ],
    })
    await runtime.processUserMessage("third prompt", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(provider.requests[1].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "second prompt" },
    ])
    expect(provider.requests[2].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "first prompt" },
      { role: "assistant", content: "first reply" },
      { role: "user", content: "third prompt" },
    ])
  })

  it("reports provider errors via onError", async () => {
    const provider: LLMProvider = {
      async *streamChat() {
        const chunks: LLMChunk[] = []
        for (const chunk of chunks) {
          yield chunk
        }
        throw new Error("provider exploded")
      },
      validateConnection: async () => true,
      listModels: async () => [],
    }
    const runtime = new MockPiAgentRuntime()
    const onError = vi.fn()

    runtime.configure({ provider, skill: createSkill() })
    await runtime.processUserMessage("explode", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError,
    })

    expect(onError).toHaveBeenCalledWith("provider exploded", null)
  })
})
