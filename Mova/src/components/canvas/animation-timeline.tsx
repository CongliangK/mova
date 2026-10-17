import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import {
  Play,
  Pause,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  Copy,
  ClipboardPaste,
  Trash2,
  Layers,
  Gauge,
  Eye,
  GripVertical,
} from "lucide-react"
import { useAnimationStore } from "../../stores/animation-store"
import { useFileTreeStore } from "../../stores/file-tree-store"
import { useProjectStore } from "../../stores/project-store"
import type { Frame } from "../../types/animation"
import { isTimelineImagePath } from "../../utils/asset-url"
import { MOVA_FILE_DRAG_TYPE, readFileDragPayload } from "../../utils/file-drag"
import { logDnd } from "../../utils/dnd-debug"
import { useToast } from "../../hooks/use-toast"
import { useTimelineImageInsertion } from "../../hooks/use-timeline-image-insertion"
import { isBrowserDemoWorkspaceEnabled } from "../../dev/browser-demo-workspace"
import { LocalImage } from "../ui/local-image"

const SPEED_MIN = 0.1
const SPEED_MAX = 3
const EMPTY_TIMELINE_CELL_COUNT = 8
const ACTIVE_EMPTY_CELL_COUNT = 4

function hasMovaFilePayload(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types ?? []).includes(MOVA_FILE_DRAG_TYPE)
}

function hasTimelineImportPayload(dataTransfer: DataTransfer) {
  return hasMovaFilePayload(dataTransfer) || (dataTransfer.files?.length ?? 0) > 0
}

type NativeDropPosition = {
  x: number
  y: number
  toLogical?: (scaleFactor: number) => { x: number; y: number }
}

function toLogicalDropPosition(position: NativeDropPosition) {
  if (position.toLogical) {
    return position.toLogical(window.devicePixelRatio || 1)
  }
  return { x: position.x, y: position.y }
}

function getImportedImagePath(projectPath: string, fileName: string) {
  const dotIndex = fileName.lastIndexOf(".")
  const rawName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const extension = dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : ""
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image"
  return `${projectPath}/assets/characters/${safeName}-${crypto.randomUUID()}${extension}`
}

type ImageFileBytes = {
  data: number[]
  mime: string
}

function getPathFileName(path: string) {
  return path.split(/[\\/]/).pop() || "image"
}

function normalizeLocalPath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "")
}

function isWindowsAbsolutePath(path: string) {
  return /^[a-zA-Z]:\//.test(normalizeLocalPath(path))
}

function isProjectContainedPath(path: string, projectPath: string) {
  const normalizedPath = normalizeLocalPath(path)
  const normalizedProjectPath = normalizeLocalPath(projectPath)
  if (!normalizedProjectPath) return false

  const comparePath = isWindowsAbsolutePath(normalizedPath)
    ? normalizedPath.toLowerCase()
    : normalizedPath
  const compareProjectPath = isWindowsAbsolutePath(normalizedProjectPath)
    ? normalizedProjectPath.toLowerCase()
    : normalizedProjectPath

  return (
    comparePath === compareProjectPath ||
    comparePath.startsWith(`${compareProjectPath}/`)
  )
}

async function saveImageBytes(projectPath: string, path: string, data: number[]) {
  await invoke("save_image_bytes", { projectPath, path, data })
}

async function saveImageDrop(projectPath: string, file: File, path: string) {
  const data = Array.from(new Uint8Array(await file.arrayBuffer()))
  await saveImageBytes(projectPath, path, data)
}

