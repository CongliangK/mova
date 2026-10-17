import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, FileText, GitBranch, Loader2 } from "lucide-react"
import { useGitStore } from "../../stores/git-store"
import { useProjectStore } from "../../stores/project-store"
import { isBrowserDemoWorkspaceEnabled } from "../../dev/browser-demo-workspace"

export function GitPanel() {
  const projectPath = useProjectStore((s) => s.projectPath)
  const isRepo = useGitStore((s) => s.isRepo)
  const branch = useGitStore((s) => s.branch)
  const files = useGitStore((s) => s.files)
  const log = useGitStore((s) => s.log)
  const isLoading = useGitStore((s) => s.isLoading)
  const error = useGitStore((s) => s.error)
  const initRepo = useGitStore((s) => s.initRepo)
  const loadStatus = useGitStore((s) => s.loadStatus)
  const loadLog = useGitStore((s) => s.loadLog)
  const [initializing, setInitializing] = useState(false)
  const browserDemoWorkspace = isBrowserDemoWorkspaceEnabled()

  useEffect(() => {
    if (browserDemoWorkspace || !projectPath) return
    loadStatus(projectPath)
    loadLog(projectPath, 8)
  }, [browserDemoWorkspace, projectPath, loadLog, loadStatus])

  const handleInit = async () => {
    if (browserDemoWorkspace || !projectPath || initializing) return
    setInitializing(true)
    try {
      await initRepo(projectPath)
      await loadStatus(projectPath)
    } finally {
      setInitializing(false)
    }
  }

  const changedFiles = files.filter((file) => file.status !== "unmodified" && file.status !== "ignored")

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-panel)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Git</h2>
          <p className="mt-1 truncate text-xs font-medium text-[var(--color-text-secondary)]">
            Repository status
          </p>
        </div>
        {isLoading ? (
          <Loader2 size={17} className="animate-spin text-[var(--color-text-secondary)]" />
        ) : (
          <GitBranch size={17} className="text-[var(--color-text-secondary)]" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-danger)]/20 bg-[var(--color-brand-red-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {browserDemoWorkspace && (
          <div className="mb-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            Browser demo Git data is synthetic and read-only.
          </div>
        )}

        {!isRepo ? (
          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">No repository</p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
              Initialize Git for this project to track generated assets and project files.
            </p>
            <button
              type="button"
              onClick={handleInit}
              disabled={browserDemoWorkspace || initializing || !projectPath}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--color-accent)] px-3 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-50"
            >
              {initializing ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
              Initialize Repository
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[var(--color-success)]" />
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {branch || "HEAD"}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                {changedFiles.length} changed file{changedFiles.length === 1 ? "" : "s"}
              </p>
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                Changes
              </h3>
              <div className="space-y-1">
                {changedFiles.length === 0 ? (
                  <p className="rounded-[var(--radius-lg)] bg-[var(--color-bg-secondary)] px-3 py-3 text-xs text-[var(--color-text-secondary)]">
                    Working tree clean
                  </p>
                ) : (
                  changedFiles.slice(0, 24).map((file) => (
                    <div
                      key={`${file.status}-${file.path}`}
                      className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                      title={file.path}
                    >
                      <FileText size={13} className="shrink-0 text-[var(--color-text-secondary)]" />
                      <span className="min-w-0 flex-1 truncate">{file.path}</span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-muted)]">
                        {file.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                Recent Log
              </h3>
              <div className="space-y-1">
                {log.length === 0 ? (
                  <p className="rounded-[var(--radius-lg)] bg-[var(--color-bg-secondary)] px-3 py-3 text-xs text-[var(--color-text-secondary)]">
                    No commits found
                  </p>
                ) : (
                  log.map((entry) => (
                    <div
                      key={entry.hash}
                      className="rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-[var(--color-bg-hover)]"
                    >
                      <div className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
                        {entry.message}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                        {entry.hash.slice(0, 7)} · {entry.author}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
