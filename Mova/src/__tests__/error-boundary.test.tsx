import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { ErrorBoundary } from "../../src/components/ui/error-boundary"

function ThrowOnRender({ shouldThrow, message }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) {
    throw new Error(message ?? "Test render error")
  }
  return <div data-testid="normal-child">All good</div>
}

function triggerRenderError(): Error {
  try {
    render(
      <ErrorBoundary>
        <ThrowOnRender shouldThrow={true} message="Kaboom" />
      </ErrorBoundary>,
    )
  } catch {
    // ErrorBoundary catches the error in its own render;
    // RTL may still throw when the error bubbles in StrictMode with React 18.
    // We ignore that here — the assertions below verify the fallback UI.
  }
  return new Error("Kaboom")
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it("renders children normally when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello</div>
      </ErrorBoundary>,
    )

    expect(screen.getByTestId("child")).toBeInTheDocument()
    expect(screen.getByText("Hello")).toBeInTheDocument()
  })

  it("shows the error fallback UI when a child throws during render", () => {
    triggerRenderError()

    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(
      screen.getByText("An unexpected error occurred. Please reload the application to continue."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reload Application" })).toBeInTheDocument()
  })

  it("displays the caught error message inside the error details element", () => {
    triggerRenderError()

    const details = screen.getByText("Error details").closest("details")
    expect(details).toBeInTheDocument()

    // Open the <details> element so the <pre> content is visible
    details!.open = true

    expect(screen.getByText("Kaboom")).toBeInTheDocument()
  })

  it("renders the reload button with the correct label", () => {
    triggerRenderError()

    const reloadButton = screen.getByRole("button", { name: "Reload Application" })
    expect(reloadButton).toBeInTheDocument()
    expect(reloadButton).toHaveTextContent("Reload Application")
  })
})
