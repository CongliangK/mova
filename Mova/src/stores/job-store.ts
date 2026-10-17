import { create } from "zustand"
import type { RuntimeJobRecord, JobStatus } from "../types/manifest"

export interface JobStoreState {
  /** All in-flight and recently-completed jobs, keyed by jobId. */
  jobs: Record<string, RuntimeJobRecord>

  /**
   * Create or update a job record.
   *
   * On first call for a given `jobId`, defaults `status` to `"pending"` and
   * sets `startedAt` to now before applying `patch`.
   * On subsequent calls, shallow-merges `patch` on top of the existing record.
   */
  upsertJob: (jobId: string, patch: Partial<RuntimeJobRecord>) => void

  /** Remove a job record entirely (e.g. after the UI has acknowledged it). */
  removeJob: (jobId: string) => void

  /**
   * Transition a job to `"cancelled"` and stamp `finishedAt`.
   * No-op when the job is unknown or already in a terminal state.
   */
  cancelJob: (jobId: string) => void

  /** Read a single job record (returns `undefined` when unknown). */
  getJob: (jobId: string) => RuntimeJobRecord | undefined
}

export const useJobStore = create<JobStoreState>()((set, get) => ({
  jobs: {},

  upsertJob: (jobId, patch) =>
    set((state) => {
      const existing = state.jobs[jobId]
      if (existing) {
        return {
          jobs: {
            ...state.jobs,
            [jobId]: { ...existing, ...patch },
          },
        }
      }
      return {
        jobs: {
          ...state.jobs,
          [jobId]: {
            jobId,
            status: "pending" as JobStatus,
            startedAt: new Date().toISOString(),
            ...patch,
          },
        },
      }
    }),

  removeJob: (jobId) =>
    set((state) => {
      const next = { ...state.jobs }
      delete next[jobId]
      return { jobs: next }
    }),

  cancelJob: (jobId) =>
    set((state) => {
      const existing = state.jobs[jobId]
      if (!existing) return state
      // Only cancel non-terminal jobs.
      if (existing.status === "completed" || existing.status === "failed" || existing.status === "cancelled") {
        return state
      }
      return {
        jobs: {
          ...state.jobs,
          [jobId]: {
            ...existing,
            status: "cancelled" as JobStatus,
            finishedAt: new Date().toISOString(),
          },
        },
      }
    }),

  getJob: (jobId) => get().jobs[jobId],
}))
