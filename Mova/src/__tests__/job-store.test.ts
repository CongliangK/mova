import { describe, it, expect, beforeEach } from "vitest"
import { useJobStore } from "../../src/stores/job-store"
import type { RuntimeJobRecord } from "../../src/types/manifest"

describe("JobStore", () => {
  beforeEach(() => {
    useJobStore.setState({ jobs: {} })
  })

  // ── upsertJob: create ──────────────────────────────────────────

  it("creates a new job with pending status and startedAt on first upsert", () => {
    const before = Date.now()
    useJobStore.getState().upsertJob("job-1", {})

    const job = useJobStore.getState().getJob("job-1")
    expect(job).toBeDefined()
    expect(job!.jobId).toBe("job-1")
    expect(job!.status).toBe("pending")
    expect(job!.startedAt).toBeTruthy()
    expect(new Date(job!.startedAt).getTime()).toBeGreaterThanOrEqual(before)
  })

  it("applies the patch fields on creation", () => {
    useJobStore.getState().upsertJob("job-2", {
      status: "running",
      progress: 0.5,
    })

    const job = useJobStore.getState().getJob("job-2")
    expect(job!.status).toBe("running")
    expect(job!.progress).toBe(0.5)
  })

  // ── upsertJob: update ──────────────────────────────────────────
  // go through a complete lifecycle: pending → running → completed

  it("transitions pending → running → completed with progress", () => {
    useJobStore.getState().upsertJob("job-lifecycle", {})

    // pending by default
    let job = useJobStore.getState().getJob("job-lifecycle")
    expect(job!.status).toBe("pending")
    expect(job!.progress).toBeUndefined()

    // running
    useJobStore.getState().upsertJob("job-lifecycle", {
      status: "running",
      progress: 0.3,
    })
    job = useJobStore.getState().getJob("job-lifecycle")
    expect(job!.status).toBe("running")
    expect(job!.progress).toBe(0.3)

    // progress update
    useJobStore.getState().upsertJob("job-lifecycle", { progress: 0.7 })
    job = useJobStore.getState().getJob("job-lifecycle")
    expect(job!.status).toBe("running")
    expect(job!.progress).toBe(0.7)

    // completed
    const finishTime = new Date().toISOString()
    useJobStore.getState().upsertJob("job-lifecycle", {
      status: "completed",
      progress: 1,
      finishedAt: finishTime,
    })
    job = useJobStore.getState().getJob("job-lifecycle")
    expect(job!.status).toBe("completed")
    expect(job!.progress).toBe(1)
    expect(job!.finishedAt).toBe(finishTime)
  })

  // ── failure ────────────────────────────────────────────────────

  it("records a failed job with error and finishedAt", () => {
    useJobStore.getState().upsertJob("job-fail", { status: "running" })

    const finishTime = new Date().toISOString()
    useJobStore.getState().upsertJob("job-fail", {
      status: "failed",
      error: "Something went wrong",
      finishedAt: finishTime,
    })

    const job = useJobStore.getState().getJob("job-fail")
    expect(job!.status).toBe("failed")
    expect(job!.error).toBe("Something went wrong")
    expect(job!.finishedAt).toBe(finishTime)
  })

  // ── cancelJob ──────────────────────────────────────────────────

  it("cancelJob transitions a running job to cancelled", () => {
    useJobStore.getState().upsertJob("job-cancel", { status: "running" })

    const before = Date.now()
    useJobStore.getState().cancelJob("job-cancel")

    const job = useJobStore.getState().getJob("job-cancel")
    expect(job!.status).toBe("cancelled")
    expect(job!.finishedAt).toBeTruthy()
    expect(new Date(job!.finishedAt!).getTime()).toBeGreaterThanOrEqual(before)
  })

  it("cancelJob is a no-op for unknown jobs", () => {
    useJobStore.getState().cancelJob("nonexistent")
    // Should not throw; store remains unchanged
    expect(useJobStore.getState().jobs).toEqual({})
  })

  it("cancelJob is a no-op for already-terminal jobs", () => {
    useJobStore.getState().upsertJob("job-done", {
      status: "completed",
      finishedAt: new Date().toISOString(),
    })
    const before = useJobStore.getState().getJob("job-done")!

    useJobStore.getState().cancelJob("job-done")

    const after = useJobStore.getState().getJob("job-done")!
    expect(after.status).toBe("completed")
    expect(after.finishedAt).toBe(before.finishedAt)
  })

  // ── removeJob + getJob after remove ────────────────────────────

  it("removeJob deletes the record and getJob returns undefined", () => {
    useJobStore.getState().upsertJob("job-remove", { status: "running" })
    expect(useJobStore.getState().getJob("job-remove")).toBeDefined()

    useJobStore.getState().removeJob("job-remove")

    expect(useJobStore.getState().getJob("job-remove")).toBeUndefined()
    expect(useJobStore.getState().jobs).not.toHaveProperty("job-remove")
  })

  it("removeJob is idempotent (no-op for unknown ids)", () => {
    useJobStore.getState().removeJob("never-existed")
    expect(useJobStore.getState().jobs).toEqual({})
  })

  it("getJob after remove returns undefined (idempotent)", () => {
    useJobStore.getState().upsertJob("job-ephemeral", {})
    useJobStore.getState().removeJob("job-ephemeral")

    // Multiple gets after remove
    expect(useJobStore.getState().getJob("job-ephemeral")).toBeUndefined()
    expect(useJobStore.getState().getJob("job-ephemeral")).toBeUndefined()
  })

  // ── upsertJob does not mutate other jobs ───────────────────────

  it("upsertJob does not affect other job records", () => {
    const jobA: Partial<RuntimeJobRecord> = {
      jobId: "a",
      status: "running",
      progress: 0.5,
      startedAt: new Date().toISOString(),
    }
    const jobB: Partial<RuntimeJobRecord> = {
      jobId: "b",
      status: "pending",
      startedAt: new Date().toISOString(),
    }

    useJobStore.getState().upsertJob("a", jobA)
    useJobStore.getState().upsertJob("b", jobB)
    useJobStore.getState().upsertJob("a", { progress: 0.8 })

    const keys = Object.keys(useJobStore.getState().jobs)
    expect(keys).toHaveLength(2)

    expect(useJobStore.getState().getJob("a")!.progress).toBe(0.8)
    expect(useJobStore.getState().getJob("b")!.status).toBe("pending")
  })
})
