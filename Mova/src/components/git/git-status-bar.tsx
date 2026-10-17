import { useEffect } from "react"
import { GIT_WORKFLOW_DEFERRED_REASON, useGitStore } from "../../stores/git-store"
import { useProjectStore } from "../../stores/project-store"
import { isBrowserDemoWorkspaceEnabled } from "../../dev/browser-demo-workspace"

export function GitStatusBar() {
  const projectPath = useProjectStore((s) => s.projectPath)
  const isRepo = useGitStore((s) => s.isRepo)
  const branch = useGitStore((s) => s.branch)
  const files = useGitStore((s) => s.files)
  const isLoading = useGitStore((s) => s.isLoading)
  const loadStatus = useGitStore((s) => s.loadStatus)
  const browserDemoWorkspace = isBrowserDemoWorkspaceEnabled()

  useEffect(() => {
    if (browserDemoWorkspace) return
    if (projectPath) {
      loadStatus(projectPath)
    }
  }, [browserDemoWorkspace, projectPath, loadStatus])

  const changeCount = files.filter(
    (f) => f.status !== "unmodified" && f.status !== "ignored",
  ).length

  if (!isRepo) {
    return (
      <span className="text-[var(--color-text-muted)]">No repo</span>
    )
  }

  return (
    <>
      {isLoading ? (
        <span className="text-[var(--color-text-muted)]">...</span>
      ) : (
        <span className="text-[var(--color-success)]">{branch || "HEAD"}</span>
      )}
      <span className="text-[var(--color-border)]">|</span>
      <span className="text-[var(--color-text-secondary)]">
        {changeCount} change{changeCount !== 1 ? "s" : ""}
      </span>
      <span className="text-[var(--color-border)]">|</span>
      <button
        type="button"
        disabled
        title={GIT_WORKFLOW_DEFERRED_REASON}
        className="cursor-not-allowed text-[var(--color-text-muted)] opacity-70"
      >
        Add, commit, and log deferred
      </button>
    </>
  )
}
