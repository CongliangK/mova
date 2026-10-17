const WEB_URL_PATTERN = /^(https?:|data:|blob:|asset:)/i
type TauriInternals = {
  convertFileSrc?: (filePath: string, protocol?: string) => string
}

function getTauriInternals() {
  return (globalThis as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__
}

export function toDisplayAssetUrl(
  path: string | null | undefined,
): string | undefined {
  if (!path) return undefined
  if (WEB_URL_PATTERN.test(path)) return path
  const convertFileSrc = getTauriInternals()?.convertFileSrc
  if (!convertFileSrc) return path
  return convertFileSrc(path, "asset")
}

export function isTimelineImagePath(
  path: string | null | undefined,
): path is string {
  return Boolean(path && /\.(png|jpe?g|webp|gif)$/i.test(path))
}
