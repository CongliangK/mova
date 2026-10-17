import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { FileTreeNode } from "../../src/components/file-tree/FileTreeNode"
import type { FileNode } from "../../src/types/file-tree"
import { useFileTreeStore } from "../../src/stores/file-tree-store"
import { MOVA_FILE_DRAG_TYPE } from "../../src/utils/file-drag"

// Mock the Tauri IPC used by the store
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}))

// Mock lucide-react to render simple SVG stubs
vi.mock("lucide-react", () => {
  const icons = [
    "Folder",
    "FolderOpen",
    "File",
    "FileText",
    "Image",
    "ChevronRight",
  ]
  const mock: Record<
    string,
    React.FC<{ size?: number; className?: string }>
  > = {}
  for (const name of icons) {
    mock[name] = function MockIcon(props: {
      size?: number
      className?: string
    }) {
      return React.createElement("svg", {
        "data-testid": name.toLowerCase(),
        className: props.className,
      })
    }
  }
  return mock
})

function createFileNode(overrides: Partial<FileNode> = {}): FileNode {
  return {
    name: "file.txt",
    path: "/project/file.txt",
    isDirectory: false,
    category: "files",
    ...overrides,
  }
}

describe("FileTreeNode", () => {
  beforeEach(() => {
    // Reset the store to clean state
    useFileTreeStore.setState({
      expandedPaths: new Set(),
      selectedPath: null,
    })
  })

  describe("rendering", () => {
    it("renders file name", () => {
      const node = createFileNode({ name: "readme.md" })
      render(<FileTreeNode node={node} />)
      expect(screen.getByText("readme.md")).toBeInTheDocument()
    })

    it("renders directory name with chevron", () => {
      const node = createFileNode({
        name: "assets",
        path: "/project/assets",
        isDirectory: true,
      })
      render(<FileTreeNode node={node} />)
      expect(screen.getByText("assets")).toBeInTheDocument()
      expect(screen.getByTestId("chevronright")).toBeInTheDocument()
    })

    it("renders git status badge for modified file", () => {
      const node = createFileNode({
        name: "changed.ts",
        path: "/project/changed.ts",
        gitStatus: "modified",
      })
      render(<FileTreeNode node={node} />)
      expect(screen.getByText("M")).toBeInTheDocument()
    })

    it("renders git status badge from gitStatusMap", () => {
      const node = createFileNode({
        name: "staged.ts",
        path: "/project/staged.ts",
      })
      const statusMap = new Map<string, string>()
      statusMap.set("/project/staged.ts", "staged")
      render(<FileTreeNode node={node} gitStatusMap={statusMap} />)
      expect(screen.getByText("A")).toBeInTheDocument()
    })

    it("renders untracked badge", () => {
      const node = createFileNode({
        name: "new.ts",
        path: "/project/new.ts",
        gitStatus: "untracked",
      })
      render(<FileTreeNode node={node} />)
      expect(screen.getByText("U")).toBeInTheDocument()
    })

    it("does not render git badge for directories", () => {
      const node = createFileNode({
        name: "src",
        path: "/project/src",
        isDirectory: true,
        gitStatus: "modified",
      })
      render(<FileTreeNode node={node} />)
      expect(screen.queryByText("M")).not.toBeInTheDocument()
    })

    it("does not render badge for ignored files", () => {
      const node = createFileNode({
        name: "lock.json",
        path: "/project/lock.json",
        gitStatus: "ignored",
      })
      render(<FileTreeNode node={node} />)
      // ignored has empty letter, so no badge text
      expect(screen.queryByText("C")).not.toBeInTheDocument()
      expect(screen.queryByText("M")).not.toBeInTheDocument()
    })
  })

  describe("expand/collapse", () => {
    it("toggles expansion when directory is clicked", () => {
      const childNode = createFileNode({
        name: "inner.txt",
        path: "/project/folder/inner.txt",
      })
      const dirNode = createFileNode({
        name: "folder",
        path: "/project/folder",
        isDirectory: true,
        children: [childNode],
      })
      const { rerender } = render(<FileTreeNode node={dirNode} />)

      // Children should NOT be visible initially
      expect(screen.queryByText("inner.txt")).not.toBeInTheDocument()

      // Click to expand
      fireEvent.click(screen.getByText("folder"))
      // Need to rerender because store change triggers re-render
      rerender(<FileTreeNode node={dirNode} />)

      // Children should be visible now
      expect(screen.getByText("inner.txt")).toBeInTheDocument()

      // Click again to collapse
      fireEvent.click(screen.getByText("folder"))
      rerender(<FileTreeNode node={dirNode} />)
      expect(screen.queryByText("inner.txt")).not.toBeInTheDocument()
    })

    it("does not show children for empty directories", () => {
      const dirNode = createFileNode({
        name: "empty",
        path: "/project/empty",
        isDirectory: true,
        children: [],
      })
      // Expand it
      useFileTreeStore.setState({ expandedPaths: new Set(["/project/empty"]) })
      render(<FileTreeNode node={dirNode} />)
      // Should render without error, just no children list
      expect(screen.getByText("empty")).toBeInTheDocument()
    })
  })

  describe("file selection", () => {
    it("selects file when clicked", () => {
      const node = createFileNode({
        name: "app.ts",
        path: "/project/app.ts",
      })
      render(<FileTreeNode node={node} />)
      fireEvent.click(screen.getByText("app.ts"))
      expect(useFileTreeStore.getState().selectedPath).toBe("/project/app.ts")
    })

    it("does not select directories when clicked", () => {
      const node = createFileNode({
        name: "assets",
        path: "/project/assets",
        isDirectory: true,
        children: [],
      })
      render(<FileTreeNode node={node} />)
      fireEvent.click(screen.getByText("assets"))
      expect(useFileTreeStore.getState().selectedPath).toBeNull()
      expect(
        useFileTreeStore.getState().expandedPaths.has("/project/assets"),
      ).toBe(true)
    })
  })

  describe("drag payload", () => {
    it("sets both text and structured file payloads for file drags", () => {
      const node = createFileNode({
        name: "hero.png",
        path: "/project/assets/characters/hero.png",
        category: "character",
      })
      const setData = vi.fn()
      render(<FileTreeNode node={node} />)

      fireEvent.dragStart(screen.getByRole("button"), {
        dataTransfer: {
          setData,
          effectAllowed: "",
        },
      })

      expect(setData).toHaveBeenCalledWith("text/plain", node.path)
      expect(setData).toHaveBeenCalledWith(
        MOVA_FILE_DRAG_TYPE,
        JSON.stringify({
          path: node.path,
          name: node.name,
          category: node.category,
          isDirectory: false,
        }),
      )
    })
  })

  describe("context menu", () => {
    it("calls onContextMenu on right-click", () => {
      const onContextMenu = vi.fn()
      const node = createFileNode({
        name: "file.ts",
        path: "/project/file.ts",
      })
      render(<FileTreeNode node={node} onContextMenu={onContextMenu} />)
      fireEvent.contextMenu(screen.getByText("file.ts"))
      expect(onContextMenu).toHaveBeenCalledOnce()
      expect(onContextMenu.mock.calls[0][1]).toEqual(node)
    })
  })

  describe("create input", () => {
    it("shows input when creatingParentPath matches node path", () => {
      const dirNode = createFileNode({
        name: "src",
        path: "/project/src",
        isDirectory: true,
        children: [],
      })
      useFileTreeStore.setState({ expandedPaths: new Set(["/project/src"]) })
      render(
        <FileTreeNode
          node={dirNode}
          creatingParentPath="/project/src"
          creatingIsImage={false}
        />,
      )
      const input = screen.getByPlaceholderText("file.txt")
      expect(input).toBeInTheDocument()
    })

    it("shows image placeholder when creatingIsImage is true", () => {
      const dirNode = createFileNode({
        name: "img",
        path: "/project/img",
        isDirectory: true,
        children: [],
      })
      useFileTreeStore.setState({ expandedPaths: new Set(["/project/img"]) })
      render(
        <FileTreeNode
          node={dirNode}
          creatingParentPath="/project/img"
          creatingIsImage={true}
        />,
      )
      expect(screen.getByPlaceholderText("image.png")).toBeInTheDocument()
    })

    it("submits on Enter key", () => {
      const onSubmit = vi.fn()
      const dirNode = createFileNode({
        name: "src",
        path: "/project/src",
        isDirectory: true,
        children: [],
      })
      useFileTreeStore.setState({ expandedPaths: new Set(["/project/src"]) })
      render(
        <FileTreeNode
          node={dirNode}
          creatingParentPath="/project/src"
          onCreateSubmit={onSubmit}
        />,
      )
      const input = screen.getByPlaceholderText("file.txt")
      fireEvent.change(input, { target: { value: "newfile.ts" } })
      fireEvent.keyDown(input, { key: "Enter" })
      expect(onSubmit).toHaveBeenCalledWith("newfile.ts")
    })

    it("cancels on Escape key", () => {
      const onCancel = vi.fn()
      const dirNode = createFileNode({
        name: "src",
        path: "/project/src",
        isDirectory: true,
        children: [],
      })
      useFileTreeStore.setState({ expandedPaths: new Set(["/project/src"]) })
      render(
        <FileTreeNode
          node={dirNode}
          creatingParentPath="/project/src"
          onCreateCancel={onCancel}
        />,
      )
      fireEvent.keyDown(screen.getByPlaceholderText("file.txt"), {
        key: "Escape",
      })
      expect(onCancel).toHaveBeenCalledOnce()
    })

    it("does not submit empty name", () => {
      const onSubmit = vi.fn()
      const dirNode = createFileNode({
        name: "src",
        path: "/project/src",
        isDirectory: true,
        children: [],
      })
      useFileTreeStore.setState({ expandedPaths: new Set(["/project/src"]) })
      render(
        <FileTreeNode
          node={dirNode}
          creatingParentPath="/project/src"
          onCreateSubmit={onSubmit}
        />,
      )
      fireEvent.keyDown(screen.getByPlaceholderText("file.txt"), {
        key: "Enter",
      })
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })
})
