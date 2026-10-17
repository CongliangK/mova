import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { Sidebar } from "../../src/components/layout/sidebar"
import { useProjectStore } from "../../src/stores/project-store"
import { useFileTreeStore } from "../../src/stores/file-tree-store"

vi.mock("../../src/components/file-tree/FileTree", () => ({
  FileTree: () => <div data-testid="file-tree">File tree content</div>,
}))

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

describe("Sidebar", () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: {
        id: "project-1",
        name: "Assets Project",
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
      projectPath: "/tmp/assets-project",
      isLoaded: true,
    })
    useFileTreeStore.setState({
      isLoading: false,
      refresh: vi.fn().mockResolvedValue(undefined),
    })
  })

  it("only renders project assets and file tree controls", () => {
    render(<Sidebar />)

    expect(screen.getByText("项目资源")).toBeInTheDocument()
    expect(screen.getByTestId("file-tree")).toBeInTheDocument()
    expect(screen.queryByText("Characters")).not.toBeInTheDocument()
    expect(screen.queryByText("Recent Projects")).not.toBeInTheDocument()
    expect(screen.queryByText("Timeline")).not.toBeInTheDocument()
  })
})
