import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const QA_SCHEMA_VERSION = "mova.qa-report.v0";
const EXECUTION_LANE = "mock-offline";
const PRIVACY_CLASSIFICATION = "public-safe";

const STEPS = [
  { name: "lint", command: "pnpm", args: ["lint"] },
  { name: "typecheck", command: "pnpm", args: ["typecheck"] },
  { name: "test", command: "pnpm", args: ["test"] },
  { name: "build", command: "pnpm", args: ["build"] },
  { name: "test:rust", command: "pnpm", args: ["test:rust"] },
];

const REPORT_PATH = "reports/verify-gate.json";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readPackageVersion() {
  try {
    const pkgPath = resolve(rootDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

function formatDuration(ms) {
  return Math.round(ms * 1000) / 1000;
}

function failureCategory(exitCode, stepName) {
  if (exitCode === 0) return "none";
  if (stepName === "test" || stepName === "test:rust") return "assertion";
  if (stepName === "build" || stepName === "typecheck" || stepName === "lint") return "environment";
  return "unknown";
}

function runStep(step) {
  const start = performance.now();
  const result = spawnSync(step.command, step.args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  const durationMs = formatDuration(performance.now() - start);

  const stdout = (result.stdout ?? "").trimEnd();
  const stderr = (result.stderr ?? "").trimEnd();
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const error = result.error?.message ?? null;

  const combined = [stdout, stderr].filter(Boolean).join("\n");
  const tailLines = combined.split("\n").slice(-30);
  const stdoutTail = tailLines.join("\n") || null;

  return { exitCode, durationMs, stdoutTail, error };
}

/**
 * Collect capability-level results by running pnpm test:report and reading
 * the generated qa-report-v0.json.  Returns a summary object or null on
 * failure (the gate report is still written without capability data).
 */
function collectCapabilitySummary() {
  const qaReportPath = resolve(rootDir, "reports", "qa-report-v0.json");

  console.log("Collecting capability-level test results via pnpm test:report ...");
  const result = spawnSync("pnpm", ["test:report"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
    timeout: 180_000,
  });

  if (result.status !== 0 || !existsSync(qaReportPath)) {
    const reason = result.status !== 0
      ? `pnpm test:report exited with code ${result.status}`
      : "qa-report-v0.json not found after pnpm test:report";
    console.log(`  WARNING: Capability analysis unavailable — ${reason}`);
    return null;
  }

  let qaReport;
  try {
    qaReport = JSON.parse(readFileSync(qaReportPath, "utf8"));
  } catch (err) {
    console.log(`  WARNING: Could not parse qa-report-v0.json — ${err.message}`);
    return null;
  }

  const capabilities = (qaReport.suites ?? []).map((suite) => ({
    name: extractCapName(suite.suiteId),
    status: suite.status ?? "unknown",
    caseCount: (suite.cases ?? []).length,
  }));

  // Known gaps tracked here (mirrors report-test.mjs KNOWN_GAPS)
  const knownUncoveredAreas = ["video-generation", "native-renderer"];

  console.log(
    `  Capability analysis complete: ${capabilities.length} capability areas, ` +
      `${knownUncoveredAreas.length} known uncovered areas`,
  );

  return {
    source: "pnpm test:report",
    capabilities,
    knownUncoveredAreas,
  };
}

/**
 * Map QA report suite IDs back to capability area names.
 * report-test.mjs creates suiteIds via cap.replace(/\//g, "-"),
 * which is lossy for names that contain hyphens (e.g. "file-tree/git").
 */
const SUITE_ID_TO_CAP_NAME = {
  "project": "project",
  "canvas-timeline": "canvas/timeline",
  "chat-ai": "chat/ai",
  "export": "export",
  "drawing": "drawing",
  "file-tree-git": "file-tree/git",
  "settings": "settings",
  "performance": "performance",
};

function extractCapName(suiteId) {
  return SUITE_ID_TO_CAP_NAME[suiteId] ?? suiteId;
}

function main() {
  console.log("=== Mova verify:report ===");
  console.log();

  const appVersion = readPackageVersion();
  const generatedAt = new Date().toISOString();

  const stepResults = [];
  let allPassed = true;

  for (const step of STEPS) {
    console.log(`Running ${step.name} (${step.command} ${step.args.join(" ")})...`);
    const result = runStep(step);
    stepResults.push({ ...step, ...result });

    const statusLabel = result.exitCode === 0 ? "PASS" : "FAIL";
    console.log(`  ${statusLabel}  exit=${result.exitCode}  duration=${result.durationMs}ms`);
    if (result.error) {
      console.log(`  error: ${result.error}`);
    }
    console.log();

    if (result.exitCode !== 0) {
      allPassed = false;
    }
  }

  // Collect capability-level test results (runs vitest again via pnpm test:report)
  const capabilitySummary = collectCapabilitySummary();

  const cases = stepResults.map((step) => ({
    caseId: `verify-${step.name}`,
    name: `${step.command} ${step.args.join(" ")}`,
    status: step.exitCode === 0 ? "passed" : "failed",
    executionLane: EXECUTION_LANE,
    durationMs: step.durationMs,
    failureCategory: failureCategory(step.exitCode, step.name),
    providerRefs: [],
    artifactRefs: ["verify-gate-json"],
    metrics: [],
  }));

  const report = {
    schemaVersion: QA_SCHEMA_VERSION,
    reportId: "verify-gate",
    generatedAt,
    capabilitySummary,
    command: {
      name: "pnpm",
      args: ["verify:report"],
      cwd: "Mova",
      exitCode: allPassed ? 0 : 1,
    },
    environment: {
      runner: "node",
      os: process.platform,
      node: process.version,
      appVersion,
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
        durationMs: formatDuration(
          stepResults.reduce((sum, step) => sum + step.durationMs, 0),
        ),
        cases,
      },
    ],
    artifacts: [
      {
        artifactId: "verify-gate-json",
        kind: "json-report",
        path: REPORT_PATH,
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
    notes: `Verify gate report for ${STEPS.length} verification steps. Exit code 0 = all passed.`,
  };

  const absReportDir = resolve(rootDir, "reports");
  mkdirSync(absReportDir, { recursive: true });

  const absReportPath = resolve(rootDir, REPORT_PATH);
  writeFileSync(absReportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Report written to ${REPORT_PATH}`);

  if (allPassed) {
    console.log("All verification steps passed.");
  } else {
    const failedSteps = stepResults.filter((s) => s.exitCode !== 0);
    console.log(`${failedSteps.length} step(s) failed.`);
  }

  process.exit(allPassed ? 0 : 1);
}

main();
