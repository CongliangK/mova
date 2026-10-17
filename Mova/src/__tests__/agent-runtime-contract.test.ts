import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAgentRuntime } from "../services/ai/runtimes/agent-runtime-factory"
import { AGENT_RUNTIME_FLAG_KEY, getConfiguredAgentRuntimeMode, resolveAgentRuntimeMode } from "../services/ai/runtimes/agent-runtime-config"
import { LazyPiAgentCoreRuntime, resetLazyPiAgentCoreRuntimeLoaderForTests } from "../services/ai/runtimes/lazy-piagent-core-runtime"
import { LegacyAgentRuntime } from "../services/ai/runtimes/legacy-agent-runtime"
import { resetPiAgentCoreRuntimeLoaderForTests } from "../services/ai/runtimes/piagent-core-runtime"
import type { AgentRuntimeCallbacks, MovaAgentRuntime } from "../services/ai/runtimes/agent-runtime"
import type { ChatMessage, LLMChunk, LLMProvider, LLMRequest, LLMStreamOptions, Skill } from "../types/ai"

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

function createDeferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

class LegacyAbortNoopProvider implements LLMProvider {
  requests: LLMRequest[] = []
  readonly continueFirstStream = createDeferred()

  async *streamChat(request: LLMRequest): AsyncGenerator<LLMChunk> {
    this.requests.push(structuredClone(request))
    if (this.requests.length === 1) {
      yield { type: "text", delta: "partial " }
      await this.continueFirstStream.promise
      yield { type: "text", delta: "continued" }
      yield { type: "done" }
      return
    }

    yield { type: "text", delta: "next ok" }
    yield { type: "done" }
  }

  async validateConnection() {
    return true
  }

  async listModels() {
    return []
  }
}

class ThrowingThenRecoveringProvider implements LLMProvider {
  requests: LLMRequest[] = []

  async *streamChat(request: LLMRequest): AsyncGenerator<LLMChunk> {
    this.requests.push(structuredClone(request))
    if (this.requests.length === 1) {
      yield { type: "text", delta: "partial" }
      throw new Error("stream broke")
    }

    yield { type: "text", delta: "recovered" }
    yield { type: "done" }
  }

  async validateConnection() {
    return true
  }

  async listModels() {
    return []
  }
}

class BlockingThenRecoveringProvider implements LLMProvider {
  requests: LLMRequest[] = []
  signals: (AbortSignal | undefined)[] = []
  observedAbort = false

  async *streamChat(request: LLMRequest, options?: LLMStreamOptions): AsyncGenerator<LLMChunk> {
    this.requests.push(structuredClone(request))
    this.signals.push(options?.signal)
    if (this.requests.length === 1) {
      options?.signal?.addEventListener("abort", () => {
        this.observedAbort = true
      }, { once: true })
      yield { type: "text", delta: "partial" }
      await new Promise<never>(() => {})
      return
    }

    yield { type: "text", delta: "after reset" }
    yield { type: "done" }
  }

  async validateConnection() {
    return true
  }

  async listModels() {
    return []
  }
}

function createContractSkill(): Skill {
  return {
    name: "runtime-contract",
    description: "Contract test skill",
    systemPrompt: "Follow the runtime contract.",
    buildContext: () => "contract context",
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

function createEventRecorder(events: string[], completedMessages: ChatMessage[], errors: string[]): AgentRuntimeCallbacks {
  return {
    onTextDelta: (delta) => events.push(`text:${delta}`),
    onToolCalls: (calls) => events.push(`tools:${calls.map((call) => call.name).join(",")}`),
    onComplete: (message) => {
      events.push(`complete:${message.content}`)
      completedMessages.push(message)
    },
    onError: (error) => {
      events.push(`error:${error}`)
      errors.push(error)
    },
  }
}

const runtimeFactories: [string, () => MovaAgentRuntime][] = [
  ["legacy", () => new LegacyAgentRuntime()],
  ["piagent-core", () => new LazyPiAgentCoreRuntime()],
]

describe("AI runtime mode contract", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    resetLazyPiAgentCoreRuntimeLoaderForTests()
    resetPiAgentCoreRuntimeLoaderForTests()
  })

  it("keeps piAgent core as the default runtime while allowing explicit legacy opt-out", () => {
    const factorySource = readFileSync("src/services/ai/runtimes/agent-runtime-factory.ts", "utf8")
    const eagerRuntimeImports = factorySource.match(/^import\s+(?!type).*from\s+["'][^"']+["']/gm) ?? []

    expect(eagerRuntimeImports).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/@earendil-works\/pi-agent-core|["']\.\/piagent-core-runtime["']/)]),
    )
    expect(getConfiguredAgentRuntimeMode()).toBe("piagent-core")
    expect(createAgentRuntime()).toBeInstanceOf(LazyPiAgentCoreRuntime)

    vi.stubEnv("VITE_MOVA_AGENT_RUNTIME", "legacy")
    expect(getConfiguredAgentRuntimeMode()).toBe("legacy")
    expect(createAgentRuntime()).toBeInstanceOf(LegacyAgentRuntime)

    localStorage.setItem(AGENT_RUNTIME_FLAG_KEY, "piagent-core")
    expect(getConfiguredAgentRuntimeMode()).toBe("piagent-core")
    expect(createAgentRuntime()).toBeInstanceOf(LazyPiAgentCoreRuntime)
  })

  it("falls back to legacy for unsupported or future runtime names until they are explicitly implemented", () => {
    expect(resolveAgentRuntimeMode("piagent-core")).toBe("piagent-core")
    expect(resolveAgentRuntimeMode("piagent")).toBe("legacy")
    expect(resolveAgentRuntimeMode("PIAGENT-MOCK")).toBe("legacy")
  })
})

