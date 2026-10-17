import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { DocumentPreview } from "../../src/components/canvas/document-preview"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

import { invoke } from "@tauri-apps/api/core"

const invokeMock = vi.mocked(invoke)

function preview(content: string, size = content.length) {
  return { content, size, too_large: false }
}

describe("DocumentPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows loading state initially", () => {
    invokeMock.mockReturnValue(new Promise(() => {})) // never resolves
    render(<DocumentPreview path="/test/readme.md" projectPath="/test" />)
    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("renders markdown content", async () => {
    invokeMock.mockResolvedValue(preview("# Hello World\n\nSome paragraph."))
    render(<DocumentPreview path="/test/readme.md" projectPath="/test" />)

    await waitFor(() => {
      expect(screen.getByText("Hello World")).toBeInTheDocument()
    })
    expect(screen.getByText("Some paragraph.")).toBeInTheDocument()
    expect(invokeMock).toHaveBeenCalledWith("read_text_file_preview", {
      path: "/test/readme.md",
      projectPath: "/test",
      maxBytes: 1_048_576,
    })
  })

  it("renders JSON content as formatted code", async () => {
    const jsonContent = '{"name":"mova","version":1}'
    invokeMock.mockResolvedValue(preview(jsonContent))
    render(<DocumentPreview path="/test/config.json" projectPath="/test" />)

    await waitFor(() => {
      expect(screen.getByText(/"name"/)).toBeInTheDocument()
    })
    // Verify formatted output (indented)
    expect(screen.getByText(/"mova"/)).toBeInTheDocument()
    expect(screen.getByText(/"version"/)).toBeInTheDocument()
  })

  it("renders invalid JSON as plain text", async () => {
    invokeMock.mockResolvedValue(preview("{not valid json}"))
    render(<DocumentPreview path="/test/broken.json" projectPath="/test" />)

    await waitFor(() => {
      expect(screen.getByText("{not valid json}")).toBeInTheDocument()
    })
  })

  it("shows error message when file read fails", async () => {
    invokeMock.mockRejectedValue(new Error("Permission denied"))
    render(<DocumentPreview path="/test/secret.md" projectPath="/test" />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to load file/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Permission denied/)).toBeInTheDocument()
  })

  it("shows error with non-Error thrown value", async () => {
    invokeMock.mockRejectedValue("string error")
    render(<DocumentPreview path="/test/other.md" projectPath="/test" />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to load file/)).toBeInTheDocument()
    })
    expect(screen.getByText(/string error/)).toBeInTheDocument()
  })

  it("does not invoke the backend without a project path", async () => {
    render(<DocumentPreview path="/test/readme.md" projectPath={null} />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to load file/)).toBeInTheDocument()
    })
    expect(screen.getByText(/No project open/)).toBeInTheDocument()
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("shows too-large message for files exceeding 1MB", async () => {
    invokeMock.mockResolvedValue({ content: null, size: 1_048_577, too_large: true })
    render(<DocumentPreview path="/test/huge.md" projectPath="/test" />)

    await waitFor(() => {
      expect(screen.getByText("File too large to preview")).toBeInTheDocument()
    })
    expect(screen.getByText(/exceeds the 1MB preview limit/)).toBeInTheDocument()
  })

  it("reloads file when path changes", async () => {
    invokeMock.mockResolvedValue(preview("# First"))
    const { rerender } = render(<DocumentPreview path="/a.md" projectPath="/test" />)

    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument()
    })

    invokeMock.mockResolvedValue(preview("# Second"))
    rerender(<DocumentPreview path="/b.md" projectPath="/test" />)

    await waitFor(() => {
      expect(screen.getByText("Second")).toBeInTheDocument()
    })
  })
})
