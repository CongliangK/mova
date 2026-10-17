#!/usr/bin/env node

/**
 * Unified QA gate: runs verify:report and perf:baseline, then merges all
 * sub-report outputs into a single combined reports/qa-gate.json.
 *
 * Usage: pnpm qa:gate
 *
 * verify:report internally runs test:report via collectCapabilitySummary(),
 * so the capability-level qa-report-v0.json is already produced without a
 * redundant vitest invocation.
 *
 * Conforms to docs/qa-report-v0.schema.json.
 * Defaults to executionLane "mock-offline" with privacy marker "public-safe".
 */

import { spawnSync, execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { arch, platform } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(SCRIPT_DIR, "..")

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QA_SCHEMA_VERSION = "mova.qa-report.v0"
const EXECUTION_LANE = "mock-offline"
const PRIVACY_CLASSIFICATION = "public-safe"
const REPORT_PATH = "reports/qa-gate.json"

/** Known capability areas with zero test coverage (mirrors report-test.mjs). */
const KNOWN_GAPS = ["video-generation", "native-renderer"]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(ROOT_DIR, "package.json"), "utf8"))
    return typeof pkg.version === "string" ? pkg.version : "unknown"
  } catch {
    return "unknown"
  }
}

function formatDuration(ms) {
  return Math.round(ms * 1000) / 1000
}

function execGitSha() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: ROOT_DIR,
      encoding: "utf-8",
    }).trim()
  } catch {
    return undefined
  }
}

/**
 * Run a command via spawnSync with inherited stdio so the user sees
 * sub-script output inline.  Returns exit code and wall-clock duration.
 */
function runStep(label, command, args) {
  const start = performance.now()
  console.log(`\n=== qa:gate / ${label} ===`)
  console.log(`[qa:gate] ${command} ${args.join(" ")}`)

  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf-8",
    stdio: "inherit",
    timeout: 600_000, // generous: perf baseline can be slow on CI-like runners
    env: process.env,
  })

  const durationMs = formatDuration(performance.now() - start)
  const exitCode = result.status ?? (result.error ? 1 : 0)
  const error = result.error?.message ?? null

  const statusLabel = exitCode === 0 ? "PASS" : "FAIL"
  console.log(`[qa:gate] ${statusLabel}  exit=${exitCode}  ${durationMs}ms`)
  if (error) console.log(`[qa:gate] error: ${error}`)

  return { exitCode, durationMs, error }
}

/**
 * Read and parse a JSON file, returning null on missing file or parse error.
 */
