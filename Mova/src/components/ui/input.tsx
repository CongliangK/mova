import { forwardRef, type InputHTMLAttributes } from "react"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  type?: "text" | "password" | "search"
  error?: boolean
  icon?: React.ReactNode
  className?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      type = "text",
      placeholder,
      value,
      onChange,
      error = false,
      icon,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const containerStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-sm)",
      padding: "0 var(--space-sm)",
      backgroundColor: "var(--color-input-bg)",
      border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-xs)",
      transition: `border-color var(--duration-fast) var(--ease-default), box-shadow var(--duration-fast) var(--ease-default)`,
      height: "38px",
      ...style,
    }

    const inputStyle: React.CSSProperties = {
      flex: 1,
      background: "transparent",
      border: "none",
      outline: "none",
      color: "var(--color-text-primary)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      padding: 0,
      height: "100%",
    }

    const iconStyle: React.CSSProperties = {
      color: "var(--color-text-secondary)",
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
    }

    return (
      <div
        className={className}
        style={containerStyle}
      onFocus={(e) => {
        const target = e.currentTarget
        if (!error) {
          target.style.borderColor = "var(--color-border-active)"
          target.style.boxShadow = "0 0 0 4px var(--color-brand-red-ring)"
        }
      }}
      onBlur={(e) => {
        const target = e.currentTarget
        if (!error) {
          target.style.borderColor = "var(--color-border)"
          target.style.boxShadow = "var(--shadow-xs)"
        }
      }}
      >
        {icon && <span style={iconStyle}>{icon}</span>}
        <input
          ref={ref}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          style={inputStyle}
          {...props}
        />
      </div>
    )
  }
)

Input.displayName = "Input"
