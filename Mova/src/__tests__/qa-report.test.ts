import { describe, expect, it } from "vitest"
import {
  createVerifyGateReport,
  isRelativeQaArtifactPath,
  type QaReportV0,
  type VerifyGateStep,
} from "../utils/qa-report"

const SAMPLE_STEPS: VerifyGateStep[] = [
  { name: "lint", command: "pnpm", args: ["lint"], exitCode: 0, durationMs: 1500 },
  { name: "typecheck", command: "pnpm", args: ["typecheck"], exitCode: 0, durationMs: 3200 },
  { name: "test", command: "pnpm", args: ["test"], exitCode: 0, durationMs: 8500 },
  { name: "build", command: "pnpm", args: ["build"], exitCode: 0, durationMs: 4200 },
  { name: "test:rust", command: "pnpm", args: ["test:rust"], exitCode: 0, durationMs: 600 },
]

const SAMPLE_OPTIONS = {
  appVersion: "0.1.1",
  os: "linux",
  node: "v24.0.0",
  ci: false,
}

function validateReportShape(report: QaReportV0) {
  // Top-level required fields
  expect(report.schemaVersion).toBe("mova.qa-report.v0")
  expect(typeof report.reportId).toBe("string")
  expect(typeof report.generatedAt).toBe("string")

  // Command shape
  expect(report.command).toMatchObject({
    name: expect.any(String),
    args: expect.any(Array),
    exitCode: expect.any(Number),
  })

  // Environment shape
  expect(report.environment).toMatchObject({
    runner: expect.any(String),
    os: expect.any(String),
    node: expect.any(String),
    appVersion: expect.any(String),
  })

  // Execution lane
  expect(report.executionLane).toBe("mock-offline")

  // Privacy
  expect(report.privacy).toMatchObject({
    marker: "public-safe",
    containsPrivateAssets: false,
    containsSecrets: false,
    dataPolicy: "synthetic-only",
  })

  // Redaction check
  expect(report.redactionCheck).toMatchObject({
    status: "passed",
    checks: expect.arrayContaining([
      "no-secrets",
      "no-prompts",
      "no-raw-provider-payloads",
      "no-provider-urls",
      "no-private-asset-contents",
      "artifact-paths-are-relative",
    ]),
    checkedAt: expect.any(String),
    notes: expect.any(String),
  })

  // Provider metadata
  expect(report.providerMetadata).toBeInstanceOf(Array)
  for (const pm of report.providerMetadata) {
    expect(pm).toMatchObject({
      providerRef: expect.any(String),
      lane: "mock-offline",
      providerKind: "mock",
      requestCount: 0,
      mockFixtureId: expect.any(String),
    })
  }

  // Artifact policy
  expect(report.artifactPolicy).toMatchObject({
    defaultRetention: {
      policy: expect.any(String),
      reason: expect.any(String),
    },
    defaultCleanupOwner: "developer",
    notes: expect.any(String),
  })
}

