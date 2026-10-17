export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  artifacts: Artifact[]
  toolCalls: ToolCallResult[] | null
  timestamp: string
}

export interface Artifact {
  type: "image" | "animation" | "character"
  id: string
  label: string
}

export type LLMProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "qwen"
  | "moonshot"
  | "zhipu"
  | "baidu"
  | "minimax"
  | "doubao"
  | "ollama"

export interface LLMConfig {
  provider: LLMProviderId
  model: string
  apiKey: string | null
  baseUrl: string | null
  temperature: number
  topP: number
  maxTokens: number
  frequencyPenalty: number
  systemPrompt: string | null
}

export type ImageProviderId = "suchuang" | "dall-e" | "stability" | "sedans-image"
export type VideoProviderId = "sedans-video"
export type GenerationProviderId = LLMProviderId | ImageProviderId | VideoProviderId
export type GenerationProviderModality = "llm" | "image" | "video"

export interface ImageGenConfig {
  provider: ImageProviderId
  model: string
  apiKey: string | null
  baseUrl: string | null
  defaultParams: Record<string, unknown>
}

export interface VideoGenConfig {
  provider: VideoProviderId
  model: string
  apiKey: string | null
  baseUrl: string | null
  defaultParams: Record<string, unknown>
}

// Image Generation Provider types

export interface ImageGenRequest {
  prompt: string
  model?: string
  size?: string
  aspectRatio?: string
  referenceUrls?: string[]
}

export type ImageGenChunk =
  | { type: "progress"; message: string }
  | { type: "image"; imageUrl: string; imageData?: Uint8Array }
  | { type: "error"; message: string }
  | { type: "done" }

export interface ImageGenProvider {
  generate(request: ImageGenRequest): AsyncGenerator<ImageGenChunk>
  validateConnection(): Promise<boolean>
}

// LLM Provider types

export interface LLMToolCall {
  id: string
  name: string
  arguments: string
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  toolCallId?: string
  toolCalls?: LLMToolCall[]
}

export interface LLMToolDefinition {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface LLMRequest {
  messages: LLMMessage[]
  tools?: LLMToolDefinition[]
  temperature?: number
  maxTokens?: number
}

export type LLMChunk =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "done" }

export interface LLMStreamOptions {
  signal?: AbortSignal
}

export interface LLMProvider {
  streamChat(request: LLMRequest, options?: LLMStreamOptions): AsyncGenerator<LLMChunk>
  validateConnection(): Promise<boolean>
  listModels(): Promise<string[]>
}

// Tool system types

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

export interface ToolCallResult {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: ToolResult
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export type WorkbenchStepStatus = "queued" | "running" | "completed" | "error"

// Skill types

export interface Skill {
  name: string
  description: string
  systemPrompt: string
  tools: ToolDefinition[]
  buildContext: () => string
}