describe.each(runtimeFactories)("%s runtime callbacks contract", (_name, createRuntime) => {
  it("emits text deltas, tool-call batches, follow-up text, and completion in order", async () => {
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
    const runtime = createRuntime()
    const events: string[] = []
    const completedMessages: ChatMessage[] = []
    const errors: string[] = []

    runtime.configure({ provider, skill: createContractSkill() })
    await runtime.processUserMessage("run tool", createEventRecorder(events, completedMessages, errors))

    expect(events).toEqual(["text:before ", "tools:echo_tool", "text:after", "complete:after"])
    expect(errors).toEqual([])
    expect(completedMessages[0]).toMatchObject({
      role: "assistant",
      content: "after",
      toolCalls: [{ id: "call-1", name: "echo_tool", result: { success: true, data: { value: "ok" } } }],
    })
    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "assistant", content: "before ", toolCalls: [expect.objectContaining({ id: "call-1" })] }),
        expect.objectContaining({ role: "tool", toolCallId: "call-1", content: expect.stringContaining('"success":true') }),
      ]),
    )
  })

  it("routes provider failures to onError without calling onComplete", async () => {
    const runtime = createRuntime()
    const events: string[] = []
    const completedMessages: ChatMessage[] = []
    const errors: string[] = []

    runtime.configure({ provider: new ThrowingProvider(), skill: createContractSkill() })
    await runtime.processUserMessage("explode", createEventRecorder(events, completedMessages, errors))

    expect(events).toEqual(["text:partial", "error:stream broke"])
    expect(completedMessages).toEqual([])
    expect(errors).toEqual(["stream broke"])
  })

  it("does not carry failed turns into later conversation history", async () => {
    const provider = new ThrowingThenRecoveringProvider()
    const runtime = createRuntime()
    const events: string[] = []
    const completedMessages: ChatMessage[] = []
    const errors: string[] = []

    runtime.configure({ provider, skill: createContractSkill() })
    await runtime.processUserMessage("explode", createEventRecorder(events, completedMessages, errors))
    await runtime.processUserMessage("recover", createEventRecorder(events, completedMessages, errors))

    expect(events).toEqual(["text:partial", "error:stream broke", "text:recovered", "complete:recovered"])
    expect(errors).toEqual(["stream broke"])
    expect(completedMessages.map((message) => message.content)).toEqual(["recovered"])
    expect(provider.requests[1].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "recover" },
    ])
  })

  it("carries successful multi-turn conversation history into the next request", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "text", delta: "first reply" },
        { type: "done" },
      ],
      [
        { type: "text", delta: "second reply" },
        { type: "done" },
      ],
    ])
    const runtime = createRuntime()

    runtime.configure({ provider, skill: createContractSkill() })
    await runtime.processUserMessage("first prompt", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })
    await runtime.processUserMessage("second prompt", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[1].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "first prompt" },
      { role: "assistant", content: "first reply" },
      { role: "user", content: "second prompt" },
    ])
  })

  it("reset clears conversation history before the next configured request", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "text", delta: "first reply" },
        { type: "done" },
      ],
      [
        { type: "text", delta: "second reply" },
        { type: "done" },
      ],
    ])
    const runtime = createRuntime()

    runtime.configure({ provider, skill: createContractSkill() })
    await runtime.processUserMessage("first prompt", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })

    runtime.reset()
    runtime.configure({ provider, skill: createContractSkill() })
    await runtime.processUserMessage("second prompt", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[1].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "second prompt" },
    ])
  })
})

