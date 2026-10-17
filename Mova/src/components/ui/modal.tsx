import { useEffect, useCallback } from "react"
import type { ReactNode } from "react"

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  size?: "sm" | "md" | "lg"
  children: ReactNode
  className?: string
}

const sizeMap = {
  sm: "400px",
  md: "560px",
  lg: "720px",
} as const

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
  className,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown)
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = ""
    }
  }, [open, handleKeyDown])

  if (!open) return null

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "var(--color-overlay)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "var(--space-lg)",
  }

  const modalStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: sizeMap[size],
    maxHeight: "90vh",
    backgroundColor: "var(--color-bg-primary)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    contain: "layout paint style",
  }

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--space-lg)",
    borderBottom: title ? "1px solid var(--color-border)" : "none",
    flexShrink: 0,
  }

  const titleStyle: React.CSSProperties = {
    fontSize: "var(--text-lg)",
    fontWeight: 600,
    color: "var(--color-text-primary)",
    margin: 0,
  }

  const closeButtonStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "var(--color-text-secondary)",
    fontSize: "20px",
    cursor: "pointer",
    padding: "var(--space-xs)",
    lineHeight: 1,
    borderRadius: "var(--radius-sm)",
    transition: `all var(--duration-fast) var(--ease-default)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }

  const bodyStyle: React.CSSProperties = {
    padding: "var(--space-lg)",
    overflow: "auto",
    flex: 1,
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        className={className}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          {title && <h2 style={titleStyle}>{title}</h2>}
          <button
            onClick={onClose}
            style={closeButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)"
              e.currentTarget.style.color = "var(--color-text-primary)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
              e.currentTarget.style.color = "var(--color-text-secondary)"
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>
  )
}
