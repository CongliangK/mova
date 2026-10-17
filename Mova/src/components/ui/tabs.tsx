import type { CSSProperties } from "react"

interface Tab {
  id: string
  label: string
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    borderBottom: "1px solid var(--color-border)",
    gap: "var(--space-xs)",
  }

  const tabStyle = (isActive: boolean): CSSProperties => ({
    padding: "var(--space-sm) var(--space-md)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
    fontWeight: isActive ? 600 : 400,
    color: isActive
      ? "var(--color-text-primary)"
      : "var(--color-text-secondary)",
    background: "none",
    border: "none",
    borderBottom: `2px solid ${isActive ? "var(--color-accent)" : "transparent"}`,
    cursor: "pointer",
    transition: `all var(--duration-fast) var(--ease-default)`,
    marginBottom: "-1px",
    whiteSpace: "nowrap",
  })

  return (
    <div className={className} style={containerStyle}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={tabStyle(isActive)}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "var(--color-text-primary)"
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "var(--color-text-secondary)"
              }
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
