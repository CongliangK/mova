import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { AppLayout } from "../../src/components/layout/app-layout"
import { useProjectStore } from "../../src/stores/project-store"
import { useSettingsStore } from "../../src/stores/settings-store"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock("../../src/components/layout/resizable-panel", () => ({
  ResizablePanel: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}))

vi.mock("../../src/components/layout/toolbar", () => ({
  AppHeader: () => <header>Toolbar</header>,
  Toolbar: () => <header>Toolbar</header>,
}))

vi.mock("../../src/components/git/git-status-bar", () => ({
  GitStatusBar: () => <span>main | 0 changes</span>,
}))

vi.mock("../../src/components/git/git-panel", () => ({
  GitPanel: () => <div>Git Panel</div>,
}))

vi.mock("../../src/components/chat/chat-history-panel", () => ({
  ChatHistoryPanel: () => <div>AI History Panel</div>,
}))

vi.mock("../../src/components/canvas/animation-timeline", () => ({
  AnimationTimeline: () => <div>Timeline Panel</div>,
}))

function renderLayout() {
  return render(
    <AppLayout
      sidebar={<div>Files Panel</div>}
      canvas={<main>Canvas Panel</main>}
      chat={<aside>Chat Panel</aside>}
      onExport={vi.fn()}
      onOpenSettings={vi.fn()}
      onBackToHome={vi.fn()}
    />,
  )
}

describe("AppLayout dock panels", () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: {
        id: "project-1",
        name: "Panel Project",
        version: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        activeCharacterId: null,
        characters: [],
        settings: {
          defaultFrameWidth: 64,
          defaultFrameHeight: 64,
          defaultFps: 12,
          defaultArtStyle: "pixel-art",
        },
      },
      projectPath: "/tmp/panel-project",
      isLoaded: true,
    })
    useSettingsStore.setState({
      llmConfigs: [{
        provider: "openai",
        model: "Mova 1.0",
        apiKey: null,
        baseUrl: null,
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2048,
        frequencyPenalty: 0,
        systemPrompt: null,
      }],
      activeLlmIndex: 0,
    })
  })

  it("toggles left, timeline, and right panels from the dock", () => {
    renderLayout()

    expect(screen.getByText("Files Panel")).toBeInTheDocument()
    expect(screen.getByText("Timeline Panel")).toBeInTheDocument()
    expect(screen.getByText("Chat Panel")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /文件树/i }))
    expect(screen.getByText("Files Panel")).not.toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: /^Git$/i }))
    expect(screen.getByText("Git Panel")).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: /时间轴/i }))
    expect(screen.getByText("Timeline Panel")).not.toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: /AI 对话/i }))
    expect(screen.getByText("Chat Panel")).not.toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: /AI 历史/i }))
    expect(screen.getByText("AI History Panel")).toBeVisible()
  })
})
