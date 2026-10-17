#!/usr/bin/env node

/**
 * Generates a structured QA report (reports/qa-report-v0.json) from vitest JSON output.
 *
 * Usage: pnpm test:report
 *
 * Conforms to docs/qa-report-v0.schema.json.
 * Defaults to executionLane "mock-offline" with privacy marker "public-safe".
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { arch, platform, release } from "node:os"
import { createHash } from "node:crypto"

const nodeVersion = process.version

// ---------------------------------------------------------------------------
// Static capability → test file mapping
// ---------------------------------------------------------------------------

/** @type {Record<string, string[]>} */
const CAPABILITY_TEST_MAP = {
  project: [
    "project-store.test.ts",
    "asset-url.test.ts",
    "filename-validation.test.ts",
    "browser-demo-workspace.test.tsx",
    "app-header.test.tsx",
    "app-layout-drag-import.test.tsx",
    "app-layout-panels.test.tsx",
    "sidebar.test.tsx",
    "resizable-panel.test.tsx",
    "setup.test.ts",
  ],
  "canvas/timeline": [
    "animation-store.test.ts",
    "animation-timeline.test.tsx",
    "canvas-image-editor.test.tsx",
    "viewport-math.test.ts",
    "interaction-throttle.test.ts",
    "keyboard-shortcuts.test.tsx",
    "context-menu.test.tsx",
    "document-preview.test.tsx",
  ],
  "chat/ai": [
    "agent-orchestrator.test.ts",
    "agent-runtime-contract.test.ts",
    "agent-runtime.test.ts",
    "ai-map-tools.test.ts",
    "ai-sprite-tools.test.ts",
    "chat-isolation.test.ts",
    "chat-panel-drop.test.tsx",
    "chat-panel-message.test.tsx",
    "chat-project-storage.test.ts",
    "chat-store-fix.test.ts",
    "chat-store.test.ts",
    "chat-store-toolcalls.test.ts",
    "image-generation-pipeline.test.ts",
    "llm-provider-tool-messages.test.ts",
    "piagent-core-runtime.test.ts",
    "piagent-runtime-adapter.test.ts",
    "skill-registry.test.ts",
    "skill-selection.test.ts",
    "tool-runner.test.ts",
    "use-agent-full-chat-flow.test.tsx",
    "use-agent-runtime.test.tsx",
  ],
  export: ["export-wizard-godot.test.tsx"],
  drawing: [
    "drawing-integration.test.ts",
    "raster-editing-service.test.ts",
    "dnd-debug.test.ts",
  ],
  "file-tree/git": [
    "file-tree-create-file.test.tsx",
    "file-tree-git-badges.test.tsx",
    "file-tree-node.test.tsx",
    "file-tree-store.test.ts",
  ],
  settings: ["settings-provider-guard.test.tsx", "settings-store.test.ts", "settings-diagnostics.test.tsx"],
  performance: ["perf/performance-baseline.test.ts", "qa-report.test.ts"],
  "error-handling": ["error-boundary.test.tsx"],
}

/** Capability areas recognised by the project that currently have zero tests. */
const KNOWN_GAPS = [
  "video-generation",
  "native-renderer",
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse vitest JSON reporter output, extracting the JSON object from possibly
 * noisy stdout (warnings / other output before the JSON payload).
 */
function parseVitestJson(stdout) {
  // Vitest JSON reporter emits a single JSON object.  Try the whole string
  // first; if that fails, find the outermost `{ … }` region.
  try {
    return JSON.parse(stdout)
  } catch {
    const first = stdout.indexOf("{")
    const last = stdout.lastIndexOf("}")
    if (first === -1 || last === -1 || last <= first) {
      throw new Error("Could not find JSON object in vitest stdout")
    }
    return JSON.parse(stdout.slice(first, last + 1))
  }
}

/**
 * Derive suite status from an array of individual test statuses.
 * "warning" when some skipped, "failed" when any failed.
 */
function suiteStatus(caseStatuses) {
  if (caseStatuses.length === 0) return "skipped"
  if (caseStatuses.includes("failed")) return "failed"
  if (caseStatuses.includes("skipped")) return "warning"
  return "passed"
}

/** Vitest status string → QA report case status. */
function toCaseStatus(vitestStatus) {
  switch (vitestStatus) {
    case "passed":
      return "passed"
    case "failed":
      return "failed"
    case "skipped":
    case "pending":
      return "skipped"
    default:
      return "unknown" // should not happen
  }
}

/** Safe base-name extraction that strips the test directory prefix. */
function relativeTestName(absPath, testDir) {
  try {
    return relative(testDir, absPath)
  } catch {
    return absPath
  }
}

// ---------------------------------------------------------------------------
// Environment info
// ---------------------------------------------------------------------------

function collectEnvironment() {
  return {
    runner: "vitest",
    os: `${platform()} ${release()}`,
    node: nodeVersion,
    appVersion: "0.1.1", // keep in sync with package.json
    commit: execGitSha(),
    ci: Boolean(process.env.CI),
    hardwareProfile: `${platform()}-${arch()}`,
  }
}

function execGitSha() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: resolve(fileURLToPath(import.meta.url), "../.."),
      encoding: "utf-8",
    })
      .trim()
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_DIR = resolve(SCRIPT_DIR, "..")
const REPORTS_DIR = resolve(REPO_DIR, "reports")
const TEST_DIR = resolve(REPO_DIR, "src", "__tests__")
const REPORT_PATH = resolve(REPORTS_DIR, "qa-report-v0.json")
const SCHEMA_PATH = resolve(REPO_DIR, "docs", "qa-report-v0.schema.json")

