import type { AgentEvent, AgentMessage, AgentToolResult, StreamFn } from "@earendil-works/pi-agent-core"
import type { AssistantMessage, AssistantMessageEvent, Context, Message, Model, ToolCall } from "@earendil-works/pi-ai"
import type { ChatMessage, LLMChunk, LLMMessage, LLMProvider, LLMRequest, ToolCallResult, ToolResult } from "../../../types/ai"
import type { AgentRuntimeCallbacks, AgentRuntimeConfig, MovaAgentRuntime } from "./agent-runtime"
import { buildRuntimeSystemPrompt } from "./piagent-message-adapter"
import { adaptMovaToolsToPiAgentCoreTools, isAllowedMovaToolName } from "./piagent-tool-adapter"

type PiAgentCoreModule = typeof import("@earendil-works/pi-agent-core")
type PiAgentConstructor = PiAgentCoreModule["Agent"]
type PiAgentInstance = InstanceType<PiAgentConstructor>

type QueuedEvent = AssistantMessageEvent | { type: "__end" }

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

const DEFAULT_MODEL: Model<string> = {
  id: "mova-provider",
  name: "Mova configured provider",
  api: "mova-llm-provider",
  provider: "mova",
  baseUrl: "",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 0,
  maxTokens: 0,
}

let piAgentCoreModulePromise: Promise<PiAgentCoreModule> | null = null
let piAgentCoreLoader: () => Promise<PiAgentCoreModule> = () => import("@earendil-works/pi-agent-core")

export function resetPiAgentCoreRuntimeLoaderForTests() {
  piAgentCoreModulePromise = null
  piAgentCoreLoader = () => import("@earendil-works/pi-agent-core")
}

export function setPiAgentCoreRuntimeLoaderForTests(loader: () => Promise<PiAgentCoreModule>) {
  piAgentCoreModulePromise = null
  piAgentCoreLoader = loader
}

async function loadPiAgentCore(): Promise<PiAgentCoreModule> {
  piAgentCoreModulePromise ??= piAgentCoreLoader()
  return piAgentCoreModulePromise
}

function textFromPiContent(content: Message["content"]): string {
  if (typeof content === "string") return content
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
}

function parseToolCallArguments(rawArguments: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawArguments) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function toMovaMessages(context: Context): LLMMessage[] {
  const messages: LLMMessage[] = []
  if (context.systemPrompt) {
    messages.push({ role: "system", content: context.systemPrompt })
  }

  for (const message of context.messages) {
    if (message.role === "user") {
      messages.push({ role: "user", content: textFromPiContent(message.content) })
    } else if (message.role === "assistant") {
      const toolCalls = message.content
        .filter((part): part is ToolCall => part.type === "toolCall")
        .map((part) => ({ id: part.id, name: part.name, arguments: JSON.stringify(part.arguments) }))
      messages.push({
        role: "assistant",
        content: textFromPiContent(message.content),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      })
    } else if (message.role === "toolResult") {
      messages.push({
        role: "tool",
        content: JSON.stringify(message.details ?? { success: !message.isError, content: textFromPiContent(message.content) }),
        toolCallId: message.toolCallId,
      })
    }
  }

  return messages
}

function toMovaRequest(context: Context): LLMRequest {
  return {
    messages: toMovaMessages(context),
    tools: context.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as LLMRequest["tools"] extends Array<infer T> ? T extends { parameters: infer P } ? P : never : never,
    })),
  }
}

function createAssistantMessage(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"], errorMessage?: string): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: DEFAULT_MODEL.api,
    provider: DEFAULT_MODEL.provider,
    model: DEFAULT_MODEL.id,
    usage: EMPTY_USAGE,
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  }
}

async function readNextProviderChunk(
  iterator: AsyncIterator<LLMChunk>,
  signal: AbortSignal | undefined,
): Promise<IteratorResult<LLMChunk> | "aborted"> {
  if (!signal) return iterator.next()
  if (signal.aborted) return "aborted"

  let removeAbortListener = () => {}
  const abortPromise = new Promise<"aborted">((resolve) => {
    const abort = () => resolve("aborted")
    signal.addEventListener("abort", abort, { once: true })
    removeAbortListener = () => signal.removeEventListener("abort", abort)
  })

  const nextChunk = iterator.next()
  try {
    return await Promise.race([nextChunk, abortPromise])
  } finally {
    removeAbortListener()
  }
}

class MovaAssistantMessageEventStream implements AsyncIterable<AssistantMessageEvent> {
  private readonly queue: QueuedEvent[] = []
  private readonly waiters: Array<(result: IteratorResult<AssistantMessageEvent>) => void> = []
  private finalMessage: AssistantMessage | null = null
  private resultPromise: Promise<AssistantMessage>
  private resolveResult: (message: AssistantMessage) => void = () => {}

