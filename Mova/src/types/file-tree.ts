export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  modifiedAt?: string
  children?: FileNode[]
  category: string
  gitStatus?: "unmodified" | "modified" | "staged" | "untracked" | "ignored"
}
