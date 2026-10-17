import type { ReactNode } from "react"
import { useProjectStore } from "../../stores/project-store"
import { useSettingsStore } from "../../stores/settings-store"
import { useAnimationStore } from "../../stores/animation-store"
import { GitStatusBar } from "../git/git-status-bar"
import { Bot, Clock3, Files, Film, GitBranch } from "lucide-react"
import { useI18n } from "../../i18n"

export type LeftPanel = "files" | "git" | null
export type RightPanel = "chat" | "history" | null

interface StatusBarProps {
  leftPanel?: LeftPanel
  rightPanel?: RightPanel
  timelineVisible?: boolean
  onToggleFiles?: () => void
  onToggleGit?: () => void
  onToggleTimeline?: () => void
  onToggleChat?: () => void
  onToggleHistory?: () => void
}

function DockButton({
  active,
  children,
  onClick,
  title,
}: {
  active: boolean
  children: ReactNode
  onClick?: () => void
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-8 items-center gap-2 rounded-[var(--radius-md)] px-2.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-[var(--color-brand-red-soft)] text-[var(--color-accent)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      }`}
    >
      {children}
    </button>
  )
}

export function StatusBar({
  leftPanel = "files",
  rightPanel = "chat",
  timelineVisible = true,
  onToggleFiles,
  onToggleGit,
  onToggleTimeline,
  onToggleChat,
  onToggleHistory,
}: StatusBarProps) {
  const project = useProjectStore((s) => s.project)
  const projectPath = useProjectStore((s) => s.projectPath)
  const isLoaded = useProjectStore((s) => s.isLoaded)

  const llmConfigs = useSettingsStore((s) => s.llmConfigs)
  const activeLlmIndex = useSettingsStore((s) => s.activeLlmIndex)
  const { t } = useI18n()

  const animations = useAnimationStore((s) => s.animations)
  const activeAnimationId = useAnimationStore((s) => s.activeAnimationId)
  const currentFrameIndex = useAnimationStore((s) => s.currentFrameIndex)
  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const playbackSpeed = useAnimationStore((s) => s.playbackSpeed)

  const activeAnimation = animations.find((a) => a.id === activeAnimationId)
  const totalFrames = activeAnimation?.frames.length ?? 0
  const frameDisplay = activeAnimation
    ? t("status.frame", { current: currentFrameIndex + 1, total: totalFrames })
    : t("status.noAnimation")

  const fps = activeAnimation ? Math.round(activeAnimation.fps * playbackSpeed) : 0
  const fpsDisplay = activeAnimation ? `${fps} FPS` : ""

  const modelName = llmConfigs[activeLlmIndex]?.model ?? t("status.noModel")
  const projectName = isLoaded && project ? project.name : t("status.noProject")
  const projectPathDisplay = projectPath ?? ""

  return (
    <footer
      className="flex h-12 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5"
      style={{ fontSize: "var(--text-xs)" }}
    >
      <div className="flex min-w-[260px] items-center gap-1">
        <DockButton active={leftPanel === "files"} onClick={onToggleFiles} title={t("status.toggleFileTree")}>
          <Files size={15} />
          {t("status.fileTree")}
        </DockButton>
        <DockButton active={leftPanel === "git"} onClick={onToggleGit} title={t("status.toggleGitPanel")}>
          <GitBranch size={15} />
          Git
        </DockButton>
        <DockButton active={timelineVisible} onClick={onToggleTimeline} title={t("status.toggleTimeline")}>
          <Film size={15} />
          {t("status.timeline")}
        </DockButton>
      </div>

      <div className="hidden min-w-[180px] items-center gap-3 2xl:flex">
        <GitStatusBar />
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3 font-medium text-[var(--color-text-secondary)]">
        <span className="truncate text-[var(--color-text-primary)]">{projectName}</span>
        <span className="text-[var(--color-border-strong)]">·</span>
        <span>1280 x 720</span>
        <span className="text-[var(--color-border-strong)]">·</span>
        <span>{frameDisplay}</span>
        {fpsDisplay && (
          <>
            <span className="text-[var(--color-border-strong)]">·</span>
            <span>{fpsDisplay}</span>
          </>
        )}
        {isPlaying && (
          <>
            <span className="text-[var(--color-border-strong)]">·</span>
            <span className="font-semibold text-[var(--color-success)]">{t("status.playing")}</span>
          </>
        )}
      </div>

      <div className="flex min-w-[260px] items-center justify-end gap-1 font-medium">
        <DockButton active={rightPanel === "chat"} onClick={onToggleChat} title={t("status.toggleAiChat")}>
          <Bot size={15} />
          {t("status.aiChat")}
        </DockButton>
        <DockButton active={rightPanel === "history"} onClick={onToggleHistory} title={t("status.toggleAiHistory")}>
          <Clock3 size={15} />
          {t("status.aiHistory") }
        </DockButton>
        <span className="hidden max-w-[180px] truncate text-[var(--color-text-secondary)] 2xl:inline" title={projectPathDisplay}>
          {projectPathDisplay}
        </span>
        <span className="rounded-[var(--radius-pill)] bg-[var(--color-bg-subtle)] px-2.5 py-1 text-[var(--color-text-secondary)]">
          {modelName}
        </span>
        <span className="text-[var(--color-text-muted)]">v0.1.1</span>
      </div>
    </footer>
  )
}
