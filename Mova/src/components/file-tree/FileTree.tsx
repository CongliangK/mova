import { useState, useRef, useEffect, useMemo, useCallback, useDeferredValue } from "react"
import { Search, Folder, Loader2, AlertCircle, GitBranch, FileText, Image, ExternalLink, RefreshCw } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useFileTreeStore } from "../../stores/file-tree-store"
import { useProjectStore } from "../../stores/project-store"
import { useGitStore } from "../../stores/git-store"
import { FileTreeNode } from "./FileTreeNode"
import { Input } from "../ui/input"
import { ContextMenu, type MenuItem } from "../ui/context-menu"
import { useToast } from "../../hooks/use-toast"
import type { FileNode } from "../../types/file-tree"
import { filterFileTreeNodes } from "../../utils/file-tree-helpers"
import { validateFileBasename } from "../../utils/filename-validation"
import { isBrowserDemoWorkspaceEnabled } from "../../dev/browser-demo-workspace"

const DEBOUNCE_DELAY = 300
const FILE_CHANGE_DEBOUNCE_MS = 1000

function getParentPath(node: FileNode): string {
  if (node.isDirectory) return node.path
  const idx = Math.max(node.path.lastIndexOf("/"), node.path.lastIndexOf("\\"))
  return idx >= 0 ? node.path.slice(0, idx) : ""
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/")
}

