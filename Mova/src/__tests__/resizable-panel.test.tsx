import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ResizablePanel } from "../../src/components/layout/resizable-panel"

describe("ResizablePanel", () => {
  it("keeps visual background and borders out of the left sizing wrapper", () => {
    render(
      <ResizablePanel
        defaultWidth={300}
        minWidth={240}
        maxWidth={380}
        side="left"
      >
        <div>Left panel</div>
      </ResizablePanel>,
    )

    const panel = screen.getByTestId("resizable-panel-left")
    expect(panel).not.toHaveClass("bg-[var(--color-bg-secondary)]")
    expect(panel).not.toHaveClass("border-r")
    expect(panel).toHaveClass("overflow-hidden")
  })

  it("keeps visual background and borders out of the right sizing wrapper", () => {
    render(
      <ResizablePanel
        defaultWidth={360}
        minWidth={300}
        maxWidth={460}
        side="right"
      >
        <div>Right panel</div>
      </ResizablePanel>,
    )

    const panel = screen.getByTestId("resizable-panel-right")
    expect(panel).not.toHaveClass("bg-[var(--color-bg-secondary)]")
    expect(panel).not.toHaveClass("border-l")
    expect(panel).toHaveClass("overflow-hidden")
  })
})