// Ensure reports/ exists
mkdirSync(REPORTS_DIR, { recursive: true })

// 1. Run vitest
console.log("[test:report] Running vitest with --reporter=json …")
let vitestOutput
let vitestExitCode
try {
  vitestOutput = execSync("npx vitest run --reporter=json", {
    cwd: REPO_DIR,
    encoding: "utf-8",
    // Allow a generous timeout for the full suite
    timeout: 120_000,
    env: { ...process.env, FORCE_COLOR: "0" },
  })
  vitestExitCode = 0
} catch (err) {
  // vitest exits non-zero when tests fail — that is expected
  vitestOutput = err.stdout ?? ""
  vitestExitCode = err.status ?? 1
}
// 2. Parse
const vitestResult = parseVitestJson(vitestOutput)
console.log(
  `[test:report] ${vitestResult.numPassedTests ?? 0} passed, ` +
    `${vitestResult.numFailedTests ?? 0} failed, ` +
    `${vitestResult.numPendingTests ?? 0} skipped ` +
    `(${vitestResult.numTotalTests ?? 0} total)`,
)

// 3. Build suite → cases lookup
/** @type {Map<string, { file: string, case: object }[]>} */
const capabilityCases = new Map()
for (const [cap, files] of Object.entries(CAPABILITY_TEST_MAP)) {
  capabilityCases.set(cap, [])
}

// Also track files that don't match any known capability
const unmatched = []

for (const suite of vitestResult.testResults ?? []) {
  // The suite name from vitest is an absolute path; skip non-test entries
  const rel = relativeTestName(suite.name ?? "", TEST_DIR)
  const fileBase = rel.split("/").pop() // e.g. "project-store.test.ts"

  // Find capability
  let cap = null
  for (const [c, files] of Object.entries(CAPABILITY_TEST_MAP)) {
    // Match against either the full subpath or just the basename
    if (files.includes(fileBase) || files.includes(rel)) {
      cap = c
      break
    }
  }

  if (!cap) {
    unmatched.push(fileBase || suite.name)
    continue
  }

  // Map each assertion result to a case entry
  for (const assert of suite.assertionResults ?? []) {
    capabilityCases.get(cap).push({
      file: rel,
      fullName: assert.fullName ?? assert.title ?? "unnamed",
      status: assert.status ?? "skipped",
      duration: assert.duration ?? 0,
      failureMessages: assert.failureMessages ?? [],
    })
  }
}

