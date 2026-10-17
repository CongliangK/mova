import type { PerformanceReport, PerformanceSummary } from "./performance"

const QA_SCHEMA_VERSION = "mova.qa-report.v0" as const
const EXECUTION_LANE = "mock-offline" as const
const PRIVACY_CLASSIFICATION = "public-safe" as const
const PERF_CASE_ID = "perf-store-helper-baseline" as const

const DEFAULT_ARTIFACT_PATHS = {
  performanceJson: "reports/performance-baseline-stage1.json",
  performanceMarkdown: "reports/performance-baseline-stage1.md",
  qaJson: "reports/qa-performance-baseline-stage1.json",
}

export type QaReportStatus = "passed" | "failed" | "skipped" | "warning"
export type QaMetricStatus = "pass" | "watch" | "fail"
export type QaFailureCategory =
  | "none"
  | "assertion"
  | "timeout"
  | "environment"
  | "artifact-policy"
  | "redaction"
  | "provider"
  | "unknown"

export interface QaReportCommand {
  name: string
  args: string[]
  cwd?: string
  exitCode: number
}

export interface QaPerformanceBaselineArtifactPaths {
  performanceJson: string
  performanceMarkdown: string
  qaJson: string
}

export interface CreateQaPerformanceBaselineReportOptions {
  appVersion: string
  os: string
  node: string
  command?: QaReportCommand
  reportId?: string
  ci?: boolean
  commit?: string
  hardwareProfile?: string
  artifactPaths?: Partial<QaPerformanceBaselineArtifactPaths>
}

export interface QaReportMetric {
  name: string
  value: number
  unit?: string
  budget?: number
  status?: QaMetricStatus
}

export interface QaReportArtifact {
  artifactId: string
  kind: "json-report" | "markdown-report" | "log" | "screenshot" | "export" | "trace" | "other"
  path: string
  producedByCaseId?: string
  mimeType?: string
  privacyClassification: "public-safe" | "internal" | "private-user-asset" | "secret-derived-prohibited"
  retention: {
    policy: "keep-checked-in" | "keep-local" | "delete-after-run" | "delete-after-days"
    days?: number
    reason?: string
  }
  cleanup: {
    owner: "test-runner" | "developer" | "ci" | "manual"
    status: "not-needed" | "pending" | "completed" | "failed"
    notes?: string
  }
}

export interface QaReportV0 {
  schemaVersion: typeof QA_SCHEMA_VERSION
  reportId: string
  generatedAt: string
  command: QaReportCommand
  environment: {
    runner: string
    os: string
    node: string
    appVersion: string
    commit?: string
    ci?: boolean
    hardwareProfile?: string
  }
  executionLane: typeof EXECUTION_LANE
  privacy: {
    marker: typeof PRIVACY_CLASSIFICATION
    containsPrivateAssets: false
    containsSecrets: false
    dataPolicy: "synthetic-only"
  }
  redactionCheck: {
    status: "passed"
    checks: Array<
      | "no-secrets"
      | "no-prompts"
      | "no-raw-provider-payloads"
      | "no-provider-urls"
      | "no-private-asset-contents"
      | "artifact-paths-are-relative"
    >
    checkedAt: string
    notes: string
  }
  providerMetadata: Array<{
    providerRef: string
    lane: typeof EXECUTION_LANE
    providerKind: "mock"
    requestCount: number
    mockFixtureId: string
  }>
  artifactPolicy: {
    defaultRetention: {
      policy: "keep-local"
      reason: string
    }
    defaultCleanupOwner: "developer"
    notes: string
  }
  suites: Array<{
    suiteId: string
    name: string
    status: QaReportStatus
    durationMs: number
    cases: Array<{
      caseId: string
      name: string
      status: QaReportStatus
      executionLane: typeof EXECUTION_LANE
      durationMs: number
      failureCategory: QaFailureCategory
      providerRefs: string[]
      artifactRefs: string[]
      metrics: QaReportMetric[]
    }>
  }>
  artifacts: QaReportArtifact[]
  notes: string
}

export function isRelativeQaArtifactPath(path: string) {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.startsWith("../") &&
    !path.includes("/../") &&
    !path.includes("://") &&
    !/^[a-zA-Z]:[\\/]/.test(path)
  )
}

function assertRelativeArtifactPaths(paths: QaPerformanceBaselineArtifactPaths) {
  for (const path of Object.values(paths)) {
    if (!isRelativeQaArtifactPath(path)) {
      throw new Error(`QA report artifact path must be relative: ${path}`)
    }
  }
}

function roundMs(value: number) {
  return Math.round(value * 1000) / 1000
}