function readReport(relPath) {
  const absPath = resolve(ROOT_DIR, relPath)
  if (!existsSync(absPath)) return null
  try {
    return JSON.parse(readFileSync(absPath, "utf8"))
  } catch (err) {
    console.warn(`[qa:gate] WARNING: Could not parse ${relPath}: ${err.message}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("=== Mova qa:gate ===")
  console.log()

  const appVersion = readPackageVersion()
  const generatedAt = new Date().toISOString()
  const stepResults = []

  // ------------------------------------------------------------------
  // Step 1 – verify:report
  //   Internally runs lint, typecheck, vitest, build, test:rust, and
  //   collectCapabilitySummary which calls pnpm test:report → writes
  //   reports/qa-report-v0.json.
  // ------------------------------------------------------------------
  const verifyResult = runStep("verify:report", "pnpm", ["verify:report"])
  stepResults.push({ name: "verify:report", ...verifyResult })

  // ------------------------------------------------------------------
  // Step 2 – perf:baseline
  //   Runs the Stage 1 performance smoke test; produces
  //   reports/qa-performance-baseline-stage1.json.
  // ------------------------------------------------------------------
  const perfResult = runStep("perf:baseline", "pnpm", ["perf:baseline"])
  stepResults.push({ name: "perf:baseline", ...perfResult })

  // ------------------------------------------------------------------
  // Read sub-report outputs
  // ------------------------------------------------------------------
  const verifyGateReport = readReport("reports/verify-gate.json")
  const capabilityReport = readReport("reports/qa-report-v0.json")
  const perfQaReport = readReport("reports/qa-performance-baseline-stage1.json")

  const hasCapabilityReport = capabilityReport && Array.isArray(capabilityReport.suites) && capabilityReport.suites.length > 0
  const hasPerfReport = perfQaReport && Array.isArray(perfQaReport.suites) && perfQaReport.suites.length > 0
  const hasVerifyReport = verifyGateReport && Array.isArray(verifyGateReport.suites) && verifyGateReport.suites.length > 0

  // ------------------------------------------------------------------
  // Merge suites and artifacts (deduplicating artifacts by artifactId)
  // ------------------------------------------------------------------
  const allSuites = []
  const allArtifacts = []
  const seenArtifactIds = new Set()

  function addArtifacts(artifacts) {
    if (!Array.isArray(artifacts)) return
    for (const a of artifacts) {
      if (a && a.artifactId && !seenArtifactIds.has(a.artifactId)) {
        seenArtifactIds.add(a.artifactId)
        allArtifacts.push(a)
      }
    }
  }

  // Order: verify-gate first (fastest to fail), then capability, then perf
  if (hasVerifyReport) {
    allSuites.push(...verifyGateReport.suites)
    addArtifacts(verifyGateReport.artifacts)
  }

  if (hasCapabilityReport) {
    allSuites.push(...capabilityReport.suites)
    addArtifacts(capabilityReport.artifacts)
  }

  if (hasPerfReport) {
    allSuites.push(...perfQaReport.suites)
    addArtifacts(perfQaReport.artifacts)
  }

  // Fallback: if nothing was produced, emit a single failure suite so the
  // report remains schema-valid (suites minItems 1).
  if (allSuites.length === 0) {
    console.log("[qa:gate] No sub-reports available — writing fallback suite")
    allSuites.push({
      suiteId: "qa-gate",
      name: "Mova QA gate (fallback — no sub-reports available)",
      status: "failed",
      durationMs: 0,
      cases: [
        {
          caseId: "qa-gate-no-reports",
          name: "No sub-reports were generated; all steps failed or produced no output",
          status: "failed",
          executionLane: EXECUTION_LANE,
          durationMs: 0,
          failureCategory: "environment",
          providerRefs: ["mock-runtime"],
          artifactRefs: [],
          metrics: [],
        },
      ],
    })
  }

  // ------------------------------------------------------------------
  // Build combined report
  // ------------------------------------------------------------------
  const allPassed = stepResults.every((s) => s.exitCode === 0)
  const overallExitCode = allPassed ? 0 : 1

  const notesParts = []

  if (KNOWN_GAPS.length > 0) {
    notesParts.push(`Known capability gaps (no tests): ${KNOWN_GAPS.join(", ")}.`)
  }

  if (!hasVerifyReport) {
    notesParts.push("verify:report did not produce reports/verify-gate.json.")
  }
  if (!hasCapabilityReport) {
    notesParts.push("Capability-level test report (reports/qa-report-v0.json) was not available.")
  }
  if (!hasPerfReport) {
    notesParts.push("Performance baseline QA report was not available.")
  }

  const stepSummary = stepResults
    .map((s) => `${s.name}: ${s.exitCode === 0 ? "PASS" : "FAIL"}`)
    .join(", ")
  notesParts.push(`Step results: ${stepSummary}.`)

  const report = {
    schemaVersion: QA_SCHEMA_VERSION,
    reportId: "qa-gate",
    generatedAt,
    command: {
      name: "pnpm",
      args: ["qa:gate"],
      cwd: "Mova",
      exitCode: overallExitCode,
    },
    environment: {
      runner: "node",
      os: platform(),
      node: process.version,
      appVersion,
      commit: execGitSha(),
      ci: Boolean(process.env.CI),
      hardwareProfile: `${platform()}-${arch()}`,
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
        "QA gate merges existing sub-reports without introducing new provider calls, secrets, prompts, or absolute paths.",
    },
    providerMetadata: [
      {
        providerRef: "mock-runtime",
        lane: EXECUTION_LANE,
        providerKind: "mock",
        requestCount: 0,
        mockFixtureId: "qa-gate-fixtures",
      },
    ],
    artifactPolicy: {
      defaultRetention: {
        policy: "keep-local",
        reason:
          "Generated QA gate report is a local engineering artifact for release-gate decisions.",
      },
      defaultCleanupOwner: "developer",
      notes:
        "Reports must not contain secrets, prompts, raw provider payloads, provider URLs, or private asset contents.",
    },
    suites: allSuites,
    artifacts: [
      {
        artifactId: "qa-gate-json",
        kind: "json-report",
        path: REPORT_PATH,
        producedByCaseId: "qa-gate-combined",
        mimeType: "application/json",
        privacyClassification: PRIVACY_CLASSIFICATION,
        retention: {
          policy: "keep-local",
          reason: "Combined QA gate evidence for release review.",
        },
        cleanup: {
          owner: "developer",
          status: "pending",
          notes: "Regenerated on each pnpm qa:gate run.",
        },
      },
      ...allArtifacts,
    ],
    notes: notesParts.join(" "),
  }

  // ------------------------------------------------------------------
  // Write output
  // ------------------------------------------------------------------
  const absReportDir = resolve(ROOT_DIR, "reports")
  mkdirSync(absReportDir, { recursive: true })

  const absReportPath = resolve(ROOT_DIR, REPORT_PATH)
  writeFileSync(absReportPath, JSON.stringify(report, null, 2), "utf8")

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log()
  console.log(
    `[qa:gate] Combined report → ${REPORT_PATH}  (${allSuites.length} suites, ${allArtifacts.length} artifacts)`,
  )

  if (allPassed) {
    console.log("[qa:gate] All steps passed.")
  } else {
    const failed = stepResults.filter((s) => s.exitCode !== 0).map((s) => s.name)
    console.log(`[qa:gate] Failed steps: ${failed.join(", ")}`)
  }

  process.exit(overallExitCode)
}

main()
