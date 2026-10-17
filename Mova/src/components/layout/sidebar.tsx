import { useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Plus, RefreshCw, FileText, Image } from "lucide-react"
import { useProjectStore } from "../../stores/project-store"
import { useFileTreeStore } from "../../stores/file-tree-store"
import { useToast } from "../../hooks/use-toast"
import { FileTree } from "../file-tree/FileTree"
import { useI18n } from "../../i18n"
import { isBrowserDemoWorkspaceEnabled } from "../../dev/browser-demo-workspace"
import { validateFileBasename } from "../../utils/filename-validation"

export function Sidebar() {
  const project = useProjectStore((s) => s.project)
  const projectPath = useProjectStore((s) => s.projectPath)
  const refreshTree = useFileTreeStore((s) => s.refresh)
  const isTreeLoading = useFileTreeStore((s) => s.isLoading)
  const { showToast } = useToast()
  const { t } = useI18n()
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const browserDemoWorkspace = isBrowserDemoWorkspaceEnabled()

  const createAsset = async (isImage: boolean) => {
    if (browserDemoWorkspace || !projectPath) return
    setAddMenuOpen(false)
    const defaultName = isImage ? "image.png" : "file.txt"
    const rawName = window.prompt(isImage ? "New image file name" : "New text file name", defaultName)
    const name = rawName?.trim()
    if (!name) return
    const rawNameError = validateFileBasename(name)
    if (rawNameError) {
      showToast("error", rawNameError)
      return
    }
    const normalizedName = isImage && !/\.(png|jpg|jpeg|webp|gif)$/i.test(name) ? `${name}.png` : name
    const nameError = validateFileBasename(normalizedName)
    if (nameError) {
      showToast("error", nameError)
      return
    }

    try {
      await invoke("create_file", {
        req: {
          project_path: projectPath,
          parent_path: projectPath,
          name: normalizedName,
          content: "",
          is_image: isImage,
        },
      })
      await refreshTree()
      showToast("success", `Created ${normalizedName}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast("error", `Failed to create file: ${message}`)
    }
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-[var(--color-text-secondary)]">{t("sidebar.noProject")}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-panel)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{t("sidebar.projectAssets")}</h2>
          <p className="mt-1 truncate text-xs font-medium text-[var(--color-text-secondary)]">
            {project.name}
          </p>
        </div>
        <div className="relative flex items-center gap-1.5" ref={addMenuRef}>
          <button
            type="button"
            onClick={() => {
              if (!browserDemoWorkspace) setAddMenuOpen((open) => !open)
            }}
            disabled={browserDemoWorkspace}
            className="mova-icon-button disabled:cursor-not-allowed disabled:opacity-40"
            title={browserDemoWorkspace ? "Asset creation is disabled in browser demo mode" : t("sidebar.addAsset")}
            aria-label={t("sidebar.addAsset")}
            aria-expanded={addMenuOpen}
          >
            <Plus size={18} />
          </button>
          {addMenuOpen && (
            <div className="absolute right-8 top-10 z-30 min-w-[160px] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg">
              <button
                type="button"
                onClick={() => void createAsset(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                <FileText size={14} />
                New Text File
              </button>
              <button
                type="button"
                onClick={() => void createAsset(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                <Image size={14} />
                New Image File
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (!browserDemoWorkspace) refreshTree()
            }}
            disabled={browserDemoWorkspace || isTreeLoading}
            className="mova-icon-button disabled:cursor-not-allowed disabled:opacity-40"
            title={browserDemoWorkspace ? "Refresh is disabled in browser demo mode" : t("sidebar.refreshAssets")}
            aria-label={t("sidebar.refreshAssets")}
          >
            <RefreshCw size={16} className={isTreeLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
        <FileTree />
      </div>
    </div>
  )
}
