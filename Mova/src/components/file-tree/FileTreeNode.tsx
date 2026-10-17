import { memo, useCallback, useRef } from "react"
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  Image,
  ChevronRight,
} from "lucide-react"
import type { FileNode } from "../../types/file-tree"
import { useFileTreeStore } from "../../stores/file-tree-store"
import { Icon } from "../ui/icon"
import {
  MOVA_FILE_DRAG_TYPE,
  createFileDragPayload,
} from "../../utils/file-drag"
import { logDnd } from "../../utils/dnd-debug"

export interface GitStatusBadge {
  letter: string
  color: string
}

const GIT_BADGE_MAP: Record<string, GitStatusBadge> = {
  modified: { letter: "M", color: "var(--color-warning)" },
  staged: { letter: "A", color: "var(--color-success)" },
  untracked: { letter: "U", color: "var(--color-info)" },
  unmodified: { letter: "C", color: "var(--color-text-muted)" },
  ignored: { letter: "", color: "" },
}

interface FileTreeNodeProps {
  node: FileNode
  depth?: number
  gitStatusMap?: Map<string, string>
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void
  creatingParentPath?: string | null
  creatingIsImage?: boolean
  onCreateSubmit?: (name: string) => void
  onCreateCancel?: () => void
}

function getFileIcon(node: FileNode, isExpanded: boolean) {
  if (node.isDirectory) {
    return isExpanded ? FolderOpen : Folder
  }
  const ext = node.name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "json":
    case "md":
      return FileText
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
      return Image
    default:
      return File
  }
}

function FileTreeNodeBase({
  node,
  depth = 0,
  gitStatusMap,
  onContextMenu,
  creatingParentPath,
  creatingIsImage,
  onCreateSubmit,
  onCreateCancel,
}: FileTreeNodeProps) {
  const toggleExpand = useFileTreeStore((s) => s.toggleExpand)
  const selectFile = useFileTreeStore((s) => s.selectFile)
  const isExpanded = useFileTreeStore((s) => s.expandedPaths.has(node.path))
  const isSelected = useFileTreeStore((s) => s.selectedPath === node.path)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasChildren = node.isDirectory && (node.children?.length ?? 0) > 0
  const fileIcon = getFileIcon(node, isExpanded)

  const statusKey = gitStatusMap?.get(node.path) ?? node.gitStatus
  const badge = statusKey ? GIT_BADGE_MAP[statusKey] : undefined

  const handleClick = useCallback(() => {
    if (node.isDirectory) {
      toggleExpand(node.path)
    } else {
      selectFile(node.path)
    }
  }, [node.isDirectory, node.path, toggleExpand, selectFile])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onContextMenu?.(e, node)
    },
    [node, onContextMenu],
  )

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const name = e.currentTarget.value.trim()
        if (name) onCreateSubmit?.(name)
      } else if (e.key === "Escape") {
        onCreateCancel?.()
      }
    },
    [onCreateSubmit, onCreateCancel],
  )

  const isCreating = creatingParentPath === node.path

  return (
    <div>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={!node.isDirectory}
        onDragStart={(e) => {
          if (!node.isDirectory) {
            e.dataTransfer.setData("text/plain", node.path)
            e.dataTransfer.setData(
              MOVA_FILE_DRAG_TYPE,
              JSON.stringify(createFileDragPayload(node)),
            )
            e.dataTransfer.effectAllowed = "copy"
            logDnd("file-tree dragstart", {
              path: node.path,
              category: node.category,
              types: Array.from(e.dataTransfer.types ?? []),
            })
          }
        }}
        className={`mb-0.5 flex w-full items-center gap-2 rounded-[var(--radius-lg)] px-2 py-2 text-left text-sm font-medium transition-colors ${
          isSelected
            ? "border-l-2 border-[var(--color-accent)] bg-[var(--color-brand-red-soft)] text-[var(--color-accent)]"
            : "border-l-2 border-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
        }`}
        style={{ paddingLeft: `${10 + depth * 16}px` }}
      >
        {node.isDirectory && (
          <ChevronRight
            size={14}
            className={`shrink-0 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        )}
        {!node.isDirectory && <span className="w-[14px] shrink-0" />}
        <span
          className={
            node.isDirectory ? "text-[var(--color-text-secondary)]" : ""
          }
        >
          <Icon icon={fileIcon} size={14} />
        </span>
        <span className="truncate">{node.name}</span>
        {badge && badge.letter && !node.isDirectory && (
          <span
            className="ml-auto shrink-0 text-[10px] font-bold leading-none"
            style={{ color: badge.color }}
          >
            {badge.letter}
          </span>
        )}
      </button>

      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              gitStatusMap={gitStatusMap}
              onContextMenu={onContextMenu}
              creatingParentPath={creatingParentPath}
              creatingIsImage={creatingIsImage}
              onCreateSubmit={onCreateSubmit}
              onCreateCancel={onCreateCancel}
            />
          ))}
        </div>
      )}

      {isCreating && (
        <div style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}>
          <input
            ref={inputRef}
            autoFocus
            className="mb-1 w-[calc(100%-16px)] rounded-[var(--radius-md)] border border-[var(--color-border-active)] bg-[var(--color-input-bg)] px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none"
            placeholder={creatingIsImage ? "image.png" : "file.txt"}
            onKeyDown={handleInputKeyDown}
            onBlur={onCreateCancel}
          />
        </div>
      )}
    </div>
  )
}

export const FileTreeNode = memo(FileTreeNodeBase)
