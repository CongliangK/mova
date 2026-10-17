import type { ChatMessage, Skill, ToolCallResult } from "../../../types/ai"
import type { AgentRuntimeCallbacks } from "./agent-runtime"

export type MovaPiAgentRuntimeEvent =
  | { type: "message_update"; delta: string }
  | { type: "tool_execution_end"; calls: ToolCallResult[] }
  | { type: "agent_end"; message: ChatMessage }
  | { type: "agent_error"; error: string }

export function buildRuntimeSystemPrompt(skill: Skill): string {
  const context = skill.buildContext()
  return context ? `${skill.systemPrompt}\n\n${context}` : skill.systemPrompt
}

export function dispatchPiAgentRuntimeEvent(
  event: MovaPiAgentRuntimeEvent,
  callbacks: AgentRuntimeCallbacks
): void {
  switch (event.type) {
    case "message_update":
      callbacks.onTextDelta(event.delta)
      break
    case "tool_execution_end":
      callbacks.onToolCalls(event.calls)
      break
    case "agent_end":
      callbacks.onComplete(event.message)
      break
    case "agent_error":
      callbacks.onError(event.error)
      break
  }
}
