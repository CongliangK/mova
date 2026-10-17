import { act, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ToastProvider } from "../components/ui/toast"
import { FileTree } from "../components/file-tree/FileTree"
import { useAgent } from "../hooks/use-agent"
import { BrowserDemoMockLlmProvider } from "../dev/browser-demo-ai-mock"
import { isBrowserDemoAiMockEnabled } from "../dev/browser-demo-ai-mock-gate"
import {
  bootstrapBrowserDemoWorkspace,
  isBrowserDemoWorkspaceEnabled,
  seedBrowserDemoWorkspace,
} from "../dev/browser-demo-workspace"
import { useAnimationStore } from "../stores/animation-store"
import { useChatStore } from "../stores/chat-store"
import { useFileTreeStore } from "../stores/file-tree-store"
import { useGitStore } from "../stores/git-store"
import { useProjectStore } from "../stores/project-store"
import { useSettingsStore } from "../stores/settings-store"
import { skillRegistry } from "../services/ai/skills/skill-registry"
import type { ChatMessage, LLMConfig } from "../types/ai"

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriMocks.listen,
}))

function createUnconfiguredLlm(): LLMConfig {
  return {
    provider: "openai",
    model: "gpt-test",
    apiKey: null,
    baseUrl: "https://example.test/v1",
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 512,
    frequencyPenalty: 0,
    systemPrompt: null,
  }
}

function resetStores() {
  skillRegistry.setActiveSkill(null)
  useProjectStore.setState({
    project: null,
    projectPath: null,
    isLoaded: false,
  })
  useAnimationStore.setState({
    animations: [],
    activeAnimationId: null,
    currentFrameIndex: 0,
    isPlaying: false,
  })
  useFileTreeStore.setState({
    tree: [],
    currentPath: null,
    expandedPaths: new Set(),
    selectedPath: null,
    searchQuery: "",
    isLoading: false,
    error: null,
  })
  useGitStore.setState({
    isRepo: false,
    branch: "",
    files: [],
    log: [],
    isLoading: false,
    error: null,
  })
  useChatStore.setState({
    activeProjectId: null,
    conversations: [],
    activeConversationId: null,
    isLoading: false,
    projectConversations: {},
  })
  useSettingsStore.setState({
    llmConfigs: [createUnconfiguredLlm()],
    activeLlmIndex: 0,
  })
}

function getActiveMessages(): ChatMessage[] {
  const state = useChatStore.getState()
  const activeConversation = state.conversations.find(
    (conversation) => conversation.id === state.activeConversationId,
  )
  return activeConversation?.messages ?? []
}