function joinProjectPath(projectPath: string, relativePath: string): string {
  const normalizedProjectPath = normalizePath(projectPath).replace(/\/$/, "")
  const normalizedRelativePath = normalizePath(relativePath).replace(/^\//, "")
  return `${normalizedProjectPath}/${normalizedRelativePath}`
}

interface ContextMenuState {
  x: number
  y: number
  node: FileNode
}

interface CreatingState {
  parentPath: string
  isImage: boolean
}

export function FileTree() {
  const projectPath = useProjectStore((s) => s.projectPath)
  const tree = useFileTreeStore((s) => s.tree)
  const isLoading = useFileTreeStore((s) => s.isLoading)
  const error = useFileTreeStore((s) => s.error)
  const searchQuery = useFileTreeStore((s) => s.searchQuery)
  const setSearch = useFileTreeStore((s) => s.setSearch)
  const loadTree = useFileTreeStore((s) => s.loadTree)
  const toggleExpand = useFileTreeStore((s) => s.toggleExpand)
  const refresh = useFileTreeStore((s) => s.refresh)

  const isRepo = useGitStore((s) => s.isRepo)
  const gitFiles = useGitStore((s) => s.files)
  const gitIsLoading = useGitStore((s) => s.isLoading)
  const loadStatus = useGitStore((s) => s.loadStatus)
  const initRepo = useGitStore((s) => s.initRepo)

  const { showToast } = useToast()

  const [localQuery, setLocalQuery] = useState(searchQuery)
  const [initiating, setInitiating] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [creating, setCreating] = useState<CreatingState | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const browserDemoWorkspace = isBrowserDemoWorkspaceEnabled()

  useEffect(() => {
    if (browserDemoWorkspace) return
    if (projectPath) {
      loadStatus(projectPath)
    }
  }, [browserDemoWorkspace, projectPath, loadStatus])

  useEffect(() => {
    if (browserDemoWorkspace) return
    if (projectPath) {
      loadTree(projectPath)
    }
  }, [browserDemoWorkspace, projectPath, loadTree])

  useEffect(() => {
    if (browserDemoWorkspace || !projectPath) return

    let unlisten: (() => void) | undefined
    let stopped = false

    const setup = async () => {
      try {
        await invoke("watch_project_dir", { path: projectPath })
      } catch (err) {
        console.error("Failed to start file watcher:", err)
        return
      }

      if (stopped) {
        invoke("unwatch_project_dir").catch(() => {})
        return
      }

      unlisten = await listen<string[]>("file-system-changed", () => {
        if (fileChangeTimerRef.current) clearTimeout(fileChangeTimerRef.current)
        fileChangeTimerRef.current = setTimeout(async () => {
          setIsRefreshing(true)
          try {
            await refresh()
          } finally {
            setIsRefreshing(false)
          }
        }, FILE_CHANGE_DEBOUNCE_MS)
      })
    }

    setup()

    return () => {
      stopped = true
      if (unlisten) unlisten()
      if (fileChangeTimerRef.current) clearTimeout(fileChangeTimerRef.current)
      invoke("unwatch_project_dir").catch(() => {})
    }
  }, [browserDemoWorkspace, projectPath, refresh])

  const handleInitRepo = useCallback(async () => {
    if (browserDemoWorkspace || !projectPath || initiating) return
    setInitiating(true)
    try {
      await initRepo(projectPath)
      await loadStatus(projectPath)
    } finally {
      setInitiating(false)
    }
  }, [browserDemoWorkspace, projectPath, initiating, initRepo, loadStatus])

  const gitStatusMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of gitFiles) {
      const normalizedPath = normalizePath(f.path)
      map.set(normalizedPath, f.status)
      if (projectPath && !normalizedPath.startsWith("/")) {
        map.set(joinProjectPath(projectPath, normalizedPath), f.status)
      }
    }
    return map
  }, [gitFiles, projectPath])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setLocalQuery(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setSearch(value)
      }, DEBOUNCE_DELAY)
    },
    [setSearch],
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const displayTree = useMemo(
    () => filterFileTreeNodes(tree, deferredSearchQuery),
    [tree, deferredSearchQuery],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
    })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleCreateTextFile = useCallback(() => {
    if (browserDemoWorkspace) return
    if (!contextMenu) return
    const parentPath = getParentPath(contextMenu.node)
    toggleExpand(contextMenu.node.isDirectory ? contextMenu.node.path : parentPath)
    setCreating({ parentPath, isImage: false })
  }, [browserDemoWorkspace, contextMenu, toggleExpand])

  const handleCreateImageFile = useCallback(() => {
    if (browserDemoWorkspace) return
    if (!contextMenu) return
    const parentPath = getParentPath(contextMenu.node)
    toggleExpand(contextMenu.node.isDirectory ? contextMenu.node.path : parentPath)
    setCreating({ parentPath, isImage: true })
  }, [browserDemoWorkspace, contextMenu, toggleExpand])

  const handleRevealInFileManager = useCallback(async () => {
    if (browserDemoWorkspace) return
    if (!contextMenu) return
    try {
      await invoke("reveal_in_file_manager", { path: contextMenu.node.path })
    } catch {
      showToast("error", "无法在文件管理器中显示，文件或文件夹可能已被移动或删除")
    }
  }, [browserDemoWorkspace, contextMenu, showToast])

  const handleCreateSubmit = useCallback(
    async (name: string) => {
      if (browserDemoWorkspace || !creating || !projectPath) return
      const nameError = validateFileBasename(name)
      if (nameError) {
        showToast("error", nameError)
        setCreating(null)
        return
      }
      try {
        await invoke("create_file", {
          req: {
            project_path: projectPath,
            parent_path: creating.parentPath,
            name,
            content: "",
            is_image: creating.isImage,
          },
        })
        await refresh()
      } catch (err) {
        console.error("Failed to create file:", err)
      } finally {
        setCreating(null)
      }
    },
    [browserDemoWorkspace, creating, projectPath, refresh, showToast],
  )

  const handleCreateCancel = useCallback(() => {
    setCreating(null)
  }, [])

  const contextMenuItems: MenuItem[] = useMemo(() => {
    if (!contextMenu) return []
    const isDir = contextMenu.node.isDirectory
    return [
      {
        label: "New Text File",
        icon: <FileText size={14} />,
        disabled: browserDemoWorkspace,
        onClick: handleCreateTextFile,
      },
      {
        label: "New Image File",
        icon: <Image size={14} />,
        disabled: browserDemoWorkspace,
        onClick: handleCreateImageFile,
      },
      ...(isDir
        ? [
            {
              label: "New Folder" as const,
              icon: <Folder size={14} />,
              disabled: true as const,
              onClick: () => {},
            },
          ]
        : []),
      { label: "", separator: true, onClick: () => {} },
      {
        label: "在文件管理器中显示",
        icon: <ExternalLink size={14} />,
        disabled: browserDemoWorkspace,
        onClick: handleRevealInFileManager,
      },
    ]
  }, [browserDemoWorkspace, contextMenu, handleCreateTextFile, handleCreateImageFile, handleRevealInFileManager])

  const hasNoResults = !isLoading && !error && displayTree.length === 0 && searchQuery.trim().length > 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={handleCloseContextMenu}
        />
      )}

      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
        <Folder size={14} />
        <span>Files</span>
        {isRefreshing && (
          <RefreshCw size={12} className="ml-auto animate-spin" />
        )}
      </div>

      {browserDemoWorkspace && (
        <div className="mb-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          Browser demo tree is read-only and does not call Tauri filesystem IPC.
        </div>
      )}

      <div className="pb-3">
        <Input
          type="search"
          placeholder="Search assets..."
          value={localQuery}
          onChange={handleSearchChange}
          icon={<Search size={14} />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-4">
            <Loader2 size={14} className="animate-spin text-[var(--color-text-secondary)]" />
            <span className="text-xs text-[var(--color-text-secondary)]">Loading...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4">
            <AlertCircle size={14} className="shrink-0 text-[var(--color-danger)]" />
            <span className="text-xs text-[var(--color-danger)]">{error}</span>
          </div>
        ) : hasNoResults ? (
          <div className="p-4 text-center">
            <p className="text-xs text-[var(--color-text-secondary)]">No results</p>
          </div>
        ) : displayTree.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-[var(--color-text-secondary)]">No files found</p>
          </div>
        ) : (
          displayTree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              gitStatusMap={gitStatusMap}
              onContextMenu={handleContextMenu}
              creatingParentPath={creating?.parentPath ?? null}
              creatingIsImage={creating?.isImage ?? false}
              onCreateSubmit={handleCreateSubmit}
              onCreateCancel={handleCreateCancel}
            />
          ))
        )}
      </div>

      {!browserDemoWorkspace && !isRepo && projectPath && !gitIsLoading && (
        <div className="border-t border-[var(--color-border)] pt-3">
          <button
            onClick={handleInitRepo}
            disabled={initiating}
            className="flex w-full items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
          >
            {initiating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <GitBranch size={12} />
            )}
            <span>Initialize Git Repository</span>
          </button>
        </div>
      )}
    </div>
  )
}
