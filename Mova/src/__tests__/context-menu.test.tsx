import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ContextMenu } from "../../src/components/ui/context-menu"
import type { MenuItem } from "../../src/components/ui/context-menu"

describe("ContextMenu", () => {
  let onClose: () => void
  const items: MenuItem[] = [
    { label: "Rename", onClick: vi.fn() as () => void },
    { label: "Delete", onClick: vi.fn() as () => void },
    { label: "", separator: true, onClick: vi.fn() as () => void },
    { label: "Copy Path", onClick: vi.fn() as () => void },
    { label: "Properties", onClick: vi.fn() as () => void },
  ]

  beforeEach(() => {
    onClose = vi.fn() as () => void
    items.forEach((item) => {
      item.onClick = vi.fn() as () => void
    })
  })

  it("renders all menu items", () => {
    render(<ContextMenu x={100} y={100} items={items} onClose={onClose} />)
    expect(screen.getByText("Rename")).toBeInTheDocument()
    expect(screen.getByText("Delete")).toBeInTheDocument()
    expect(screen.getByText("Copy Path")).toBeInTheDocument()
  })

  it("renders items with icons", () => {
    const itemsWithIcon: MenuItem[] = [
      { label: "Edit", icon: <span data-testid="edit-icon">✏️</span>, onClick: vi.fn() as () => void },
    ]
    render(<ContextMenu x={0} y={0} items={itemsWithIcon} onClose={onClose} />)
    expect(screen.getByTestId("edit-icon")).toBeInTheDocument()
  })

  it("calls onClick and onClose when a menu item is clicked", () => {
    render(<ContextMenu x={100} y={100} items={items} onClose={onClose} />)
    fireEvent.click(screen.getByText("Delete"))
    expect(items[1].onClick).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("renders disabled items as disabled", () => {
    const disabledItems: MenuItem[] = [
      { label: "Action", onClick: vi.fn() as () => void, disabled: true },
    ]
    render(<ContextMenu x={0} y={0} items={disabledItems} onClose={onClose} />)
    const button = screen.getByText("Action").closest("button")!
    expect(button).toBeDisabled()
  })

  it("does not call onClick for disabled items", () => {
    const onClick = vi.fn()
    const disabledItems: MenuItem[] = [
      { label: "Action", onClick, disabled: true },
    ]
    render(<ContextMenu x={0} y={0} items={disabledItems} onClose={onClose} />)
    fireEvent.click(screen.getByText("Action"))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("renders separator items", () => {
    const itemsWithSeparator: MenuItem[] = [
      { label: "Cut", onClick: vi.fn() as () => void },
      { label: "", separator: true, onClick: vi.fn() as () => void },
      { label: "Paste", onClick: vi.fn() as () => void },
    ]
    const { container } = render(
      <ContextMenu x={0} y={0} items={itemsWithSeparator} onClose={onClose} />,
    )
    // Separator is a div with border-t class
    const separators = container.querySelectorAll(".border-t")
    expect(separators).toHaveLength(1)
  })

  it("calls onClose when clicking outside the menu", async () => {
    render(<ContextMenu x={100} y={100} items={items} onClose={onClose} />)
    // The click-outside listener is registered after a setTimeout(0)
    await new Promise((r) => setTimeout(r, 10))
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it("calls onClose when pressing Escape", async () => {
    render(<ContextMenu x={100} y={100} items={items} onClose={onClose} />)
    await new Promise((r) => setTimeout(r, 10))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("prevents default on contextMenu event", () => {
    const { container } = render(
      <ContextMenu x={100} y={100} items={items} onClose={onClose} />,
    )
    const menu = container.firstChild as HTMLElement
    const event = new Event("contextmenu", { bubbles: true, cancelable: true })
    const spy = vi.spyOn(event, "preventDefault")
    menu.dispatchEvent(event)
    expect(spy).toHaveBeenCalled()
  })
})
