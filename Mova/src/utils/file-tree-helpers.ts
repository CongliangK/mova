import type { FileNode } from "../types/file-tree"

export function filterFileTreeNodes(nodes: FileNode[], query: string): FileNode[] {
  const normalizedQuery = query.toLowerCase().trim()
  if (!normalizedQuery) return nodes

  return nodes.reduce<FileNode[]>((acc, node) => {
    const nameMatch = node.name.toLowerCase().includes(normalizedQuery)
    const filteredChildren = node.children
      ? filterFileTreeNodes(node.children, normalizedQuery)
      : undefined

    if (nameMatch || (filteredChildren && filteredChildren.length > 0)) {
      acc.push({ ...node, children: filteredChildren })
    }

    return acc
  }, [])
}

export function countFileTreeNodes(nodes: FileNode[]): number {
  let count = 0
  const stack = [...nodes]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    count += 1
    if (node.children) {
      stack.push(...node.children)
    }
  }
  return count
}
