import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { AppHeader } from "../../src/components/layout/toolbar"
import { useProjectStore } from "../../src/stores/project-store"
import { useSettingsStore } from "../../src/stores/settings-store"
import { useFileTreeStore } from "../../src/stores/file-tree-store"
import { useGitStore } from "../../src/stores/git-store"

const invokeMock = vi.fn()
const showToastMock = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}))

describe("AppHeader", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    showToastMock.mockReset()
    useProjectStore.setState({
      project: {
        id: "project-current",
        name: "Untitled Animation Project",
        version: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        characters: [],
        activeCharacterId: null,
        settings: {
          defaultFrameWidth: 64,
          defaultFrameHeight: 64,
          defaultFps: 12,
          defaultArtStyle: "pixel-art",
        },
      },
      projectPath: "/tmp/current",
      isLoaded: true,
    })
    useSettingsStore.setState({
      recentProjects: [
        { name: "Untitled Animation Project", path: "/tmp/current" },
        { name: "Other Project", path: "/tmp/other" },
      ],
    })
    useFileTreeStore.setState({ loadTree: vi.fn().mockResolvedValue(undefined) })
    useGitStore.setState({ loadStatus: vi.fn().mockResolvedValue(undefined) })
  })

  it("shows project/model context and wires primary actions", () => {
    const onExport = vi.fn()
    const onOpenSettings = vi.fn()
    const onBackToHome = vi.fn()

    render(
      <AppHeader
        projectName="Untitled Animation Project"
        modelName="Mova 1.0"
        onExport={onExport}
        onOpenSettings={onOpenSettings}
        onBackToHome={onBackToHome}
      />,
    )

    expect(screen.getByText("Untitled Animation Project")).toBeInTheDocument()
    expect(screen.getByText("Mova 1.0")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "导出" }))
    fireEvent.click(screen.getByRole("button", { name: "设置" }))
    fireEvent.click(screen.getByRole("button", { name: "返回主页" }))

    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(onBackToHome).toHaveBeenCalledTimes(1)
  })

  it("switches projects from the top project dropdown", async () => {
    invokeMock.mockResolvedValue({
      id: "project-other",
      name: "Other Project",
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      characters: [],
      active_character_id: null,
      settings: {
        default_frame_width: 64,
        default_frame_height: 64,
        default_fps: 12,
        default_art_style: "pixel-art",
      },
    })

    render(
      <AppHeader
        projectName="Untitled Animation Project"
        modelName="Mova 1.0"
        onExport={vi.fn()}
        onOpenSettings={vi.fn()}
        onBackToHome={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Untitled Animation Project/i }))
    fireEvent.click(screen.getByRole("menuitem", { name: /Other Project/i }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_project", { path: "/tmp/other" })
      expect(useProjectStore.getState().project?.name).toBe("Other Project")
      expect(useProjectStore.getState().projectPath).toBe("/tmp/other")
    })
  })
})
