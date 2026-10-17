import type { LLMProvider, LLMRequest, LLMChunk, LLMMessage, LLMStreamOptions } from "../../../../types/ai"
import { readStreamChunk, throwIfAborted, toolsToOpenAIFormat } from "./llm-provider"


function parseToolArguments(argumentsJson: string): unknown {
  try {
    return JSON.parse(argumentsJson)
  } catch {
    return argumentsJson
  }
}

function serializeOllamaMessages(messages: LLMMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: message.role,
        content: message.content,
        tool_calls: message.toolCalls.map((toolCall) => ({
          function: {
            name: toolCall.name,
            arguments: parseToolArguments(toolCall.arguments),
          },
        })),
      }
    }

    if (message.role === "tool") {
      return {
        role: message.role,
        content: message.content,
        tool_call_id: message.toolCallId || "",
      }
    }

    return { role: message.role, content: message.content }
  })
}

interface OllamaConfig {
  baseUrl?: string
  model: string
  temperature?: number
}

export class OllamaProvider implements LLMProvider {
  private config: OllamaConfig

  constructor(config: OllamaConfig) {
    this.config = config
  }

  async *streamChat(request: LLMRequest, options?: LLMStreamOptions): AsyncGenerator<LLMChunk> {
    const baseUrl = this.config.baseUrl || "http://localhost:11434"
    const url = `${baseUrl}/api/chat`

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: serializeOllamaMessages(request.messages),
      stream: true,
      options: {
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
      },
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = toolsToOpenAIFormat(request.tools)
    }

    throwIfAborted(options?.signal)
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama API error (${response.status}): ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
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
        const text = decoder.decode(value, { stream: true })
        const lines = text.split("\n").filter((l) => l.trim())

        for (const line of lines) {
          try {
            const json = JSON.parse(line)

            if (json.message?.content) {
              yield { type: "text", delta: json.message.content }
            }

            if (json.message?.tool_calls) {
              for (let i = 0; i < json.message.tool_calls.length; i++) {
                const tc = json.message.tool_calls[i]
                if (!toolCallBuffers.has(i)) {
                  toolCallBuffers.set(i, {
                    id: crypto.randomUUID(),
                    name: tc.function?.name || "",
                    arguments: "",
                  })
                }
                const buf = toolCallBuffers.get(i)!
                if (tc.function?.name) buf.name = tc.function.name
                if (tc.function?.arguments) {
                  buf.arguments += typeof tc.function.arguments === "string"
                    ? tc.function.arguments
                    : JSON.stringify(tc.function.arguments)
                }
              }
            }
          } catch (err) {
            console.warn("[Ollama] Skipping malformed stream chunk:", err instanceof Error ? err.message : err)
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    for (const [, tc] of toolCallBuffers) {
      yield { type: "tool_call", id: tc.id, name: tc.name, arguments: tc.arguments }
    }

    yield { type: "done" }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const baseUrl = this.config.baseUrl || "http://localhost:11434"
      const response = await fetch(`${baseUrl}/api/tags`)
      return response.ok
    } catch (err) {
      console.warn("[Ollama] Connection validation failed:", err instanceof Error ? err.message : err)
      return false
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const baseUrl = this.config.baseUrl || "http://localhost:11434"
      const response = await fetch(`${baseUrl}/api/tags`)
      if (!response.ok) return []
      const json = await response.json()
      return (json.models as { name: string }[]).map((m) => m.name).sort()
    } catch (err) {
      console.warn("[Ollama] Failed to list models:", err instanceof Error ? err.message : err)
      return []
    }
  }
}
