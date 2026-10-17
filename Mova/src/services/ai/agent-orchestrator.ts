import type { LLMProvider, LLMMessage, Skill, ToolCallResult, ChatMessage } from "../../types/ai"
import { ToolRunner } from "./tool-runner"

interface OrchestratorCallbacks {
  onTextDelta: (delta: string) => void
  onToolCalls: (calls: ToolCallResult[]) => void
  onComplete: (message: ChatMessage) => void
  onError: (error: string, toolCalls?: ToolCallResult[] | null) => void
}

export class AgentOrchestrator {
  private provider: LLMProvider | null = null
  private activeSkill: Skill | null = null
  private toolRunner: ToolRunner
  private conversationHistory: LLMMessage[] = []
  private maxToolRounds = 5
  private abortController: AbortController | null = null

  constructor() {
    this.toolRunner = new ToolRunner()
  }

  abort(): void {
    this.abortController?.abort()
  }

  setProvider(provider: LLMProvider) {
    this.provider = provider
  }

  setSkill(skill: Skill) {
    this.activeSkill = skill
    this.toolRunner.clear()
    this.toolRunner.registerTools(skill.tools)
  }

  setConversationHistory(history: LLMMessage[]) {
    this.conversationHistory = [...history]
  }

  getConversationHistory(): LLMMessage[] {
    return [...this.conversationHistory]
  }

  async processUserMessage(
    userMessage: string,
    callbacks: OrchestratorCallbacks
  ): Promise<void> {
    if (!this.provider) {
      callbacks.onError("No LLM provider configured. Please set up an API key in Settings.")
      return
    }

    if (!this.activeSkill) {
      callbacks.onError("No active skill selected.")
      return
    }

    // Build the messages array
    const messages: LLMMessage[] = [
      {
        role: "system",
        content: this.activeSkill.systemPrompt + "\n\n" + this.activeSkill.buildContext(),
      },
      ...this.conversationHistory,
      { role: "user", content: userMessage },
    ]

    const historyBeforeTurn = [...this.conversationHistory]

    // Add user message to history
    this.conversationHistory.push({ role: "user", content: userMessage })

    let fullResponse = ""
    let roundsRemaining = this.maxToolRounds
    const allToolCalls: ToolCallResult[] = []

    this.abortController = new AbortController()

    try {
      while (roundsRemaining > 0) {
        fullResponse = ""
        const currentToolCalls: { id: string; name: string; arguments: string }[] = []

        const toolSchemas = this.toolRunner.getToolSchemasForLLM()
        const request = {
          messages,
          tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        }

        // Stream the response
        for await (const chunk of this.provider.streamChat(request, { signal: this.abortController!.signal })) {
          if (chunk.type === "text") {
            fullResponse += chunk.delta
            callbacks.onTextDelta(chunk.delta)
          } else if (chunk.type === "tool_call") {
            currentToolCalls.push({
              id: chunk.id,
              name: chunk.name,
              arguments: chunk.arguments,
            })
          }
        }

        // If no tool calls, we're done
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

        // Execute tool calls
        const toolResults = await this.toolRunner.executeToolCalls(currentToolCalls)
        allToolCalls.push(...toolResults)
        callbacks.onToolCalls(toolResults)

        // Add tool results to messages for next round
        for (const result of toolResults) {
          messages.push({
            role: "tool",
            content: result.result
              ? JSON.stringify(result.result)
              : JSON.stringify({ error: "Tool execution failed" }),
            toolCallId: result.id,
          })
          this.conversationHistory.push({
            role: "tool",
            content: result.result
              ? JSON.stringify(result.result)
              : JSON.stringify({ error: "Tool execution failed" }),
            toolCallId: result.id,
          })
        }

        roundsRemaining--
      }

      // If we exhausted all tool rounds without a final response, treat as error
      if (roundsRemaining === 0) {
        this.conversationHistory = historyBeforeTurn
        callbacks.onError("Maximum tool rounds reached before a final assistant response.", allToolCalls.length > 0 ? [...allToolCalls] : null)
        return
      }

      // Add final assistant response to history
      this.conversationHistory.push({ role: "assistant", content: fullResponse })

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fullResponse,
        artifacts: [],
        toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
        timestamp: new Date().toISOString(),
      }

      callbacks.onComplete(message)
    } catch (err) {
      this.conversationHistory = historyBeforeTurn
      const errorMsg = err instanceof Error ? err.message : String(err)
      callbacks.onError(errorMsg, allToolCalls.length > 0 ? [...allToolCalls] : null)
    } finally {
      this.abortController = null
    }
  }

  reset() {
    this.conversationHistory = []
    this.activeSkill = null
    this.toolRunner.clear()
  }
}
