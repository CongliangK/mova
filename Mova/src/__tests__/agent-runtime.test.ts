import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAgentRuntime } from "../services/ai/runtimes/agent-runtime-factory"
import { AGENT_RUNTIME_FLAG_KEY, getConfiguredAgentRuntimeMode, resolveAgentRuntimeMode } from "../services/ai/runtimes/agent-runtime-config"
import { LazyPiAgentCoreRuntime } from "../services/ai/runtimes/lazy-piagent-core-runtime"
import { LegacyAgentRuntime } from "../services/ai/runtimes/legacy-agent-runtime"
import type { LLMChunk, LLMProvider, LLMRequest, Skill } from "../types/ai"

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

const runtimeSkill: Skill = {
  name: "runtime-test",
  description: "Runtime test skill",
  systemPrompt: "You are testing runtime boundaries.",
  buildContext: () => "runtime context",
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

describe("agent runtime config and factory", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
  })

  it("defaults unset runtime flags to pi-agent core and invalid flags to legacy", () => {
    expect(resolveAgentRuntimeMode(undefined)).toBe("piagent-core")
    expect(resolveAgentRuntimeMode(null)).toBe("piagent-core")
    expect(resolveAgentRuntimeMode("")).toBe("piagent-core")
    expect(resolveAgentRuntimeMode("bad-runtime")).toBe("legacy")
    expect(resolveAgentRuntimeMode("piagent-mock")).toBe("legacy")
    expect(resolveAgentRuntimeMode("piagent-core")).toBe("piagent-core")
  })

  it("uses pi-agent core when no feature flag is configured", () => {
    expect(getConfiguredAgentRuntimeMode()).toBe("piagent-core")
    expect(createAgentRuntime()).toBeInstanceOf(LazyPiAgentCoreRuntime)
  })

  it("allows explicit legacy opt-out for testers", () => {
    localStorage.setItem(AGENT_RUNTIME_FLAG_KEY, "legacy")

    expect(getConfiguredAgentRuntimeMode()).toBe("legacy")
    expect(createAgentRuntime()).toBeInstanceOf(LegacyAgentRuntime)
  })

  it("falls back to legacy for invalid internal flag values", () => {
    localStorage.setItem(AGENT_RUNTIME_FLAG_KEY, "piagent")

    expect(getConfiguredAgentRuntimeMode()).toBe("legacy")
    expect(createAgentRuntime()).toBeInstanceOf(LegacyAgentRuntime)
  })

  it("supports the env flag but lets localStorage override env for testers", () => {
    vi.stubEnv("VITE_MOVA_AGENT_RUNTIME", "piagent-core")
    expect(getConfiguredAgentRuntimeMode()).toBe("piagent-core")

    localStorage.setItem(AGENT_RUNTIME_FLAG_KEY, "legacy")
    expect(getConfiguredAgentRuntimeMode()).toBe("legacy")

    localStorage.setItem(AGENT_RUNTIME_FLAG_KEY, "invalid")
    expect(getConfiguredAgentRuntimeMode()).toBe("legacy")
  })
})

describe("LegacyAgentRuntime", () => {
  it("preserves legacy text streaming and completion callbacks", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "text", delta: "Hel" },
        { type: "text", delta: "lo" },
        { type: "done" },
      ],
    ])
    const runtime = new LegacyAgentRuntime()
    const deltas: string[] = []
    let completedContent = ""

    runtime.configure({ provider, skill: runtimeSkill })
    await runtime.processUserMessage("say hello", {
      onTextDelta: (delta) => deltas.push(delta),
      onToolCalls: () => {},
      onComplete: (message) => {
        completedContent = message.content
      },
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(deltas).toEqual(["Hel", "lo"])
    expect(completedContent).toBe("Hello")
    expect(provider.requests[0].messages[0]).toMatchObject({
      role: "system",
      content: "You are testing runtime boundaries.\n\nruntime context",
    })
  })

  it("preserves legacy tool-call follow-up message ordering", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "tool_call", id: "call-1", name: "echo_tool", arguments: '{"value":"ok"}' },
        { type: "done" },
      ],
      [
        { type: "text", delta: "Finished" },
        { type: "done" },
      ],
    ])
    const runtime = new LegacyAgentRuntime()
    const toolResults: string[] = []

    runtime.configure({ provider, skill: runtimeSkill })
    await runtime.processUserMessage("run tool", {
      onTextDelta: () => {},
      onToolCalls: (calls) => toolResults.push(...calls.map((call) => call.name)),
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })

    expect(toolResults).toEqual(["echo_tool"])
    expect(provider.requests).toHaveLength(2)
    const followUpMessages = provider.requests[1].messages
    const assistantToolMessageIndex = followUpMessages.findIndex(
      (message) => message.role === "assistant" && message.toolCalls?.[0]?.id === "call-1",
    )
    const toolMessageIndex = followUpMessages.findIndex(
      (message) => message.role === "tool" && message.toolCallId === "call-1",
    )

    expect(assistantToolMessageIndex).toBeGreaterThan(-1)
    expect(toolMessageIndex).toBeGreaterThan(assistantToolMessageIndex)
    expect(followUpMessages[toolMessageIndex].content).toContain('"success":true')
  })
})