  constructor() {
    this.resultPromise = new Promise<AssistantMessage>((resolve) => {
      this.resolveResult = resolve
    })
  }

  push(event: AssistantMessageEvent) {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ value: event, done: false })
      return
    }
    this.queue.push(event)
  }

  end(message: AssistantMessage) {
    this.finalMessage = message
    this.resolveResult(message)
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ value: undefined, done: true })
      return
    }
    this.queue.push({ type: "__end" })
  }

  result(): Promise<AssistantMessage> {
    if (this.finalMessage) return Promise.resolve(this.finalMessage)
    return this.resultPromise
  }

  [Symbol.asyncIterator](): AsyncIterator<AssistantMessageEvent> {
    return {
      next: () => {
        const nextEvent = this.queue.shift()
        if (nextEvent) {
          if (nextEvent.type === "__end") {
            return Promise.resolve({ value: undefined, done: true })
          }
          return Promise.resolve({ value: nextEvent, done: false })
        }
        return new Promise<IteratorResult<AssistantMessageEvent>>((resolve) => {
          this.waiters.push(resolve)
        })
      },
    }
  }
}

function createStreamFn(provider: LLMProvider): StreamFn {
  return (_model, context, options) => {
    const stream = new MovaAssistantMessageEventStream()

    void (async () => {
      const content: AssistantMessage["content"] = []
      const startMessage = createAssistantMessage(content, "stop")
      stream.push({ type: "start", partial: startMessage })

      let textIndex: number | null = null
      let text = ""
      let hasToolCalls = false

      try {
        const providerStream = provider.streamChat(toMovaRequest(context), { signal: options?.signal })
        const iterator = providerStream[Symbol.asyncIterator]()

        while (true) {
          const nextChunk = await readNextProviderChunk(iterator, options?.signal)
          if (nextChunk === "aborted") {
            if (iterator.return) void iterator.return(undefined as never)
            const aborted = createAssistantMessage(content, "aborted", "Operation aborted")
            stream.push({ type: "error", reason: "aborted", error: aborted })
            stream.end(aborted)
            return
          }
          if (nextChunk.done) break

          const chunk = nextChunk.value
          if (chunk.type === "text") {
            if (textIndex === null) {
              textIndex = content.length
              content.push({ type: "text", text: "" })
              stream.push({ type: "text_start", contentIndex: textIndex, partial: createAssistantMessage([...content], "stop") })
            }
            text += chunk.delta
            content[textIndex] = { type: "text", text }
            stream.push({
              type: "text_delta",
              contentIndex: textIndex,
              delta: chunk.delta,
              partial: createAssistantMessage([...content], "stop"),
            })
          } else if (chunk.type === "tool_call") {
            hasToolCalls = true
            const toolCallIndex = content.length
            const toolCall: ToolCall = {
              type: "toolCall",
              id: chunk.id,
              name: chunk.name,
              arguments: parseToolCallArguments(chunk.arguments),
            }
            stream.push({ type: "toolcall_start", contentIndex: toolCallIndex, partial: createAssistantMessage([...content], "toolUse") })
            content.push(toolCall)
            stream.push({
              type: "toolcall_end",
              contentIndex: toolCallIndex,
              toolCall,
              partial: createAssistantMessage([...content], "toolUse"),
            })
          }
        }

        if (textIndex !== null) {
          stream.push({
            type: "text_end",
            contentIndex: textIndex,
            content: text,
            partial: createAssistantMessage([...content], hasToolCalls ? "toolUse" : "stop"),
          })
        }

        const finalMessage = createAssistantMessage([...content], hasToolCalls ? "toolUse" : "stop")
        stream.push({ type: "done", reason: hasToolCalls ? "toolUse" : "stop", message: finalMessage })
        stream.end(finalMessage)
      } catch (err) {
        const isAborted = options?.signal?.aborted === true
        const message = isAborted ? "Operation aborted" : err instanceof Error ? err.message : String(err)
        const errorMessage = createAssistantMessage([...content], isAborted ? "aborted" : "error", message)
        stream.push({ type: "error", reason: errorMessage.stopReason === "aborted" ? "aborted" : "error", error: errorMessage })
        stream.end(errorMessage)
      }
    })()

    return stream as unknown as ReturnType<StreamFn>
  }
}

function toolResultFromPiEvent(event: Extract<AgentEvent, { type: "tool_execution_end" }>): ToolCallResult {
  const result = event.result as AgentToolResult<ToolResult | undefined>
  const details = result.details
  const movaResult: ToolResult = details && typeof details === "object" && "success" in details
    ? (details as ToolResult)
    : { success: !event.isError, data: details, error: event.isError ? textFromPiContent(result.content) : undefined }

  return {
    id: event.toolCallId,
    name: event.toolName,
    arguments: {},
    result: movaResult,
  }
}

