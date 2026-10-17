import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { FileTree } from "../../src/components/file-tree/FileTree"
import { GitStatusBar } from "../../src/components/git/git-status-bar"
import { useFileTreeStore } from "../../src/stores/file-tree-store"
import { useGitStore } from "../../src/stores/git-store"
import { useProjectStore } from "../../src/stores/project-store"
import type { FileNode } from "../../src/types/file-tree"

const invokeMock = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock("lucide-react", () => {
  const icons = [
    "Search",
    "Folder",
    "FolderOpen",
    "File",
    "FileText",
    "Image",
    "ChevronRight",
    "Loader2",
    "AlertCircle",
    "GitBranch",
    "ExternalLink",
    "RefreshCw",
  ]
  const mock: Record<string, React.FC<{ size?: number; className?: string }>> = {}
  for (const name of icons) {
    mock[name] = function MockIcon(props: { size?: number; className?: string }) {
      return React.createElement("svg", {
        "data-testid": name.toLowerCase(),
        className: props.className,
      })
    }
  }
  return mock
})

const projectPath = "/tmp/Mova Project"

const tree: FileNode[] = [
  {
    name: "assets",
    path: `${projectPath}/assets`,
    isDirectory: true,
    category: "assets",
    children: [
      {
        name: "hero sprite.png",
        path: `${projectPath}/assets/hero sprite.png`,
        isDirectory: false,
        category: "assets",
      },
      {
        name: "draft.txt",
        path: `${projectPath}/assets/draft.txt`,
        isDirectory: false,
        category: "assets",
      },
    ],
  },
]

function resetStores() {
  useProjectStore.setState({ project: null, projectPath, isLoaded: true })
  useFileTreeStore.setState({
    tree,
    currentPath: projectPath,
    expandedPaths: new Set([`${projectPath}/assets`]),
    selectedPath: null,
    searchQuery: "",
    isLoading: false,
    error: null,
  })
  useGitStore.setState({
    isRepo: true,
    branch: "main",
    files: [
      { path: "assets/hero sprite.png", status: "modified" },
      { path: "assets/draft.txt", status: "untracked" },
    ],
    log: [],
    isLoading: false,
    error: null,
  })
}

describe("Git file tree badges", () => {
  beforeEach(() => {
    localStorage.clear()
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      if (command === "list_project_files") return Promise.resolve(tree)
      if (command === "git_status") {
        return Promise.resolve({
          is_repo: true,
          branch: "main",
          files: [
            { path: "assets/hero sprite.png", status: "modified" },
            { path: "assets/draft.txt", status: "untracked" },
          ],
        })
      }
      return Promise.resolve(undefined)
    })
    resetStores()
  })

  it("maps relative Git status paths onto absolute file-tree nodes including spaces", async () => {
    render(<FileTree />)

    expect(await screen.findByText("hero sprite.png")).toBeInTheDocument()
    expect(screen.getByText("draft.txt")).toBeInTheDocument()
    expect(screen.getByText("M")).toBeInTheDocument()
    expect(screen.getByText("U")).toBeInTheDocument()
  })

  it("shows an init action without crashing for uninitialized projects", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "list_project_files") return Promise.resolve(tree)
      if (command === "git_status") {
        return Promise.resolve({ is_repo: false, branch: "", files: [] })
      }
      return Promise.resolve(undefined)
    })
    useGitStore.setState({ isRepo: false, branch: "", files: [], isLoading: false })

    render(<FileTree />)

    expect(await screen.findByText("Initialize Git Repository")).toBeInTheDocument()
    expect(screen.queryByText("M")).not.toBeInTheDocument()
  })

  it("surfaces add, commit, and log as an explicit deferred Git workflow", async () => {
    render(<GitStatusBar />)

    await waitFor(() => expect(screen.getByText("main")).toBeInTheDocument())
    const deferredAction = screen.getByRole("button", { name: /add, commit, and log deferred/i })
    expect(deferredAction).toBeDisabled()
    expect(deferredAction).toHaveAttribute(
      "title",
      "Git add, commit, and log commands exist in the backend store but need a dedicated history/staging workflow before they can safely modify project repositories.",
    )
  })
})
