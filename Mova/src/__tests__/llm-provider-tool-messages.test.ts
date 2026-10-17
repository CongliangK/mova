import { afterEach, describe, expect, it, vi } from "vitest"
import { AnthropicProvider } from "../../src/services/ai/providers/llm/anthropic-provider"
import { OpenAIProvider } from "../../src/services/ai/providers/llm/openai-provider"
import { OllamaProvider } from "../../src/services/ai/providers/llm/ollama-provider"
import type { LLMProvider, LLMRequest } from "../../src/types/ai"

function emptyStreamResponse() {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

const request: LLMRequest = {
  messages: [
    { role: "system", content: "system" },
    { role: "user", content: "make art" },
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "call-1", name: "generate_image", arguments: '{"prompt":"hero"}' }],
    },
    {
      role: "tool",
      content: '{"success":true}',
      toolCallId: "call-1",
    },
  ],
}

describe("LLM provider tool message serialization", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("serializes OpenAI assistant tool calls and tool results with OpenAI field names", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(emptyStreamResponse())
    const provider = new OpenAIProvider({ apiKey: "test-key", model: "gpt-test" })

    for await (const chunk of provider.streamChat(request)) {
      void chunk
      // drain stream
    }

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    const assistantMessage = body.messages[2]
    const toolMessage = body.messages[3]

    expect(assistantMessage).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "generate_image", arguments: '{"prompt":"hero"}' },
        },
      ],
    })
    expect(toolMessage).toEqual({
      role: "tool",
      content: '{"success":true}',
      tool_call_id: "call-1",
    })
  })

  it("serializes Ollama assistant tool calls and tool results with tool_call_id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(emptyStreamResponse())
    const provider = new OllamaProvider({ model: "llama-test" })

    for await (const chunk of provider.streamChat(request)) {
      void chunk
      // drain stream
    }

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    const assistantMessage = body.messages[2]
    const toolMessage = body.messages[3]

    expect(assistantMessage).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        { function: { name: "generate_image", arguments: { prompt: "hero" } } },
      ],
    })
    expect(toolMessage).toEqual({
      role: "tool",
      content: '{"success":true}',
      tool_call_id: "call-1",
    })
  })

  it.each<[string, LLMProvider]>([
    ["OpenAI", new OpenAIProvider({ apiKey: "test-key", model: "gpt-test" })],
    ["Anthropic", new AnthropicProvider({ apiKey: "test-key", model: "claude-test" })],
    ["Ollama", new OllamaProvider({ model: "llama-test" })],
  ])("passes AbortSignal to %s streaming fetch", async (_name, provider) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(emptyStreamResponse())
    const abortController = new AbortController()

    for await (const chunk of provider.streamChat(request, { signal: abortController.signal })) {
      void chunk
      // drain stream
    }

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(abortController.signal)
  })
})
