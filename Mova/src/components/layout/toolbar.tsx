import { useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ArrowLeft, Box, ChevronDown, Download, FolderOpen, Loader2, Settings } from "lucide-react"
import { Button } from "../../components/ui/button"
import { useFileTreeStore } from "../../stores/file-tree-store"
import { useGitStore } from "../../stores/git-store"
import { useProjectStore } from "../../stores/project-store"
import { useSettingsStore } from "../../stores/settings-store"
import { useToast } from "../../hooks/use-toast"
import { MovaLogo } from "../brand/mova-logo"
import { mapRustProject, type RustProjectData } from "../../types/project"
import { useI18n } from "../../i18n"
import { isBrowserDemoWorkspaceEnabled } from "../../dev/browser-demo-workspace"

interface AppHeaderProps {
  projectName: string
  modelName: string
  onExport: () => void
  onOpenSettings: () => void
  onBackToHome: () => void
}

export function AppHeader({
  projectName,
  modelName,
  onExport,
  onOpenSettings,
  onBackToHome,
}: AppHeaderProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [switchingPath, setSwitchingPath] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const currentPath = useProjectStore((s) => s.projectPath)
  const loadProject = useProjectStore((s) => s.loadProject)
  const recentProjects = useSettingsStore((s) => s.recentProjects)
  const addRecentProject = useSettingsStore((s) => s.addRecentProject)
  const loadTree = useFileTreeStore((s) => s.loadTree)
  const loadGitStatus = useGitStore((s) => s.loadStatus)
  const { showToast } = useToast()
  const { t } = useI18n()
  const browserDemoWorkspace = isBrowserDemoWorkspaceEnabled()

  const projectOptions = browserDemoWorkspace
    ? []
    : recentProjects.filter((p) => p.path !== currentPath)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setProjectMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSwitchProject = async (path: string) => {
    if (browserDemoWorkspace || switchingPath) return
    setSwitchingPath(path)
    try {
      const result = await invoke<RustProjectData>("open_project", { path })
      const nextProject = mapRustProject(result)
      addRecentProject(nextProject.name, path)
      loadProject(nextProject, path)
      await Promise.all([
        loadTree(path),
        loadGitStatus(path),
      ])
      setProjectMenuOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast("error", t("toolbar.switchProjectFailed", { message }))
    } finally {
      setSwitchingPath(null)
    }
  }

  return (
    <header className="flex h-[74px] shrink-0 items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-6">
      <div className="flex items-center gap-4">
        <div className="flex gap-2" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <MovaLogo size="sm" />
        <span className="hidden text-sm font-medium text-[var(--color-text-secondary)] xl:inline">
          {t("toolbar.tagline")}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <div className="relative min-w-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setProjectMenuOpen((open) => !open)}
          className="flex max-w-[420px] items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
          title={projectName}
          aria-haspopup="menu"
          aria-expanded={projectMenuOpen}
        >
          <span className="truncate">{projectName}</span>
          <ChevronDown size={15} className={`shrink-0 text-[var(--color-text-secondary)] transition-transform ${projectMenuOpen ? "rotate-180" : ""}`} />
        </button>

        {projectMenuOpen && (
          <div
            role="menu"
            className="absolute left-1/2 top-full z-50 mt-2 w-[320px] -translate-x-1/2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-[var(--shadow-md)]"
          >
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
              {t("toolbar.recentProjects")}
            </div>
            {projectOptions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-[var(--color-text-secondary)]">
                {t("toolbar.noOtherRecentProjects")}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {projectOptions.map((project) => (
                  <button
                    key={project.path}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSwitchProject(project.path)}
                    disabled={switchingPath !== null}
                    className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left hover:bg-[var(--color-bg-hover)] disabled:cursor-wait disabled:opacity-60"
                    title={project.path}
                  >
                    <FolderOpen size={15} className="shrink-0 text-[var(--color-text-secondary)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">
                        {project.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--color-text-muted)]">
                        {project.path}
                      </span>
                    </span>
                    {switchingPath === project.path && (
                      <Loader2 size={14} className="shrink-0 animate-spin text-[var(--color-accent)]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] shadow-[var(--shadow-xs)] md:flex">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
          <span className="text-[var(--color-text-secondary)]">{t("common.model")}</span>
          <span className="max-w-[160px] truncate">{modelName}</span>
          <ChevronDown size={14} className="text-[var(--color-text-secondary)]" />
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={onExport}
          disabled={browserDemoWorkspace}
          title={browserDemoWorkspace ? "Export is disabled in browser demo mode" : t("toolbar.exportSpriteSheet")}
        >
          <Download size={16} />
          {t("common.export")}
        </Button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="mova-icon-button border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-[var(--shadow-xs)]"
          title={t("common.settings")}
          aria-label={t("common.settings")}
        >
          <Settings size={18} />
        </button>

        <button
          type="button"
          onClick={onBackToHome}
          className="mova-icon-button border border-transparent"
          title={t("toolbar.backToHome")}
          aria-label={t("toolbar.backToHome")}
        >
          <ArrowLeft size={17} />
        </button>

        <div className="hidden h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-brand-red-soft)] text-[var(--color-accent)] lg:flex">
          <Box size={17} />
        </div>
      </div>
    </header>
  )
}

export const Toolbar = AppHeader
