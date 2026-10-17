import { useState, useCallback } from "react"
import { Eye, EyeOff, Layers, ChevronDown } from "lucide-react"
import { LocalImage } from "../ui/local-image"
import type { PropManifestItem } from "../../types/manifest"

export interface CollisionGrid {
  rows: number
  cols: number
  data: number[][]
}

export interface CollisionData {
  mapSize: { width: number; height: number }
  cellSize: number
  grid: CollisionGrid
  blockers: unknown[]
  walkBounds: Array<{ id: string; type: string; x: number; y: number; w: number; h: number }>
  zones: Record<string, unknown>
}

export interface MapLayerPanelProps {
  baseMapPath: string | null
  props: PropManifestItem[]
  collisionData: CollisionData | null
  className?: string
}

export function MapLayerPanel({
  baseMapPath,
  props,
  collisionData,
  className,
}: MapLayerPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [visibleProps, setVisibleProps] = useState<Set<number>>(() => {
    const s = new Set<number>()
    props.forEach((p) => s.add(p.index))
    return s
  })
  const [showCollision, setShowCollision] = useState(true)

  const toggleProp = useCallback((index: number) => {
    setVisibleProps((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const allVisible = visibleProps.size === props.length && props.length > 0
  const toggleAll = useCallback(() => {
    if (allVisible) {
      setVisibleProps(new Set())
    } else {
      setVisibleProps(new Set(props.map((p) => p.index)))
    }
  }, [allVisible, props])

  const panelStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "280px",
    backgroundColor: "var(--color-bg-secondary)",
    borderLeft: "1px solid var(--color-border)",
    overflow: "hidden",
  }

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--space-sm) var(--space-md)",
    borderBottom: "1px solid var(--color-border)",
    cursor: "pointer",
    userSelect: "none",
  }

  const titleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    color: "var(--color-text-primary)",
  }

  const contentStyle: React.CSSProperties = {
    display: isExpanded ? "flex" : "none",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
  }

  const previewContainerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 9",
    backgroundColor: "var(--color-bg-primary)",
    borderBottom: "1px solid var(--color-border)",
    overflow: "hidden",
  }

  const previewImageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    imageRendering: "pixelated",
  }

  const overlayContainerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  }

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--space-sm) var(--space-md)",
    borderBottom: "1px solid var(--color-border)",
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--color-text-secondary)",
  }

  const listStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
  }

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    padding: "var(--space-sm) var(--space-md)",
    borderBottom: "1px solid var(--color-border)",
    transition: `background-color var(--duration-fast) var(--ease-default)`,
  }

  const rowHoverStyle: React.CSSProperties = {
    backgroundColor: "var(--color-bg-hover)",
  }

  const thumbStyle: React.CSSProperties = {
    width: "32px",
    height: "32px",
    borderRadius: "var(--radius-sm)",
    objectFit: "cover",
    border: "1px solid var(--color-border)",
    flexShrink: 0,
    imageRendering: "pixelated",
  }

  const infoStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
    gap: "2px",
  }

  const filenameStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    fontWeight: 500,
    color: "var(--color-text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }

  const dimsStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    color: "var(--color-text-muted)",
  }

  const iconButtonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "transparent",
    border: "none",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    transition: `all var(--duration-fast) var(--ease-default)`,
    flexShrink: 0,
  }

  const iconButtonHoverStyle: React.CSSProperties = {
    backgroundColor: "var(--color-bg-hover)",
    color: "var(--color-text-primary)",
  }

  const collisionToggleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-xs)",
    fontSize: "var(--text-xs)",
    color: showCollision ? "var(--color-accent)" : "var(--color-text-muted)",
    cursor: "pointer",
    backgroundColor: "transparent",
    border: "none",
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    transition: `all var(--duration-fast) var(--ease-default)`,
  }

  const emptyStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-xl)",
    fontSize: "var(--text-sm)",
    color: "var(--color-text-secondary)",
    textAlign: "center",
  }

  const renderCollisionOverlay = () => {
    if (!showCollision || !collisionData) return null
    const { grid } = collisionData
    const cellW = 100 / grid.cols
    const cellH = 100 / grid.rows

    return (
      <div style={overlayContainerStyle}>
        {grid.data.map((row, r) =>
          row.map((cell, c) => {
            if (cell === 0) return null
            const style: React.CSSProperties = {
              position: "absolute",
              left: `${c * cellW}%`,
              top: `${r * cellH}%`,
              width: `${cellW}%`,
              height: `${cellH}%`,
              backgroundColor: "var(--color-danger)",
              opacity: 0.35,
              border: "1px solid var(--color-danger)",
            }
            return <div key={`${r}-${c}`} style={style} />
          })
        )}
      </div>
    )
  }

  return (
    <div className={className} style={panelStyle}>
      {/* Header */}
      <div
        style={headerStyle}
        onClick={() => setIsExpanded((v) => !v)}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = ""
        }}
      >
        <div style={titleStyle}>
          <Layers size={16} />
          <span>Map Layers</span>
        </div>
        <ChevronDown
          size={16}
          style={{
            color: "var(--color-text-secondary)",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: `transform var(--duration-normal) var(--ease-default)`,
          }}
        />
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {/* Base Map Preview */}
        <div style={previewContainerStyle}>
          {baseMapPath ? (
            <>
              <LocalImage
                src={baseMapPath}
                alt="Base map preview"
                style={previewImageStyle}
              />
              {renderCollisionOverlay()}
            </>
          ) : (
            <div
              style={{
                ...previewImageStyle,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
              }}
            >
              No base map
            </div>
          )}
        </div>

        {/* Collision Toggle */}
        {collisionData && (
          <div style={sectionHeaderStyle}>
            <span style={sectionTitleStyle}>Collision</span>
            <button
              style={collisionToggleStyle}
              onClick={() => setShowCollision((v) => !v)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-bg-hover)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent"
              }}
            >
              {showCollision ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{showCollision ? "On" : "Off"}</span>
            </button>
          </div>
        )}

        {/* Props List */}
        <div style={sectionHeaderStyle}>
          <span style={sectionTitleStyle}>Props</span>
          {props.length > 0 && (
            <button
              style={iconButtonStyle}
              onClick={toggleAll}
              onMouseEnter={(e) => {
                Object.assign(e.currentTarget.style, iconButtonHoverStyle)
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent"
                e.currentTarget.style.color = "var(--color-text-secondary)"
              }}
              title={allVisible ? "Hide all" : "Show all"}
            >
              {allVisible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          )}
        </div>

        <div style={listStyle}>
          {props.length === 0 ? (
            <div style={emptyStyle}>No props extracted</div>
          ) : (
            props.map((prop) => {
              const isVisible = visibleProps.has(prop.index)
              return (
                <div
                  key={prop.index}
                  style={rowStyle}
                  onMouseEnter={(e) => {
                    Object.assign(e.currentTarget.style, rowHoverStyle)
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = ""
                  }}
                >
                  <LocalImage
                    src={prop.filename}
                    alt={prop.filename}
                    style={thumbStyle}
                    onError={(e) => {
                      const target = e.currentTarget
                      target.style.display = "none"
                    }}
                  />
                  <div style={infoStyle}>
                    <span style={filenameStyle}>{prop.filename}</span>
                    <span style={dimsStyle}>
                      {prop.width}×{prop.height} px
                    </span>
                  </div>
                  <button
                    style={iconButtonStyle}
                    onClick={() => toggleProp(prop.index)}
                    onMouseEnter={(e) => {
                      Object.assign(e.currentTarget.style, iconButtonHoverStyle)
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent"
                      e.currentTarget.style.color = "var(--color-text-secondary)"
                    }}
                    title={isVisible ? "Hide" : "Show"}
                  >
                    {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