function toPiAgentConversationHistory(history: LLMMessage[]): AgentMessage[] {
  const toolNamesById = new Map<string, string>()
  return history.flatMap((message): AgentMessage[] => {
    const timestamp = Date.now()
    if (message.role === "user") {
      return [{ role: "user", content: message.content, timestamp }]
    }
    if (message.role === "assistant") {
      const content: AssistantMessage["content"] = []
      if (message.content) {
        content.push({ type: "text", text: message.content })
      }
      for (const toolCall of message.toolCalls ?? []) {
        toolNamesById.set(toolCall.id, toolCall.name)
        content.push({
          type: "toolCall",
          id: toolCall.id,
          name: toolCall.name,
          arguments: parseToolCallArguments(toolCall.arguments),
        })
      }
      return [createAssistantMessage(content, message.toolCalls?.length ? "toolUse" : "stop")]
    }
    if (message.role === "tool" && message.toolCallId) {
      return [{
        role: "toolResult",
        toolCallId: message.toolCallId,
        toolName: toolNamesById.get(message.toolCallId) ?? "",
        content: [{ type: "text", text: message.content }],
        isError: false,
        timestamp,
      }]
    }
    return []
  })
}

function chatMessageFromAgentMessages(messages: AgentMessage[], toolCalls: ToolCallResult[]): ChatMessage {
  const assistantMessages = messages.filter((message): message is AssistantMessage => message.role === "assistant")
  const finalAssistant = assistantMessages[assistantMessages.length - 1]
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: finalAssistant ? textFromPiContent(finalAssistant.content) : "",
    artifacts: [],
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    timestamp: new Date().toISOString(),
  }
}

export class PiAgentCoreRuntime implements MovaAgentRuntime {
  private config: AgentRuntimeConfig | null = null
  private agent: PiAgentInstance | null = null
  private unsubscribe: (() => void) | null = null
  private conversationHistory: AgentMessage[] = []
  private conversationKey: string | null = null

  configure(config: AgentRuntimeConfig) {
    this.config = config
    if (config.conversationHistory !== undefined) {
      this.conversationHistory = toPiAgentConversationHistory(config.conversationHistory)
    } else if (config.conversationKey !== undefined && config.conversationKey !== this.conversationKey) {
      this.conversationHistory = []
    }
    this.conversationKey = config.conversationKey ?? null
  }

  async processUserMessage(userMessage: string, callbacks: AgentRuntimeCallbacks): Promise<void> {
    if (!this.config) {
      callbacks.onError("No active skill selected.")
      return
    }

    const { Agent } = await loadPiAgentCore()
    const toolCalls: ToolCallResult[] = []
    const allowedToolNames = new Set(this.config.skill.tools.map((tool) => tool.name).filter(isAllowedMovaToolName))

    this.unsubscribe?.()
    this.agent = new Agent({
      initialState: {
        systemPrompt: buildRuntimeSystemPrompt(this.config.skill),
        model: DEFAULT_MODEL,
        tools: adaptMovaToolsToPiAgentCoreTools(this.config.skill.tools),
        messages: this.conversationHistory,
      },
      streamFn: createStreamFn(this.config.provider),
      toolExecution: "sequential",
      beforeToolCall: async ({ toolCall }) => {
        if (!allowedToolNames.has(toolCall.name)) {
          return { block: true, reason: `Blocked tool call: ${toolCall.name}` }
        }
        return undefined
      },
    })

    this.unsubscribe = this.agent.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        callbacks.onTextDelta(event.assistantMessageEvent.delta)
      } else if (event.type === "tool_execution_end") {
        const toolCall = toolResultFromPiEvent(event)
        toolCalls.push(toolCall)
        callbacks.onToolCalls([toolCall])
      } else if (event.type === "agent_end") {
        const finalAssistant = event.messages.findLast((message) => message.role === "assistant")
        if (!finalAssistant) {
          callbacks.onError("Agent ended without a final response.", toolCalls.length > 0 ? [...toolCalls] : null)
          return
        }
        if (finalAssistant.stopReason !== "stop" && finalAssistant.stopReason !== "toolUse" && finalAssistant.errorMessage) {
          callbacks.onError(finalAssistant.errorMessage, toolCalls.length > 0 ? [...toolCalls] : null)
          return
        }
        this.conversationHistory = this.agent?.state?.messages ?? [...event.messages]
        callbacks.onComplete(chatMessageFromAgentMessages(event.messages, toolCalls))
      }
    })

    await this.agent.prompt(userMessage)
  }

  abort() {
    this.agent?.abort()
  }

  reset() {
    this.abort()
    this.unsubscribe?.()
    this.unsubscribe = null
    this.agent?.reset()
    this.agent = null
    this.config = null
    this.conversationHistory = []
    this.conversationKey = null
  }
}
