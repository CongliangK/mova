import { useContext, useMemo, useRef, useCallback, useEffect } from "react"
import { useChatStore } from "../stores/chat-store"
import { useSettingsStore } from "../stores/settings-store"
import { ToastContext } from "../components/ui/toast-context"
import type { ToastContextValue } from "../components/ui/toast-context"
import { createLlmProvider } from "../services/ai/providers/llm/provider-registry"
import { createAgentRuntime } from "../services/ai/runtimes/agent-runtime-factory"
import { getConfiguredAgentRuntimeMode } from "../services/ai/runtimes/agent-runtime-config"
import { generalSkill } from "../services/ai/skills/general-skill"
import { skillRegistry } from "../services/ai/skills/skill-registry"
import { isBrowserDemoAiMockEnabled } from "../dev/browser-demo-ai-mock-gate"
import type { AgentRuntimeMode, MovaAgentRuntime } from "../services/ai/runtimes/agent-runtime"
import type { ChatMessage, LLMMessage, LLMProvider, ToolCallResult } from "../types/ai"

const STREAM_UPDATE_INTERVAL_MS = 50

interface ProviderSetup {
  provider: LLMProvider | null
  error: string | null
}

function serializeToolCallArguments(args: Record<string, unknown>): string {
  return JSON.stringify(args)
}

function serializeToolCallResult(toolCall: NonNullable<ChatMessage["toolCalls"]>[number]): string {
  return JSON.stringify(toolCall.result ?? { success: false, error: "Tool result unavailable" })
}

function toRuntimeConversationHistory(messages: ChatMessage[]): LLMMessage[] {
  return messages.flatMap((message): LLMMessage[] => {
    if (message.role === "user") {
      return [{ role: "user", content: message.content }]
    }

    if (message.role !== "assistant") {
      return []
    }

    const toolCalls = message.toolCalls ?? []
    if (toolCalls.length === 0) {
      return [{ role: "assistant", content: message.content }]
    }

    return [
      {
        role: "assistant",
        content: "",
        toolCalls: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
          arguments: serializeToolCallArguments(toolCall.arguments),
        })),
      },
      ...toolCalls.map((toolCall) => ({
        role: "tool" as const,
        content: serializeToolCallResult(toolCall),
        toolCallId: toolCall.id,
      })),
      ...(message.content ? [{ role: "assistant" as const, content: message.content }] : []),
    ]
  })
}

async function createProvider(): Promise<ProviderSetup> {
  if (import.meta.env.DEV && isBrowserDemoAiMockEnabled()) {
    const { createBrowserDemoMockProvider } = await import("../dev/browser-demo-ai-mock")
    return { provider: createBrowserDemoMockProvider(), error: null }
  }

  const settings = useSettingsStore.getState()
  const config = settings.llmConfigs[settings.activeLlmIndex]
  if (!config) {
    return { provider: null, error: "No AI provider configured. Please go to Settings and configure a provider." }
  }

  return createLlmProvider(config)
}

