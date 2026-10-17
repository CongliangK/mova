import { useState, useCallback, memo } from "react"
import { Circle, Eraser, PaintBucket, Pencil, Redo2, Square, Undo2 } from "lucide-react"
import type { ToolType, DrawingToolConfig } from "../../services/drawing/types"
import { Slider } from "../ui/slider"

interface DrawingToolbarProps {
  activeTool: ToolType
  onToolChange: (tool: ToolType) => void
  config: DrawingToolConfig
  onConfigChange: (config: DrawingToolConfig) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
}

const tools: { type: ToolType; icon: typeof Pencil; label: string }[] = [
  { type: "brush", icon: Pencil, label: "Brush" },
  { type: "eraser", icon: Eraser, label: "Eraser" },
  { type: "fill", icon: PaintBucket, label: "Fill" },
  { type: "rect", icon: Square, label: "Rectangle" },
  { type: "ellipse", icon: Circle, label: "Ellipse" },
]

const presetColors = [
  "#202124",
  "#ffffff",
  "#ff3830",
  "#ff7a1a",
  "#f5c542",
  "#21c35e",
  "#4d7cff",
  "#8b5cf6",
  "#ec4899",
  "#94a0b8",
]

export const DrawingToolbar = memo(function DrawingToolbar({
  activeTool,
  onToolChange,
  config,
  onConfigChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: DrawingToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false)

  const handleColorChange = useCallback(
    (color: string) => {
      onConfigChange({ ...config, color })
      setShowColorPicker(false)
    },
    [config, onConfigChange],
  )

  const handleSizeChange = useCallback(
    (size: number) => {
      onConfigChange({ ...config, size })
    },
    [config, onConfigChange],
  )

  return (
    <div className="mova-control flex items-center gap-1.5 px-2 py-2">
      {tools.map((tool) => (
        <button
          key={tool.type}
          type="button"
          title={tool.label}
          aria-label={tool.label}
          onClick={() => onToolChange(tool.type)}
          className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] transition-colors ${
            activeTool === tool.type
              ? "bg-[var(--color-brand-red-soft)] text-[var(--color-accent)]"
              : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
          }`}
        >
          <tool.icon size={17} />
        </button>
      ))}

      <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />

      <button
        type="button"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        onClick={onUndo}
        disabled={!canUndo}
        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Undo2 size={17} />
      </button>
      <button
        type="button"
        title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
        aria-label="Redo"
        onClick={onRedo}
        disabled={!canRedo}
        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Redo2 size={17} />
      </button>

      <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />

      <div className="relative">
        <button
          type="button"
          title="Color"
          aria-label="Color"
          className="h-8 w-8 rounded-[var(--radius-md)] border-2 border-white shadow-[0_0_0_1px_var(--color-border)]"
          style={{ backgroundColor: config.color }}
          onClick={() => setShowColorPicker(!showColorPicker)}
        />
        {showColorPicker && (
          <div className="absolute left-0 top-10 z-50 grid grid-cols-5 gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-[var(--shadow-md)]">
            {presetColors.map((color) => (
              <button
                key={color}
                type="button"
                className="h-6 w-6 rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                style={{ backgroundColor: color }}
                onClick={() => handleColorChange(color)}
                title={color}
                aria-label={color}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />

      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
          Size
        </span>
        <Slider value={config.size} onChange={handleSizeChange} min={1} max={50} step={1} className="w-24" />
        <span className="w-6 text-right text-[10px] font-mono text-[var(--color-text-muted)]">
          {config.size}
        </span>
      </div>
    </div>
  )
})
