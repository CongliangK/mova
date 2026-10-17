import { useState, useCallback, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ResizablePanel } from "./resizable-panel"
import { AppHeader } from "./toolbar"
import { StatusBar, type LeftPanel, type RightPanel } from "./status-bar"
import { AnimationTimeline } from "../canvas/animation-timeline"
import { ChatHistoryPanel } from "../chat/chat-history-panel"
import { GitPanel } from "../git/git-panel"
import { useProjectStore } from "../../stores/project-store"
import { useFileTreeStore } from "../../stores/file-tree-store"
import { useSettingsStore } from "../../stores/settings-store"
import { useToast } from "../../hooks/use-toast"
import { logDnd } from "../../utils/dnd-debug"
import { isBrowserDemoWorkspaceEnabled } from "../../dev/browser-demo-workspace"

interface PanelLayoutProps {
  sidebar: ReactNode
  canvas: ReactNode
  chat: ReactNode
  onExport: () => void
  onOpenSettings: () => void
  onBackToHome: () => void
}

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif",
])

const SUPPORTED_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  "txt", "md", "json", "yaml", "yml", "toml", "xml", "csv",
  "js", "ts", "tsx", "jsx", "css", "html",
  "glsl", "vert", "frag", "lua", "py",
])

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".")
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ""
}

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filename))
}

function isSupported(filename: string): boolean {
  const ext = getExtension(filename)
  return ext !== "" && SUPPORTED_EXTENSIONS.has(ext)
}

function getImportedImagePath(projectPath: string, fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".")
  const rawName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const extension = dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : ""
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image"
  return `${projectPath}/assets/characters/${safeName}-${crypto.randomUUID()}${extension}`
}