describe("legacy runtime abort contract", () => {
  it("documents abort as a no-op that lets the active turn finish and keeps later turns usable", async () => {
    const provider = new LegacyAbortNoopProvider()
    const runtime = new LegacyAgentRuntime()
    const events: string[] = []
    const completedMessages: ChatMessage[] = []
    const errors: string[] = []

    runtime.configure({ provider, skill: createContractSkill() })
    const firstTurn = runtime.processUserMessage("first prompt", createEventRecorder(events, completedMessages, errors))

    await vi.waitFor(() => expect(events).toContain("text:partial "))
    runtime.abort()
    provider.continueFirstStream.resolve()
    await firstTurn

    await runtime.processUserMessage("second prompt", createEventRecorder(events, completedMessages, errors))

    expect(events).toEqual(["text:partial ", "text:continued", "complete:partial continued", "text:next ok", "complete:next ok"])
    expect(completedMessages.map((message) => message.content)).toEqual(["partial continued", "next ok"])
    expect(errors).toEqual([])
    expect(provider.requests[1].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "first prompt" },
      { role: "assistant", content: "partial continued" },
      { role: "user", content: "second prompt" },
    ])
  })
})

describe("piagent-core runtime stability contracts", () => {
  beforeEach(() => {
    resetLazyPiAgentCoreRuntimeLoaderForTests()
    resetPiAgentCoreRuntimeLoaderForTests()
  })

  it("handles provider mid-stream errors, reports onError, and recovers after reset", async () => {
    const provider = new ThrowingThenRecoveringProvider()
    const runtime = new LazyPiAgentCoreRuntime()
    const events: string[] = []
    const completedMessages: ChatMessage[] = []
    const errors: string[] = []

    runtime.configure({ provider, skill: createContractSkill() })
    await runtime.processUserMessage("explode", createEventRecorder(events, completedMessages, errors))

    expect(events).toEqual(["text:partial", "error:stream broke"])
    expect(completedMessages).toEqual([])
    expect(errors).toEqual(["stream broke"])

    runtime.reset()
    runtime.configure({ provider, skill: createContractSkill() })
    await runtime.processUserMessage("fresh prompt", createEventRecorder(events, completedMessages, errors))

    expect(provider.requests[1].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "fresh prompt" },
    ])
    expect(completedMessages.map((message) => message.content)).toEqual(["recovered"])
    expect(errors).toEqual(["stream broke"])
  })

  it("aborts an in-flight provider stream, passes AbortSignal to the provider, and never completes the aborted turn", async () => {
    const provider = new BlockingThenRecoveringProvider()
    const runtime = new LazyPiAgentCoreRuntime()
    const events: string[] = []
    const completedMessages: ChatMessage[] = []
    const errors: string[] = []

    runtime.configure({ provider, skill: createContractSkill() })
    const activeTurn = runtime.processUserMessage("abort me", createEventRecorder(events, completedMessages, errors))

    await vi.waitFor(() => expect(events).toContain("text:partial"))
    expect(provider.signals[0]).toBeInstanceOf(AbortSignal)
    runtime.abort()
    await activeTurn

    expect(provider.signals[0]?.aborted).toBe(true)
    expect(provider.observedAbort).toBe(true)
    expect(events).toEqual(["text:partial", "error:Operation aborted"])
    expect(completedMessages).toEqual([])
    expect(errors).toEqual(["Operation aborted"])
  })

  it("keeps the next request history clean after abort even without reset", async () => {
    const provider = new BlockingThenRecoveringProvider()
    const runtime = new LazyPiAgentCoreRuntime()
    const events: string[] = []
    const completedMessages: ChatMessage[] = []
    const errors: string[] = []

    runtime.configure({ provider, skill: createContractSkill() })
    const activeTurn = runtime.processUserMessage("abort me", createEventRecorder(events, completedMessages, errors))

    await vi.waitFor(() => expect(events).toContain("text:partial"))
    runtime.abort()
    await activeTurn

    await runtime.processUserMessage("fresh prompt", createEventRecorder(events, completedMessages, errors))

    expect(provider.requests[1].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "fresh prompt" },
    ])
    expect(completedMessages.map((message) => message.content)).toEqual(["after reset"])
    expect(errors).toEqual(["Operation aborted"])
  })

  it("resets cleanly after abort so the next request starts with a fresh history", async () => {
    const provider = new BlockingThenRecoveringProvider()
    const runtime = new LazyPiAgentCoreRuntime()
    const events: string[] = []
    const completedMessages: ChatMessage[] = []
    const errors: string[] = []

    runtime.configure({ provider, skill: createContractSkill() })
    const activeTurn = runtime.processUserMessage("abort me", createEventRecorder(events, completedMessages, errors))

    await vi.waitFor(() => expect(events).toContain("text:partial"))
    runtime.abort()
    await activeTurn

    runtime.reset()
    runtime.configure({ provider, skill: createContractSkill() })
    await runtime.processUserMessage("fresh prompt", createEventRecorder(events, completedMessages, errors))

    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[1].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "fresh prompt" },
    ])
    expect(completedMessages.map((message) => message.content)).toEqual(["after reset"])
    expect(errors).toEqual(["Operation aborted"])
  })
})