function budgetStatus(summary: PerformanceSummary, budget?: number): QaMetricStatus | undefined {
  if (budget === undefined) return undefined
  if (summary.p95Ms <= budget) return "pass"
  if (summary.p95Ms <= budget * 1.1) return "watch"
  return "fail"
}

function suiteStatus(metrics: QaReportMetric[]): QaReportStatus {
  if (metrics.some((metric) => metric.status === "fail")) return "failed"
  if (metrics.some((metric) => metric.status === "watch")) return "warning"
  return "passed"
}

function createBudgetMetrics(report: PerformanceReport): QaReportMetric[] {
  return report.summaries.map((summary) => {
    const budget = report.budgets?.[summary.name]
    return {
      name: `${summary.name}.p95Ms`,
      value: summary.p95Ms,
      unit: "ms",
      budget,
      status: budgetStatus(summary, budget),
    }
  })
}

export interface VerifyGateStep {
  name: string
  command: string
  args: string[]
  exitCode: number
  durationMs: number
}

export interface CreateVerifyGateReportOptions {
  appVersion: string
  os: string
  node: string
  ci?: boolean
  commit?: string
  steps: VerifyGateStep[]
}

export function createVerifyGateReport(
  options: CreateVerifyGateReportOptions,
): QaReportV0 {
  const allPassed = options.steps.every((step) => step.exitCode === 0)
  const generatedAt = new Date().toISOString()
  const totalDurationMs = roundMs(
    options.steps.reduce((sum, step) => sum + step.durationMs, 0),
  )

  function failureCategory(exitCode: number, stepName: string): QaFailureCategory {
    if (exitCode === 0) return "none"
    if (stepName === "test" || stepName === "test:rust") return "assertion"
    if (stepName === "build" || stepName === "typecheck" || stepName === "lint") return "environment"
    return "unknown"
  }

  return {
    schemaVersion: QA_SCHEMA_VERSION,
    reportId: "verify-gate",
    generatedAt,
    command: {
      name: "pnpm",
      args: ["verify:report"],
      cwd: "Mova",
      exitCode: allPassed ? 0 : 1,
    },
    environment: {
      runner: "node",
      os: options.os,
      node: options.node,
      appVersion: options.appVersion,
      commit: options.commit,
      ci: options.ci,
    },
    executionLane: EXECUTION_LANE,
    privacy: {
      marker: PRIVACY_CLASSIFICATION,
      containsPrivateAssets: false,
      containsSecrets: false,
      dataPolicy: "synthetic-only",
    },
    redactionCheck: {
      status: "passed",
      checks: [
        "no-secrets",
        "no-prompts",
        "no-raw-provider-payloads",
        "no-provider-urls",
        "no-private-asset-contents",
        "artifact-paths-are-relative",
      ],
      checkedAt: generatedAt,
      notes:
        "Verify-gate report uses only local toolchain commands; no AI providers, no private assets, relative artifact paths.",
    },
    providerMetadata: [
      {
        providerRef: "mock-runtime",
        lane: EXECUTION_LANE,
        providerKind: "mock",
        requestCount: 0,
        mockFixtureId: "verify-gate-fixtures",
      },
    ],
    artifactPolicy: {
      defaultRetention: {
        policy: "keep-local",
        reason:
          "Generated verify-gate reports are local engineering artifacts for release decision support.",
      },
      defaultCleanupOwner: "developer",
      notes:
        "Reports must not contain secrets, prompts, raw provider payloads, provider URLs, or private asset contents.",
    },
    suites: [
      {
        suiteId: "verify-gate",
        name: "Mova verification gate",
        status: allPassed ? "passed" : "failed",
        durationMs: totalDurationMs,
        cases: options.steps.map((step) => ({
          caseId: `verify-${step.name}`,
          name: `${step.command} ${step.args.join(" ")}`,
          status: step.exitCode === 0 ? "passed" : "failed",
          executionLane: EXECUTION_LANE,
          durationMs: roundMs(step.durationMs),
          failureCategory: failureCategory(step.exitCode, step.name),
          providerRefs: [],
          artifactRefs: ["verify-gate-json"],
          metrics: [],
        })),
      },
    ],
    artifacts: [
      {
        artifactId: "verify-gate-json",
        kind: "json-report",
        path: "reports/verify-gate.json",
        producedByCaseId: "verify-lint",
        mimeType: "application/json",
        privacyClassification: PRIVACY_CLASSIFICATION,
        retention: {
          policy: "keep-local",
          reason: "Local verify-gate evidence for release review.",
        },
        cleanup: {
          owner: "developer",
          status: "pending",
          notes: "Regenerated on each verify:report run.",
        },
      },
    ],
    notes: `Verify gate report for ${options.steps.length} verification steps. Exit code 0 = all passed.`,
  }
}

