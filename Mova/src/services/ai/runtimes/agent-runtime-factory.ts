import type { AgentRuntimeMode, MovaAgentRuntime } from "./agent-runtime"
import { getConfiguredAgentRuntimeMode } from "./agent-runtime-config"
import { LazyPiAgentCoreRuntime } from "./lazy-piagent-core-runtime"
import { LegacyAgentRuntime } from "./legacy-agent-runtime"

export function createAgentRuntime(mode: AgentRuntimeMode = getConfiguredAgentRuntimeMode()): MovaAgentRuntime {
  switch (mode) {
    case "legacy":
      return new LegacyAgentRuntime()
    case "piagent-core":
      return new LazyPiAgentCoreRuntime()
  }
}
