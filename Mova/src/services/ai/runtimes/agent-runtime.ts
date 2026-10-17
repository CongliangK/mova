import type { ChatMessage, LLMMessage, LLMProvider, Skill, ToolCallResult } from "../../../types/ai"

export interface AgentRuntimeCallbacks {
  onTextDelta: (delta: string) => void
  onToolCalls: (calls: ToolCallResult[]) => void
  onComplete: (message: ChatMessage) => void
  onError: (error: string, toolCalls?: ToolCallResult[] | null) => void
}

export interface AgentRuntimeConfig {
  provider: LLMProvider
  skill: Skill
  conversationKey?: string
  conversationHistory?: LLMMessage[]
}

export interface MovaAgentRuntime {
  configure: (config: AgentRuntimeConfig) => void
  processUserMessage: (userMessage: string, callbacks: AgentRuntimeCallbacks) => Promise<void>
  abort: () => void
  reset: () => void
}

export type AgentRuntimeMode = "legacy" | "piagent-core"
