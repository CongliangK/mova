import { forwardRef } from "react"

interface SliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  className?: string
  disabled?: boolean
  style?: React.CSSProperties
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      value,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      label,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const containerStyle: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-xs)",
      width: "100%",
      ...style,
    }

    const labelRowStyle: React.CSSProperties = {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }

    const labelStyle: React.CSSProperties = {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--color-text-secondary)",
    }

    const valueStyle: React.CSSProperties = {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--text-xs)",
      color: "var(--color-text-primary)",
      minWidth: "24px",
      textAlign: "right",
    }

    const sliderStyle: React.CSSProperties = {
      width: "100%",
      height: "4px",
      accentColor: "var(--color-accent)",
      cursor: "pointer",
    }

    return (
      <div className={className} style={containerStyle}>
        <div style={labelRowStyle}>
          {label && <span style={labelStyle}>{label}</span>}
          <span style={valueStyle}>{value}</span>
        </div>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={sliderStyle}
          {...props}
        />
      </div>
    )
  }
)

Slider.displayName = "Slider"
