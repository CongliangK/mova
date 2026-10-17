import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { AppLayout } from "../../src/components/layout/app-layout"
import { useFileTreeStore } from "../../src/stores/file-tree-store"
import { useProjectStore } from "../../src/stores/project-store"

const invokeMock = vi.fn()
const showToastMock = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}))

vi.mock("../../src/components/layout/resizable-panel", () => ({
  ResizablePanel: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}))

vi.mock("../../src/components/layout/toolbar", () => ({
  AppHeader: () => <header>Toolbar</header>,
  Toolbar: () => <header>Toolbar</header>,
}))

vi.mock("../../src/components/layout/status-bar", () => ({
  StatusBar: () => <footer>Status</footer>,
}))

const projectPath = "/tmp/Mova Project"

function renderLayout() {
  return render(
    <AppLayout
      sidebar={<div>Sidebar</div>}
      canvas={<main>Canvas</main>}
      chat={<aside>Chat</aside>}
      onExport={vi.fn()}
      onOpenSettings={vi.fn()}
      onBackToHome={vi.fn()}
    />,
  )
}

function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByText("Canvas").closest("div")!, {
    dataTransfer: {
      files,
      types: ["Files"],
    },
  })
}

describe("AppLayout drag import IPC payload", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    showToastMock.mockReset()
    vi.restoreAllMocks()
    useProjectStore.setState({ project: null, projectPath, isLoaded: true })
    useFileTreeStore.setState({ refresh: vi.fn().mockResolvedValue(undefined) })
  })

  it("imports dropped text files with the Rust req wrapper and snake_case image flag", async () => {
    renderLayout()

    dropFiles([new File(["hello"], "notes.txt", { type: "text/plain" })])

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_file", {
        req: {
          project_path: projectPath,
          parent_path: projectPath,
          name: "notes.txt",
          content: "hello",
          is_image: false,
        },
      })
    })
  })

  it("imports dropped image files with sanitized collision-resistant asset paths while preserving their bytes", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("11111111-1111-4111-8111-111111111111")
    renderLayout()

    const pngBytes = [137, 80, 78, 71, 13, 10, 26, 10]
    dropFiles([new File([new Uint8Array(pngBytes)], "勇者 Idle.PNG", { type: "image/png" })])

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
        projectPath: expect.any(String),
        path: `${projectPath}/assets/characters/Idle-11111111-1111-4111-8111-111111111111.png`,
        data: pngBytes,
      })
    })
    expect(invokeMock).not.toHaveBeenCalledWith("create_file", expect.anything())
  })

  it("uses different image import paths when one drop contains duplicate original names", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")
    renderLayout()

    dropFiles([
      new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" }),
      new File([new Uint8Array([4, 5, 6])], "hero.png", { type: "image/png" }),
    ])

    await waitFor(() => {
      const saveCalls = invokeMock.mock.calls.filter(([command]) => command === "save_image_bytes")
      expect(saveCalls).toHaveLength(2)
      expect(saveCalls[0]?.[1]).toMatchObject({
        path: `${projectPath}/assets/characters/hero-11111111-1111-4111-8111-111111111111.png`,
        data: [1, 2, 3],
      })
      expect(saveCalls[1]?.[1]).toMatchObject({
        path: `${projectPath}/assets/characters/hero-22222222-2222-4222-8222-222222222222.png`,
        data: [4, 5, 6],
      })
    })
  })

  it("skips unsupported dropped files and reports them", async () => {
    renderLayout()

    dropFiles([new File(["binary"], "archive.zip", { type: "application/zip" })])

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("warning", "Skipped 1 unsupported file")
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
