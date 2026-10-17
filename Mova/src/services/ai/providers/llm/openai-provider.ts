import type { LLMProvider, LLMRequest, LLMChunk, LLMMessage, LLMStreamOptions } from "../../../../types/ai"
import { readStreamChunk, throwIfAborted, toolsToOpenAIFormat } from "./llm-provider"


function serializeOpenAIMessages(messages: LLMMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: message.role,
        content: message.content,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function" as const,
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        })),
      }
    }

    if (message.role === "tool") {
      return {
        role: message.role,
        content: message.content,
        tool_call_id: message.toolCallId,
      }
    }

    return { role: message.role, content: message.content }
  })
}

interface OpenAIConfig {
  apiKey: string
  model: string
  baseUrl?: string
  temperature?: number
  topP?: number
  maxTokens?: number
  frequencyPenalty?: number
  providerName?: string
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`
}

export class OpenAIProvider implements LLMProvider {
  private config: OpenAIConfig

  constructor(config: OpenAIConfig) {
    this.config = config
  }

  async *streamChat(request: LLMRequest, options?: LLMStreamOptions): AsyncGenerator<LLMChunk> {
    const baseUrl = this.config.baseUrl || "https://api.openai.com/v1"
    const url = joinUrl(baseUrl, "/chat/completions")

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: serializeOpenAIMessages(request.messages),
      stream: true,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = toolsToOpenAIFormat(request.tools)
      body.tool_choice = "auto"
    }

    const maxTokens = request.maxTokens ?? this.config.maxTokens
    if (maxTokens) {
      body.max_tokens = maxTokens
    }
    if (this.config.topP !== undefined) {
      body.top_p = this.config.topP
    }
    if (this.config.frequencyPenalty !== undefined) {
      body.frequency_penalty = this.config.frequencyPenalty
    }

    throwIfAborted(options?.signal)
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${this.config.providerName || "OpenAI"} API error (${response.status}): ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""
    const toolCallBuffers = new Map<number, { id: string; name: string; arguments: string }>()

    try {
      while (true) {
        const chunk = await readStreamChunk(reader, options?.signal)
        if (chunk === "aborted") {
          await reader.cancel().catch(() => {})
          throwIfAborted(options?.signal)
          break
        }
        const { done, value } = chunk
        if (done) break

        throwIfAborted(options?.signal)
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === "data: [DONE]") continue
          if (!trimmed.startsWith("data: ")) continue

          try {
            const json = JSON.parse(trimmed.slice(6))
            const delta = json.choices?.[0]?.delta
            if (!delta) continue

            // Text content
            if (delta.content) {
              yield { type: "text", delta: delta.content }
            }

            // Tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0
                if (!toolCallBuffers.has(idx)) {
                  toolCallBuffers.set(idx, {
                    id: tc.id || "",
                    name: "",
                    arguments: "",
                  })
                }
                const buf = toolCallBuffers.get(idx)!
                if (tc.id) buf.id = tc.id
                if (tc.function?.name) buf.name = tc.function.name
                if (tc.function?.arguments) buf.arguments += tc.function.arguments
              }
            }
          } catch (err) {
            console.warn("[OpenAI] Skipping malformed SSE chunk:", trimmed, err)
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Yield accumulated tool calls
    for (const [, tc] of toolCallBuffers) {
      yield { type: "tool_call", id: tc.id, name: tc.name, arguments: tc.arguments }
    }

    yield { type: "done" }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const baseUrl = this.config.baseUrl || "https://api.openai.com/v1"
      const response = await fetch(joinUrl(baseUrl, "/models"), {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      })
      return response.ok
    } catch (err) {
      console.error(`[${this.config.providerName || "OpenAI"}] Connection validation failed:`, err)
      return false
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const baseUrl = this.config.baseUrl || "https://api.openai.com/v1"
      const response = await fetch(joinUrl(baseUrl, "/models"), {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      })
      if (!response.ok) return []
      const json = await response.json()
      return (json.data as { id: string }[]).map((m) => m.id).sort()
    } catch (err) {
      console.error(`[${this.config.providerName || "OpenAI"}] Failed to list models:`, err)
      return []
    }
  }
}
