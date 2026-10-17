import { useState } from "react"
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock3 } from "lucide-react"
import type { ToolCallResult } from "../../types/ai"

type SpriteQcSummary =
  | { status: "warning"; warnings: string[] }
  | { status: "passed"; warnings: [] }
  | { status: "unknown"; warnings: [] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getSpriteQcSummary(toolCall: ToolCallResult): SpriteQcSummary | null {
  if (toolCall.name !== "process_sprite" || toolCall.result?.success !== true) {
    return null
  }

  const data = toolCall.result.data
  if (!isRecord(data) || !isRecord(data.qc)) {
    return { status: "unknown", warnings: [] }
  }

  const rawWarnings = data.qc.warnings
  if (!Array.isArray(rawWarnings)) {
    return { status: "unknown", warnings: [] }
  }

  const warnings = rawWarnings.filter(
    (warning): warning is string => typeof warning === "string" && warning.trim().length > 0,
  )

  if (warnings.length > 0) {
    return { status: "warning", warnings }
  }

  return rawWarnings.length === 0
    ? { status: "passed", warnings: [] }
    : { status: "unknown", warnings: [] }
}

function getSpriteManifestPath(toolCall: ToolCallResult): string | null {
  if (toolCall.name !== "process_sprite" || toolCall.result?.success !== true) {
    return null
  }

  const data = toolCall.result.data
  if (!isRecord(data) || typeof data.manifestPath !== "string" || data.manifestPath.trim().length === 0) {
    return null
  }

  return data.manifestPath
}

interface ToolCallCardProps {
  toolCall: ToolCallResult
}

function getStatusIcon(toolCall: ToolCallResult, spriteQcSummary: SpriteQcSummary | null) {
  if (!toolCall.result) {
    return <Clock3 size={14} className="text-[var(--color-text-muted)]" />
  }
  if (spriteQcSummary?.status === "warning") {
    return <AlertCircle size={14} className="text-[var(--color-warning)]" />
  }
  if (toolCall.result.success) {
    return <CheckCircle2 size={14} className="text-[var(--color-success)]" />
  }
  return <AlertCircle size={14} className="text-[var(--color-danger)]" />
}

function getStatusLabel(toolCall: ToolCallResult, spriteQcSummary: SpriteQcSummary | null): string {
  if (!toolCall.result) {
    return "等待中"
  }
  if (spriteQcSummary?.status === "warning") {
    return "有警告"
  }
  if (toolCall.result.success) {
    return "成功"
  }
  return "失败"
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const spriteQcSummary = getSpriteQcSummary(toolCall)
  const spriteManifestPath = getSpriteManifestPath(toolCall)
  const statusIcon = getStatusIcon(toolCall, spriteQcSummary)
  const statusLabel = getStatusLabel(toolCall, spriteQcSummary)
  const hasResult = toolCall.result !== undefined

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] transition-colors hover:bg-[var(--color-bg-hover)]"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {isExpanded ? (
          <ChevronDown size={14} className="shrink-0 text-[var(--color-text-secondary)]" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-[var(--color-text-secondary)]" />
        )}
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-bg-subtle)]" title={statusLabel}>
          {statusIcon}
        </span>
        <span className="flex-1 truncate text-xs font-medium text-[var(--color-text-primary)]">
          {toolCall.name}
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
          {statusLabel}
        </span>
      </button>

      {spriteQcSummary && (
        <div className="border-t border-[var(--color-border)] px-3 py-2 text-xs">
          {spriteQcSummary.status === "warning" ? (
            <div className="rounded-[var(--radius-md)] border border-[color:var(--color-warning)]/40 bg-[color:var(--color-warning)]/10 p-2 text-[var(--color-text-primary)]">
              <div className="mb-1 font-semibold text-[var(--color-warning)]">Sprite QC 有警告</div>
              <ul className="list-disc space-y-1 pl-4">
                {spriteQcSummary.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : spriteQcSummary.status === "passed" ? (
            <div className="rounded-[var(--radius-md)] border border-[color:var(--color-success)]/40 bg-[color:var(--color-success)]/10 p-2 font-medium text-[var(--color-success)]">
              Sprite QC 通过
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-2 text-[var(--color-text-secondary)]">
              Sprite QC 未返回可显示的结果
            </div>
          )}
          {spriteManifestPath && (
            <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-2 text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
              QC Manifest: {spriteManifestPath}
            </div>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="border-t border-[var(--color-border)] px-3 py-2">
          <div className="mb-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
              参数
            </div>
            <pre className="max-h-32 overflow-auto rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-2 text-[11px] text-[var(--color-text-primary)]">
              <code>{formatJson(toolCall.arguments)}</code>
            </pre>
          </div>

          {hasResult && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                结果
              </div>
              <pre className="max-h-32 overflow-auto rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-2 text-[11px] text-[var(--color-text-primary)]">
                <code>
                  {toolCall.result!.success
                    ? formatJson(toolCall.result!.data)
                    : toolCall.result!.error ?? "Unknown error"}
                </code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
