import { forwardRef, type SVGProps } from "react"
import type { LucideIcon } from "lucide-react"

const sizeMap = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const

type IconSize = keyof typeof sizeMap

interface IconProps extends SVGProps<SVGSVGElement> {
  icon: LucideIcon
  size?: IconSize | number
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ icon: LucideComponent, size = "md", className, ...props }, ref) => {
    const pixelSize = typeof size === "number" ? size : sizeMap[size]
    return (
      <LucideComponent
        ref={ref}
        size={pixelSize}
        className={`shrink-0 ${className ?? ""}`}
        {...props}
      />
    )
  }
)

Icon.displayName = "Icon"
