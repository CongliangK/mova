import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { FileTree } from "../../src/components/file-tree/FileTree"
import { useFileTreeStore } from "../../src/stores/file-tree-store"
import { useGitStore } from "../../src/stores/git-store"
import { useProjectStore } from "../../src/stores/project-store"
import type { FileNode } from "../../src/types/file-tree"

const invokeMock = vi.fn()
const showToastMock = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
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

const baseTree: FileNode[] = [
  {
    name: "assets",
    path: `${projectPath}/assets`,
    isDirectory: true,
    category: "assets",
    children: [],
  },
]

let currentProjectPath = projectPath
let currentTree: FileNode[] = baseTree

function resetStores() {
  useProjectStore.setState({ project: null, projectPath: currentProjectPath, isLoaded: true })
  useFileTreeStore.setState({
    tree: currentTree,
    currentPath: currentProjectPath,
    expandedPaths: new Set(currentTree.map((node) => node.path)),
    selectedPath: null,
    searchQuery: "",
    isLoading: false,
    error: null,
  })
  useGitStore.setState({
    isRepo: true,
    branch: "main",
    files: [],
    log: [],
    isLoading: false,
    error: null,
  })
}

function createFileCalls() {
  return invokeMock.mock.calls.filter(([command]) => command === "create_file")
}

describe("FileTree create_file IPC payload", () => {
  beforeEach(() => {
    localStorage.clear()
    invokeMock.mockReset()
    showToastMock.mockReset()
    currentProjectPath = projectPath
    currentTree = baseTree
    invokeMock.mockImplementation((command: string) => {
      if (command === "list_project_files") return Promise.resolve(currentTree)
      if (command === "git_status") {
        return Promise.resolve({ is_repo: true, branch: "main", files: [] })
      }
      return Promise.resolve(undefined)
    })
    resetStores()
  })

  it("creates text files with the Rust req wrapper and snake_case image flag", async () => {
    render(<FileTree />)

    fireEvent.contextMenu(await screen.findByText("assets"))
    fireEvent.click(screen.getByRole("button", { name: /new text file/i }))

    const input = await screen.findByPlaceholderText("file.txt")
    fireEvent.change(input, { target: { value: "notes.txt" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => {
      expect(createFileCalls()).toEqual([
        [
          "create_file",
          {
            req: {
              project_path: projectPath,
              parent_path: `${projectPath}/assets`,
              name: "notes.txt",
              content: "",
              is_image: false,
            },
          },
        ],
      ])
    })
  })

  it("creates image files with the Rust req wrapper and snake_case image flag", async () => {
    render(<FileTree />)

    fireEvent.contextMenu(await screen.findByText("assets"))
    fireEvent.click(screen.getByRole("button", { name: /new image file/i }))

    const input = await screen.findByPlaceholderText("image.png")
    fireEvent.change(input, { target: { value: "hero.png" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => {
      expect(createFileCalls()).toEqual([
        [
          "create_file",
          {
            req: {
              project_path: projectPath,
              parent_path: `${projectPath}/assets`,
              name: "hero.png",
              content: "",
              is_image: true,
            },
          },
        ],
      ])
    })
  })

  it("creates text files next to Windows-style file nodes using the containing folder", async () => {
    currentProjectPath = "C:\\tmp\\Mova Project"
    currentTree = [
      {
        name: "assets",
        path: "C:\\tmp\\Mova Project\\assets",
        isDirectory: true,
        category: "assets",
        children: [
          {
            name: "hero.png",
            path: "C:\\tmp\\Mova Project\\assets\\hero.png",
            isDirectory: false,
            category: "assets",
          },
        ],
      },
    ]
    resetStores()

    render(<FileTree />)

    fireEvent.contextMenu(await screen.findByText("hero.png"))
    fireEvent.click(screen.getByRole("button", { name: /new text file/i }))

    const input = await screen.findByPlaceholderText("file.txt")
    fireEvent.change(input, { target: { value: "notes.txt" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => {
      expect(createFileCalls()).toEqual([
        [
          "create_file",
          {
            req: {
              project_path: "C:\\tmp\\Mova Project",
              parent_path: "C:\\tmp\\Mova Project\\assets",
              name: "notes.txt",
              content: "",
              is_image: false,
            },
          },
        ],
      ])
    })
  })

  it.each([
    { label: "forward slash", name: "nested/file.txt", error: /separator/ },
    { label: "backslash", name: "nested\\file.txt", error: /separator/ },
    { label: "single dot", name: ".", error: /directory reference/ },
    { label: "double dot", name: "..", error: /directory reference/ },
    { label: "absolute unix path", name: "/tmp/file.txt", error: /absolute|drive path/ },
    { label: "absolute backslash path", name: "\\tmp\\file.txt", error: /absolute|drive path/ },
    { label: "drive-relative path", name: "C:file.txt", error: /absolute|drive path/ },
    { label: "drive absolute path", name: "C:\\tmp\\file.txt", error: /absolute|drive path/ },
    { label: "control character", name: "bad\u0007name.txt", error: /control characters/ },
  ])("does not invoke create_file for invalid $label names", async ({ name, error }) => {
    render(<FileTree />)

    fireEvent.contextMenu(await screen.findByText("assets"))
    fireEvent.click(screen.getByRole("button", { name: /new text file/i }))

    const input = await screen.findByPlaceholderText("file.txt")
    fireEvent.change(input, { target: { value: name } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => {
      expect(createFileCalls()).toHaveLength(0)
    })
    expect(showToastMock).toHaveBeenCalledWith("error", expect.stringMatching(error))
  })
})
