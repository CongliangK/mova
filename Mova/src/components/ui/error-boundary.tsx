import { Component, type ErrorInfo, type ReactNode } from "react"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <div style={iconWrapperStyle}>
              <span style={iconStyle}>!</span>
            </div>
            <h1 style={headingStyle}>Something went wrong</h1>
            <p style={messageStyle}>
              An unexpected error occurred. Please reload the application to continue.
            </p>
            {this.state.error && (
              <details style={detailsStyle}>
                <summary style={summaryStyle}>Error details</summary>
                <pre style={preStyle}>{this.state.error.message}</pre>
              </details>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              style={buttonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-accent-hover)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-accent)"
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100vw",
  height: "100vh",
  backgroundColor: "var(--color-bg-primary)",
  fontFamily: "var(--font-sans)",
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--space-lg)",
  backgroundColor: "var(--color-bg-panel)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-xl)",
  padding: "var(--space-2xl) var(--space-xl)",
  maxWidth: "420px",
  width: "100%",
  margin: "var(--space-lg)",
  boxShadow: "var(--shadow-lg)",
  textAlign: "center",
}

const iconWrapperStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  backgroundColor: "var(--color-danger)",
  color: "#ffffff",
  fontSize: "var(--text-xl)",
  fontWeight: 700,
  lineHeight: 1,
}

const iconStyle: React.CSSProperties = {
  display: "block",
}

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-lg)",
  fontWeight: 600,
  color: "var(--color-text-primary)",
}

const messageStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-sm)",
  color: "var(--color-text-secondary)",
  lineHeight: 1.5,
}

const detailsStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
}

const summaryStyle: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  color: "var(--color-text-muted)",
  cursor: "pointer",
  marginBottom: "var(--space-xs)",
}

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: "var(--space-sm) var(--space-md)",
  fontSize: "var(--text-xs)",
  fontFamily: "var(--font-mono)",
  color: "var(--color-danger)",
  backgroundColor: "var(--color-bg-secondary)",
  borderRadius: "var(--radius-sm)",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
}

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--space-sm) var(--space-lg)",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-sans)",
  fontWeight: 500,
  backgroundColor: "var(--color-accent)",
  color: "#ffffff",
  border: "1px solid transparent",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  height: "32px",
  whiteSpace: "nowrap",
  transition: "all var(--duration-fast) var(--ease-default)",
}
