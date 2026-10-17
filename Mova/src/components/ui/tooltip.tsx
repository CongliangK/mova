import { useState } from "react"
import type { ReactNode } from "react"

interface TooltipProps {
  content: string
  children: ReactNode
  position?: "top" | "bottom"
  className?: string
}

export function Tooltip({
  content,
  children,
  position = "top",
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)

  const wrapperStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
  }

  const tooltipStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "var(--space-xs) var(--space-sm)",
    backgroundColor: "var(--color-bg-panel)",
    color: "var(--color-text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-xs)",
    borderRadius: "var(--radius-sm)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: 100,
    opacity: visible ? 1 : 0,
    transition: `opacity var(--duration-fast) var(--ease-default)`,
    boxShadow: "var(--shadow-sm)",
    ...(position === "top"
      ? { bottom: "calc(100% + var(--space-xs))" }
      : { top: "calc(100% + var(--space-xs))" }),
  }

  const arrowStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "4px solid transparent",
    borderRight: "4px solid transparent",
    ...(position === "top"
      ? {
          top: "100%",
          borderTop: "4px solid var(--color-bg-panel)",
        }
      : {
          bottom: "100%",
          borderBottom: "4px solid var(--color-bg-panel)",
        }),
  }

  return (
    <div
      className={className}
      style={wrapperStyle}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <div style={tooltipStyle}>
        {content}
        <div style={arrowStyle} />
      </div>
    </div>
  )
}
