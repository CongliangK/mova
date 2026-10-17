import { fetch } from "@tauri-apps/plugin-http"
import type { ImageGenProvider, ImageGenRequest, ImageGenChunk } from "../../../../types/ai"

const DEFAULT_BASE_URL = "https://api.wuyinkeji.com"
const POLL_INTERVAL = 3000
const POLL_TIMEOUT = 180000

const MODEL_ENDPOINTS: Record<string, string> = {
  nanobanana: "/api/async/image_nanoBanana2",
  "gpt-image": "/api/async/image_gpt",
}

const SIZE_MAP: Record<string, string> = {
  "1K": "1024x1024",
  "2K": "2048x2048",
  "4K": "4096x4096",
}

interface SuchuangConfig {
  apiKey: string
  model?: string
  baseUrl?: string
}

export class SuchuangProvider implements ImageGenProvider {
  private apiKey: string
  private model: string
  private baseUrl: string

  constructor(config: SuchuangConfig) {
    this.apiKey = config.apiKey
    this.model = config.model || "nanobanana"
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL
  }

  async *generate(request: ImageGenRequest): AsyncGenerator<ImageGenChunk> {
    const model = request.model || this.model
    const endpoint = MODEL_ENDPOINTS[model]
    if (!endpoint) {
      yield { type: "error", message: `Unknown model: ${model}` }
      return
    }

    // Phase A: Submit
    const payload: Record<string, unknown> = { prompt: request.prompt }

    if (model === "nanobanana") {
      payload.size = request.size || "1K"
      if (request.aspectRatio && request.aspectRatio !== "auto") {
        payload.aspectRatio = request.aspectRatio
      }
    } else if (model === "gpt-image") {
      payload.size = SIZE_MAP[request.size || "1K"] || request.size || "1024x1024"
    }

    if (request.referenceUrls?.length) {
      payload.urls = request.referenceUrls
    }

    let taskId: string
    try {
      const resp = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      const data = await resp.json()
      if (data.code !== 200) {
        yield { type: "error", message: `Submit failed [${data.code}]: ${data.msg || JSON.stringify(data)}` }
        return
      }
      taskId = data.data.id
      yield { type: "progress", message: "Image generation submitted..." }
    } catch (err) {
      yield { type: "error", message: `Submit error: ${err instanceof Error ? err.message : String(err)}` }
      return
    }

    // Phase B: Poll
    const startTime = Date.now()
    let imageUrls!: string[]

    while (true) {
      const elapsed = Date.now() - startTime
      if (elapsed > POLL_TIMEOUT) {
        yield { type: "error", message: `Generation timeout (${POLL_TIMEOUT / 1000}s)` }
        return
      }

      await sleep(POLL_INTERVAL)

      try {
        const resp = await fetch(
          `${this.baseUrl}/api/async/detail?id=${taskId}`,
          { headers: { Authorization: this.apiKey } }
        )
        const data = await resp.json()
        if (data.code !== 200) continue

        const status = data.data?.status
        if (status === 2) {
          imageUrls = (data.data.result || []).filter((u: unknown) => typeof u === "string")
          if (!imageUrls.length) {
            yield { type: "error", message: "Generation succeeded but no images returned" }
            return
          }
          yield { type: "progress", message: `Generated ${imageUrls.length} image(s) in ${(elapsed / 1000).toFixed(1)}s` }
          break
        } else if (status === -1) {
          yield { type: "error", message: `Generation failed: ${data.data.message || "unknown"}` }
          return
        }

        yield { type: "progress", message: `Generating... (${(elapsed / 1000).toFixed(0)}s)` }
      } catch (err) {
        yield { type: "error", message: `Poll error, retrying: ${err instanceof Error ? err.message : String(err)}` }
      }
    }

    // Phase C: Download
    for (const url of imageUrls) {
      try {
        const resp = await fetch(url)
        const buffer = await resp.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        yield { type: "image", imageUrl: url, imageData: bytes }
      } catch (err) {
        yield { type: "error", message: `Download failed: ${err instanceof Error ? err.message : String(err)}` }
        return
      }
    }

    yield { type: "done" }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/async/detail?id=test`, {
        headers: { Authorization: this.apiKey },
      })
      const data = await resp.json()
      return data.code !== 401 && data.code !== 403
    } catch {
      return false
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