export function useAgent() {
  const runtimeRef = useRef<MovaAgentRuntime | null>(null)
  const runtimeModeRef = useRef<AgentRuntimeMode | null>(null)
  const toastContext = useContext(ToastContext)
  const showToast = useMemo<ToastContextValue["showToast"]>(
    () => toastContext?.showToast ?? (() => {}),
    [toastContext],
  )

  const getRuntime = useCallback(() => {
    const mode = getConfiguredAgentRuntimeMode()
    if (!runtimeRef.current || runtimeModeRef.current !== mode) {
      runtimeRef.current?.reset()
      runtimeRef.current = createAgentRuntime(mode)
      runtimeModeRef.current = mode
    }
    return runtimeRef.current
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const store = useChatStore.getState()

    const conversationId = store.activeConversationId ?? store.createConversation()
    const currentState = useChatStore.getState()
    const entryProjectId = currentState.activeProjectId
    const conversation = currentState.conversations.find((item) => item.id === conversationId)
    const conversationKey = `${currentState.activeProjectId ?? "general"}:${conversationId}`
    const conversationHistory = toRuntimeConversationHistory(conversation?.messages ?? [])

    store.addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    }, conversationId)

    const providerSetup = await createProvider()
    if (!providerSetup.provider) {
      store.addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: providerSetup.error ?? "No AI provider configured. Please go to Settings and configure a provider.",
        artifacts: [],
        toolCalls: null,
        timestamp: new Date().toISOString(),
      }, conversationId)
      return
    }

    const activeSkill = skillRegistry.getActiveSkill()
    const detectedSkill = activeSkill ?? skillRegistry.getSkillForIntent(text)
    const skill = import.meta.env.DEV && isBrowserDemoAiMockEnabled()
      ? generalSkill
      : (detectedSkill ?? generalSkill)

    store.setLoading(true)

    const assistantId = crypto.randomUUID()
    store.addMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      artifacts: [],
      toolCalls: null,
      timestamp: new Date().toISOString(),
    }, conversationId)

    let accumulatedText = ""
    let pendingTimer: ReturnType<typeof setTimeout> | null = null
    let lastFlushAt = 0
    let finished = false
    let runtime: MovaAgentRuntime | null = null

    const isProjectSwitched = () =>
      useChatStore.getState().activeProjectId !== entryProjectId

    const handleProjectSwitch = () => {
      runtime?.abort()
      clearPendingTimer()
      finishLoading()
      showToast("warning", "AI response was interrupted because the project was switched.")
    }

    const clearPendingTimer = () => {
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
      }
    }

    const finishLoading = () => {
      clearPendingTimer()
      finished = true
      useChatStore.getState().setLoading(false)
    }

    const updateError = (error: unknown, toolCalls?: ToolCallResult[] | null) => {
      const message = error instanceof Error ? error.message : String(error)
      const tc = toolCalls && toolCalls.length > 0 ? toolCalls : null
      useChatStore.getState().updateMessage(assistantId, { content: `Error: ${message}`, toolCalls: tc }, conversationId)
      finishLoading()
    }

    const flushAccumulatedText = () => {
      clearPendingTimer()
      lastFlushAt = performance.now()
      useChatStore.getState().updateMessage(assistantId, { content: accumulatedText }, conversationId)
    }

    const scheduleTextFlush = () => {
      if (pendingTimer) return
      const elapsed = performance.now() - lastFlushAt
      const delay = Math.max(0, STREAM_UPDATE_INTERVAL_MS - elapsed)
      pendingTimer = setTimeout(flushAccumulatedText, delay)
    }

    try {
      runtime = getRuntime()
      runtime.configure({
        provider: providerSetup.provider,
        skill,
        conversationKey,
        conversationHistory,
      })

      await runtime.processUserMessage(text, {
        onTextDelta: (delta) => {
          if (isProjectSwitched()) { handleProjectSwitch(); return }
          accumulatedText += delta
          scheduleTextFlush()
        },
        onToolCalls: (calls) => {
          if (isProjectSwitched()) { handleProjectSwitch(); return }
          const names = calls.map((c) => c.name).join(", ")
          if (names.includes("generate_image")) {
            flushAccumulatedText()
            useChatStore.getState().updateMessage(assistantId, {
              content: accumulatedText || "Generating image...",
            }, conversationId)
          }
        },
        onComplete: (message) => {
          if (isProjectSwitched()) { handleProjectSwitch(); return }
          useChatStore.getState().updateMessage(assistantId, {
            content: message.content,
            toolCalls: message.toolCalls,
          }, conversationId)
          finishLoading()
        },
        onError: (error, toolCalls) => {
          if (isProjectSwitched()) { handleProjectSwitch(); return }
          updateError(error, toolCalls)
        },
      })
    } catch (err) {
      updateError(err)
    } finally {
      if (!finished) {
        finishLoading()
      }
    }
  }, [getRuntime, showToast])

  useEffect(() => {
    return () => {
      runtimeRef.current?.reset()
    }
  }, [])

  const abort = useCallback(() => {
    runtimeRef.current?.abort()
  }, [])

  return { sendMessage, abort }
}
