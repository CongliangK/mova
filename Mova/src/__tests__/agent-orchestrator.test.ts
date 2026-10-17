import { describe, it, expect, vi } from "vitest"
import { AgentOrchestrator } from "../../src/services/ai/agent-orchestrator"
import type { LLMProvider, LLMRequest, LLMChunk, Skill } from "../../src/types/ai"

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
  /* eslint-disable require-yield, @typescript-eslint/no-unused-vars */
  async *streamChat(_request: LLMRequest): AsyncGenerator<LLMChunk> {
    throw new Error("provider stream exploded")
  }
  /* eslint-enable require-yield, @typescript-eslint/no-unused-vars */

  async validateConnection() {
    return true
  }

  async listModels() {
    return []
  }
}

const skill: Skill = {
  name: "test",
  description: "test",
  systemPrompt: "You are a test agent.",
  buildContext: () => "context",
  tools: [
    {
      name: "echo_tool",
      description: "Echo",
      parameters: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
      },
      execute: async (args) => ({ success: true, data: args }),
    },
  ],
}

describe("AgentOrchestrator plain text conversation", () => {
  it("streams text deltas, completes, and records conversation history with no tool calls", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "text", delta: "Hello" },
        { type: "text", delta: " " },
        { type: "text", delta: "World" },
        { type: "done" },
      ],
    ])
    const orchestrator = new AgentOrchestrator()
    orchestrator.setProvider(provider)
    orchestrator.setSkill(skill)
    const deltas: string[] = []
    let completedContent = ""
    let completedToolCalls = undefined as unknown
    const onComplete = vi.fn()
    const onError = vi.fn()

    await orchestrator.processUserMessage("say hello", {
      onTextDelta: (delta) => deltas.push(delta),
      onToolCalls: () => {},
      onComplete: (message) => {
        completedContent = message.content
        completedToolCalls = message.toolCalls
        onComplete()
      },
      onError,
    })

    expect(deltas).toEqual(["Hello", " ", "World"])
    expect(completedContent).toBe("Hello World")
    expect(completedToolCalls).toBeNull()
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
    expect(provider.requests).toHaveLength(1)
    // Verify system prompt includes skill context
    const messages = provider.requests[0].messages
    expect(messages[0]).toMatchObject({
      role: "system",
      content: "You are a test agent.\n\ncontext",
    })
    expect(messages[messages.length - 1]).toMatchObject({
      role: "user",
      content: "say hello",
    })
    // Verify conversation history records user + assistant
    const history = orchestrator.getConversationHistory()
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ role: "user", content: "say hello" })
    expect(history[1]).toMatchObject({ role: "assistant", content: "Hello World" })
  })

  it("can replace private history with the selected conversation history", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "text", delta: "first reply" },
        { type: "done" },
      ],
      [
        { type: "text", delta: "selected reply" },
        { type: "done" },
      ],
    ])
    const orchestrator = new AgentOrchestrator()
    orchestrator.setProvider(provider)
    orchestrator.setSkill(skill)

    await orchestrator.processUserMessage("first prompt", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => { throw new Error(error) },
    })
    orchestrator.setConversationHistory([
      { role: "user", content: "selected prior" },
      { role: "assistant", content: "selected answer" },
    ])
    await orchestrator.processUserMessage("next prompt", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => { throw new Error(error) },
    })

    expect(provider.requests[1].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "selected prior" },
      { role: "assistant", content: "selected answer" },
      { role: "user", content: "next prompt" },
    ])
  })

  it("handles a done-only stream (empty response) without hanging", async () => {
    const provider = new ScriptedProvider([[{ type: "done" }]])
    const orchestrator = new AgentOrchestrator()
    orchestrator.setProvider(provider)
    orchestrator.setSkill(skill)
    const onComplete = vi.fn()
    const onError = vi.fn()

    await orchestrator.processUserMessage("ping", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete,
      onError,
    })

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ role: "assistant", content: "", toolCalls: null }),
    )
    expect(onError).not.toHaveBeenCalled()
  })
})

