import { useState, useRef, useCallback } from "react"
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layers,
} from "lucide-react"
import { useDrawingStore, type DrawingLayer } from "../../stores/drawing-store"
import { Button } from "../../components/ui/button"
import { Slider } from "../../components/ui/slider"

interface LayerRowProps {
  layer: DrawingLayer
  isActive: boolean
  canDelete: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onToggleVisibility: () => void
  onRename: (name: string) => void
  onSetOpacity: (opacity: number) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function LayerRow({
  layer,
  isActive,
  canDelete,
  canMoveUp,
  canMoveDown,
  onSelect,
  onToggleVisibility,
  onRename,
  onSetOpacity,
  onDelete,
  onMoveUp,
  onMoveDown,
}: LayerRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(layer.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
    setEditName(layer.name)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [layer.name])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    const trimmed = editName.trim()
    if (trimmed && trimmed !== layer.name) {
      onRename(trimmed)
    } else {
      setEditName(layer.name)
    }
  }, [editName, layer.name, onRename])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleBlur()
      } else if (e.key === "Escape") {
        setIsEditing(false)
        setEditName(layer.name)
      }
    },
    [handleBlur, layer.name]
  )

  const rowStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
    padding: "var(--space-sm) var(--space-md)",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: isActive
      ? "var(--color-bg-hover)"
      : "transparent",
    cursor: "pointer",
    transition: `background-color var(--duration-fast) var(--ease-default)`,
  }

  const rowHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
  }

  const nameStyle: React.CSSProperties = {
    flex: 1,
    fontSize: "var(--text-sm)",
    fontWeight: 500,
    color: layer.visible
      ? "var(--color-text-primary)"
      : "var(--color-text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    userSelect: "none",
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    fontSize: "var(--text-sm)",
    fontWeight: 500,
    color: "var(--color-text-primary)",
    backgroundColor: "var(--color-bg-primary)",
    border: "1px solid var(--color-border-active)",
    borderRadius: "var(--radius-sm)",
    padding: "2px var(--space-xs)",
    outline: "none",
    fontFamily: "var(--font-sans)",
  }

  const iconButtonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "transparent",
    border: "none",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    transition: `all var(--duration-fast) var(--ease-default)`,
    flexShrink: 0,
    padding: 0,
  }

  const iconButtonHoverStyle: React.CSSProperties = {
    backgroundColor: "var(--color-bg-hover)",
    color: "var(--color-text-primary)",
  }

  const opacityContainerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    paddingLeft: "30px",
  }

  const opacityLabelStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    color: "var(--color-text-muted)",
    minWidth: "28px",
    textAlign: "right",
    fontFamily: "var(--font-mono)",
  }

  return (
    <div
      style={rowStyle}
      onClick={onSelect}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)"
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent"
        }
      }}
    >
      <div style={rowHeaderStyle}>
        <button
          style={iconButtonStyle}
          onClick={(e) => {
            e.stopPropagation()
            onToggleVisibility()
          }}
          onMouseEnter={(e) => {
            Object.assign(e.currentTarget.style, iconButtonHoverStyle)
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.color = "var(--color-text-secondary)"
          }}
          title={layer.visible ? "Hide layer" : "Show layer"}
        >
          {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>

        {isEditing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={inputStyle}
          />
        ) : (
          <span style={nameStyle} onDoubleClick={handleDoubleClick}>
            {layer.name}
          </span>
        )}

        <button
          style={{
            ...iconButtonStyle,
            opacity: canMoveUp ? 1 : 0.3,
            cursor: canMoveUp ? "pointer" : "not-allowed",
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (canMoveUp) onMoveUp()
          }}
          disabled={!canMoveUp}
          title="Move up"
        >
          <ChevronUp size={14} />
        </button>

        <button
          style={{
            ...iconButtonStyle,
            opacity: canMoveDown ? 1 : 0.3,
            cursor: canMoveDown ? "pointer" : "not-allowed",
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (canMoveDown) onMoveDown()
          }}
          disabled={!canMoveDown}
          title="Move down"
        >
          <ChevronDown size={14} />
        </button>

        <button
          style={{
            ...iconButtonStyle,
            opacity: canDelete ? 1 : 0.3,
            cursor: canDelete ? "pointer" : "not-allowed",
            color: canDelete ? "var(--color-danger)" : "var(--color-text-muted)",
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (canDelete) onDelete()
          }}
          disabled={!canDelete}
          onMouseEnter={(e) => {
            if (canDelete) {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)"
              e.currentTarget.style.filter = "brightness(1.1)"
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.filter = ""
          }}
          title="Delete layer"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div style={opacityContainerStyle}>
        <Slider
          value={Math.round(layer.opacity * 100)}
          onChange={(v) => onSetOpacity(v / 100)}
          min={0}
          max={100}
          step={1}
          style={{ flex: 1 }}
        />
        <span style={opacityLabelStyle}>{Math.round(layer.opacity * 100)}%</span>
      </div>
    </div>
  )
}

