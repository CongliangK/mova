export type PerformanceMetadata = Record<string, string | number | boolean | null>

export interface PerformanceSample {
  name: string
  durationMs: number
  startedAtMs: number
  endedAtMs: number
  metadata?: PerformanceMetadata
}

export interface PerformanceSummary {
  name: string
  count: number
  minMs: number
  maxMs: number
  meanMs: number
  p50Ms: number
  p95Ms: number
  totalMs: number
}

export interface PerformanceReport {
  title: string
  generatedAt: string
  environment: string
  summaries: PerformanceSummary[]
  samples: PerformanceSample[]
  budgets?: Record<string, number>
}

export interface PerformanceRecorder {
  mark: (name: string) => void
  measure: (
    name: string,
    startMark: string,
    endMark?: string,
    metadata?: PerformanceMetadata,
  ) => PerformanceSample
  timeSync: <T>(name: string, fn: () => T, metadata?: PerformanceMetadata) => T
  addSample: (sample: PerformanceSample) => void
  getSamples: () => PerformanceSample[]
  summarize: () => PerformanceSummary[]
  createReport: (options?: CreatePerformanceReportOptions) => PerformanceReport
  reset: () => void
}

export interface CreatePerformanceReportOptions {
  title?: string
  environment?: string
  budgets?: Record<string, number>
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now()
}

function roundMs(value: number) {
  return Math.round(value * 1000) / 1000
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))] ?? 0
}

export function summarizePerformanceSamples(
  samples: PerformanceSample[],
): PerformanceSummary[] {
  const grouped = new Map<string, number[]>()
  for (const sample of samples) {
    const values = grouped.get(sample.name) ?? []
    values.push(sample.durationMs)
    grouped.set(sample.name, values)
  }

  return Array.from(grouped.entries())
    .map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b)
      const total = values.reduce((sum, value) => sum + value, 0)
      return {
        name,
        count: values.length,
        minMs: roundMs(sorted[0] ?? 0),
        maxMs: roundMs(sorted[sorted.length - 1] ?? 0),
        meanMs: roundMs(total / values.length),
        p50Ms: roundMs(percentile(sorted, 50)),
        p95Ms: roundMs(percentile(sorted, 95)),
        totalMs: roundMs(total),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function createPerformanceRecorder(): PerformanceRecorder {
  const marks = new Map<string, number>()
  const samples: PerformanceSample[] = []

  return {
    mark: (name) => {
      marks.set(name, nowMs())
    },
    measure: (name, startMark, endMark, metadata) => {
      const startedAtMs = marks.get(startMark)
      if (startedAtMs === undefined) {
        throw new Error(`Missing performance mark: ${startMark}`)
      }
      const endedAtMs = endMark ? marks.get(endMark) : nowMs()
      if (endedAtMs === undefined) {
        throw new Error(`Missing performance mark: ${endMark}`)
      }
      const sample = {
        name,
        durationMs: roundMs(Math.max(0, endedAtMs - startedAtMs)),
        startedAtMs: roundMs(startedAtMs),
        endedAtMs: roundMs(endedAtMs),
        metadata,
      }
      samples.push(sample)
      return sample
    },
    timeSync: (name, fn, metadata) => {
      const startedAtMs = nowMs()
      try {
        return fn()
      } finally {
        const endedAtMs = nowMs()
        samples.push({
          name,
          durationMs: roundMs(Math.max(0, endedAtMs - startedAtMs)),
          startedAtMs: roundMs(startedAtMs),
          endedAtMs: roundMs(endedAtMs),
          metadata,
        })
      }
    },
    addSample: (sample) => {
      samples.push(sample)
    },
    getSamples: () => [...samples],
    summarize: () => summarizePerformanceSamples(samples),
    createReport: (options = {}) => ({
      title: options.title ?? "Mova performance baseline",
      generatedAt: new Date().toISOString(),
      environment:
        options.environment ??
        `${globalThis.navigator?.userAgent ?? "node/jsdom"}`,
      summaries: summarizePerformanceSamples(samples),
      samples: [...samples],
      budgets: options.budgets,
    }),
    reset: () => {
      marks.clear()
      samples.length = 0
    },
  }
}

export function performanceReportToMarkdown(report: PerformanceReport): string {
  const budgetHeader = report.budgets ? " | Budget ms | Status" : ""
  const rows = report.summaries.map((summary) => {
    const budget = report.budgets?.[summary.name]
    const budgetCells =
      budget === undefined
        ? report.budgets
          ? " | - | -"
          : ""
        : ` | ${budget} | ${summary.p95Ms <= budget ? "pass" : "watch"}`
    return `| ${summary.name} | ${summary.count} | ${summary.minMs} | ${summary.meanMs} | ${summary.p50Ms} | ${summary.p95Ms} | ${summary.maxMs}${budgetCells} |`
  })

  return [
    `# ${report.title}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Environment: ${report.environment}`,
    "",
    `| Metric | Count | Min ms | Mean ms | P50 ms | P95 ms | Max ms${budgetHeader} |`,
    `|---|---:|---:|---:|---:|---:|---:${report.budgets ? "|---:|---" : ""} |`,
    ...rows,
    "",
  ].join("\n")
}
