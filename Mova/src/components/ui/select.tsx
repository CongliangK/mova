import { forwardRef, type SelectHTMLAttributes } from "react"

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  className?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, value, onChange, className, style, ...props }, ref) => {
    const selectStyle: React.CSSProperties = {
      width: "100%",
      height: "32px",
      padding: "0 var(--space-sm)",
      backgroundColor: "var(--color-input-bg)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-text-primary)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      cursor: "pointer",
      outline: "none",
      transition: `border-color var(--duration-fast) var(--ease-default)`,
      appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right var(--space-sm) center",
      paddingRight: "var(--space-xl)",
      ...style,
    }

    return (
      <select
        ref={ref}
        value={value}
        onChange={onChange}
        className={className}
        style={selectStyle}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border-active)"
          props.onFocus?.(e)
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border)"
          props.onBlur?.(e)
        }}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }
)

Select.displayName = "Select"
