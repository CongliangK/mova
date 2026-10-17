import { memo } from "react"
import type { ImgHTMLAttributes } from "react"
import { useImageObjectUrl } from "../../hooks/use-image-object-url"
import { useProjectStore } from "../../stores/project-store"

const WEB_URL_PATTERN = /^(https?:|data:|blob:|asset:)/i
const ABSOLUTE_PATH_PATTERN = /^(?:[a-zA-Z]:[\\/]|[\\/]{2}|\/)/

type LocalImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined
}

function resolveProjectRelativePath(src: string | null | undefined, projectPath: string | null) {
  if (!src || !projectPath || WEB_URL_PATTERN.test(src) || ABSOLUTE_PATH_PATTERN.test(src)) {
    return src
  }
  return `${projectPath.replace(/[\\/]+$/, "")}/${src}`
}

export const LocalImage = memo(function LocalImage({ src, loading, decoding, ...props }: LocalImageProps) {
  const projectPath = useProjectStore((s) => s.projectPath)
  const resolvedPath = resolveProjectRelativePath(src, projectPath)
  const resolvedSrc = useImageObjectUrl(resolvedPath)
  return (
    <img
      {...props}
      src={resolvedSrc ?? ""}
      loading={loading ?? "lazy"}
      decoding={decoding ?? "async"}
    />
  )
})
