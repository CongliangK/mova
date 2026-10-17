import type Konva from "konva"

export function dataUrlToBytes(dataUrl: string): number[] {
  const [, base64 = ""] = dataUrl.split(",")
  const binary = window.atob(base64)
  const bytes: number[] = []
  for (let i = 0; i < binary.length; i++) {
    bytes.push(binary.charCodeAt(i))
  }
  return bytes
}

export function exportEditedImagePngBytes(
  stage: Konva.Stage,
  image: HTMLImageElement,
  width: number,
  height: number,
): number[] {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context is unavailable")

  ctx.drawImage(image, 0, 0, width, height)

  const drawingLayer = stage.findOne(".drawing-layer") as Konva.Layer | null
  if (drawingLayer) {
    const drawingCanvas = drawingLayer.toCanvas({
      x: 0,
      y: 0,
      width,
      height,
      pixelRatio: 1,
    })
    ctx.drawImage(drawingCanvas, 0, 0)
  }

  return dataUrlToBytes(canvas.toDataURL("image/png"))
}