export function AnimationTimeline() {
  const animations = useAnimationStore((s) => s.animations)
  const activeAnimationId = useAnimationStore((s) => s.activeAnimationId)
  const currentFrameIndex = useAnimationStore((s) => s.currentFrameIndex)
  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const playbackSpeed = useAnimationStore((s) => s.playbackSpeed)
  const onionSkinEnabled = useAnimationStore((s) => s.onionSkinEnabled)
  const onionSkinOpacity = useAnimationStore((s) => s.onionSkinOpacity)
  const frameClipboard = useAnimationStore((s) => s.frameClipboard)
  const project = useProjectStore((s) => s.project)
  const projectPath = useProjectStore((s) => s.projectPath)
  const refreshTree = useFileTreeStore((s) => s.refresh)
  const browserDemoWorkspace = isBrowserDemoWorkspaceEnabled()

  const togglePlayback = useAnimationStore((s) => s.togglePlayback)
  const setCurrentFrame = useAnimationStore((s) => s.setCurrentFrame)
  const setPlaybackSpeed = useAnimationStore((s) => s.setPlaybackSpeed)
  const setPlaying = useAnimationStore((s) => s.setPlaying)
  const setActiveAnimation = useAnimationStore((s) => s.setActiveAnimation)
  const setFps = useAnimationStore((s) => s.setFps)
  const reorderFrames = useAnimationStore((s) => s.reorderFrames)
  const duplicateFrame = useAnimationStore((s) => s.duplicateFrame)
  const deleteFrame = useAnimationStore((s) => s.deleteFrame)
  const copyFrame = useAnimationStore((s) => s.copyFrame)
  const pasteFrame = useAnimationStore((s) => s.pasteFrame)
  const toggleOnionSkin = useAnimationStore((s) => s.toggleOnionSkin)
  const setOnionSkinOpacity = useAnimationStore((s) => s.setOnionSkinOpacity)

  const activeAnimation = useMemo(
    () => animations.find((a) => a.id === activeAnimationId),
    [animations, activeAnimationId],
  )
  const playbackAnimationId = activeAnimation?.id
  const playbackFrameCount = activeAnimation?.frames.length ?? 0
  const playbackFps = activeAnimation?.fps ?? 1
  const { showToast } = useToast()
  const {
    addImagePathsToEmptyCell,
    addImagePathsToTimeline,
    createTimelineAtIndex,
    insertBlankFramesToIndex,
    persistUpdatedAnimation,
    removePersistedAnimation,
  } = useTimelineImageInsertion()

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    frameIndex: number
  } | null>(null)
  const timelineRootRef = useRef<HTMLDivElement>(null)
  const thumbnailsRef = useRef<HTMLDivElement>(null)
  const speedDragStartRef = useRef<{ x: number; speed: number } | null>(null)

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handlePlaybackSpeedChange = useCallback(
    (nextSpeed: number) => {
      const clampedSpeed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, nextSpeed))
      setPlaybackSpeed(Number(clampedSpeed.toFixed(2)))
    },
    [setPlaybackSpeed],
  )

  const handleSpeedPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      speedDragStartRef.current = { x: event.clientX, speed: playbackSpeed }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [playbackSpeed],
  )

  const handleSpeedPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const dragStart = speedDragStartRef.current
      if (!dragStart) return
      const delta = (event.clientX - dragStart.x) / 120
      handlePlaybackSpeedChange(dragStart.speed + delta)
    },
    [handlePlaybackSpeedChange],
  )

  const handleSpeedPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      speedDragStartRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [],
  )

  const handleSpeedWheel = useCallback(
    (event: React.WheelEvent<HTMLButtonElement>) => {
      event.preventDefault()
      handlePlaybackSpeedChange(playbackSpeed + (event.deltaY < 0 ? 0.05 : -0.05))
    },
    [handlePlaybackSpeedChange, playbackSpeed],
  )

  const handleSpeedKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault()
        handlePlaybackSpeedChange(playbackSpeed - 0.05)
      }
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault()
        handlePlaybackSpeedChange(playbackSpeed + 0.05)
      }
      if (event.key === "Home") {
        event.preventDefault()
        handlePlaybackSpeedChange(SPEED_MIN)
      }
      if (event.key === "End") {
        event.preventDefault()
        handlePlaybackSpeedChange(SPEED_MAX)
      }
    },
    [handlePlaybackSpeedChange, playbackSpeed],
  )

  useEffect(() => {
    if (!isPlaying || !playbackAnimationId) return
    if (playbackFrameCount === 0) {
      setPlaying(false)
      return
    }

    const framesPerSecond = Math.max(1, playbackFps) * Math.max(0.01, playbackSpeed)
    const frameDurationMs = 1000 / framesPerSecond
    const timerIntervalMs = Math.max(1, frameDurationMs)
    let lastTick = Date.now()
    let accumulatedMs = 0

    const timer = window.setInterval(() => {
      const now = Date.now()
      accumulatedMs += Math.max(now - lastTick, timerIntervalMs)
      lastTick = now

      const framesToAdvance = Math.floor(accumulatedMs / frameDurationMs)
      if (framesToAdvance <= 0) return
      accumulatedMs -= framesToAdvance * frameDurationMs

      const state = useAnimationStore.getState()
      const playingAnimation = state.animations.find(
        (animation) => animation.id === playbackAnimationId,
      )
      if (!playingAnimation || playingAnimation.frames.length === 0) {
        state.setPlaying(false)
        return
      }

      const frameCount = playingAnimation.frames.length
      const lastFrameIndex = frameCount - 1
      const nextFrameIndex = state.currentFrameIndex + framesToAdvance

      if (playingAnimation.loop) {
        state.setCurrentFrame(nextFrameIndex % frameCount)
        return
      }

      if (nextFrameIndex >= lastFrameIndex) {
        state.setCurrentFrame(lastFrameIndex)
        state.setPlaying(false)
        return
      }

      state.setCurrentFrame(nextFrameIndex)
    }, timerIntervalMs)

    return () => window.clearInterval(timer)
  }, [
    isPlaying,
    playbackAnimationId,
    playbackFps,
    playbackFrameCount,
    playbackSpeed,
    setPlaying,
  ])

  const importDroppedFiles = useCallback(
    async (files: File[], afterIndex?: number, targetIndex?: number) => {
      logDnd("importDroppedFiles", {
        files: files.map((file) => file.name),
        afterIndex,
        targetIndex,
      })
      if (browserDemoWorkspace) {
        showToast("warning", "Timeline file import is disabled in browser demo mode")
        return false
      }
      if (!project || !projectPath) {
        showToast("error", "No project open")
        return false
      }
      if (files.length === 0) return false
      if (files.some((file) => !isTimelineImagePath(file.name))) {
        showToast("warning", "Only image files can be added to the timeline")
        return false
      }

      const savedPaths: string[] = []
      for (const file of files) {
        const path = getImportedImagePath(projectPath, file.name)
        try {
          await saveImageDrop(projectPath, file, path)
          savedPaths.push(path)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          showToast("error", `Failed to import ${file.name}: ${message}`)
          if (savedPaths.length > 0) await refreshTree()
          return false
        }
      }

      await refreshTree()
      return typeof targetIndex === "number"
        ? addImagePathsToEmptyCell(savedPaths, targetIndex)
        : addImagePathsToTimeline(savedPaths, afterIndex)
    },
    [
      addImagePathsToEmptyCell,
      addImagePathsToTimeline,
      browserDemoWorkspace,
      project,
      projectPath,
      refreshTree,
      showToast,
    ],
  )

  const importDroppedImage = useCallback(
    async (e: React.DragEvent, afterIndex?: number, targetIndex?: number) => {
      logDnd("timeline importDroppedImage", {
        types: Array.from(e.dataTransfer.types ?? []),
        files: (e.dataTransfer.files?.length ?? 0),
        hasMovaPayload: hasMovaFilePayload(e.dataTransfer),
        dragIndex,
        afterIndex,
        targetIndex,
        target: e.target instanceof HTMLElement ? e.target.dataset.testid ?? e.target.tagName : String(e.target),
        currentTarget: e.currentTarget instanceof HTMLElement ? e.currentTarget.dataset.testid ?? e.currentTarget.tagName : String(e.currentTarget),
      })
      e.preventDefault()
      e.stopPropagation()
      setDragIndex(null)

      const files = Array.from(e.dataTransfer.files ?? [])
      if (!hasMovaFilePayload(e.dataTransfer) && files.length > 0) {
        return importDroppedFiles(files, afterIndex, targetIndex)
      }

      const payload = readFileDragPayload(e.dataTransfer)
      logDnd("timeline payload", { payload })
      if (!payload || payload.isDirectory) return false
      if (!isTimelineImagePath(payload.path)) {
        showToast("warning", "Only image files can be added to the timeline")
        return false
      }
      return typeof targetIndex === "number"
        ? addImagePathsToEmptyCell([payload.path], targetIndex)
        : addImagePathsToTimeline([payload.path], afterIndex)
    },
    [
      addImagePathsToEmptyCell,
      addImagePathsToTimeline,
      dragIndex,
      importDroppedFiles,
      showToast,
    ],
  )

  const isNativeDropInsideTimeline = useCallback(
    (position: NativeDropPosition) => {
      const root = timelineRootRef.current
      if (!root) return false
      const rect = root.getBoundingClientRect()
      const logicalPosition = toLogicalDropPosition(position)
      const inside =
        logicalPosition.x >= rect.left &&
        logicalPosition.x <= rect.right &&
        logicalPosition.y >= rect.top &&
        logicalPosition.y <= rect.bottom
      logDnd("native inside check", {
        rawPosition: { x: position.x, y: position.y },
        devicePixelRatio: window.devicePixelRatio || 1,
        hasToLogical: Boolean(position.toLogical),
        logicalPosition,
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        inside,
      })
      return inside
    },
    [],
  )

  const importNativeDroppedPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return false
      if (browserDemoWorkspace) {
        showToast("warning", "Timeline file import is disabled in browser demo mode")
        return false
      }
      if (!project || !projectPath) {
        showToast("error", "No project open")
        return false
      }

      const imagePaths = paths.filter(isTimelineImagePath)
      if (imagePaths.length === 0) {
        showToast("warning", "Only image files can be added to the timeline")
        return false
      }

      const timelinePaths: string[] = []
      let importedExternalPath = false
      for (const imagePath of imagePaths) {
        if (isProjectContainedPath(imagePath, projectPath)) {
          timelinePaths.push(imagePath)
          continue
        }

        const importedPath = getImportedImagePath(projectPath, getPathFileName(imagePath))
        try {
          const imageFile = await invoke<ImageFileBytes>("read_image_file", { path: imagePath })
          await saveImageBytes(projectPath, importedPath, imageFile.data)
          timelinePaths.push(importedPath)
          importedExternalPath = true
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          showToast("error", `Failed to import ${getPathFileName(imagePath)}: ${message}`)
          if (importedExternalPath) await refreshTree()
          return false
        }
      }

      setDragIndex(null)
      if (importedExternalPath) await refreshTree()
      return addImagePathsToTimeline(timelinePaths)
    },
    [
      addImagePathsToTimeline,
      browserDemoWorkspace,
      project,
      projectPath,
      refreshTree,
      showToast,
    ],
  )

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return

    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        logDnd("native event", event.payload)
        if (event.payload.type !== "drop") return
        if (!isNativeDropInsideTimeline(event.payload.position)) return
        void importNativeDroppedPaths(event.payload.paths)
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup()
          return
        }
        unlisten = cleanup
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [importNativeDroppedPaths, isNativeDropInsideTimeline])

  const handleTimelineDragOver = useCallback(
    (e: React.DragEvent) => {
      logDnd("timeline dragover", {
        types: Array.from(e.dataTransfer.types ?? []),
        files: (e.dataTransfer.files?.length ?? 0),
        dragIndex,
        target: e.target instanceof HTMLElement ? e.target.dataset.testid ?? e.target.tagName : String(e.target),
        currentTarget: e.currentTarget instanceof HTMLElement ? e.currentTarget.dataset.testid ?? e.currentTarget.tagName : String(e.currentTarget),
      })
      e.preventDefault()
      e.dataTransfer.dropEffect = dragIndex === null ? "copy" : "move"
    },
    [dragIndex],
  )

  const timelineSelector = useMemo(
    () => (
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {animations.map((animation) => {
          const isActive = animation.id === activeAnimationId
          return (
            <button
              key={animation.id}
              type="button"
              onClick={() => setActiveAnimation(animation.id)}
              aria-label={`Switch to ${animation.name} timeline`}
              title={animation.name}
              className={`max-w-28 shrink-0 truncate rounded-[var(--radius-pill)] border px-2.5 py-1 text-xs font-semibold ${
                isActive
                  ? "border-[var(--color-accent)] bg-[var(--color-brand-red-soft)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              {animation.name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => createTimelineAtIndex(0)}
          aria-label="Create new timeline"
          className="shrink-0 rounded-[var(--radius-pill)] border border-dashed border-[var(--color-border-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          + Timeline
        </button>
      </div>
    ),
    [animations, activeAnimationId, setActiveAnimation, createTimelineAtIndex],
  )

  if (!activeAnimation) {
    return (
      <div
        ref={timelineRootRef}
        className="shrink-0 bg-[var(--color-bg-panel)] px-4 py-4"
        data-testid="animation-timeline-empty"
        onDragOver={handleTimelineDragOver}
        onDrop={(e) => {
          void importDroppedImage(e)
        }}
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex min-w-[140px] shrink-0 items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Timeline
            </span>
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-bg-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
              Waiting for frames
            </span>
          </div>
          <button
            type="button"
            disabled
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]"
            title="No animation available"
            aria-label="No animation available"
          >
            <Play size={16} />
          </button>
          <div className="min-w-0 flex-1">{timelineSelector}</div>
          <div className="hidden text-xs font-medium text-[var(--color-text-secondary)] lg:block">
            Drop an image here or generate an animation to populate frames.
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex min-w-0 flex-1 gap-2 overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-bg-secondary)] p-3">
            {Array.from({ length: EMPTY_TIMELINE_CELL_COUNT }, (_, index) => (
              <div key={index} className="mova-content-auto shrink-0">
                <button
                  type="button"
                  aria-label={`Create timeline with frame ${index + 1} selected`}
                  data-testid={`empty-timeline-cell-${index}`}
                  onClick={() => insertBlankFramesToIndex(index)}
                  onDragOver={handleTimelineDragOver}
                  onDrop={(e) => {
                    void importDroppedImage(e, undefined, index)
                  }}
                  className="flex h-12 w-16 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-panel)] text-sm font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  +
                </button>
                <div className="mt-1 text-center text-xs font-semibold text-[var(--color-text-muted)]">
                  {String(index + 1).padStart(2, "0")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", activeAnimation.frames[index]?.id ?? "")
    logDnd("frame dragstart", {
      index,
      frameId: activeAnimation.frames[index]?.id,
      types: Array.from(e.dataTransfer.types ?? []),
    })
    setDragIndex(index)
  }

  const handleDragOver = () => handleTimelineDragOver

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    logDnd("frame drop", {
      index,
      dragIndex,
      types: Array.from(e.dataTransfer.types ?? []),
      files: (e.dataTransfer.files?.length ?? 0),
      hasTimelineImportPayload: hasTimelineImportPayload(e.dataTransfer),
    })
    e.preventDefault()
    e.stopPropagation()
    if (dragIndex === null || hasTimelineImportPayload(e.dataTransfer)) {
      void importDroppedImage(e, index)
      return
    }
    if (dragIndex === index) {
      setDragIndex(null)
      return
    }
    persistUpdatedAnimation(reorderFrames(activeAnimation.id, dragIndex, index))
    setDragIndex(null)
  }

  const handleContextMenu = (frameIndex: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, frameIndex })
  }

  const handleCopy = (frame: Frame) => {
    copyFrame(frame)
    closeContextMenu()
  }

  const handlePaste = (afterIndex: number) => {
    persistUpdatedAnimation(pasteFrame(activeAnimation.id, afterIndex))
    closeContextMenu()
  }

  const handleDuplicate = (frameIndex: number) => {
    persistUpdatedAnimation(duplicateFrame(activeAnimation.id, frameIndex))
    closeContextMenu()
  }

  const handleDelete = (frameIndex: number) => {
    const deletingLastFrame = activeAnimation.frames.length <= 1
    if (activeAnimation.frames.length <= 1) {
      const ok = window.confirm(
        "This is the last frame. Deleting it will remove the animation. Continue?",
      )
      if (!ok) return
    }
    const updatedAnimation = deleteFrame(activeAnimation.id, frameIndex)
    if (deletingLastFrame) {
      removePersistedAnimation(activeAnimation.id)
    } else {
      persistUpdatedAnimation(updatedAnimation)
    }
    closeContextMenu()
  }

  const handleFpsChange = (fps: number) => {
    persistUpdatedAnimation(setFps(activeAnimation.id, fps))
  }

  return (
    <div
      ref={timelineRootRef}
      className="shrink-0 bg-[var(--color-bg-panel)] px-4 py-3"
      data-testid="animation-timeline"
      onDragOver={handleTimelineDragOver}
      onDrop={(e) => {
        void importDroppedImage(e)
      }}
    >
      <div className="mb-3 space-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-[140px] shrink-0 items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Timeline
            </span>
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-bg-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
              {currentFrameIndex + 1}/{activeAnimation.frames.length}
            </span>
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">{timelineSelector}</div>
        </div>

        <div
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 overflow-x-auto pb-1"
          data-testid="timeline-controls"
        >
          <div className="flex min-w-0 items-center justify-start gap-2">
            <button
              onClick={togglePlayback}
              title={isPlaying ? "Pause" : "Play"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-[0_10px_24px_rgba(255,56,48,0.22)] hover:bg-[var(--color-accent-hover)]"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              onClick={() => setCurrentFrame(0)}
              title="Go to first frame"
              className="mova-icon-button shrink-0"
            >
              <SkipBack size={14} />
            </button>
            <button
              onClick={() => setCurrentFrame(Math.max(0, currentFrameIndex - 1))}
              title="Previous frame"
              className="mova-icon-button shrink-0"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() =>
                setCurrentFrame(
                  Math.min(
                    activeAnimation.frames.length - 1,
                    currentFrameIndex + 1,
                  ),
                )
              }
              title="Next frame"
              className="mova-icon-button shrink-0"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="flex min-w-max items-center justify-center gap-2">
            <span className="shrink-0 text-xs font-mono text-[var(--color-text-secondary)]">
              Frame {currentFrameIndex + 1}/{activeAnimation.frames.length}
            </span>

            <div className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-2 py-1 shadow-[var(--shadow-xs)]">
              <Gauge size={12} className="text-[var(--color-text-secondary)]" />
              <input
                type="number"
                min={1}
                max={60}
                value={activeAnimation.fps}
                onChange={(e) =>
                  handleFpsChange(parseInt(e.target.value, 10) || 1)
                }
                className="w-10 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-xs font-semibold text-[var(--color-text-primary)]"
                title="FPS"
              />
              <span className="text-[10px] text-[var(--color-text-muted)]">
                fps
              </span>
            </div>

            <button
              type="button"
              title="Playback speed: drag horizontally, scroll, or use arrow keys to adjust; double-click to reset"
              aria-label={`Playback speed ${playbackSpeed.toFixed(2)}x`}
              aria-valuemin={SPEED_MIN}
              aria-valuemax={SPEED_MAX}
              aria-valuenow={playbackSpeed}
              onPointerDown={handleSpeedPointerDown}
              onPointerMove={handleSpeedPointerMove}
              onPointerUp={handleSpeedPointerUp}
              onPointerCancel={handleSpeedPointerUp}
              onWheel={handleSpeedWheel}
              onKeyDown={handleSpeedKeyDown}
              onDoubleClick={() => handlePlaybackSpeedChange(1)}
              className="flex h-8 min-w-16 shrink-0 cursor-ew-resize touch-none select-none items-center justify-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-3 text-xs font-mono font-semibold text-white shadow-[var(--shadow-xs)] hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red-ring)]"
            >
              <Gauge size={13} />
              {playbackSpeed.toFixed(2).replace(/\.00$/, "").replace(/0$/, "")}x
            </button>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2">
            <button
              onClick={toggleOnionSkin}
              title="Toggle onion skin"
              className={`flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold transition-colors ${
                onionSkinEnabled
                  ? "text-[var(--color-accent)] bg-[var(--color-brand-red-soft)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              <Eye size={14} />
              Onion Skin
            </button>
            {onionSkinEnabled && (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  Opacity
                </span>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={Math.round(onionSkinOpacity * 100)}
                  onChange={(e) =>
                    setOnionSkinOpacity(parseInt(e.target.value, 10) / 100)
                  }
                  className="h-1 w-16 cursor-pointer"
                  title="Onion skin opacity"
                />
                <span className="w-6 text-right text-[10px] font-mono text-[var(--color-text-muted)]">
                  {Math.round(onionSkinOpacity * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 items-end gap-4">
        <div
          ref={thumbnailsRef}
          data-testid="animation-timeline-strip"
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto rounded-[var(--radius-xl)] bg-[var(--color-bg-secondary)] p-3"
          onClick={closeContextMenu}
          onDragOver={handleTimelineDragOver}
          onDrop={(e) => {
            logDnd("strip drop", {
              dragIndex,
              types: Array.from(e.dataTransfer.types ?? []),
              files: (e.dataTransfer.files?.length ?? 0),
              hasTimelineImportPayload: hasTimelineImportPayload(e.dataTransfer),
              target: e.target instanceof HTMLElement ? e.target.dataset.testid ?? e.target.tagName : String(e.target),
            })
            e.preventDefault()
            e.stopPropagation()
            if (dragIndex === null || hasTimelineImportPayload(e.dataTransfer)) {
              void importDroppedImage(e)
              return
            }
            setDragIndex(null)
          }}
        >
          {activeAnimation.frames.map((frame, i) => (
            <div
              key={frame.id}
              role="button"
              tabIndex={0}
              aria-label={`Frame ${i + 1} timeline item`}
              data-testid={`timeline-frame-${i}`}
              draggable
              onDragStart={handleDragStart(i)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={handleDragOver()}
              onDrop={handleDrop(i)}
              onContextMenu={handleContextMenu(i)}
              onClick={() => setCurrentFrame(i)}
              className={`mova-content-auto group relative shrink-0 cursor-pointer transition-colors ${
                dragIndex === i ? "opacity-50" : ""
              }`}
            >
              {i === currentFrameIndex && (
                <div className="absolute -top-7 left-1/2 h-6 w-px -translate-x-1/2 bg-[var(--color-accent)]">
                  <div className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-[var(--color-accent)]" />
                </div>
              )}
              <div
                className={`relative rounded-[var(--radius-md)] border bg-[var(--color-bg-panel)] p-1 shadow-[var(--shadow-xs)] ${
                  i === currentFrameIndex
                    ? "border-[var(--color-accent)] ring-2 ring-[var(--color-brand-red-ring)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                }`}
              >
                <div className="absolute -top-1 -left-1 hidden rounded bg-[var(--color-bg-panel)] p-0.5 shadow-[var(--shadow-xs)] group-hover:block">
                  <GripVertical
                    size={10}
                    className="text-[var(--color-text-muted)]"
                  />
                </div>
                {frame.imagePath ? (
                  <LocalImage
                    src={frame.imagePath}
                    alt={`Frame ${i + 1}`}
                    className="h-12 w-16 rounded-[var(--radius-sm)] object-cover"
                    style={{ imageRendering: "pixelated" }}
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-12 w-16 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white text-sm font-semibold text-[var(--color-text-secondary)]">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                )}
              </div>
              <div
                className={`mt-1 text-center text-xs font-semibold ${
                  i === currentFrameIndex
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text-primary)]"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
            </div>
          ))}

          {Array.from({ length: ACTIVE_EMPTY_CELL_COUNT }, (_, offset) => {
            const targetIndex = activeAnimation.frames.length + offset
            return (
              <div key={`empty-${targetIndex}`} className="mova-content-auto shrink-0">
                <button
                  type="button"
                  aria-label={`Insert blank frame ${targetIndex + 1}`}
                  data-testid={`timeline-empty-cell-${targetIndex}`}
                  onClick={() => insertBlankFramesToIndex(targetIndex)}
                  onDragOver={handleTimelineDragOver}
                  onDrop={(e) => {
                    void importDroppedImage(e, undefined, targetIndex)
                  }}
                  className="flex h-16 w-12 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-panel)] text-sm font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  +
                </button>
                <div className="mt-1 text-center text-xs font-semibold text-[var(--color-text-muted)]">
                  {String(targetIndex + 1).padStart(2, "0")}
                </div>
              </div>
            )
          })}

          <button
            type="button"
            onClick={() =>
              persistUpdatedAnimation(
                duplicateFrame(activeAnimation.id, currentFrameIndex),
              )
            }
            className="flex h-[74px] w-14 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            title="Duplicate current frame"
            aria-label="Duplicate current frame"
          >
            +
          </button>
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() =>
              handleCopy(activeAnimation.frames[contextMenu.frameIndex])
            }
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
          >
            <Copy size={12} />
            Copy
          </button>
          <button
            onClick={() => handlePaste(contextMenu.frameIndex)}
            disabled={!frameClipboard}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ClipboardPaste size={12} />
            Paste
          </button>
          <button
            onClick={() => handleDuplicate(contextMenu.frameIndex)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
          >
            <Layers size={12} />
            Duplicate
          </button>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            onClick={() => handleDelete(contextMenu.frameIndex)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)]"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
