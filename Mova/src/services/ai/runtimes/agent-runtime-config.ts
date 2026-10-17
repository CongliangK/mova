import type { AgentRuntimeMode } from "./agent-runtime"

export const AGENT_RUNTIME_FLAG_KEY = "mova.agentRuntime"
const RUNTIME_MODES = ["legacy", "piagent-core"] as const
const DEFAULT_RUNTIME_MODE: AgentRuntimeMode = "piagent-core"

function isAgentRuntimeMode(value: string | undefined): value is AgentRuntimeMode {
  return RUNTIME_MODES.some((mode) => mode === value)
}

function readLocalStorageMode(): string | undefined {
  if (typeof globalThis.localStorage === "undefined") return undefined
  return globalThis.localStorage.getItem(AGENT_RUNTIME_FLAG_KEY) ?? undefined
}

export function resolveAgentRuntimeMode(value: string | null | undefined): AgentRuntimeMode {
  const normalized = value ?? undefined
  if (normalized === undefined || normalized === "") return DEFAULT_RUNTIME_MODE
  return isAgentRuntimeMode(normalized) ? normalized : "legacy"
}

export function getConfiguredAgentRuntimeMode(): AgentRuntimeMode {
  const envMode = import.meta.env.VITE_MOVA_AGENT_RUNTIME as string | undefined
  return resolveAgentRuntimeMode(readLocalStorageMode() ?? envMode)
}
