import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ChatPanel } from "../../src/components/chat/chat-panel"
import { useChatStore } from "../../src/stores/chat-store"
import { useProjectStore } from "../../src/stores/project-store"
import { MOVA_FILE_DRAG_TYPE } from "../../src/utils/file-drag"

const sendMessageMock = vi.hoisted(() => vi.fn())

vi.mock("../../src/hooks/use-agent", () => ({
  useAgent: () => ({ sendMessage: sendMessageMock }),
}))

const projectPath = "/tmp/Mova Project"

function renderPanel() {
  render(<ChatPanel />)
  const input = screen.getByPlaceholderText(
    "Describe the animation...",
  ) as HTMLInputElement
  const dropZone = input.parentElement
  if (!dropZone) throw new Error("Expected chat input drop zone")
  return { input, dropZone }
}

function changeInput(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } })
}

function dropPlainText(dropZone: HTMLElement, text: string) {
  fireEvent.drop(dropZone, {
    dataTransfer: {
      dropEffect: "",
      files: [] as unknown as FileList,
      getData: (type: string) => (type === "text/plain" ? text : ""),
      types: ["text/plain"],
    },
  })
}

function dropMovaFilePayload(dropZone: HTMLElement, path: string) {
  fireEvent.drop(dropZone, {
    dataTransfer: {
      dropEffect: "",
      files: [] as unknown as FileList,
      getData: (type: string) => {
        if (type === MOVA_FILE_DRAG_TYPE) {
          return JSON.stringify({
            path,
            name: path.split("/").pop(),
            category: "character",
            isDirectory: false,
          })
        }
        if (type === "text/plain") return path
        return ""
      },
      types: [MOVA_FILE_DRAG_TYPE, "text/plain"],
    },
  })
}

function dropBrowserFiles(dropZone: HTMLElement, files: File[]) {
  fireEvent.drop(dropZone, {
    dataTransfer: {
      dropEffect: "",
      files: files as unknown as FileList,
      getData: () => "",
      types: ["Files"],
    },
  })
}

describe("ChatPanel image path drops", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    sendMessageMock.mockReset()
    useProjectStore.setState({ project: null, projectPath, isLoaded: true })
    useChatStore.setState({
      activeProjectId: "project-1",
      activeConversationId: "conversation-1",
      conversations: [
        {
          id: "conversation-1",
          title: "Drop regression",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          messages: [],
        },
      ],
      isLoading: false,
      projectConversations: {},
    })
  })

  it("inserts structured file-tree payloads as project-relative paths", () => {
    const { input, dropZone } = renderPanel()
    changeInput(input, "Animate this")

    dropMovaFilePayload(
      dropZone,
      `${projectPath}/assets/characters/勇者 Idle.PNG`,
    )

    expect(input.value).toBe("Animate this\nassets/characters/勇者 Idle.PNG")
  })

  it("preserves a plain text image path exactly once", () => {
    const { input, dropZone } = renderPanel()

    dropPlainText(dropZone, "/tmp/hero.png")

    expect(input.value).toBe("/tmp/hero.png")
  })

  it("inserts newline-separated plain text paths and keeps outside paths absolute", () => {
    const { input, dropZone } = renderPanel()
    changeInput(input, "Compare")

    dropPlainText(
      dropZone,
      `${projectPath}/assets/characters/hero.png\n/tmp/outside-library/idle.png`,
    )

    expect(input.value).toBe(
      "Compare\nassets/characters/hero.png\n/tmp/outside-library/idle.png",
    )
  })

  it("inserts one browser PNG file name as plain path text", () => {
    const { input, dropZone } = renderPanel()

    dropBrowserFiles(dropZone, [
      new File([new Uint8Array([137, 80, 78, 71])], "hero.png", {
        type: "image/png",
      }),
    ])

    expect(input.value).toBe("hero.png")
  })

  it("inserts multiple browser image file names as newline-separated plain paths", () => {
    const { input, dropZone } = renderPanel()

    dropBrowserFiles(dropZone, [
      new File([new Uint8Array([137, 80, 78, 71])], "hero.png", {
        type: "image/png",
      }),
      new File([new Uint8Array([255, 216])], "walk cycle.jpg", {
        type: "image/jpeg",
      }),
      new File([new Uint8Array([82, 73, 70, 70])], "tile.webp", {
        type: "image/webp",
      }),
    ])

    expect(input.value).toBe("hero.png\nwalk cycle.jpg\ntile.webp")
  })

  it("rejects non-image browser files without changing the input", () => {
    const { input, dropZone } = renderPanel()
    changeInput(input, "Keep this prompt")

    dropBrowserFiles(dropZone, [
      new File(["notes"], "notes.txt", { type: "text/plain" }),
    ])

    expect(input.value).toBe("Keep this prompt")
  })
})
