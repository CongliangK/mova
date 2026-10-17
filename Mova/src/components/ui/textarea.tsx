import { forwardRef, type TextareaHTMLAttributes } from "react"

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
  className?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      placeholder,
      value,
      onChange,
      error = false,
      className,
      style,
      rows = 4,
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

    const textareaStyle: React.CSSProperties = {
      width: "100%",
      minHeight: "80px",
      padding: "var(--space-sm) var(--space-md)",
      backgroundColor: "var(--color-input-bg)",
      border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
      borderRadius: "var(--radius-md)",
      color: "var(--color-text-primary)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      lineHeight: 1.5,
      resize: "vertical",
      outline: "none",
      transition: `border-color var(--duration-fast) var(--ease-default)`,
    }

    return (
      <div className={className} style={containerStyle}>
        <textarea
          ref={ref}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          rows={rows}
          style={textareaStyle}
          onFocus={(e) => {
            if (!error) {
              e.currentTarget.style.borderColor = "var(--color-border-active)"
            }
          }}
          onBlur={(e) => {
            if (!error) {
              e.currentTarget.style.borderColor = "var(--color-border)"
            }
          }}
          {...props}
        />
      </div>
    )
  }
)

Textarea.displayName = "Textarea"
