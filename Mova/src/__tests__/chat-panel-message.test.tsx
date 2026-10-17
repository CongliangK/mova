import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ChatPanel } from "../../src/components/chat/chat-panel"
import { useChatStore } from "../../src/stores/chat-store"
import type { ChatMessage } from "../../src/types/ai"

vi.mock("../../src/hooks/use-agent", () => ({
  useAgent: () => ({ sendMessage: vi.fn() }),
}))

function renderMessages(messages: ChatMessage[]) {
  useChatStore.setState({
    activeProjectId: "project-1",
    activeConversationId: "conversation-1",
    conversations: [
      {
        id: "conversation-1",
        title: "Rendered message",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        messages,
      },
    ],
    isLoading: false,
    projectConversations: {},
  })

  return render(<ChatPanel />)
}

describe("ChatPanel message rendering", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it("renders markdown images with constrained width and wraps long content", () => {
    const { container } = renderMessages([
      {
        id: "message-1",
        role: "assistant",
        content:
          "| Frame | 描述 | Preview |\n|---|---|---|\n| Frame 4 | 左脚前迈 | ![Frame 4](/tmp/mova/assets/characters/frame-4.png) |\n\nhttps://openpt1.wuyinkeji.com/cb7d71ef0b9546ad969a747d312e3090.png?very-long-path-that-should-not-overflow-the-chat-column=true",
        artifacts: [],
        toolCalls: null,
        timestamp: "2026-01-01T00:00:00Z",
      },
    ])

    const image = screen.getByAltText("Frame 4")
    expect(image).toHaveAttribute(
      "src",
      "/tmp/mova/assets/characters/frame-4.png",
    )
    expect(image).toHaveClass("max-w-full")
    expect(
      screen.getByText(/very-long-path-that-should-not-overflow/),
    ).toBeInTheDocument()
    expect(
      Array.from(container.querySelectorAll("div")).some((el) =>
        el.className.includes("[overflow-wrap:anywhere]"),
      ),
    ).toBe(true)
  })

  it("shows process_sprite QC warnings in tool call results", () => {
    renderMessages([
      {
        id: "message-1",
        role: "assistant",
        content: "Processed sprite sheet.",
        artifacts: [],
        toolCalls: [
          {
            id: "tool-1",
            name: "process_sprite",
            arguments: { imagePath: "/tmp/raw.png", grid: "2x1" },
            result: {
              success: true,
              data: {
                manifestPath: "/tmp/mova/assets/frames/processed/manifest.json",
                qc: {
                  warnings: [
                    "Frames touching cell edges may be clipped or incomplete: 0.",
                    "Frame content sizes are inconsistent: 32x64 (1), 64x64 (1).",
                  ],
                },
              },
            },
          },
        ],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ])

    expect(screen.getByText("Sprite QC 有警告")).toBeInTheDocument()
    expect(screen.getByText("有警告")).toBeInTheDocument()
    expect(
      screen.getByText("Frames touching cell edges may be clipped or incomplete: 0."),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Frame content sizes are inconsistent: 32x64 (1), 64x64 (1)."),
    ).toBeInTheDocument()
    expect(screen.getByText(/QC Manifest: \/tmp\/mova\/assets\/frames\/processed\/manifest\.json/)).toBeInTheDocument()
  })

  it("shows a clean process_sprite QC pass state", () => {
    renderMessages([
      {
        id: "message-1",
        role: "assistant",
        content: "Processed sprite sheet.",
        artifacts: [],
        toolCalls: [
          {
            id: "tool-1",
            name: "process_sprite",
            arguments: { imagePath: "/tmp/raw.png", grid: "2x1" },
            result: {
              success: true,
              data: { qc: { warnings: [] } },
            },
          },
        ],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ])

    expect(screen.getByText("Sprite QC 通过")).toBeInTheDocument()
  })

  it("renders process_sprite results with missing QC safely", () => {
    renderMessages([
      {
        id: "message-1",
        role: "assistant",
        content: "Processed sprite sheet.",
        artifacts: [],
        toolCalls: [
          {
            id: "tool-1",
            name: "process_sprite",
            arguments: { imagePath: "/tmp/raw.png", grid: "2x1" },
            result: { success: true, data: { framePaths: ["/tmp/frame-0.png"] } },
          },
        ],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ])

    expect(screen.getByText("Sprite QC 未返回可显示的结果")).toBeInTheDocument()
  })
})
