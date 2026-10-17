import type { AgentRuntimeCallbacks, AgentRuntimeConfig, MovaAgentRuntime } from "./agent-runtime"

type PiAgentCoreRuntimeModule = typeof import("./piagent-core-runtime")
type PiAgentCoreRuntimeInstance = InstanceType<PiAgentCoreRuntimeModule["PiAgentCoreRuntime"]>

let piAgentCoreRuntimeLoader: () => Promise<PiAgentCoreRuntimeModule> = () => import("./piagent-core-runtime")

export function resetLazyPiAgentCoreRuntimeLoaderForTests() {
  piAgentCoreRuntimeLoader = () => import("./piagent-core-runtime")
}

export function setLazyPiAgentCoreRuntimeLoaderForTests(loader: () => Promise<PiAgentCoreRuntimeModule>) {
  piAgentCoreRuntimeLoader = loader
}

export class LazyPiAgentCoreRuntime implements MovaAgentRuntime {
  private config: AgentRuntimeConfig | null = null
  private runtime: PiAgentCoreRuntimeInstance | null = null
  private runtimePromise: Promise<PiAgentCoreRuntimeInstance> | null = null

  configure(config: AgentRuntimeConfig) {
    this.config = config
    this.runtime?.configure(config)
  }

  async processUserMessage(userMessage: string, callbacks: AgentRuntimeCallbacks): Promise<void> {
    const runtime = await this.getRuntime()
    await runtime.processUserMessage(userMessage, callbacks)
  }

  abort() {
    this.runtime?.abort()
  }

  reset() {
    this.runtime?.reset()
    this.config = null
    this.runtime = null
    this.runtimePromise = null
  }

  private async getRuntime(): Promise<PiAgentCoreRuntimeInstance> {
    if (this.runtime) return this.runtime

    this.runtimePromise ??= piAgentCoreRuntimeLoader().then(({ PiAgentCoreRuntime }) => {
      const runtime = new PiAgentCoreRuntime()
      if (this.config) {
        runtime.configure(this.config)
      }
      this.runtime = runtime
      return runtime
    })

    return this.runtimePromise
  }
}
