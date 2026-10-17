import { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { isBrowserDemoWorkspaceEnabled } from "../../dev/browser-demo-workspace"

interface DocumentPreviewProps {
  path: string
  projectPath: string | null
}

interface TextFilePreview {
  content: string | null
  size: number
  too_large: boolean
}

const MAX_PREVIEW_SIZE = 1_048_576 // 1MB

function getDemoDocumentContent(path: string) {
  if (path.endsWith("project.json")) {
    return JSON.stringify(
      {
        name: "Browser Demo Workspace",
        mode: "dev-only",
        filesystem: "disabled",
        purpose: "Chrome panel drag/resizable performance testing",
      },
      null,
      2,
    )
  }

  if (path.endsWith("notes.md")) {
    return [
      "# Browser demo workspace",
      "",
      "This preview is synthetic and does not read from disk.",
      "",
      "Use the Files, Git, AI Chat, and Timeline panel toggles/resizers for performance testing.",
    ].join("\n")
  }

  return null
}

export function DocumentPreview({ path, projectPath }: DocumentPreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLarge, setIsLarge] = useState(false)
  const [fileSize, setFileSize] = useState<number>(0)

  const loadFile = useCallback(async () => {
    setError(null)
    setContent(null)
    setIsLarge(false)

    if (isBrowserDemoWorkspaceEnabled()) {
      const demoContent = getDemoDocumentContent(path)
      setFileSize(demoContent?.length ?? 0)
      setContent(demoContent ?? "Browser demo file preview is synthetic and read-only.")
      return
    }

    if (!projectPath) {
      setError("No project open")
      return
    }

    try {
      const preview = await invoke<TextFilePreview>("read_text_file_preview", {
        path,
        projectPath,
        maxBytes: MAX_PREVIEW_SIZE,
      })
      if (preview.too_large) {
        setIsLarge(true)
        setFileSize(preview.size)
        return
      }
      setFileSize(preview.size)
      setContent(preview.content ?? "")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [path, projectPath])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFile()
    }, 0)

    return () => clearTimeout(timer)
  }, [loadFile])

  const isJson = path.toLowerCase().endsWith(".json")

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        <p>Failed to load file: {error}</p>
      </div>
    )
  }

  if (isLarge) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-secondary)]">
        <div className="text-center">
          <p className="text-lg">File too large to preview</p>
          <p className="mt-1 text-sm">{(fileSize / 1024 / 1024).toFixed(1)}MB exceeds the 1MB preview limit</p>
        </div>
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-secondary)]">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4">
      {isJson ? (
        <RenderJson content={content} />
      ) : (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}

function RenderJson({ content }: { content: string }) {
  const previewContent = getJsonPreviewContent(content)

  return (
    <pre className="overflow-auto rounded bg-[var(--color-bg-secondary)] p-4 text-sm">
      <code>{previewContent}</code>
    </pre>
  )
}

function getJsonPreviewContent(content: string) {
  try {
    const parsed = JSON.parse(content)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return content
  }
}