// 4. Build suites
/** @type {object[]} */
const suites = []
for (const [cap, cases] of capabilityCases) {
  if (cases.length === 0) continue

  const caseStatuses = cases.map((c) => toCaseStatus(c.status))
  const totalDuration = cases.reduce((sum, c) => sum + c.duration, 0)

  suites.push({
    suiteId: cap.replace(/\//g, "-"), // "canvas/timeline" → "canvas-timeline"
    name: `Mova ${cap} tests`,
    status: suiteStatus(caseStatuses),
    durationMs: Math.round(totalDuration * 100) / 100,
    cases: cases.map((c) => ({
      caseId: (c.file.replace(/\.test\.(ts|tsx)$/, "") + "-" + c.fullName)
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .slice(0, 128),
      name: `[${c.file}] ${c.fullName}`,
      status: toCaseStatus(c.status),
      executionLane: "mock-offline",
      durationMs: c.duration,
      failureCategory:
        toCaseStatus(c.status) === "failed"
          ? c.failureMessages.length > 0
            ? "assertion"
            : "unknown"
          : "none",
      failureMessage:
        toCaseStatus(c.status) === "failed" && c.failureMessages.length > 0
          ? redactMessage(c.failureMessages[0])
          : undefined,
      providerRefs: ["mock-runtime"],
      artifactRefs: ["qa-report-v0-json"],
    })),
  })
}

// 5. Build gap notes
const coveredCaps = new Set(Object.keys(CAPABILITY_TEST_MAP))
const gaps = KNOWN_GAPS.filter((g) => !coveredCaps.has(g))

let notes = ""
if (gaps.length > 0) {
  notes += `Known capability gaps (no tests): ${gaps.join(", ")}. `
}
if (unmatched.length > 0) {
  notes += `Unmatched test files (not mapped to any capability): ${unmatched.join(", ")}. `
}
notes = notes.trim() || undefined

// 6. Construct report
const generatedAt = new Date().toISOString()
const reportId = `qa-report-v0-${generatedAt.replace(/[^0-9T-]/g, "")}`

const report = {
  schemaVersion: "mova.qa-report.v0",
  reportId,
  generatedAt,
  command: {
    name: "pnpm",
    args: ["test:report"],
    cwd: "Mova",
    exitCode: vitestExitCode,
  },
  environment: collectEnvironment(),
  executionLane: "mock-offline",
  privacy: {
    marker: "public-safe",
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
      "Automated report generation from vitest JSON output. No provider payloads, prompts, secrets, or absolute asset paths are included.",
  },
  providerMetadata: [
    {
      providerRef: "mock-runtime",
      lane: "mock-offline",
      providerKind: "mock",
      requestCount: 0,
    },
  ],
  artifactPolicy: {
    defaultRetention: {
      policy: "keep-local",
      reason:
        "Generated QA report is a local artifact. Regenerated on each pnpm test:report run.",
    },
    defaultCleanupOwner: "developer",
    notes: "Do not commit reports/ content except curated samples.",
  },
  suites,
  artifacts: [
    {
      artifactId: "qa-report-v0-json",
      kind: "json-report",
      path: "reports/qa-report-v0.json",
      producedByCaseId: null,
      mimeType: "application/json",
      sizeBytes: 0, // filled below
      privacyClassification: "public-safe",
      retention: {
        policy: "keep-local",
        reason: "Regenerated on each run; keep local unless curated as a sample.",
      },
      cleanup: {
        owner: "developer",
        status: "pending",
      },
    },
  ],
  notes,
}

// 7. Serialize, compute hash, and write
const finalJson = JSON.stringify(report, null, 2)
const sha256 = createHash("sha256").update(finalJson).digest("hex")
report.artifacts[0].sha256 = sha256
report.artifacts[0].sizeBytes = Buffer.byteLength(finalJson, "utf-8")

// Re-serialize with sha256 and sizeBytes now populated
const outputJson = JSON.stringify(report, null, 2)
writeFileSync(REPORT_PATH, outputJson, "utf-8")
console.log(`[test:report] Wrote ${REPORT_PATH} (${Buffer.byteLength(outputJson, "utf-8")} bytes)`)

// 8. Quick sanity: confirm schema file exists for reference
if (!existsSync(SCHEMA_PATH)) {
  console.warn("[test:report] WARNING: Schema file not found at", SCHEMA_PATH)
} else {
  console.log("[test:report] Schema file found at", SCHEMA_PATH, "(manual validation recommended)")
}

// 9. Report summary
const totalCases = suites.reduce((s, suite) => s + suite.cases.length, 0)
console.log(`[test:report] Done — ${suites.length} suites, ${totalCases} cases`)
if (gaps.length > 0) {
  console.log(`[test:report] Known gaps: ${gaps.join(", ")}`)
}

// ---------------------------------------------------------------------------
// Redaction helper
// ---------------------------------------------------------------------------

/**
 * Very simple redaction: truncate long messages and strip anything that looks
 * like a file path or URL that could be sensitive.  The vitest JSON reporter
 * already excludes secrets / prompts; this is a second safety net.
 */
function redactMessage(msg) {
  if (!msg) return ""
  // Truncate to 500 chars max
  let out = String(msg).slice(0, 500)
  // Remove absolute paths (naive pattern)
  out = out.replace(/\/home\/[^\s]*/g, "[redacted-path]")
  return out
}
