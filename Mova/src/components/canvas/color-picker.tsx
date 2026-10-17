import { useState, useCallback, useRef, useEffect } from "react"
import { Pipette, Palette } from "lucide-react"

// ─── Color Utilities ─────────────────────────────────────────────────────────

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = h / 360
  const sat = s / 100
  const light = l / 100

  let r: number, g: number, b: number

  if (sat === 0) {
    r = g = b = light
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
    const p = 2 * light - q
    r = hue2rgb(p, q, hue + 1 / 3)
    g = hue2rgb(p, q, hue)
    b = hue2rgb(p, q, hue - 1 / 3)
  }

  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16)
    return hex.length === 1 ? "0" + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex)
}

// ─── Preset Palettes ─────────────────────────────────────────────────────────

const PRESET_PALETTES: Record<string, string[]> = {
  "Pixel Art": [
    "#000000", "#1a1a1a", "#333333", "#555555", "#777777", "#999999",
    "#bbbbbb", "#dddddd", "#ffffff", "#ff0000", "#00ff00", "#0000ff",
    "#ffff00", "#00ffff", "#ff00ff", "#ff8800", "#8800ff", "#00ff88",
    "#8B4513", "#D2691E", "#F4A460", "#2E8B57", "#228B22", "#32CD32",
  ],
  Nature: [
    "#1a472a", "#2d5a3f", "#4a7c59", "#6b9e75", "#8fbc8f", "#a8d5a2",
    "#c8e6c9", "#2f4f4f", "#3d6b6b", "#5f9ea0", "#7fcdcd", "#b0e0e6",
    "#87CEEB", "#4682B4", "#1E90FF", "#8B4513", "#A0522D", "#CD853F",
    "#DEB887", "#F5DEB3", "#556B2F", "#6B8E23", "#9ACD32", "#ADFF2F",
  ],
  UI: [
    "#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560", "#ff6b6b",
    "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57", "#ff9ff3", "#54a0ff",
    "#5f27cd", "#00d2d3", "#1dd1a1", "#ff9f43", "#ee5a24", "#009432",
    "#0652dd", "#9980fa", "#833471", "#f79f1f", "#a3cb38", "#1289a7",
  ],
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ColorPickerProps {
  color: string
  onChange: (color: string) => void
}

export function ColorPicker({ color, onChange }: ColorPickerProps) {
  const [hsl, setHsl] = useState(() => hexToHsl(isValidHex(color) ? color : "#58a6ff"))
  type PaletteTab = "Pixel Art" | "Nature" | "UI"
  const [activeTab, setActiveTab] = useState<PaletteTab>("Pixel Art")
  const [recentColors, setRecentColors] = useState<string[]>([])
  const [hexInput, setHexInput] = useState(color.toUpperCase())
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)

  // Sync internal state when prop changes
  useEffect(() => {
    if (!isValidHex(color)) return
    const newHsl = hexToHsl(color)
    const upper = color.toUpperCase()
    const frameId = requestAnimationFrame(() => {
      setHsl((prev) => {
        if (prev.h === newHsl.h && prev.s === newHsl.s && prev.l === newHsl.l) {
          return prev
        }
        return newHsl
      })
      setHexInput((prev) => (prev === upper ? prev : upper))
    })
    return () => cancelAnimationFrame(frameId)
  }, [color])

  const currentHex = hslToHex(hsl.h, hsl.s, hsl.l)

  const addToRecent = useCallback(
    (hex: string) => {
      setRecentColors((prev) => {
        const filtered = prev.filter((c) => c !== hex)
        return [hex, ...filtered].slice(0, 12)
      })
    },
    []
  )

  const handleColorSelect = useCallback(
    (hex: string) => {
      if (!isValidHex(hex)) return
      const newHsl = hexToHsl(hex)
      setHsl(newHsl)
      setHexInput(hex.toUpperCase())
      addToRecent(hex)
      onChange(hex)
    },
    [onChange, addToRecent]
  )

  const handleHslChange = useCallback(
    (newHsl: { h: number; s: number; l: number }) => {
      setHsl(newHsl)
      const hex = hslToHex(newHsl.h, newHsl.s, newHsl.l)
      setHexInput(hex)
      addToRecent(hex)
      onChange(hex)
    },
    [onChange, addToRecent]
  )

  const handleHexInputChange = useCallback(
    (value: string) => {
      let hex = value.trim()
      if (!hex.startsWith("#")) hex = "#" + hex
      setHexInput(hex)
      if (isValidHex(hex)) {
        const newHsl = hexToHsl(hex)
        setHsl(newHsl)
        addToRecent(hex)
        onChange(hex)
      }
    },
    [onChange, addToRecent]
  )

  // Brightness slider drag handling
  const updateLightnessFromMouse = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!sliderRef.current) return
      const rect = sliderRef.current.getBoundingClientRect()
      const y = e.clientY - rect.top
      const percentage = Math.max(0, Math.min(1, y / rect.height))
      const newLightness = Math.round(percentage * 100)
      handleHslChange({ ...hsl, l: newLightness })
    },
    [hsl, handleHslChange]
  )

  const handleSliderMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingSlider(true)
    updateLightnessFromMouse(e)
  }, [updateLightnessFromMouse])

  useEffect(() => {
    if (!isDraggingSlider) return
    const handleMouseMove = (e: MouseEvent) => updateLightnessFromMouse(e)
    const handleMouseUp = () => setIsDraggingSlider(false)
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDraggingSlider, updateLightnessFromMouse])

  // Generate 12x12 HSL color grid
  const gridColors: string[][] = []
  for (let row = 0; row < 12; row++) {
    const rowColors: string[] = []
    for (let col = 0; col < 12; col++) {
      const h = Math.round((col / 11) * 360)
      const s = Math.round(30 + (row / 11) * 70) // Saturation from 30% to 100%
      rowColors.push(hslToHex(h, s, hsl.l))
    }
    gridColors.push(rowColors)
  }

  // ─── Styles ────────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-md)",
    padding: "var(--space-md)",
    backgroundColor: "var(--color-bg-panel)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--color-border)",
    width: "280px",
    fontFamily: "var(--font-sans)",
  }

  const sectionStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  }

  const gridContainerStyle: React.CSSProperties = {
    display: "flex",
    gap: "var(--space-sm)",
    alignItems: "flex-start",
  }

  const colorGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(12, 1fr)",
    gap: "1px",
    flex: 1,
    borderRadius: "var(--radius-sm)",
    overflow: "hidden",
    border: "1px solid var(--color-border)",
  }

  const colorCellStyle = (hex: string): React.CSSProperties => ({
    width: "100%",
    aspectRatio: "1",
    backgroundColor: hex,
    cursor: "pointer",
    border: "none",
    padding: 0,
    transition: `transform var(--duration-fast) var(--ease-default)`,
  })

  const brightnessSliderContainerStyle: React.CSSProperties = {
    width: "20px",
    height: "100%",
    minHeight: "200px",
    position: "relative",
    cursor: "pointer",
    borderRadius: "var(--radius-sm)",
    overflow: "hidden",
    border: "1px solid var(--color-border)",
    flexShrink: 0,
  }

  const brightnessSliderThumbStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    height: "4px",
    backgroundColor: "#ffffff",
    border: "1px solid rgba(0,0,0,0.3)",
    borderRadius: "2px",
    pointerEvents: "none",
    transform: "translateY(-50%)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  }

  const currentColorSectionStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    padding: "var(--space-sm)",
    backgroundColor: "var(--color-bg-secondary)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
  }

  const swatchStyle = (hex: string, size: number): React.CSSProperties => ({
    width: `${size}px`,
    height: `${size}px`,
    backgroundColor: hex,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    flexShrink: 0,
  })

  const hexInputContainerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-xs)",
    flex: 1,
  }

  const hexInputStyle: React.CSSProperties = {
    flex: 1,
    backgroundColor: "var(--color-input-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--space-xs) var(--space-sm)",
    color: "var(--color-text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-sm)",
    outline: "none",
    textTransform: "uppercase",
  }

  const recentColorsStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-xs)",
  }

  const recentSwatchStyle = (hex: string): React.CSSProperties => ({
    width: "20px",
    height: "20px",
    backgroundColor: hex,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    cursor: "pointer",
    transition: `transform var(--duration-fast) var(--ease-default)`,
  })

  const tabsContainerStyle: React.CSSProperties = {
    display: "flex",
    borderBottom: "1px solid var(--color-border)",
    gap: "var(--space-xs)",
  }

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "var(--space-xs) var(--space-sm)",
    fontSize: "var(--text-xs)",
    fontWeight: isActive ? 600 : 400,
    color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
    background: "none",
    border: "none",
    borderBottom: `2px solid ${isActive ? "var(--color-accent)" : "transparent"}`,
    cursor: "pointer",
    transition: `all var(--duration-fast) var(--ease-default)`,
    marginBottom: "-1px",
  })

  const paletteGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "var(--space-xs)",
    paddingTop: "var(--space-sm)",
  }

  const paletteSwatchStyle = (hex: string): React.CSSProperties => ({
    width: "100%",
    aspectRatio: "1",
    backgroundColor: hex,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    cursor: "pointer",
    transition: `transform var(--duration-fast) var(--ease-default)`,
  })

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
        <Palette size={16} style={{ color: "var(--color-accent)" }} />
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
          Color Picker
        </span>
      </div>

      {/* Color Grid + Brightness Slider */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Spectrum</span>
        <div style={gridContainerStyle}>
          <div style={colorGridStyle}>
            {gridColors.map((row, rowIdx) =>
              row.map((hex, colIdx) => (
                <button
                  key={`${rowIdx}-${colIdx}`}
                  style={colorCellStyle(hex)}
                  onClick={() => handleColorSelect(hex)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.2)"
                    e.currentTarget.style.zIndex = "1"
                    e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)"
                    e.currentTarget.style.zIndex = "0"
                    e.currentTarget.style.boxShadow = "none"
                  }}
                  aria-label={`Select color ${hex}`}
                />
              ))
            )}
          </div>

          {/* Brightness Slider */}
          <div
            ref={sliderRef}
            style={{
              ...brightnessSliderContainerStyle,
              background: `linear-gradient(to bottom, #ffffff 0%, ${hslToHex(hsl.h, hsl.s, 50)} 50%, #000000 100%)`,
            }}
            onMouseDown={handleSliderMouseDown}
          >
            <div
              style={{
                ...brightnessSliderThumbStyle,
                top: `${(hsl.l / 100) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Current Color Display */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Current</span>
        <div style={currentColorSectionStyle}>
          <div style={swatchStyle(currentHex, 40)} />
          <div style={hexInputContainerStyle}>
            <Pipette size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexInputChange(e.target.value)}
              style={hexInputStyle}
              maxLength={7}
              aria-label="Hex color value"
            />
          </div>
        </div>
      </div>

      {/* Recent Colors */}
      {recentColors.length > 0 && (
        <div style={sectionStyle}>
          <span style={labelStyle}>Recent</span>
          <div style={recentColorsStyle}>
            {recentColors.map((hex, i) => (
              <button
                key={`${hex}-${i}`}
                style={recentSwatchStyle(hex)}
                onClick={() => handleColorSelect(hex)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.15)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)"
                }}
                aria-label={`Recent color ${hex}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Preset Palettes */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Palettes</span>
        <div style={tabsContainerStyle}>
          {(Object.keys(PRESET_PALETTES) as PaletteTab[]).map((tab) => (
            <button
              key={tab}
              style={tabStyle(activeTab === tab)}
              onClick={() => setActiveTab(tab)}
              onMouseEnter={(e) => {
                if (activeTab !== tab) {
                  e.currentTarget.style.color = "var(--color-text-primary)"
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab) {
                  e.currentTarget.style.color = "var(--color-text-secondary)"
                }
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div style={paletteGridStyle}>
          {PRESET_PALETTES[activeTab].map((hex, i) => (
            <button
              key={`${activeTab}-${i}`}
              style={paletteSwatchStyle(hex)}
              onClick={() => handleColorSelect(hex)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.1)"
                e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)"
                e.currentTarget.style.boxShadow = "none"
              }}
              aria-label={`Palette color ${hex}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
