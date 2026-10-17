import { forwardRef, type ButtonHTMLAttributes } from "react"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
type ButtonSize = "sm" | "md" | "lg"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: "var(--color-accent)",
    color: "#ffffff",
    border: "1px solid transparent",
    boxShadow: "0 10px 24px rgba(255, 56, 48, 0.22)",
  },
  secondary: {
    backgroundColor: "var(--color-bg-panel)",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-border)",
    boxShadow: "var(--shadow-xs)",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--color-text-secondary)",
    border: "1px solid transparent",
  },
  danger: {
    backgroundColor: "var(--color-danger)",
    color: "#ffffff",
    border: "1px solid transparent",
    boxShadow: "0 10px 24px rgba(255, 56, 48, 0.18)",
  },
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    padding: "var(--space-xs) var(--space-sm)",
    fontSize: "var(--text-xs)",
    borderRadius: "var(--radius-md)",
    height: "30px",
  },
  md: {
    padding: "var(--space-sm) var(--space-md)",
    fontSize: "var(--text-sm)",
    borderRadius: "var(--radius-lg)",
    height: "36px",
  },
  lg: {
    padding: "var(--space-md) var(--space-lg)",
    fontSize: "var(--text-base)",
    borderRadius: "var(--radius-lg)",
    height: "44px",
  },
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      disabled = false,
      className,
      children,
      style,
      ...props
    },
    ref
  ) => {
    const baseStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-xs)",
      fontFamily: "var(--font-sans)",
      fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: `all var(--duration-fast) var(--ease-default)`,
      whiteSpace: "nowrap",
      ...variantStyles[variant],
      ...sizeStyles[size],
      ...style,
    }

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={className}
        style={baseStyle}
        onMouseEnter={(e) => {
          if (!disabled) {
            const target = e.currentTarget
            if (variant === "primary") {
              target.style.backgroundColor = "var(--color-accent-hover)"
              target.style.boxShadow = "0 12px 28px rgba(255, 56, 48, 0.26)"
            } else if (variant === "secondary") {
              target.style.backgroundColor = "var(--color-bg-hover)"
              target.style.borderColor = "var(--color-border-strong)"
            } else if (variant === "ghost") {
              target.style.backgroundColor = "var(--color-bg-hover)"
              target.style.color = "var(--color-text-primary)"
            } else if (variant === "danger") {
              target.style.filter = "brightness(1.1)"
            }
          }
          props.onMouseEnter?.(e)
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            const target = e.currentTarget
            target.style.backgroundColor = variantStyles[variant].backgroundColor || ""
            target.style.color = variantStyles[variant].color || ""
            target.style.borderColor = String(variantStyles[variant].border || "").replace("1px solid ", "")
            target.style.boxShadow = variantStyles[variant].boxShadow || ""
            target.style.filter = ""
          }
          props.onMouseLeave?.(e)
        }}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = "Button"
