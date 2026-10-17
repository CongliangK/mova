import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAgentRuntime } from "../services/ai/runtimes/agent-runtime-factory"
import {
  LazyPiAgentCoreRuntime,
  resetLazyPiAgentCoreRuntimeLoaderForTests,
  setLazyPiAgentCoreRuntimeLoaderForTests,
} from "../services/ai/runtimes/lazy-piagent-core-runtime"
import {
  PiAgentCoreRuntime,
  resetPiAgentCoreRuntimeLoaderForTests,
  setPiAgentCoreRuntimeLoaderForTests,
} from "../services/ai/runtimes/piagent-core-runtime"
import type { AgentEvent } from "@earendil-works/pi-agent-core"
import type { LLMChunk, LLMProvider, LLMRequest, Skill, ToolCallResult, ToolDefinition } from "../types/ai"

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

function createSkill(tools: ToolDefinition[] = []): Skill {
  return {
    name: "piagent-core-test",
    description: "pi-agent-core test skill",
    systemPrompt: "Use Mova tools only.",
    buildContext: () => "runtime context",
    tools,
  }
}

describe("PiAgentCoreRuntime", () => {
  beforeEach(() => {
    resetLazyPiAgentCoreRuntimeLoaderForTests()
    resetPiAgentCoreRuntimeLoaderForTests()
  })

  afterEach(() => {
    resetLazyPiAgentCoreRuntimeLoaderForTests()
    resetPiAgentCoreRuntimeLoaderForTests()
  })

  it("keeps the factory wrapper lazy and imports pi-agent-core only when piagent-core runs", async () => {
    const loadRuntime = vi.fn(async () => ({ PiAgentCoreRuntime }) as typeof import("../services/ai/runtimes/piagent-core-runtime"))
    const loadCore = vi.fn(async () => import("@earendil-works/pi-agent-core"))
    setLazyPiAgentCoreRuntimeLoaderForTests(loadRuntime)
    setPiAgentCoreRuntimeLoaderForTests(loadCore)

    expect(createAgentRuntime("legacy")).not.toBeInstanceOf(LazyPiAgentCoreRuntime)
    expect(loadRuntime).not.toHaveBeenCalled()
    expect(loadCore).not.toHaveBeenCalled()

    const runtime = createAgentRuntime("piagent-core")
    expect(runtime).toBeInstanceOf(LazyPiAgentCoreRuntime)
    expect(loadRuntime).not.toHaveBeenCalled()
    expect(loadCore).not.toHaveBeenCalled()

    runtime.configure({ provider: new ScriptedProvider([[{ type: "done" }]]), skill: createSkill() })
    await runtime.processUserMessage("hello", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(loadRuntime).toHaveBeenCalledOnce()
    expect(loadCore).toHaveBeenCalledOnce()
  })

  it("keeps lazy wrapper abort/reset as no-op before load and forwards after load", async () => {
    const configure = vi.fn()
    const processUserMessage = vi.fn(async () => {})
    const abort = vi.fn()
    const reset = vi.fn()

    class FakeRuntime {
      configure = configure
      processUserMessage = processUserMessage
      abort = abort
      reset = reset
    }

    const loadRuntime = vi.fn(async () => ({ PiAgentCoreRuntime: FakeRuntime }) as unknown as typeof import("../services/ai/runtimes/piagent-core-runtime"))
    setLazyPiAgentCoreRuntimeLoaderForTests(loadRuntime)

    const runtime = new LazyPiAgentCoreRuntime()
    runtime.abort()
    runtime.reset()
    expect(loadRuntime).not.toHaveBeenCalled()
    expect(abort).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()

    const config = { provider: new ScriptedProvider([[{ type: "done" }]]), skill: createSkill() }
    runtime.configure(config)
    await runtime.processUserMessage("hello", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: () => {},
    })
    runtime.abort()
    runtime.reset()

    expect(loadRuntime).toHaveBeenCalledOnce()
    expect(configure).toHaveBeenCalledWith(config)
    expect(processUserMessage).toHaveBeenCalledOnce()
    expect(abort).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledOnce()
  })

  it("streams normal text through the pi-agent-core Agent adapter", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "text", delta: "Core " },
        { type: "text", delta: "reply" },
        { type: "done" },
      ],
    ])
    const runtime = new PiAgentCoreRuntime()
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

    expect(deltas).toEqual(["Core ", "reply"])
    expect(completedContent).toBe("Core reply")
    expect(provider.requests[0].messages[0]).toMatchObject({
      role: "system",
      content: "Use Mova tools only.\n\nruntime context",
    })
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
    const runtime = new PiAgentCoreRuntime()

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

  it("allows active Mova skill tools and blocks generic coding tool names", async () => {
    const echoExecute = vi.fn(async (args: Record<string, unknown>) => ({ success: true, data: args }))
    const bashExecute = vi.fn(async () => ({ success: true }))
    const applyPatchExecute = vi.fn(async () => ({ success: true }))
    const tools: ToolDefinition[] = [
      {
        name: "echo_tool",
        description: "Echo a value",
        parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
        execute: echoExecute,
      },
      {
        name: "bash",
        description: "Forbidden generic shell tool",
        parameters: { type: "object", properties: {} },
        execute: bashExecute,
      },
      {
        name: "apply_patch",
        description: "Forbidden generic patch tool",
        parameters: { type: "object", properties: {} },
        execute: applyPatchExecute,
      },
    ]
    const provider = new ScriptedProvider([
      [
        { type: "tool_call", id: "call-ok", name: "echo_tool", arguments: '{"value":"ok"}' },
        { type: "tool_call", id: "call-blocked", name: "bash", arguments: "{}" },
        { type: "tool_call", id: "call-patch", name: "apply_patch", arguments: "{}" },
        { type: "done" },
      ],
      [{ type: "text", delta: "done" }, { type: "done" }],
    ])
    const runtime = new PiAgentCoreRuntime()
    const toolResults: string[] = []

    runtime.configure({ provider, skill: createSkill(tools) })
    await runtime.processUserMessage("run tools", {
      onTextDelta: () => {},
      onToolCalls: (calls) => toolResults.push(...calls.map((call) => `${call.name}:${call.result?.success}:${call.result?.error ?? ""}`)),
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(provider.requests[0].tools?.map((tool) => tool.name)).toEqual(["echo_tool"])
    expect(echoExecute).toHaveBeenCalledWith({ value: "ok" })
    expect(bashExecute).not.toHaveBeenCalled()
    expect(applyPatchExecute).not.toHaveBeenCalled()
    expect(toolResults).toEqual([
      "echo_tool:true:",
      expect.stringContaining("bash:false:Tool bash not found"),
      expect.stringContaining("apply_patch:false:Tool apply_patch not found"),
    ])
  })

  it("wires reset and abort to the underlying pi-agent-core Agent", async () => {
    const abort = vi.fn()
    const reset = vi.fn()
    let subscribed: ((event: AgentEvent) => void) | null = null

    class FakeAgent {
      subscribe(listener: (event: AgentEvent) => void) {
        subscribed = listener
        return vi.fn()
      }

      async prompt() {
        subscribed?.({ type: "agent_end", messages: [{ role: "assistant", content: [{ type: "text", text: "ok" }], api: "mova", provider: "mova", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() }] })
      }

      abort = abort
      reset = reset
    }

    setPiAgentCoreRuntimeLoaderForTests(async () => ({ Agent: FakeAgent }) as unknown as typeof import("@earendil-works/pi-agent-core"))
    const runtime = new PiAgentCoreRuntime()
    runtime.configure({ provider: new ScriptedProvider([[{ type: "done" }]]), skill: createSkill() })

    await runtime.processUserMessage("hello", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })
    runtime.abort()
    runtime.reset()

    expect(abort).toHaveBeenCalledTimes(2)
    expect(reset).toHaveBeenCalledOnce()
  })

  it("forwards accumulated tool calls through onError when the agent ends with an error stop reason", async () => {
    let subscribed: ((event: AgentEvent) => void) | null = null

    class FakeAgent {
      subscribe(listener: (event: AgentEvent) => void) {
        subscribed = listener
        return vi.fn()
      }

      async prompt() {
        subscribed?.({
          type: "tool_execution_end",
          toolCallId: "call-sprite",
          toolName: "generate_sprite_sheet",
          isError: false,
          result: { content: "ok", details: { success: true, data: { imagePath: "/project/sprites/sheet.png" } } },
        } as AgentEvent)
        subscribed?.({
          type: "agent_end",
          messages: [{
            role: "assistant",
            content: [{ type: "text", text: "partial" }],
            api: "mova",
            provider: "mova",
            model: "test",
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: "error",
            errorMessage: "provider API failed mid-generation",
            timestamp: Date.now(),
          }],
        })
      }

      abort = vi.fn()
      reset = vi.fn()
    }

    setPiAgentCoreRuntimeLoaderForTests(async () => ({ Agent: FakeAgent }) as unknown as typeof import("@earendil-works/pi-agent-core"))
    const runtime = new PiAgentCoreRuntime()
    runtime.configure({ provider: new ScriptedProvider([[{ type: "done" }]]), skill: createSkill() })

    const errorMessage: string[] = []
    const errorToolCalls: ToolCallResult[][] = []

    await runtime.processUserMessage("generate sprite", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {
        throw new Error("should not complete on error")
      },
      onError: (error, toolCalls) => {
        errorMessage.push(error)
        if (toolCalls) errorToolCalls.push(toolCalls)
      },
    })

    expect(errorMessage).toEqual(["provider API failed mid-generation"])
    expect(errorToolCalls).toHaveLength(1)
    expect(errorToolCalls[0]).toHaveLength(1)
    expect(errorToolCalls[0][0]).toMatchObject({
      id: "call-sprite",
      name: "generate_sprite_sheet",
      result: { success: true, data: { imagePath: "/project/sprites/sheet.png" } },
    })
  })
})
