import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { rm } from 'node:fs/promises'
import type { JobEvent, JobState, ManifestRelease, DownloadOptions } from './release-download-types.js'

const JOB_TTL_MS = 30 * 60 * 1000
// Active jobs with no remaining SSE subscriber are cancelled once idle this
// long — the client is gone (page closed / navigated away), so stop burning
// CPU on ffmpeg conversions nobody is waiting for.
const JOB_IDLE_CANCEL_MS = 30 * 1000
const JOB_CLEANUP_INTERVAL_MS = 10 * 1000

export class ConversionQueue {
  #jobs = new Map<string, JobState>()
  #jobTtl = JOB_TTL_MS
  #cleanupTimer: ReturnType<typeof setInterval> | null = null
  #subscribers = new Map<string, number>()
  #lastActivity = new Map<string, number>()

  constructor() {}

  startCleanup() {
    this.#cleanupTimer = setInterval(() => this.#cleanupOldJobs(), JOB_CLEANUP_INTERVAL_MS)
  }

  stopCleanup() {
    if (this.#cleanupTimer) clearInterval(this.#cleanupTimer)
    this.#cleanupTimer = null
  }

  getJob(id: string): JobState | undefined {
    return this.#jobs.get(id)
  }

  registerSubscriber(id: string) {
    this.#rawmarkActivity(id)
    this.#subscribers.set(id, (this.#subscribers.get(id) || 0) + 1)
  }

  unregisterSubscriber(id: string) {
    this.#rawmarkActivity(id)
    const count = (this.#subscribers.get(id) || 0) - 1
    if (count <= 0) this.#subscribers.delete(id)
    else this.#subscribers.set(id, count)
    return Math.max(0, count)
  }

  subscriberCount(id: string): number {
    return this.#subscribers.get(id) || 0
  }

  // Cancel an in-flight job: aborts any running ffmpeg conversion and flags
  // the job so the processing loop unwinds (releasing locks, removing partial
  // outputs). The job's own catch-emitted 'error' event surfaces to clients.
  cancelJob(id: string, reason = 'Download cancelled'): boolean {
    const job = this.#jobs.get(id)
    if (!job || job.done) return false
    job.cancelled = true
    job.error = reason
    job.abortController?.abort()
    return true
  }

  createJob(slug: string, release: ManifestRelease, opts: DownloadOptions | null, trackIndex: number | null, sessionId: string | null = null): JobState {
    const id = randomUUID()
    const emitter = new EventEmitter()
    const job: JobState = {
      id, slug, release, opts: opts as DownloadOptions, trackIndex, emitter, done: false, events: [],
      createdAt: Date.now(), sessionId,
      cancelled: false,
      abortController: new AbortController(),
    }
    this.#jobs.set(id, job)
    this.#rawmarkActivity(id)
    return job
  }

  emitEvent(job: JobState, event: JobEvent) {
    this.#lastActivity.set(job.id, Date.now())
    job.events.push(event)
    job.emitter.emit('event', event)
  }

  #rawmarkActivity(id: string) {
    this.#lastActivity.set(id, Date.now())
  }

  #cleanupOldJobs() {
    const now = Date.now()
    for (const [id, job] of this.#jobs) {
      if (job.done) {
        const age = now - job.createdAt
        if (age > this.#jobTtl) {
          if (job.filePath) rm(job.filePath, { force: true }).catch(() => {})
          this.#jobs.delete(id)
          this.#subscribers.delete(id)
          this.#lastActivity.delete(id)
        }
        continue
      }

      // Active job whose client went away: cancel it so its ffmpeg processes
      // are killed instead of burning CPU indefinitely.
      if (!job.detached && this.subscriberCount(id) === 0) {
        const lastSeen = this.#lastActivity.get(id) ?? job.createdAt
        if (now - lastSeen > JOB_IDLE_CANCEL_MS) {
          this.cancelJob(id, 'User disconnected — download cancelled')
        }
      }
    }
  }
}