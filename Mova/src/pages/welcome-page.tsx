import { useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { Clock, FolderOpen, FolderPlus, Settings } from "lucide-react"
import { useProjectStore } from "../stores/project-store"
import { useSettingsStore } from "../stores/settings-store"
import { useToast } from "../hooks/use-toast"
import { mapRustProject } from "../types/project"
import type { RustProjectData } from "../types/project"
import { MovaLogo } from "../components/brand/mova-logo"
import { useI18n } from "../i18n"

interface WelcomePageProps {
  onSettings: () => void
}

export function WelcomePage({ onSettings }: WelcomePageProps) {
  const loadProject = useProjectStore((s) => s.loadProject)
  const recentProjects = useSettingsStore((s) => s.recentProjects)
  const addRecentProject = useSettingsStore((s) => s.addRecentProject)
  const { showToast } = useToast()
  const { t } = useI18n()

  const [projectName, setProjectName] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    if (!projectName.trim()) return

    setIsCreating(true)
    try {
      const selected = await open({
        directory: true,
        title: t("welcome.selectProjectLocation"),
      })
      if (!selected) {
        setIsCreating(false)
        return
      }

      const path = selected as string
      const result = await invoke<RustProjectData>("create_project", {
        req: { name: projectName.trim(), path },
      })

      const project = mapRustProject(result)
      addRecentProject(project.name, `${path}/${projectName.trim()}`)
      loadProject(project, `${path}/${projectName.trim()}`)
    } catch (err) {
      console.error("Failed to create project:", err)
      showToast("error", t("welcome.createFailed", { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setIsCreating(false)
    }
  }

  const handleOpen = async () => {
    try {
      const selected = await open({
        directory: true,
        title: t("welcome.selectProjectFolder"),
      })
      if (!selected) return

      const path = selected as string
      const result = await invoke<RustProjectData>("open_project", { path })
      const project = mapRustProject(result)

      addRecentProject(project.name, path)
      loadProject(project, path)
    } catch (err) {
      console.error("Failed to open project:", err)
      showToast("error", t("welcome.openFailed", { message: err instanceof Error ? err.message : String(err) }))
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg-primary)] p-6">
      <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-lg)] md:grid-cols-[1fr_420px]">
        <section className="flex min-h-[640px] flex-col justify-between border-b border-[var(--color-border)] p-10 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between">
            <MovaLogo size="md" />
            <button
              type="button"
              onClick={onSettings}
              className="mova-icon-button border border-[var(--color-border)] bg-[var(--color-bg-panel)]"
              title={t("common.settings")}
              aria-label={t("common.settings")}
            >
              <Settings size={18} />
            </button>
          </div>

          <div>
            <MovaLogo size="lg" showTagline />
            <p className="mt-8 max-w-xl text-lg leading-8 text-[var(--color-text-secondary)]">
              {t("welcome.tagline")}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            <div className="rounded-[var(--radius-xl)] bg-[var(--color-bg-subtle)] p-4">
              {t("welcome.prompt")}
            </div>
            <div className="rounded-[var(--radius-xl)] bg-[var(--color-brand-red-soft)] p-4 text-[var(--color-accent)]">
              {t("welcome.frames")}
            </div>
            <div className="rounded-[var(--radius-xl)] bg-[var(--color-bg-subtle)] p-4">
              {t("welcome.export")}
            </div>
          </div>
        </section>

        <section className="flex flex-col p-8">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{t("welcome.title")}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              {t("welcome.subtitle")}
            </p>
          </div>

          <div className="mt-8 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-5 shadow-[var(--shadow-xs)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("welcome.newProject")}</h2>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={t("welcome.projectNamePlaceholder")}
            className="mt-3 h-11 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-brand-red-ring)]"
          />
          <button
            onClick={handleCreate}
            disabled={!projectName.trim() || isCreating}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--color-accent)] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,56,48,0.22)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
          >
            <FolderPlus size={16} />
            {isCreating ? t("welcome.creating") : t("welcome.createProject")}
          </button>
        </div>

        <button
          onClick={handleOpen}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] text-sm font-semibold text-[var(--color-text-primary)] shadow-[var(--shadow-xs)] transition-colors hover:bg-[var(--color-bg-hover)]"
        >
          <FolderOpen size={16} />
          {t("welcome.openExistingProject")}
        </button>

        {recentProjects.length > 0 && (
          <div className="mt-8 min-h-0 flex-1">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
              <Clock size={14} />
              {t("welcome.recentProjects")}
            </h3>
            <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
              {recentProjects.map((p) => (
                <button
                  key={p.path}
                  onClick={async () => {
                    try {
                      const result = await invoke<RustProjectData>("open_project", { path: p.path })
                      const project = mapRustProject(result)
                      loadProject(project, p.path)
                    } catch (err) {
                      console.error("Failed to open recent project:", err)
                      showToast("error", t("welcome.openRecentFailed", { message: err instanceof Error ? err.message : String(err) }))
                    }
                  }}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-3 text-left text-sm font-semibold text-[var(--color-text-primary)] shadow-[var(--shadow-xs)] transition-colors hover:border-[var(--color-accent)]"
                >
                  <span>{p.name}</span>
                  <span className="mt-1 block truncate text-xs font-medium text-[var(--color-text-secondary)]">
                    {p.path}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        </section>
      </div>
    </div>
  )
}
