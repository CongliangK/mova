import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react"

interface ResizablePanelProps {
  children: ReactNode
  defaultWidth: number
  minWidth: number
  maxWidth: number
  side: "left" | "right"
  onResize?: (width: number) => void
  visible?: boolean
}

export function ResizablePanel({
  children,
  defaultWidth,
  minWidth,
  maxWidth,
  side,
  onResize,
  visible = true,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth)
  const pendingWidthRef = useRef(width)
  const frameIdRef = useRef<number | null>(null)

  const flushWidth = useCallback(() => {
    frameIdRef.current = null
    const nextWidth = pendingWidthRef.current
    setWidth((current) => (current === nextWidth ? current : nextWidth))
    onResize?.(nextWidth)
  }, [onResize])

  const scheduleWidthUpdate = useCallback(
    (nextWidth: number) => {
      pendingWidthRef.current = nextWidth
      if (frameIdRef.current !== null) return
      frameIdRef.current = window.requestAnimationFrame(flushWidth)
    },
    [flushWidth],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = width

      const onMove = (ev: MouseEvent) => {
        const delta =
          side === "left" ? ev.clientX - startX : startX - ev.clientX
        const newWidth = Math.max(
          minWidth,
          Math.min(maxWidth, startWidth + delta),
        )
        scheduleWidthUpdate(newWidth)
      }

      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        if (frameIdRef.current !== null) {
          window.cancelAnimationFrame(frameIdRef.current)
          flushWidth()
        }
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [flushWidth, maxWidth, minWidth, scheduleWidthUpdate, side, width],
  )

  const isLeft = side === "left"

  const panelStyle: CSSProperties = visible
    ? { width }
    : { width, display: "none" }
  const handleStyle: CSSProperties = visible ? {} : { display: "none" }

  return (
    <>
      {isLeft && (
        <div
          data-testid="resizable-panel-left"
          className="shrink-0 overflow-hidden"
          style={panelStyle}
          aria-hidden={!visible}
        >
          {children}
        </div>
      )}
      <div
        className="w-px cursor-col-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)]"
        style={handleStyle}
        onMouseDown={visible ? handleMouseDown : undefined}
        aria-hidden={!visible}
      />
      {!isLeft && (
        <div
          data-testid="resizable-panel-right"
          className="flex shrink-0 flex-col overflow-hidden"
          style={panelStyle}
          aria-hidden={!visible}
        >
          {children}
        </div>
      )}
    </>
  )
}
