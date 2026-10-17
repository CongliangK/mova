import { useEffect, useRef } from "react"

export interface MenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    // Delay to avoid the right-click mousedown closing the menu immediately
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick)
      document.addEventListener("keydown", handleKey)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  // Adjust position to keep menu in viewport
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36)

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
      style={{ left: adjustedX, top: adjustedY }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="my-1 border-t border-[var(--color-border)]" />
        ) : (
          <button
            key={i}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-40"
            onClick={() => {
              item.onClick()
              onClose()
            }}
            disabled={item.disabled}
          >
            {item.icon && <span className="text-[var(--color-text-secondary)]">{item.icon}</span>}
            {item.label}
          </button>
        ),
      )}
    </div>
  )
}
