import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react"
import { Stage, Layer, Image as KonvaImage, Rect } from "react-konva"
import type Konva from "konva"
import { invoke } from "@tauri-apps/api/core"
import { Grid3x3, Maximize2, Minus, Plus, Save } from "lucide-react"
import { useAnimationStore } from "../../stores/animation-store"
import { useProjectStore } from "../../stores/project-store"
import { useFileTreeStore } from "../../stores/file-tree-store"
import { useSettingsStore } from "../../stores/settings-store"
import { GridOverlay } from "./grid-overlay"
import { useGridOverlay } from "../../hooks/use-grid-overlay"
import { useShortcuts } from "../../hooks/use-shortcuts"
import { DrawingToolbar } from "./drawing-toolbar"
import { DocumentPreview } from "./document-preview"
import { MovaLogo } from "../brand/mova-logo"
import type { DrawingPoint, ToolType, DrawingToolConfig } from "../../services/drawing/types"
import { createBrushTool } from "../../services/drawing/tools/brush-tool"
import { createEraserTool } from "../../services/drawing/tools/eraser-tool"
import { createFillTool } from "../../services/drawing/tools/fill-tool"
import { createShapeTool } from "../../services/drawing/tools/shape-tool"
import { exportEditedImagePngBytes } from "../../utils/image-save"
import { invalidateImageObjectUrl, useImageObjectUrl } from "../../hooks/use-image-object-url"
import { useTimelineImageInsertion } from "../../hooks/use-timeline-image-insertion"
import { isBrowserDemoWorkspaceEnabled } from "../../dev/browser-demo-workspace"
import { zoomAroundPoint, calculateContentPosition, clampScale } from "../../utils/viewport-math"

const CHECKER_SIZE = 20
const CHECKER_COLORS = ["#ffffff", "#f3f5f8"]
const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|gif)$/i
const EDITABLE_SELECTED_IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp)$/i
const EDITABLE_FRAME_IMAGE_FILE_PATTERN = /\.png$/i
const DRAWING_HISTORY_DEPTH = 50

type SaveStatus = "idle" | "saving" | "saved" | "error"

interface ImageSaveState {
  path: string | null
  status: SaveStatus
  error: string | null
}

interface ViewportTransform {
  scale: number
  stagePos: { x: number; y: number }
}

type DrawingHistoryNode = Konva.Shape | Konva.Group

function sameStagePos(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x === b.x && a.y === b.y
}

function sameViewportTransform(a: ViewportTransform, b: ViewportTransform) {
  return a.scale === b.scale && sameStagePos(a.stagePos, b.stagePos)
}

const imageCache = new Map<string, HTMLImageElement>()
const imageLoadCache = new Map<string, Promise<HTMLImageElement>>()

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached) return Promise.resolve(cached)

  const inFlight = imageLoadCache.get(src)
  if (inFlight) return inFlight

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const load = (useCrossOrigin: boolean) => {
      const img = new window.Image()
      if (useCrossOrigin) img.crossOrigin = "anonymous"
      img.onload = () => {
        imageCache.set(src, img)
        imageLoadCache.delete(src)
        resolve(img)
      }
      img.onerror = (event) => {
        if (useCrossOrigin) {
          load(false)
          return
        }
        imageLoadCache.delete(src)
        reject(event)
      }
      img.src = src
    }

    load(!src.startsWith("asset:") && !src.includes("asset.localhost"))
  })
  imageLoadCache.set(src, promise)
  return promise
}

function preloadImages(srcs: Array<string | undefined>) {
  srcs.forEach((src) => {
    if (src) void loadImage(src).catch(() => undefined)
  })
}

function createCheckerPatternCanvas() {
  const canvas = document.createElement("canvas")
  canvas.width = CHECKER_SIZE * 2
  canvas.height = CHECKER_SIZE * 2
  const ctx = canvas.getContext("2d")
  if (!ctx || typeof ctx.fillRect !== "function") return undefined

  ctx.fillStyle = CHECKER_COLORS[0]
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = CHECKER_COLORS[1]
  ctx.fillRect(CHECKER_SIZE, 0, CHECKER_SIZE, CHECKER_SIZE)
  ctx.fillRect(0, CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE)
  return canvas
}

function useKonvaImage(src: string | undefined) {
  const [loadedImage, setLoadedImage] = useState<{
    src: string
    image: HTMLImageElement | null
  } | null>(() =>
    src ? { src, image: imageCache.get(src) ?? null } : null,
  )

  useEffect(() => {
    if (!src) return

    let cancelled = false
    loadImage(src)
      .then((img) => {
        if (!cancelled) setLoadedImage({ src, image: img })
      })
      .catch(() => {
        if (!cancelled) setLoadedImage({ src, image: null })
      })
    return () => {
      cancelled = true
    }
  }, [src])

  if (!loadedImage || loadedImage.src !== src) return null
  return loadedImage.image
}