describe("QA report schema validation", () => {
  it("produces a valid QaReportV0 schema for a verify-gate all-passed run", () => {
    const report = createVerifyGateReport({
      ...SAMPLE_OPTIONS,
      steps: SAMPLE_STEPS,
    })

    validateReportShape(report)

    expect(report.reportId).toBe("verify-gate")
    expect(report.command.exitCode).toBe(0)
    expect(report.environment.os).toBe("linux")
    expect(report.environment.node).toBe("v24.0.0")

    // Suite
    expect(report.suites).toHaveLength(1)
    const suite = report.suites[0]!
    expect(suite.suiteId).toBe("verify-gate")
    expect(suite.status).toBe("passed")
    expect(suite.cases).toHaveLength(5)

    // Each case maps to a step
    for (const c of suite.cases) {
      expect(c.status).toBe("passed")
      expect(c.failureCategory).toBe("none")
      expect(c.executionLane).toBe("mock-offline")
      expect(c.durationMs).toBeGreaterThan(0)
      expect(c.artifactRefs).toEqual(["verify-gate-json"])
    }

    // Case IDs match step names
    const caseIds = suite.cases.map((c) => c.caseId)
    expect(caseIds).toEqual([
      "verify-lint",
      "verify-typecheck",
      "verify-test",
      "verify-build",
      "verify-test:rust",
    ])

    // Duration is sum of step durations
    const expectedTotal = SAMPLE_STEPS.reduce((sum, s) => sum + s.durationMs, 0)
    expect(Math.abs(suite.durationMs - expectedTotal)).toBeLessThan(1)
  })

  it("marks suite as failed and sets failure categories when any step fails", () => {
    const stepsWithFailure: VerifyGateStep[] = [
      { name: "lint", command: "pnpm", args: ["lint"], exitCode: 0, durationMs: 1000 },
      { name: "typecheck", command: "pnpm", args: ["typecheck"], exitCode: 2, durationMs: 3000 },
      { name: "test", command: "pnpm", args: ["test"], exitCode: 0, durationMs: 5000 },
    ]

    const report = createVerifyGateReport({
      ...SAMPLE_OPTIONS,
      steps: stepsWithFailure,
    })

    validateReportShape(report)

    expect(report.command.exitCode).toBe(1)

    const suite = report.suites[0]!
    expect(suite.status).toBe("failed")

    // typecheck failure should be "environment"
    const typecheckCase = suite.cases.find((c) => c.caseId === "verify-typecheck")
    expect(typecheckCase).toBeDefined()
    expect(typecheckCase!.status).toBe("failed")
    expect(typecheckCase!.failureCategory).toBe("environment")

    // Passing cases should be "none"
    const lintCase = suite.cases.find((c) => c.caseId === "verify-lint")
    expect(lintCase!.status).toBe("passed")
    expect(lintCase!.failureCategory).toBe("none")
  })

  it("sets failureCategory 'assertion' for test step failures", () => {
    const steps: VerifyGateStep[] = [
      { name: "lint", command: "pnpm", args: ["lint"], exitCode: 0, durationMs: 1000 },
      { name: "test", command: "pnpm", args: ["test"], exitCode: 1, durationMs: 5000 },
    ]

    const report = createVerifyGateReport({ ...SAMPLE_OPTIONS, steps })
    const testCase = report.suites[0]!.cases.find((c) => c.caseId === "verify-test")
    expect(testCase!.failureCategory).toBe("assertion")
  })

  it("sets failureCategory 'assertion' for test:rust step failures", () => {
    const steps: VerifyGateStep[] = [
      { name: "test:rust", command: "pnpm", args: ["test:rust"], exitCode: 101, durationMs: 500 },
    ]

    const report = createVerifyGateReport({ ...SAMPLE_OPTIONS, steps })
    const rustCase = report.suites[0]!.cases[0]!
    expect(rustCase.failureCategory).toBe("assertion")
  })

  it("enforces relative artifact paths", () => {
    const report = createVerifyGateReport({
      ...SAMPLE_OPTIONS,
      steps: SAMPLE_STEPS,
    })

    for (const artifact of report.artifacts) {
      expect(artifact.path).toBe("reports/verify-gate.json")
      expect(isRelativeQaArtifactPath(artifact.path)).toBe(true)
      expect(artifact.path).not.toMatch(/^\//)
      expect(artifact.path).not.toMatch(/^[a-zA-Z]:[\\/]/)
      expect(artifact.path).not.toContain("://")
      expect(artifact.path).not.toContain("../")
    }
  })

  it("enforces public-safe privacy classification on all artifacts", () => {
    const report = createVerifyGateReport({
      ...SAMPLE_OPTIONS,
      steps: SAMPLE_STEPS,
    })

    for (const artifact of report.artifacts) {
      expect(artifact.privacyClassification).toBe("public-safe")
    }

    expect(report.privacy.marker).toBe("public-safe")
    expect(report.privacy.containsPrivateAssets).toBe(false)
    expect(report.privacy.containsSecrets).toBe(false)
  })

  it("enforces all redaction checks are present", () => {
    const report = createVerifyGateReport({
      ...SAMPLE_OPTIONS,
      steps: SAMPLE_STEPS,
    })

    const requiredChecks = [
      "no-secrets",
      "no-prompts",
      "no-raw-provider-payloads",
      "no-provider-urls",
      "no-private-asset-contents",
      "artifact-paths-are-relative",
    ]

    for (const check of requiredChecks) {
      expect(report.redactionCheck.checks).toContain(check)
    }

    expect(report.redactionCheck.status).toBe("passed")
    expect(report.redactionCheck.checkedAt).toBe(report.generatedAt)
  })

  it("rejects absolute artifact paths via isRelativeQaArtifactPath helper", () => {
    expect(isRelativeQaArtifactPath("/tmp/report.json")).toBe(false)
    expect(isRelativeQaArtifactPath("C:\\Users\\report.json")).toBe(false)
    expect(isRelativeQaArtifactPath("https://example.com/report.json")).toBe(false)
    expect(isRelativeQaArtifactPath("../reports/report.json")).toBe(false)
    expect(isRelativeQaArtifactPath("reports/../secrets.json")).toBe(false)

    expect(isRelativeQaArtifactPath("reports/verify-gate.json")).toBe(true)
    expect(isRelativeQaArtifactPath("reports/performance-baseline-stage1.json")).toBe(true)
    expect(isRelativeQaArtifactPath("")).toBe(false)
  })

  it("handles empty steps gracefully", () => {
    const report = createVerifyGateReport({
      ...SAMPLE_OPTIONS,
      steps: [],
    })

    validateReportShape(report)
    expect(report.command.exitCode).toBe(0)
    expect(report.suites[0]!.status).toBe("passed")
    expect(report.suites[0]!.cases).toHaveLength(0)
    expect(report.suites[0]!.durationMs).toBe(0)
  })

  it("propagates ci and commit fields when provided", () => {
    const report = createVerifyGateReport({
      ...SAMPLE_OPTIONS,
      steps: SAMPLE_STEPS,
      ci: true,
      commit: "abc123def456",
    })

    expect(report.environment.ci).toBe(true)
    expect(report.environment.commit).toBe("abc123def456")
  })

  it("excludes ci and commit when not provided", () => {
    const report = createVerifyGateReport({
      ...SAMPLE_OPTIONS,
      steps: SAMPLE_STEPS,
    })

    expect(report.environment.ci).toBe(false)
    expect(report.environment.commit).toBeUndefined()
  })
})
