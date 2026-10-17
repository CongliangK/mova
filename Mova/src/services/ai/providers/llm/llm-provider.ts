import type { LLMToolDefinition, LLMProvider } from "../../../../types/ai"

/**
 * Base interface that all LLM providers implement.
 * Uses the Strategy pattern so the orchestrator is provider-agnostic.
 */
export type LLMProviderAdapter = LLMProvider

/**
 * Shared utility: converts tool definitions to OpenAI function-calling format.
 * Most providers (OpenAI, Ollama) use this format. Anthropic has its own.
 */
export function toolsToOpenAIFormat(tools: LLMToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted")
  }
}

export async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
): Promise<ReadableStreamReadResult<Uint8Array> | "aborted"> {
  if (!signal) return reader.read()
  if (signal.aborted) return "aborted"

  let removeAbortListener = () => {}
  const abortPromise = new Promise<"aborted">((resolve) => {
    const abort = () => resolve("aborted")
    signal.addEventListener("abort", abort, { once: true })
    removeAbortListener = () => signal.removeEventListener("abort", abort)
  })

  try {
    return await Promise.race([reader.read(), abortPromise])
  } finally {
    removeAbortListener()
  }
}