export function CanvasArea() {
  const project = useProjectStore((s) => s.project)
  const projectPath = useProjectStore((s) => s.projectPath)
  const animations = useAnimationStore((s) => s.animations)
  const activeAnimationId = useAnimationStore((s) => s.activeAnimationId)
  const currentFrameIndex = useAnimationStore((s) => s.currentFrameIndex)
  const onionSkinEnabled = useAnimationStore((s) => s.onionSkinEnabled)
  const onionSkinOpacity = useAnimationStore((s) => s.onionSkinOpacity)
  const togglePlayback = useAnimationStore((s) => s.togglePlayback)
  const editorGridSize = useSettingsStore((s) => s.editorSettings.gridSize)

  const activeAnimation = animations.find((a) => a.id === activeAnimationId)
  const currentFrame = activeAnimation?.frames[currentFrameIndex]
  const prevFrame = activeAnimation?.frames[currentFrameIndex - 1]
  const nextFrame = activeAnimation?.frames[currentFrameIndex + 1]

  const selectedPath = useFileTreeStore((s) => s.selectedPath)
  const selectFile = useFileTreeStore((s) => s.selectFile)
  const browserDemoWorkspace = isBrowserDemoWorkspaceEnabled()
  const selectedImagePath =
    selectedPath && IMAGE_FILE_PATTERN.test(selectedPath) ? selectedPath : null
  const selectedImageSrc = useImageObjectUrl(selectedImagePath)
  const selectedImage = useKonvaImage(selectedImageSrc)
  const selectedImageCanSave = Boolean(
    !browserDemoWorkspace &&
      selectedImagePath &&
      EDITABLE_SELECTED_IMAGE_FILE_PATTERN.test(selectedImagePath),
  )
  const selectedImageIsGif = Boolean(
    selectedImagePath && /\.gif$/i.test(selectedImagePath),
  )
  const currentFrameImagePath = currentFrame?.imagePath || null
  const currentFrameCanSave = Boolean(
    !browserDemoWorkspace &&
      currentFrameImagePath &&
      EDITABLE_FRAME_IMAGE_FILE_PATTERN.test(currentFrameImagePath),
  )
  const currentFrameReadOnlyReason = browserDemoWorkspace
    ? "Frame drawing is disabled in the demo workspace"
    : !currentFrameImagePath
      ? "Current frame has no editable image path"
      : !EDITABLE_FRAME_IMAGE_FILE_PATTERN.test(currentFrameImagePath)
        ? "Only PNG frame drawing edits can be saved"
        : null

  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const isPanning = useRef(false)
  const [cursor, setCursor] = useState("default")
  const lastPointerPos = useRef({ x: 0, y: 0 })
  const pendingPanDeltaRef = useRef({ x: 0, y: 0 })
  const panFrameRef = useRef<number | null>(null)
  const pendingZoomRef = useRef<ViewportTransform | null>(null)
  const zoomFrameRef = useRef<number | null>(null)

  // Refs to avoid closure staleness in event handlers without re-creating them
  const scaleRef = useRef(scale)
  const stagePosRef = useRef(stagePos)
  const committedScaleRef = useRef(scale)
  const committedStagePosRef = useRef(stagePos)
  const stageSizeRef = useRef(stageSize)
  const artboardWidthRef = useRef(0)
  const artboardHeightRef = useRef(0)
  const selectedImagePathRef = useRef(selectedImagePath)
  const selectedImageCanSaveRef = useRef(selectedImageCanSave)
  const currentFrameCanSaveRef = useRef(currentFrameCanSave)
  const activeToolConfigRef = useRef<DrawingToolConfig>({ color: "#000000", size: 4 })

  const [activeTool, setActiveTool] = useState<ToolType>("brush")
  const [toolConfig, setToolConfig] = useState<DrawingToolConfig>({
    color: "#000000",
    size: 4,
  })
  const drawingToolRef = useRef<ReturnType<typeof createBrushTool> | null>(null)
  const drawingMouseDownChildCountRef = useRef<number | null>(null)
  const drawingUndoStackRef = useRef<DrawingHistoryNode[][]>([])
  const drawingRedoStackRef = useRef<DrawingHistoryNode[][]>([])
  const [drawingHistoryState, setDrawingHistoryState] = useState({
    version: 0,
    canUndo: false,
    canRedo: false,
  })
  const [imageSaveState, setImageSaveState] = useState<ImageSaveState>({
    path: null,
    status: "idle",
    error: null,
  })
  const selectedImageSaveStatus =
    imageSaveState.path === selectedImagePath ? imageSaveState.status : "idle"
  const selectedImageSaveError =
    imageSaveState.path === selectedImagePath ? imageSaveState.error : null
  const currentFrameSaveStatus =
    currentFrameImagePath && imageSaveState.path === currentFrameImagePath
      ? imageSaveState.status
      : "idle"
  const currentFrameSaveError =
    currentFrameImagePath && imageSaveState.path === currentFrameImagePath
      ? imageSaveState.error
      : null
  const { addImagePathsToTimeline } = useTimelineImageInsertion()

  const handleShowTimelinePreview = useCallback(() => {
    selectFile(null)
  }, [selectFile])

  const handleAddSelectedImageToTimeline = useCallback(() => {
    if (!selectedImagePath) return
    const added = addImagePathsToTimeline([selectedImagePath])
    if (added) selectFile(null)
  }, [addImagePathsToTimeline, selectFile, selectedImagePath])

  const refreshDrawingHistoryState = useCallback(() => {
    setDrawingHistoryState((state) => ({
      version: state.version + 1,
      canUndo: drawingUndoStackRef.current.length > 0,
      canRedo: drawingRedoStackRef.current.length > 0,
    }))
  }, [])

  const getDrawingLayer = useCallback((): Konva.Layer | null => {
    return (stageRef.current?.findOne(".drawing-layer") as Konva.Layer | undefined) ?? null
  }, [])

  const getDrawingLayerChildren = useCallback((layer: Konva.Layer): DrawingHistoryNode[] => {
    const maybeLayer = layer as Konva.Layer & { getChildren?: () => Iterable<DrawingHistoryNode> }
    if (!maybeLayer.getChildren) return []
    return Array.from(maybeLayer.getChildren())
  }, [])

  const clearDetachedRedoNodes = useCallback(() => {
    drawingRedoStackRef.current.flat().forEach((node) => {
      if (!node.getLayer?.()) node.destroy?.()
    })
    drawingRedoStackRef.current = []
  }, [])

  const recordDrawingHistoryAction = useCallback(
    (nodes: DrawingHistoryNode[]) => {
      if (nodes.length === 0) return
      clearDetachedRedoNodes()
      drawingUndoStackRef.current.push(nodes)
      if (drawingUndoStackRef.current.length > DRAWING_HISTORY_DEPTH) {
        const removedNodes = drawingUndoStackRef.current.shift()
        removedNodes?.forEach((node) => {
          if (!node.getLayer?.()) node.destroy?.()
        })
      }
      refreshDrawingHistoryState()
    },
    [clearDetachedRedoNodes, refreshDrawingHistoryState],
  )

  const undoDrawingAction = useCallback(() => {
    const layer = getDrawingLayer()
    const action = drawingUndoStackRef.current.pop()
    if (!layer || !action) return

    action.forEach((node) => node.remove())
    drawingRedoStackRef.current.push(action)
    layer.batchDraw()
    refreshDrawingHistoryState()
  }, [getDrawingLayer, refreshDrawingHistoryState])

  const redoDrawingAction = useCallback(() => {
    const layer = getDrawingLayer()
    const action = drawingRedoStackRef.current.pop()
    if (!layer || !action) return

    action.forEach((node) => layer.add(node))
    drawingUndoStackRef.current.push(action)
    layer.batchDraw()
    refreshDrawingHistoryState()
  }, [getDrawingLayer, refreshDrawingHistoryState])

  const canUndoDrawing = drawingHistoryState.canUndo
  const canRedoDrawing = drawingHistoryState.canRedo

  useEffect(() => {
    switch (activeTool) {
      case "brush":
        drawingToolRef.current = createBrushTool()
        break
      case "eraser":
        drawingToolRef.current = createEraserTool()
        break
      case "fill":
        drawingToolRef.current = createFillTool()
        break
      case "rect":
      case "ellipse":
        drawingToolRef.current = createShapeTool()
        break
      default:
        drawingToolRef.current = null
    }
    setCursor(drawingToolRef.current?.cursor ?? "default")
  }, [activeTool])

  const grid = useGridOverlay({
    visible: editorGridSize !== 0,
    gridSize: editorGridSize === 0 ? 16 : editorGridSize,
  })
  const {
    hide: hideGrid,
    setGridSize: setGridSizeOverlay,
    show: showGrid,
  } = grid

  useEffect(() => {
    if (editorGridSize === 0) {
      hideGrid()
      return
    }
    setGridSizeOverlay(editorGridSize)
    showGrid()
  }, [editorGridSize, hideGrid, setGridSizeOverlay, showGrid])

  const flushPendingPanDelta = useCallback(() => {
    const delta = pendingPanDeltaRef.current
    pendingPanDeltaRef.current = { x: 0, y: 0 }
    if (delta.x === 0 && delta.y === 0) return

    const applyDelta = (pos: { x: number; y: number }) => ({
      x: pos.x + delta.x,
      y: pos.y + delta.y,
    })
    const pendingZoom = pendingZoomRef.current
    if (pendingZoom) {
      const nextStagePos = applyDelta(pendingZoom.stagePos)
      pendingZoomRef.current = { ...pendingZoom, stagePos: nextStagePos }
      stagePosRef.current = nextStagePos
    } else {
      stagePosRef.current = applyDelta(stagePosRef.current)
    }

    setStagePos((prev) => applyDelta(prev))
  }, [setStagePos])

  const schedulePanDelta = useCallback(
    (dx: number, dy: number) => {
      pendingPanDeltaRef.current = {
        x: pendingPanDeltaRef.current.x + dx,
        y: pendingPanDeltaRef.current.y + dy,
      }
      if (panFrameRef.current !== null) return
      panFrameRef.current = window.requestAnimationFrame(() => {
        panFrameRef.current = null
        flushPendingPanDelta()
      })
    },
    [flushPendingPanDelta],
  )

  const cancelPendingPanFrame = useCallback(() => {
    if (panFrameRef.current !== null) {
      window.cancelAnimationFrame(panFrameRef.current)
      panFrameRef.current = null
    }
  }, [])

  const flushPendingZoom = useCallback(() => {
    const pendingZoom = pendingZoomRef.current
    pendingZoomRef.current = null
    if (!pendingZoom) return

    scaleRef.current = pendingZoom.scale
    stagePosRef.current = pendingZoom.stagePos

    if (committedScaleRef.current !== pendingZoom.scale) {
      setScale((current) =>
        current === pendingZoom.scale ? current : pendingZoom.scale,
      )
    }
    if (!sameStagePos(committedStagePosRef.current, pendingZoom.stagePos)) {
      setStagePos((current) =>
        sameStagePos(current, pendingZoom.stagePos) ? current : pendingZoom.stagePos,
      )
    }
  }, [setScale, setStagePos])

  const schedulePendingZoomFlush = useCallback(() => {
    if (zoomFrameRef.current !== null) return
    zoomFrameRef.current = window.requestAnimationFrame(() => {
      zoomFrameRef.current = null
      flushPendingZoom()
    })
  }, [flushPendingZoom])

  const cancelPendingZoomFrame = useCallback(() => {
    const hadPendingZoom = pendingZoomRef.current !== null
    if (zoomFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomFrameRef.current)
      zoomFrameRef.current = null
    }
    pendingZoomRef.current = null
    if (hadPendingZoom) {
      scaleRef.current = committedScaleRef.current
      stagePosRef.current = committedStagePosRef.current
    }
  }, [])

  const zoomBy = useCallback(
    (factor: number) => {
      cancelPendingZoomFrame()
      const nextScale = clampScale(scaleRef.current * factor)
      if (nextScale === scaleRef.current) return
      scaleRef.current = nextScale
      setScale((current) => (current === nextScale ? current : nextScale))
    },
    [cancelPendingZoomFrame, setScale],
  )

  const resetViewport = useCallback(() => {
    cancelPendingZoomFrame()
    scaleRef.current = 1
    stagePosRef.current = { x: 0, y: 0 }
    setScale((current) => (current === 1 ? current : 1))
    setStagePos((current) =>
      sameStagePos(current, { x: 0, y: 0 }) ? current : { x: 0, y: 0 },
    )
  }, [cancelPendingZoomFrame, setScale, setStagePos])

  const cancelCanvasInteraction = useCallback(() => {
    isPanning.current = false
    cancelPendingPanFrame()
    flushPendingPanDelta()
    setCursor(drawingToolRef.current?.cursor ?? "default")
  }, [cancelPendingPanFrame, flushPendingPanDelta, setCursor])

  const shortcutCallbacks = useMemo(
    () => ({
      playPause: togglePlayback,
      escape: cancelCanvasInteraction,
    }),
    [cancelCanvasInteraction, togglePlayback],
  )

  useShortcuts(shortcutCallbacks)

  useEffect(
    () => () => {
      cancelPendingPanFrame()
      cancelPendingZoomFrame()
      pendingPanDeltaRef.current = { x: 0, y: 0 }
    },
    [cancelPendingPanFrame, cancelPendingZoomFrame],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const target = event.target as HTMLElement | null
      if (
        target?.closest("input, textarea, select") ||
        target?.isContentEditable
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const isUndo = key === "z" && !event.shiftKey
      const isRedo = key === "y" || (key === "z" && event.shiftKey)
      if (!isUndo && !isRedo) return

      event.preventDefault()
      if (isUndo) undoDrawingAction()
      if (isRedo) redoDrawingAction()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [redoDrawingAction, undoDrawingAction])

  const currentFrameSrc = useImageObjectUrl(currentFrameImagePath)
  const prevFrameSrc = useImageObjectUrl(prevFrame?.imagePath)
  const nextFrameSrc = useImageObjectUrl(nextFrame?.imagePath)
  const activeCharacterBaseImagePath = project?.characters.find(
    (c) => c.id === project.activeCharacterId,
  )?.baseImagePath
  const baseImageSrc = useImageObjectUrl(activeCharacterBaseImagePath)

  const animationFrameSrcs = useMemo(
    () => [currentFrameSrc, prevFrameSrc, nextFrameSrc, baseImageSrc],
    [baseImageSrc, currentFrameSrc, nextFrameSrc, prevFrameSrc],
  )

  useEffect(() => {
    preloadImages(animationFrameSrcs)
  }, [animationFrameSrcs])

  const frameImage = useKonvaImage(currentFrameSrc)
  const prevFrameImage = useKonvaImage(prevFrameSrc)
  const nextFrameImage = useKonvaImage(nextFrameSrc)
  const baseImage = useKonvaImage(baseImageSrc)

  useEffect(() => {
    const drawingLayer = stageRef.current?.findOne(".drawing-layer") as
      | Konva.Layer
      | undefined
    drawingLayer?.destroyChildren()
    drawingLayer?.batchDraw()
    drawingUndoStackRef.current = []
    drawingRedoStackRef.current = []
    drawingMouseDownChildCountRef.current = null
    const timeoutId = window.setTimeout(refreshDrawingHistoryState, 0)
    return () => window.clearTimeout(timeoutId)
  }, [
    activeAnimationId,
    currentFrameImagePath,
    currentFrameIndex,
    refreshDrawingHistoryState,
    selectedImagePath,
  ])

  // Resize observer to keep stage sized to container. ResizeObserver can fire
  // dozens of times while the user drags a native window or side panel, so
  // coalesce updates to one React state change per animation frame.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let frameId: number | null = null
    let nextSize: { width: number; height: number } | null = null
    const ro = new ResizeObserver((entries) => {
      const entry = entries.at(-1)
      if (!entry) return
      const cr = entry.contentRect
      nextSize = { width: cr.width, height: cr.height }
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        if (!nextSize) return
        const size = nextSize
        nextSize = null
        setStageSize((current) =>
          current.width === size.width && current.height === size.height
            ? current
            : size,
        )
      })
    })
    ro.observe(el)
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      ro.disconnect()
    }
  }, [])

  const displayedImage = frameImage ?? baseImage
  const canvasImage = selectedImagePath ? selectedImage : displayedImage
  const artboardWidth =
    canvasImage?.naturalWidth ||
    canvasImage?.width ||
    project?.settings.defaultFrameWidth ||
    1280
  const artboardHeight =
    canvasImage?.naturalHeight ||
    canvasImage?.height ||
    project?.settings.defaultFrameHeight ||
    720

  const contentPosition = useMemo(
    () => calculateContentPosition({
      scale,
      stagePos,
      stageSize,
      artboardWidth,
      artboardHeight,
    }),
    [artboardHeight, artboardWidth, scale, stagePos, stageSize],
  )

  const getArtboardPointer = useCallback((stage: Konva.Stage): DrawingPoint | null => {
    const pointer = stage.getRelativePointerPosition()
    return pointer ? { x: pointer.x, y: pointer.y } : null
  }, [])

  const activeToolConfig = useMemo<DrawingToolConfig>(() => {
    if (activeTool === "rect" || activeTool === "ellipse") {
      return { ...toolConfig, mode: activeTool }
    }
    return toolConfig
  }, [activeTool, toolConfig])

  // Sync refs in a layout effect so they are fresh for event handlers
  // without triggering the react-hooks/refs lint rule
  // Must be declared after all derived values it references
  useLayoutEffect(() => {
    committedScaleRef.current = scale
    committedStagePosRef.current = stagePos
    if (!pendingZoomRef.current) {
      scaleRef.current = scale
      stagePosRef.current = stagePos
    }
    stageSizeRef.current = stageSize
    artboardWidthRef.current = artboardWidth
    artboardHeightRef.current = artboardHeight
    selectedImagePathRef.current = selectedImagePath
    selectedImageCanSaveRef.current = selectedImageCanSave
    currentFrameCanSaveRef.current = currentFrameCanSave
    activeToolConfigRef.current = activeToolConfig
  })

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return

      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const currentViewport: ViewportTransform = {
        scale: scaleRef.current,
        stagePos: stagePosRef.current,
      }
      const direction = (e.evt.deltaY > 0 ? 1 : -1) as 1 | -1
      const { newScale, newStagePos } = zoomAroundPoint(
        pointer,
        currentViewport.scale,
        direction,
        artboardWidthRef.current,
        artboardHeightRef.current,
        stageSizeRef.current,
        currentViewport.stagePos,
      )
      if (newScale === currentViewport.scale) return
      const nextViewport = { scale: newScale, stagePos: newStagePos }
      if (sameViewportTransform(currentViewport, nextViewport)) return

      // Update logical viewport refs immediately so multiple wheel events in the
      // same frame compose from the previous wheel result, while React/Konva only
      // receive one committed state update in the scheduled rAF flush.
      scaleRef.current = nextViewport.scale
      stagePosRef.current = nextViewport.stagePos
      pendingZoomRef.current = nextViewport
      schedulePendingZoomFlush()
    },
    [schedulePendingZoomFlush],
  )

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const evt = e.evt
      const stage = stageRef.current
      const tool = drawingToolRef.current

      if (tool && stage) {
        const isImageMode = selectedImagePathRef.current !== null
        const canDraw = isImageMode
          ? selectedImageCanSaveRef.current
          : currentFrameCanSaveRef.current

        if (canDraw) {
          const point = getArtboardPointer(stage)
          if (!point) return
          const drawingLayer = getDrawingLayer()
          drawingMouseDownChildCountRef.current = drawingLayer
            ? getDrawingLayerChildren(drawingLayer).length
            : null
          tool.onMouseDown(e, stage, activeToolConfigRef.current, point)
          return
        }
      }

      if (evt.button === 1 || (evt.button === 0 && evt.ctrlKey)) {
        isPanning.current = true
        setCursor("grabbing")
        lastPointerPos.current = { x: evt.clientX, y: evt.clientY }
      }
    },
    [getArtboardPointer, getDrawingLayer, getDrawingLayerChildren, setCursor],
  )

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current
      const tool = drawingToolRef.current

      if (tool && stage) {
        // Use refs to avoid closure dependency on animation/project state.
        const isImageMode = selectedImagePathRef.current !== null
        const canDraw = isImageMode
          ? selectedImageCanSaveRef.current
          : currentFrameCanSaveRef.current

        if (canDraw) {
          const point = getArtboardPointer(stage)
          if (!point) return
          tool.onMouseMove(e, stage, activeToolConfigRef.current, point)
          return
        }
      }

      if (!isPanning.current) return
      const evt = e.evt
      const dx = evt.clientX - lastPointerPos.current.x
      const dy = evt.clientY - lastPointerPos.current.y
      lastPointerPos.current = { x: evt.clientX, y: evt.clientY }
      schedulePanDelta(dx, dy)
    },
    [getArtboardPointer, schedulePanDelta],
  )

  const handleMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current
      const tool = drawingToolRef.current

      if (tool && stage) {
        const isImageMode = selectedImagePathRef.current !== null
        const canDraw = isImageMode
          ? selectedImageCanSaveRef.current
          : currentFrameCanSaveRef.current

        if (canDraw) {
          tool.onMouseUp(e, stage, activeToolConfigRef.current, getArtboardPointer(stage))
          const drawingLayer = getDrawingLayer()
          const previousChildCount = drawingMouseDownChildCountRef.current
          drawingMouseDownChildCountRef.current = null
          if (drawingLayer && previousChildCount !== null) {
            const addedNodes = getDrawingLayerChildren(drawingLayer).slice(previousChildCount)
            recordDrawingHistoryAction(addedNodes)
          }
          return
        }
      }

      isPanning.current = false
      cancelPendingPanFrame()
      flushPendingPanDelta()
      setCursor(drawingToolRef.current?.cursor ?? "default")
    },
    [
      cancelPendingPanFrame,
      flushPendingPanDelta,
      getArtboardPointer,
      getDrawingLayer,
      getDrawingLayerChildren,
      recordDrawingHistoryAction,
      setCursor,
    ],
  )

  const saveEditedImage = useCallback(async (path: string, image: HTMLImageElement) => {
    const stage = stageRef.current
    if (!stage) return

    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    setImageSaveState({
      path,
      status: "saving",
      error: null,
    })
    try {
      const data = exportEditedImagePngBytes(stage, image, width, height)
      await invoke("save_image_bytes", {
        projectPath,
        path,
        data,
      })
      invalidateImageObjectUrl(path)
      const drawingLayer = getDrawingLayer()
      drawingLayer?.destroyChildren()
      drawingLayer?.batchDraw()
      drawingUndoStackRef.current = []
      drawingRedoStackRef.current = []
      drawingMouseDownChildCountRef.current = null
      refreshDrawingHistoryState()
      setImageSaveState({
        path,
        status: "saved",
        error: null,
      })
    } catch (err) {
      setImageSaveState({
        path,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [getDrawingLayer, projectPath, refreshDrawingHistoryState])

  const handleSaveSelectedImage = useCallback(async () => {
    if (!selectedImagePath || !selectedImage || !selectedImageCanSave) return
    await saveEditedImage(selectedImagePath, selectedImage)
  }, [saveEditedImage, selectedImage, selectedImageCanSave, selectedImagePath])

  const handleSaveCurrentFrame = useCallback(async () => {
    if (!currentFrameImagePath || !frameImage || !currentFrameCanSave) return
    await saveEditedImage(currentFrameImagePath, frameImage)
  }, [currentFrameCanSave, currentFrameImagePath, frameImage, saveEditedImage])

  const checkerPattern = useMemo(() => createCheckerPatternCanvas(), [])
  const checkerboard = (
    <Rect
      x={0}
      y={0}
      width={artboardWidth}
      height={artboardHeight}
      fill={CHECKER_COLORS[0]}
      fillPatternImage={checkerPattern as unknown as HTMLImageElement | undefined}
      fillPatternRepeat="repeat"
      listening={false}
      perfectDrawEnabled={false}
    />
  )

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-bg-panel)]">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <MovaLogo variant="mark" size="lg" />
          </div>
          <p className="text-lg font-semibold text-[var(--color-text-primary)]">
            Mova Workbench
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Open a project to get started
          </p>
        </div>
      </div>
    )
  }

  const isDocumentFile = selectedPath && /\.(md|json)$/i.test(selectedPath)

  if (isDocumentFile) {
    return (
      <div className="h-full">
        <DocumentPreview path={selectedPath} projectPath={projectPath} />
      </div>
    )
  }

  if (selectedImagePath) {
    const imageName = selectedImagePath.split("/").pop() ?? selectedImagePath
    return (
      <div
        className="relative flex h-full flex-col bg-[var(--color-bg-panel)]"
        data-testid="image-editor"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4">
          {selectedImageCanSave ? (
            <div className="min-w-0 shrink">
              <DrawingToolbar
                activeTool={activeTool}
                onToolChange={setActiveTool}
                config={toolConfig}
                onConfigChange={setToolConfig}
                canUndo={canUndoDrawing}
                canRedo={canRedoDrawing}
                onUndo={undoDrawingAction}
                onRedo={redoDrawingAction}
              />
            </div>
          ) : (
            <div className="mova-control px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)]">
              Read-only preview
            </div>
          )}

          <div className="hidden min-w-0 flex-1 text-center 2xl:block">
            <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {imageName}
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">
              {selectedImageIsGif
                ? "Selected GIF preview is read-only"
                : "Selected file preview and basic editing"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="mova-control hidden items-center gap-2 px-3 py-2 md:flex">
              <button
                type="button"
                onClick={() => zoomBy(1 / 1.1)}
                title="Zoom out"
                className="text-[var(--color-text-primary)]"
              >
                <Minus size={16} />
              </button>
              <span className="min-w-12 text-center text-sm font-semibold text-[var(--color-text-primary)]">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => zoomBy(1.1)}
                title="Zoom in"
                className="text-[var(--color-text-primary)]"
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={resetViewport}
              title="Reset view"
              aria-label="Reset view"
              className="mova-icon-button border border-[var(--color-border)] bg-[var(--color-bg-panel)]"
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              onClick={handleShowTimelinePreview}
              title="Show timeline preview"
              aria-label="Show timeline preview"
              className="inline-flex h-9 items-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 text-xs font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)]"
            >
              Timeline Preview
            </button>
            <button
              type="button"
              onClick={handleAddSelectedImageToTimeline}
              title="Add selected image to timeline"
              aria-label={`Add ${imageName} to timeline`}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-accent)] bg-[var(--color-brand-red-soft)] px-3 text-xs font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-bg-hover)]"
            >
              <Plus size={14} />
              <span>Add to Timeline</span>
            </button>
            {selectedImageSaveStatus === "saved" && (
              <span className="text-xs font-semibold text-[var(--color-success)]">
                Saved
              </span>
            )}
            {selectedImageSaveStatus === "error" && (
              <span className="max-w-[240px] truncate text-xs text-[var(--color-danger)]">
                {selectedImageSaveError ?? "Save failed"}
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveSelectedImage}
              disabled={
                !selectedImage ||
                !selectedImageCanSave ||
                selectedImageSaveStatus === "saving"
              }
              title={
                selectedImageIsGif ? "GIF preview is read-only" : "Save image"
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 text-xs font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={14} />
              <span>{selectedImageSaveStatus === "saving" ? "Saving" : "Save"}</span>
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden bg-[var(--color-bg-subtle)]"
        >
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            scaleX={scale}
            scaleY={scale}
            x={contentPosition.x}
            y={contentPosition.y}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            draggable={false}
            style={{ cursor }}
          >
            <Layer listening={false}>{checkerboard}</Layer>
            <Layer>
              {canvasImage ? (
                <KonvaImage
                  image={canvasImage}
                  x={0}
                  y={0}
                  width={artboardWidth}
                  height={artboardHeight}
                  perfectDrawEnabled={false}
                />
              ) : (
                <Rect
                  x={0}
                  y={0}
                  width={artboardWidth}
                  height={artboardHeight}
                  fill="transparent"
                  stroke={CHECKER_COLORS[1]}
                  strokeWidth={1 / scale}
                  dash={[4 / scale, 4 / scale]}
                />
              )}
            </Layer>
            <Layer listening={false}>
              {canvasImage && (
                <GridOverlay
                  width={artboardWidth}
                  height={artboardHeight}
                  gridSize={grid.gridSize}
                  stageScale={scale}
                  visible={grid.visible}
                />
              )}
            </Layer>
            <Layer name="drawing-layer" listening={selectedImageCanSave} />
          </Stage>

          <div className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-1 shadow-[var(--shadow-xs)]">
            <button
              onClick={grid.toggle}
              title="Toggle pixel grid"
              className={`flex items-center justify-center rounded p-0.5 transition-colors ${
                grid.visible
                  ? "text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)]"
              }`}
            >
              <Grid3x3 size={14} />
            </button>
            {grid.visible && (
              <button
                onClick={grid.cycleGridSize}
                title="Cycle grid size"
                className="text-[10px] font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {grid.gridSize}px
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!activeAnimation) {
    const activeChar = project.characters.find(
      (c) => c.id === project.activeCharacterId,
    )
    return (
      <div
        className="flex h-full flex-col bg-[var(--color-bg-panel)]"
        data-testid="empty-canvas"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4">
          <div className="mova-control flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)]">
            <MovaLogo variant="mark" size="sm" />
            Canvas Preview
          </div>
          <div className="hidden min-w-0 flex-1 text-center 2xl:block">
            <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {activeChar?.name ?? "Untitled Animation"}
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">
              Waiting for generated animation frames
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="mova-control flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => zoomBy(1 / 1.1)}
                title="Zoom out"
                className="text-[var(--color-text-primary)]"
              >
                <Minus size={16} />
              </button>
              <span className="min-w-12 text-center text-sm font-semibold text-[var(--color-text-primary)]">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => zoomBy(1.1)}
                title="Zoom in"
                className="text-[var(--color-text-primary)]"
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={resetViewport}
              title="Reset view"
              aria-label="Reset view"
              className="mova-icon-button border border-[var(--color-border)] bg-[var(--color-bg-panel)]"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden bg-[var(--color-bg-subtle)]"
        >
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            scaleX={scale}
            scaleY={scale}
            x={contentPosition.x}
            y={contentPosition.y}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            draggable={false}
            style={{ cursor }}
          >
            <Layer listening={false}>{checkerboard}</Layer>
            <Layer>
              {displayedImage ? (
                <KonvaImage
                  image={displayedImage}
                  x={0}
                  y={0}
                  width={artboardWidth}
                  height={artboardHeight}
                  perfectDrawEnabled={false}
                />
              ) : (
                <Rect
                  x={0}
                  y={0}
                  width={artboardWidth}
                  height={artboardHeight}
                  fill="transparent"
                  stroke={CHECKER_COLORS[1]}
                  strokeWidth={1 / scale}
                  dash={[4 / scale, 4 / scale]}
                />
              )}
            </Layer>
            <Layer listening={false}>
              {displayedImage && (
                <GridOverlay
                  width={artboardWidth}
                  height={artboardHeight}
                  gridSize={grid.gridSize}
                  stageScale={scale}
                  visible={grid.visible}
                />
              )}
            </Layer>
          </Stage>

          <div className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-1 shadow-[var(--shadow-xs)]">
            <button
              onClick={grid.toggle}
              title="Toggle pixel grid"
              className={`flex items-center justify-center rounded p-0.5 transition-colors ${
                grid.visible
                  ? "text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)]"
              }`}
            >
              <Grid3x3 size={14} />
            </button>
            {grid.visible && (
              <button
                onClick={grid.cycleGridSize}
                title="Cycle grid size"
                className="text-[10px] font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {grid.gridSize}px
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-panel)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4">
        {currentFrameCanSave ? (
          <div className="min-w-0 shrink">
            <DrawingToolbar
              activeTool={activeTool}
              onToolChange={setActiveTool}
              config={toolConfig}
              onConfigChange={setToolConfig}
              canUndo={canUndoDrawing}
              canRedo={canRedoDrawing}
              onUndo={undoDrawingAction}
              onRedo={redoDrawingAction}
            />
          </div>
        ) : (
          <div className="mova-control px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)]">
            Frame drawing unavailable
          </div>
        )}

        <div className="hidden min-w-0 flex-1 text-center 2xl:block">
          <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {activeAnimation.name}
          </p>
          <p className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">
            {currentFrameCanSave
              ? `${activeAnimation.frames.length} frames · ${activeAnimation.fps} FPS · edits save to current frame`
              : currentFrameReadOnlyReason}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="mova-control flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.1)}
              title="Zoom out"
              className="text-[var(--color-text-primary)]"
            >
              <Minus size={16} />
            </button>
            <span className="min-w-12 text-center text-sm font-semibold text-[var(--color-text-primary)]">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => zoomBy(1.1)}
              title="Zoom in"
              className="text-[var(--color-text-primary)]"
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={resetViewport}
            title="Reset view"
            aria-label="Reset view"
            className="mova-icon-button border border-[var(--color-border)] bg-[var(--color-bg-panel)]"
          >
            <Maximize2 size={16} />
          </button>
          {currentFrameSaveStatus === "saved" && (
            <span className="text-xs font-semibold text-[var(--color-success)]">
              Saved
            </span>
          )}
          {currentFrameSaveStatus === "error" && (
            <span className="max-w-[240px] truncate text-xs text-[var(--color-danger)]">
              {currentFrameSaveError ?? "Save failed"}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveCurrentFrame}
            disabled={
              !frameImage ||
              !currentFrameCanSave ||
              currentFrameSaveStatus === "saving"
            }
            title={currentFrameReadOnlyReason ?? "Save current frame"}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 text-xs font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            <span>{currentFrameSaveStatus === "saving" ? "Saving" : "Save Frame"}</span>
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-[var(--color-bg-subtle)]"
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={scale}
          scaleY={scale}
          x={contentPosition.x}
          y={contentPosition.y}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          draggable={false}
          style={{ cursor }}
        >
          {/* Checkerboard background layer */}
          <Layer listening={false}>{checkerboard}</Layer>

          {/* Onion skin layer (behind main frame) */}
          {onionSkinEnabled && (
            <Layer listening={false} opacity={onionSkinOpacity}>
              {prevFrameImage && (
                <KonvaImage
                  image={prevFrameImage}
                  x={0}
                  y={0}
                  width={prevFrameImage.naturalWidth || prevFrameImage.width}
                  height={prevFrameImage.naturalHeight || prevFrameImage.height}
                  perfectDrawEnabled={false}
                />
              )}
              {nextFrameImage && (
                <KonvaImage
                  image={nextFrameImage}
                  x={0}
                  y={0}
                  width={nextFrameImage.naturalWidth || nextFrameImage.width}
                  height={nextFrameImage.naturalHeight || nextFrameImage.height}
                  perfectDrawEnabled={false}
                />
              )}
            </Layer>
          )}

          {/* Frame image layer */}
          <Layer>
            {displayedImage ? (
              <KonvaImage
                image={displayedImage}
                x={0}
                y={0}
                width={artboardWidth}
                height={artboardHeight}
                perfectDrawEnabled={false}
              />
            ) : (
              <Rect
                x={0}
                y={0}
                width={artboardWidth}
                height={artboardHeight}
                fill="transparent"
                stroke={CHECKER_COLORS[1]}
                strokeWidth={1 / scale}
                dash={[4 / scale, 4 / scale]}
              />
            )}
          </Layer>

          {/* Pixel grid overlay */}
          <Layer listening={false}>
            {displayedImage && (
              <GridOverlay
                width={artboardWidth}
                height={artboardHeight}
                gridSize={grid.gridSize}
                stageScale={scale}
                visible={grid.visible}
              />
            )}
          </Layer>

          {/* Drawing layer */}
          <Layer name="drawing-layer" listening={currentFrameCanSave} />
        </Stage>

        {/* Zoom indicator */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-1 shadow-[var(--shadow-xs)]">
          <button
            onClick={grid.toggle}
            title="Toggle pixel grid"
            className={`flex items-center justify-center rounded p-0.5 transition-colors ${
              grid.visible
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-text-secondary)]"
            }`}
          >
            <Grid3x3 size={14} />
          </button>
          {grid.visible && (
            <button
              onClick={grid.cycleGridSize}
              title="Cycle grid size"
              className="text-[10px] font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              {grid.gridSize}px
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