export function AppLayout({ sidebar, canvas, chat, onExport, onOpenSettings, onBackToHome }: PanelLayoutProps) {
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("files")
  const [rightPanel, setRightPanel] = useState<RightPanel>("chat")
  const [timelineVisible, setTimelineVisible] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)
  const [hasMountedGit, setHasMountedGit] = useState(false)
  const [hasMountedHistory, setHasMountedHistory] = useState(false)
  const project = useProjectStore((s) => s.project)
  const projectPath = useProjectStore((s) => s.projectPath)
  const refreshTree = useFileTreeStore((s) => s.refresh)
  const llmConfigs = useSettingsStore((s) => s.llmConfigs)
  const activeLlmIndex = useSettingsStore((s) => s.activeLlmIndex)
  const toast = useToast()
  const browserDemoWorkspace = isBrowserDemoWorkspaceEnabled()
  const modelName = llmConfigs[activeLlmIndex]?.model ?? "No model"

  const toggleFiles = useCallback(() => {
    setLeftPanel((panel) => (panel === "files" ? null : "files"))
  }, [])

  const toggleGit = useCallback(() => {
    setHasMountedGit(true)
    setLeftPanel((panel) => (panel === "git" ? null : "git"))
  }, [])

  const toggleTimeline = useCallback(() => {
    setTimelineVisible((visible) => !visible)
  }, [])

  const toggleChat = useCallback(() => {
    setRightPanel((panel) => (panel === "chat" ? null : "chat"))
  }, [])

  const toggleHistory = useCallback(() => {
    setHasMountedHistory(true)
    setRightPanel((panel) => (panel === "history" ? null : "history"))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    logDnd("app dragover", {
      types: Array.from(e.dataTransfer.types ?? []),
      files: (e.dataTransfer.files?.length ?? 0),
      target: e.target instanceof HTMLElement ? e.target.dataset.testid ?? e.target.tagName : String(e.target),
    })
    e.preventDefault()
    e.stopPropagation()
    if (!browserDemoWorkspace && e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true)
    }
  }, [browserDemoWorkspace])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const { clientX, clientY } = e
    if (
      clientX <= rect.left || clientX >= rect.right ||
      clientY <= rect.top || clientY >= rect.bottom
    ) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    logDnd("app drop", {
      types: Array.from(e.dataTransfer.types ?? []),
      files: (e.dataTransfer.files?.length ?? 0),
      target: e.target instanceof HTMLElement ? e.target.dataset.testid ?? e.target.tagName : String(e.target),
    })
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (browserDemoWorkspace) {
      toast.showToast("warning", "File import is disabled in browser demo mode")
      return
    }

    if (!projectPath) {
      toast.showToast("error", "No project open")
      return
    }

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    let imported = 0
    let skipped = 0

    for (const file of files) {
      const name = file.name

      if (!isSupported(name)) {
        skipped++
        continue
      }

      try {
        if (isImageFile(name)) {
          const fullPath = getImportedImagePath(projectPath, name)
          const data = Array.from(new Uint8Array(await file.arrayBuffer()))
          await invoke("save_image_bytes", {
            projectPath,
            path: fullPath,
            data,
          })
        } else {
          const content = await file.text()
          await invoke("create_file", {
            req: {
              project_path: projectPath,
              parent_path: projectPath,
              name,
              content,
              is_image: false,
            },
          })
        }
        imported++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.showToast("error", `Failed to import ${name}: ${msg}`)
      }
    }

    if (imported > 0) {
      await refreshTree()
      toast.showToast("success", `Imported ${imported} file${imported > 1 ? "s" : ""}`)
    }

    if (skipped > 0) {
      toast.showToast("warning", `Skipped ${skipped} unsupported file${skipped > 1 ? "s" : ""}`)
    }
  }, [browserDemoWorkspace, projectPath, refreshTree, toast])

  return (
    <div
      className="relative flex h-full w-full flex-col bg-[var(--color-bg-primary)] p-4"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-[22px] border-4 border-dashed border-[var(--color-accent,#ff3830)] bg-white/72">
          <div className="flex flex-col items-center gap-2 text-[var(--color-accent,#6366f1)]">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="text-lg font-medium">Drop files here to import</span>
            <span className="text-sm opacity-70">Images, text, and code files</span>
          </div>
        </div>
      )}

      <div className="mova-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px]">
        <AppHeader
          projectName={project?.name ?? "Untitled Animation Project"}
          modelName={modelName}
          onExport={onExport}
          onOpenSettings={onOpenSettings}
          onBackToHome={onBackToHome}
        />

        <div className="isolate flex min-h-0 flex-1 items-stretch gap-3 overflow-hidden bg-[var(--color-bg-primary)] p-3">
          <ResizablePanel
            defaultWidth={300}
            minWidth={240}
            maxWidth={380}
            side="left"
            visible={leftPanel !== null}
          >
            <div className="h-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-[var(--shadow-xs)]">
              <div hidden={leftPanel !== "files"} className="h-full">
                {sidebar}
              </div>
              {(hasMountedGit || leftPanel === "git") && (
                <div hidden={leftPanel !== "git"} className="h-full">
                  <GitPanel />
                </div>
              )}
            </div>
          </ResizablePanel>

          <div className="flex min-w-0 flex-1 basis-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-[var(--shadow-xs)]">
            <div className="min-h-0 flex-1 overflow-hidden">
              {canvas}
            </div>
            <div hidden={!timelineVisible} className="shrink-0 border-t border-[var(--color-border)]">
              <AnimationTimeline />
            </div>
          </div>

          <ResizablePanel
            defaultWidth={360}
            minWidth={300}
            maxWidth={460}
            side="right"
            visible={rightPanel !== null}
          >
            <div className="h-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-[var(--shadow-xs)]">
              <div hidden={rightPanel !== "chat"} className="h-full">
                {chat}
              </div>
              {(hasMountedHistory || rightPanel === "history") && (
                <div hidden={rightPanel !== "history"} className="h-full">
                  <ChatHistoryPanel onSelectConversation={() => setRightPanel("chat")} />
                </div>
              )}
            </div>
          </ResizablePanel>
        </div>

        <StatusBar
          leftPanel={leftPanel}
          rightPanel={rightPanel}
          timelineVisible={timelineVisible}
          onToggleFiles={toggleFiles}
          onToggleGit={toggleGit}
          onToggleTimeline={toggleTimeline}
          onToggleChat={toggleChat}
          onToggleHistory={toggleHistory}
        />
      </div>
    </div>
  )
}
