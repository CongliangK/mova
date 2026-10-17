interface MovaLogoProps {
  variant?: "mark" | "lockup"
  size?: "sm" | "md" | "lg"
  showTagline?: boolean
  className?: string
}

const sizes = {
  sm: { mark: 28, word: "text-lg", tagline: "text-[10px]" },
  md: { mark: 40, word: "text-2xl", tagline: "text-xs" },
  lg: { mark: 88, word: "text-5xl", tagline: "text-sm" },
}

function MovaMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 72"
      role="img"
      aria-label="Mova mark"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={`mova-red-${size}`} x1="16" y1="5" x2="66" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff1f1a" />
          <stop offset="0.54" stopColor="#ff5a55" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id={`mova-red-right-${size}`} x1="80" y1="5" x2="34" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff1f1a" />
          <stop offset="0.58" stopColor="#ff5a55" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <filter id={`mova-soft-${size}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#ff3830" floodOpacity="0.14" />
        </filter>
      </defs>
      <g filter={`url(#mova-soft-${size})`}>
        <path
          d="M5 62C11 37 22 9 34 7c13-2 22 28 28 44C50 36 42 31 34 33c-12 3-18 22-29 29Z"
          fill={`url(#mova-red-${size})`}
        />
        <path
          d="M91 62C85 37 74 9 62 7 49 5 40 35 34 51c12-15 20-20 28-18 12 3 18 22 29 29Z"
          fill={`url(#mova-red-right-${size})`}
        />
      </g>
    </svg>
  )
}

export function MovaLogo({
  variant = "lockup",
  size = "md",
  showTagline = false,
  className = "",
}: MovaLogoProps) {
  const config = sizes[size]

  if (variant === "mark") {
    return <MovaMark size={config.mark} />
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <MovaMark size={config.mark} />
      <div className="min-w-0">
        <div className={`${config.word} font-semibold leading-none tracking-[0.02em] text-[var(--color-text-primary)]`}>
          MOVA
        </div>
        {showTagline && (
          <div className={`mt-2 ${config.tagline} font-medium uppercase tracking-[0.28em] text-[var(--color-text-secondary)]`}>
            AI-assisted 2D game animation tool
          </div>
        )}
      </div>
    </div>
  )
}
