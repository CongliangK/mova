import type { ReactNode } from "react"

interface CardProps {
  children: ReactNode
  header?: ReactNode
  footer?: ReactNode
  className?: string
}

export function Card({ children, header, footer, className }: CardProps) {
  const cardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--color-bg-secondary)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
  }

  const headerStyle: React.CSSProperties = {
    padding: "var(--space-md) var(--space-lg)",
    borderBottom: "1px solid var(--color-border)",
    fontSize: "var(--text-base)",
    fontWeight: 600,
    color: "var(--color-text-primary)",
  }

  const bodyStyle: React.CSSProperties = {
    padding: "var(--space-lg)",
    flex: 1,
  }

  const footerStyle: React.CSSProperties = {
    padding: "var(--space-md) var(--space-lg)",
    borderTop: "1px solid var(--color-border)",
  }

  return (
    <div className={className} style={cardStyle}>
      {header && <div style={headerStyle}>{header}</div>}
      <div style={bodyStyle}>{children}</div>
      {footer && <div style={footerStyle}>{footer}</div>}
    </div>
  )
}