describe("browser demo workspace", () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.pushState({}, "", "/")
    tauriMocks.invoke.mockReset().mockResolvedValue(undefined)
    tauriMocks.listen.mockReset().mockResolvedValue(() => {})
    resetStores()
  })

  afterEach(() => {
    window.history.pushState({}, "", "/")
    localStorage.clear()
    resetStores()
  })

  it("requires explicit dev opt-in", () => {
    expect(
      isBrowserDemoWorkspaceEnabled({
        env: { DEV: true },
        location: new URL("http://localhost:5173/"),
        storage: localStorage,
      }),
    ).toBe(false)

    expect(
      isBrowserDemoWorkspaceEnabled({
        env: { DEV: true },
        location: new URL("http://localhost:5173/?demoWorkspace=1"),
        storage: localStorage,
      }),
    ).toBe(true)

    expect(
      isBrowserDemoWorkspaceEnabled({
        env: { DEV: false },
        location: new URL("http://localhost:5173/?demoWorkspace=1"),
        storage: localStorage,
      }),
    ).toBe(false)
  })

  it("does not load a project when the demo flag is absent", () => {
    expect(bootstrapBrowserDemoWorkspace()).toBe(false)
    expect(useProjectStore.getState().isLoaded).toBe(false)
    expect(tauriMocks.invoke).not.toHaveBeenCalled()
  })

  it("seeds an in-memory project, file tree, git state, and timeline when the flag is present", () => {
    window.history.pushState({}, "", "/?demoWorkspace=1")

    expect(bootstrapBrowserDemoWorkspace()).toBe(true)

    const projectState = useProjectStore.getState()
    expect(projectState.isLoaded).toBe(true)
    expect(projectState.project?.name).toBe("Browser Demo Workspace")
    expect(projectState.projectPath).toBeNull()
    expect(useAnimationStore.getState().animations).toHaveLength(1)
    expect(useFileTreeStore.getState().tree[0]?.name).toBe("demo-workspace")
    expect(useGitStore.getState().branch).toBe("demo/browser-workspace")
    expect(tauriMocks.invoke).not.toHaveBeenCalled()
  })

  it("renders the seeded file tree in demo mode without filesystem or watcher IPC", () => {
    window.history.pushState({}, "", "/?demoWorkspace=1")
    seedBrowserDemoWorkspace()
    useProjectStore.setState({ projectPath: "/demo-workspace" })

    render(
      <ToastProvider>
        <FileTree />
      </ToastProvider>,
    )

    expect(screen.getByText("Browser demo tree is read-only and does not call Tauri filesystem IPC.")).toBeInTheDocument()
    expect(screen.getByText("hero-idle-01.png")).toBeInTheDocument()
    expect(tauriMocks.invoke).not.toHaveBeenCalled()
    expect(tauriMocks.listen).not.toHaveBeenCalled()
  })

  it("requires demo workspace plus explicit dev opt-in for the browser AI mock", () => {
    expect(
      isBrowserDemoAiMockEnabled({
        env: { DEV: true, MODE: "development" },
        location: new URL("http://localhost:5173/?demoAiMock=1"),
        storage: localStorage,
      }),
    ).toBe(false)

    expect(
      isBrowserDemoAiMockEnabled({
        env: { DEV: true, MODE: "development" },
        location: new URL("http://localhost:5173/?demoWorkspace=1&demoAiMock=1"),
        storage: localStorage,
      }),
    ).toBe(true)

    expect(
      isBrowserDemoAiMockEnabled({
        env: { DEV: false, MODE: "production" },
        location: new URL("http://localhost:5173/?demoWorkspace=1&demoAiMock=1"),
        storage: localStorage,
      }),
    ).toBe(false)
  })

  it("streams text and requests one harmless project-info tool call", async () => {
    const provider = new BrowserDemoMockLlmProvider()
    const chunks = []

    for await (const chunk of provider.streamChat({
      messages: [{ role: "user", content: "Summarize the demo" }],
      tools: [
        {
          name: "get_project_info",
          description: "Get information about the current project",
          parameters: { type: "object", properties: {} },
        },
      ],
    })) {
      chunks.push(chunk)
    }

    expect(chunks.some((chunk) => chunk.type === "text")).toBe(true)
    expect(chunks).toContainEqual({
      type: "tool_call",
      id: "browser-demo-project-info",
      name: "get_project_info",
      arguments: "{}",
    })
  })

  it("lets useAgent send through the browser AI mock without a real provider key", async () => {
    window.history.pushState({}, "", "/?demoWorkspace=1&demoAiMock=1")
    seedBrowserDemoWorkspace()
    const { result } = renderHook(() => useAgent())

    await act(async () => {
      await result.current.sendMessage("Summarize this demo workspace")
    })

    const messages = getActiveMessages()
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: "user", content: "Summarize this demo workspace" })
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: expect.stringContaining("Browser demo mock response"),
    })
    expect(messages[1]?.toolCalls).toEqual([
      expect.objectContaining({
        id: "browser-demo-project-info",
        name: "get_project_info",
        result: expect.objectContaining({ success: true }),
      }),
    ])
    expect(useChatStore.getState().isLoading).toBe(false)
    expect(tauriMocks.invoke).not.toHaveBeenCalled()
  })
})
