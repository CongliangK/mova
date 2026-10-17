import type { LLMProvider, LLMRequest, LLMChunk, LLMMessage, LLMStreamOptions } from "../../../../types/ai"
import { readStreamChunk, throwIfAborted } from "./llm-provider"

interface AnthropicConfig {
  apiKey: string
  model: string
  baseUrl?: string
  temperature?: number
  topP?: number
  maxTokens?: number
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`
}

function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson)
    return typeof parsed === "object" && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function serializeAnthropicMessages(messages: LLMMessage[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
        return {
          role: "assistant" as const,
          content: [
            ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
            ...message.toolCalls.map((toolCall) => ({
              type: "tool_use" as const,
              id: toolCall.id,
              name: toolCall.name,
              input: parseToolArguments(toolCall.arguments),
            })),
          ],
        }
      }

      if (message.role === "tool") {
        return {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: message.toolCallId || "",
              content: message.content,
            },
          ],
        }
      }

      return { role: message.role as "user" | "assistant", content: message.content }
    })
}

export class AnthropicProvider implements LLMProvider {
  private config: AnthropicConfig

  constructor(config: AnthropicConfig) {
    this.config = config
  }

  async *streamChat(request: LLMRequest, options?: LLMStreamOptions): AsyncGenerator<LLMChunk> {
    const baseUrl = this.config.baseUrl || "https://api.anthropic.com/v1"
    const system = request.messages.find((message) => message.role === "system")?.content
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: serializeAnthropicMessages(request.messages),
      stream: true,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 2048,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
    }

    if (system) body.system = system
    if (this.config.topP !== undefined) body.top_p = this.config.topP
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }))
    }

    throwIfAborted(options?.signal)
    const response = await fetch(joinUrl(baseUrl, "/messages"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
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
          if (!trimmed.startsWith("data: ")) continue

          try {
            const json = JSON.parse(trimmed.slice(6))
            if (json.type === "content_block_start" && json.content_block?.type === "tool_use") {
              toolCallBuffers.set(json.index ?? toolCallBuffers.size, {
                id: json.content_block.id || crypto.randomUUID(),
                name: json.content_block.name || "",
                arguments: "",
              })
            }

            if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
              yield { type: "text", delta: json.delta.text || "" }
            }

            if (json.type === "content_block_delta" && json.delta?.type === "input_json_delta") {
              const idx = json.index ?? 0
              if (!toolCallBuffers.has(idx)) {
                toolCallBuffers.set(idx, { id: crypto.randomUUID(), name: "", arguments: "" })
              }
              toolCallBuffers.get(idx)!.arguments += json.delta.partial_json || ""
            }
          } catch (err) {
            console.warn("[Anthropic] Skipping malformed SSE chunk:", trimmed, err)
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    for (const [, toolCall] of toolCallBuffers) {
      yield { type: "tool_call", id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments }
    }

    yield { type: "done" }
  }

  async validateConnection(): Promise<boolean> {
    const models = await this.listModels()
    return models.length > 0
  }

  async listModels(): Promise<string[]> {
    try {
      const baseUrl = this.config.baseUrl || "https://api.anthropic.com/v1"
      const response = await fetch(joinUrl(baseUrl, "/models"), {
        headers: {
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
      })
      if (!response.ok) return []
      const json = await response.json()
      return (json.data as { id: string }[]).map((model) => model.id).sort()
    } catch (err) {
      console.error("[Anthropic] Failed to list models:", err)
      return []
    }
  }
}