describe("AgentOrchestrator error paths", () => {
  it("calls onError when no provider is configured", async () => {
    const orchestrator = new AgentOrchestrator()
    // Neither setProvider nor setSkill called
    const onError = vi.fn()
    const onComplete = vi.fn()

    await orchestrator.processUserMessage("hello", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete,
      onError,
    })

    expect(onError).toHaveBeenCalledWith(
      "No LLM provider configured. Please set up an API key in Settings.",
    )
    expect(onComplete).not.toHaveBeenCalled()
  })

  it("calls onError when no skill is selected (provider set but no skill)", async () => {
    const provider = new ScriptedProvider([[{ type: "done" }]])
    const orchestrator = new AgentOrchestrator()
    orchestrator.setProvider(provider)
    // No setSkill call
    const onError = vi.fn()
    const onComplete = vi.fn()

    await orchestrator.processUserMessage("hello", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete,
      onError,
    })

    expect(onError).toHaveBeenCalledWith("No active skill selected.")
    expect(onComplete).not.toHaveBeenCalled()
  })

  it("calls onError when the provider stream throws an exception", async () => {
    const provider = new ThrowingProvider()
    const orchestrator = new AgentOrchestrator()
    orchestrator.setProvider(provider)
    orchestrator.setSkill(skill)
    const onError = vi.fn()
    const onComplete = vi.fn()

    await orchestrator.processUserMessage("explode", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete,
      onError,
    })

    expect(onError).toHaveBeenCalledWith("provider stream exploded", null)
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe("AgentOrchestrator tool-call context", () => {
  it("calls onError and reverts history when max tool rounds is exhausted without a final response", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "tool_call", id: "call-1", name: "echo_tool", arguments: '{"value":"r1"}' },
        { type: "done" },
      ],
      [
        { type: "tool_call", id: "call-2", name: "echo_tool", arguments: '{"value":"r2"}' },
        { type: "done" },
      ],
      [
        { type: "tool_call", id: "call-3", name: "echo_tool", arguments: '{"value":"r3"}' },
        { type: "done" },
      ],
      [
        { type: "tool_call", id: "call-4", name: "echo_tool", arguments: '{"value":"r4"}' },
        { type: "done" },
      ],
      [
        { type: "tool_call", id: "call-5", name: "echo_tool", arguments: '{"value":"r5"}' },
        { type: "done" },
      ],
    ])
    const orchestrator = new AgentOrchestrator()
    orchestrator.setProvider(provider)
    orchestrator.setSkill(skill)

    // Seed some prior history to verify it's preserved after revert
    orchestrator.setConversationHistory([
      { role: "user", content: "previous question" },
      { role: "assistant", content: "previous answer" },
    ])
    const onComplete = vi.fn()
    const onError = vi.fn()

    await orchestrator.processUserMessage("trigger infinite tool loop", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete,
      onError,
    })

    expect(onError).toHaveBeenCalledWith(
      "Maximum tool rounds reached before a final assistant response.",
      expect.arrayContaining([
        expect.objectContaining({ id: "call-1", name: "echo_tool", result: expect.objectContaining({ success: true }) }),
        expect.objectContaining({ id: "call-2", name: "echo_tool", result: expect.objectContaining({ success: true }) }),
        expect.objectContaining({ id: "call-3", name: "echo_tool", result: expect.objectContaining({ success: true }) }),
        expect.objectContaining({ id: "call-4", name: "echo_tool", result: expect.objectContaining({ success: true }) }),
        expect.objectContaining({ id: "call-5", name: "echo_tool", result: expect.objectContaining({ success: true }) }),
      ]),
    )
    expect(onComplete).not.toHaveBeenCalled()
    // History should be reverted to the state before this turn (even before the user message)
    const history = orchestrator.getConversationHistory()
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ role: "user", content: "previous question" })
    expect(history[1]).toMatchObject({ role: "assistant", content: "previous answer" })
  })

  it("adds assistant tool-call context before tool-result follow-up messages", async () => {
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
    const orchestrator = new AgentOrchestrator()
    orchestrator.setProvider(provider)
    orchestrator.setSkill(skill)

    await orchestrator.processUserMessage("run tool", {
      onTextDelta: () => {},
      onToolCalls: () => {},
      onComplete: () => {},
      onError: (error) => { throw new Error(error) },
    })

    expect(provider.requests).toHaveLength(2)
    const followUpMessages = provider.requests[1].messages
    const assistantToolMessage = followUpMessages.find(
      (message) => message.role === "assistant" && message.toolCalls?.[0]?.id === "call-1",
    )
    const toolMessage = followUpMessages.find(
      (message) => message.role === "tool" && message.toolCallId === "call-1",
    )

    expect(assistantToolMessage).toMatchObject({
      role: "assistant",
      toolCalls: [{ id: "call-1", name: "echo_tool", arguments: '{"value":"ok"}' }],
    })
    expect(toolMessage?.content).toContain('"success":true')
  })
})
