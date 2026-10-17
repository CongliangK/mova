import type { LLMMessage, LLMProvider, Skill, ToolCallResult } from "../../../types/ai"
import type { AgentRuntimeCallbacks, AgentRuntimeConfig, MovaAgentRuntime } from "./agent-runtime"
import { buildRuntimeSystemPrompt, dispatchPiAgentRuntimeEvent } from "./piagent-message-adapter"
import { adaptMovaToolsToPiAgentTools, executePiAgentToolCall, type MovaPiAgentTool } from "./piagent-tool-adapter"

interface PendingToolCall {
  id: string
  name: string
  arguments: string
}

export class MockPiAgentRuntime implements MovaAgentRuntime {
  private provider: LLMProvider | null = null
  private activeSkill: Skill | null = null
  private tools: MovaPiAgentTool[] = []
  private conversationHistory: LLMMessage[] = []
  private conversationKey: string | null = null
  private readonly maxToolRounds = 5

  configure(config: AgentRuntimeConfig) {
    this.provider = config.provider
    this.activeSkill = config.skill
    this.tools = adaptMovaToolsToPiAgentTools(config.skill.tools)
    if (config.conversationHistory !== undefined) {
      this.conversationHistory = [...config.conversationHistory]
    } else if (config.conversationKey !== undefined && config.conversationKey !== this.conversationKey) {
      this.conversationHistory = []
    }
    this.conversationKey = config.conversationKey ?? null
  }

  async processUserMessage(userMessage: string, callbacks: AgentRuntimeCallbacks): Promise<void> {
    if (!this.provider) {
      dispatchPiAgentRuntimeEvent(
        { type: "agent_error", error: "No LLM provider configured. Please set up an API key in Settings." },
        callbacks,
      )
      return
    }

    if (!this.activeSkill) {
      dispatchPiAgentRuntimeEvent({ type: "agent_error", error: "No active skill selected." }, callbacks)
      return
    }

    const messages: LLMMessage[] = [
      { role: "system", content: buildRuntimeSystemPrompt(this.activeSkill) },
      ...this.conversationHistory,
      { role: "user", content: userMessage },
    ]
    const historyBeforeTurn = [...this.conversationHistory]
    this.conversationHistory.push({ role: "user", content: userMessage })

    let fullResponse = ""
    let roundsRemaining = this.maxToolRounds
    const allToolCalls: ToolCallResult[] = []

    try {
      while (roundsRemaining > 0) {
        fullResponse = ""
        const currentToolCalls: PendingToolCall[] = []
        const toolSchemas = this.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        }))

        for await (const chunk of this.provider.streamChat({
          messages,
          tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        })) {
          if (chunk.type === "text") {
            fullResponse += chunk.delta
            dispatchPiAgentRuntimeEvent({ type: "message_update", delta: chunk.delta }, callbacks)
          } else if (chunk.type === "tool_call") {
            currentToolCalls.push({
              id: chunk.id,
              name: chunk.name,
              arguments: chunk.arguments,
            })
          }
        }

        if (currentToolCalls.length === 0) {
          break
        }

        const assistantToolMessage: LLMMessage = {
          role: "assistant",
          content: fullResponse,
          toolCalls: currentToolCalls,
        }
        messages.push(assistantToolMessage)
        this.conversationHistory.push(assistantToolMessage)

        const toolResults = await this.executeToolCalls(currentToolCalls)
        allToolCalls.push(...toolResults)
        dispatchPiAgentRuntimeEvent({ type: "tool_execution_end", calls: toolResults }, callbacks)

        for (const result of toolResults) {
          const toolMessage: LLMMessage = {
            role: "tool",
            content: result.result
              ? JSON.stringify(result.result)
              : JSON.stringify({ error: "Tool execution failed" }),
            toolCallId: result.id,
          }
          messages.push(toolMessage)
          this.conversationHistory.push(toolMessage)
        }

        roundsRemaining--
        if (roundsRemaining === 0) {
          this.conversationHistory = historyBeforeTurn
          callbacks.onError("Maximum tool rounds reached before a final assistant response.", allToolCalls.length > 0 ? [...allToolCalls] : null)
          return
        }
      }

      this.conversationHistory.push({ role: "assistant", content: fullResponse })
      dispatchPiAgentRuntimeEvent(
        {
          type: "agent_end",
          message: {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullResponse,
            artifacts: [],
            toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
            timestamp: new Date().toISOString(),
          },
        },
        callbacks,
      )
    } catch (err) {
      this.conversationHistory = historyBeforeTurn
      callbacks.onError(err instanceof Error ? err.message : String(err), allToolCalls.length > 0 ? [...allToolCalls] : null)
    }
  }

  abort() {
    // Mock contract runtime has no underlying abortable agent.
  }

  reset() {
    this.provider = null
    this.activeSkill = null
    this.tools = []
    this.conversationHistory = []
    this.conversationKey = null
  }

  private async executeToolCalls(toolCalls: PendingToolCall[]): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = []
    for (const toolCall of toolCalls) {
      results.push(await executePiAgentToolCall(this.tools, toolCall))
    }
    return results
  }
}
