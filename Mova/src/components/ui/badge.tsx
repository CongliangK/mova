import type { ReactNode } from "react"

type BadgeVariant = "default" | "success" | "warning" | "danger"

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: {
    backgroundColor: "var(--color-bg-panel)",
    color: "var(--color-text-secondary)",
  },
  success: {
    backgroundColor: "rgba(63, 185, 80, 0.15)",
    color: "var(--color-success)",
  },
  warning: {
    backgroundColor: "rgba(210, 153, 34, 0.15)",
    color: "var(--color-warning)",
  },
  danger: {
    backgroundColor: "rgba(248, 81, 73, 0.15)",
    color: "var(--color-danger)",
  },
}

export function Badge({ variant = "default", children, className }: BadgeProps) {
  const badgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "var(--space-xs) var(--space-sm)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    borderRadius: "var(--radius-sm)",
    whiteSpace: "nowrap",
    lineHeight: 1,
    ...variantStyles[variant],
  }

  return (
    <span className={className} style={badgeStyle}>
      {children}
    </span>
  )
}
