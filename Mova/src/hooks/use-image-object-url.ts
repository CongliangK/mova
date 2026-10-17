import { toDisplayAssetUrl } from "../utils/asset-url"

const WEB_URL_PATTERN = /^(https?:|data:|blob:|asset:)/i
const CACHE_BUSTABLE_URL_PATTERN = /^(asset:|https?:|http:\/\/asset\.localhost)/i

const imageVersionCache = new Map<string, number>()

function appendVersion(url: string | undefined, path: string | null | undefined) {
  if (!url || !path) return url
  const version = imageVersionCache.get(path)
  if (!version || !CACHE_BUSTABLE_URL_PATTERN.test(url)) return url
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}mova_v=${version}`
}

export function invalidateImageObjectUrl(path: string | null | undefined) {
  if (!path) return
  imageVersionCache.set(path, (imageVersionCache.get(path) ?? 0) + 1)
}

export function resolveImmediateImageSrc(path: string | null | undefined) {
  if (!path) return undefined
  if (WEB_URL_PATTERN.test(path)) return appendVersion(path, path)
  return appendVersion(toDisplayAssetUrl(path), path)
}

export function useImageObjectUrl(path: string | null | undefined) {
  return resolveImmediateImageSrc(path)
}
