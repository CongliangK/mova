import { AgentOrchestrator } from "../agent-orchestrator"
import type { AgentRuntimeCallbacks, AgentRuntimeConfig, MovaAgentRuntime } from "./agent-runtime"

export class LegacyAgentRuntime implements MovaAgentRuntime {
  private readonly orchestrator = new AgentOrchestrator()
  private conversationKey: string | null = null

  configure(config: AgentRuntimeConfig) {
    this.orchestrator.setProvider(config.provider)
    this.orchestrator.setSkill(config.skill)
    if (config.conversationHistory !== undefined) {
      this.orchestrator.setConversationHistory(config.conversationHistory)
    } else if (config.conversationKey !== undefined && config.conversationKey !== this.conversationKey) {
      this.orchestrator.setConversationHistory([])
    }
    this.conversationKey = config.conversationKey ?? null
  }

  async processUserMessage(userMessage: string, callbacks: AgentRuntimeCallbacks): Promise<void> {
    await this.orchestrator.processUserMessage(userMessage, callbacks)
  }

  abort() {
    this.orchestrator.abort()
  }

  reset() {
    this.orchestrator.reset()
    this.conversationKey = null
  }
}