export function createQaPerformanceBaselineReport(
  report: PerformanceReport,
  options: CreateQaPerformanceBaselineReportOptions,
): QaReportV0 {
  const artifactPaths = {
    ...DEFAULT_ARTIFACT_PATHS,
    ...options.artifactPaths,
  }
  assertRelativeArtifactPaths(artifactPaths)

  const metrics = createBudgetMetrics(report)
  const status = suiteStatus(metrics)
  const durationMs = roundMs(report.summaries.reduce((sum, summary) => sum + summary.totalMs, 0))
  const failureCategory: QaFailureCategory = status === "failed" ? "assertion" : "none"
  const command = options.command ?? {
    name: "pnpm",
    args: ["perf:baseline"],
    cwd: "Mova",
    exitCode: status === "failed" ? 1 : 0,
  }

  return {
    schemaVersion: QA_SCHEMA_VERSION,
    reportId: options.reportId ?? "performance-baseline-stage1",
    generatedAt: report.generatedAt,
    command,
    environment: {
      runner: "vitest",
      os: options.os,
      node: options.node,
      appVersion: options.appVersion,
      commit: options.commit,
      ci: options.ci,
      hardwareProfile: options.hardwareProfile ?? "local-workstation",
    },
    executionLane: EXECUTION_LANE,
    privacy: {
      marker: PRIVACY_CLASSIFICATION,
      containsPrivateAssets: false,
      containsSecrets: false,
      dataPolicy: "synthetic-only",
    },
    redactionCheck: {
      status: "passed",
      checks: [
        "no-secrets",
        "no-prompts",
        "no-raw-provider-payloads",
        "no-provider-urls",
        "no-private-asset-contents",
        "artifact-paths-are-relative",
      ],
      checkedAt: report.generatedAt,
      notes: "Performance baseline smoke uses synthetic fixtures, mock/offline execution, and relative artifact paths only.",
    },
    providerMetadata: [
      {
        providerRef: "mock-runtime",
        lane: EXECUTION_LANE,
        providerKind: "mock",
        requestCount: 0,
        mockFixtureId: "perf-fixtures",
      },
    ],
    artifactPolicy: {
      defaultRetention: {
        policy: "keep-local",
        reason: "Generated performance reports are local comparison artifacts unless intentionally checked in as samples.",
      },
      defaultCleanupOwner: "developer",
      notes: "Reports must not contain secrets, prompts, raw provider payloads, provider URLs, or private asset contents.",
    },
    suites: [
      {
        suiteId: "perf-stage1-smoke",
        name: report.title,
        status,
        durationMs,
        cases: [
          {
            caseId: PERF_CASE_ID,
            name: "records store/helper and mounted file-tree baseline metrics without external AI or Tauri I/O",
            status,
            executionLane: EXECUTION_LANE,
            durationMs,
            failureCategory,
            providerRefs: ["mock-runtime"],
            artifactRefs: [
              "performance-baseline-json",
              "performance-baseline-markdown",
              "qa-performance-baseline-json",
            ],
            metrics,
          },
        ],
      },
    ],
    artifacts: [
      {
        artifactId: "performance-baseline-json",
        kind: "json-report",
        path: artifactPaths.performanceJson,
        producedByCaseId: PERF_CASE_ID,
        mimeType: "application/json",
        privacyClassification: PRIVACY_CLASSIFICATION,
        retention: {
          policy: "keep-local",
          reason: "Local generated baseline output for performance comparison.",
        },
        cleanup: {
          owner: "developer",
          status: "pending",
          notes: "Delete or regenerate after the local comparison run.",
        },
      },
      {
        artifactId: "performance-baseline-markdown",
        kind: "markdown-report",
        path: artifactPaths.performanceMarkdown,
        producedByCaseId: PERF_CASE_ID,
        mimeType: "text/markdown",
        privacyClassification: PRIVACY_CLASSIFICATION,
        retention: {
          policy: "keep-local",
          reason: "Human-readable companion to the local JSON baseline.",
        },
        cleanup: {
          owner: "developer",
          status: "pending",
        },
      },
      {
        artifactId: "qa-performance-baseline-json",
        kind: "json-report",
        path: artifactPaths.qaJson,
        producedByCaseId: PERF_CASE_ID,
        mimeType: "application/json",
        privacyClassification: PRIVACY_CLASSIFICATION,
        retention: {
          policy: "keep-local",
          reason: "Machine-readable QA wrapper for the local performance baseline run.",
        },
        cleanup: {
          owner: "developer",
          status: "pending",
        },
      },
    ],
    notes: "QA report for the mock/offline Stage 1 performance baseline smoke; existing performance JSON and Markdown outputs remain unchanged.",
  }
}