export function LayerPanel({ className }: { className?: string }) {
  const layers = useDrawingStore((s) => s.layers)
  const activeLayerId = useDrawingStore((s) => s.activeLayerId)
  const addLayer = useDrawingStore((s) => s.addLayer)
  const removeLayer = useDrawingStore((s) => s.removeLayer)
  const renameLayer = useDrawingStore((s) => s.renameLayer)
  const toggleVisibility = useDrawingStore((s) => s.toggleVisibility)
  const setOpacity = useDrawingStore((s) => s.setOpacity)
  const setActiveLayer = useDrawingStore((s) => s.setActiveLayer)
  const reorderLayers = useDrawingStore((s) => s.reorderLayers)

  const sortedLayers = [...layers].sort((a, b) => b.order - a.order)
  const canAdd = layers.length < 5
  const canDelete = layers.length > 1

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
  }

  const titleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    color: "var(--color-text-primary)",
  }

  const listStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
  }

  const footerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--space-sm) var(--space-md)",
    borderTop: "1px solid var(--color-border)",
  }

  const countStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    color: "var(--color-text-muted)",
  }

  const handleMoveUp = useCallback(
    (index: number) => {
      reorderLayers(index, index - 1)
    },
    [reorderLayers]
  )

  const handleMoveDown = useCallback(
    (index: number) => {
      reorderLayers(index, index + 1)
    },
    [reorderLayers]
  )

  return (
    <div className={className} style={panelStyle}>
      <div style={headerStyle}>
        <div style={titleStyle}>
          <Layers size={16} />
          <span>Layers</span>
        </div>
      </div>

      <div style={listStyle}>
        {sortedLayers.map((layer, visualIndex) => {
          const actualIndex = sortedLayers.length - 1 - visualIndex
          return (
            <LayerRow
              key={layer.id}
              layer={layer}
              isActive={layer.id === activeLayerId}
              canDelete={canDelete}
              canMoveUp={visualIndex > 0}
              canMoveDown={visualIndex < sortedLayers.length - 1}
              onSelect={() => setActiveLayer(layer.id)}
              onToggleVisibility={() => toggleVisibility(layer.id)}
              onRename={(name) => renameLayer(layer.id, name)}
              onSetOpacity={(opacity) => setOpacity(layer.id, opacity)}
              onDelete={() => removeLayer(layer.id)}
              onMoveUp={() => handleMoveUp(actualIndex)}
              onMoveDown={() => handleMoveDown(actualIndex)}
            />
          )
        })}
      </div>

      <div style={footerStyle}>
        <span style={countStyle}>
          {layers.length} / 5
        </span>
        <Button
          size="sm"
          disabled={!canAdd}
          onClick={() => addLayer()}
        >
          <Plus size={14} />
          Add Layer
        </Button>
      </div>
    </div>
  )
}
