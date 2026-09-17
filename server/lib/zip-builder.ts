import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { ZipArchive } from 'archiver'
import { convertAudioToFormatProgress, exists } from './media-convert.js'
import type { CacheManager } from './cache-manager.js'
import type { ConversionQueue } from './conversion-queue.js'
import type { JobState, JobEvent } from './release-download-types.js'
import { JobCancelledError } from './release-download-types.js'
import { withLock } from './lock.js'

const buildLocks = new Map<string, Set<string>>()

function acquireBuildLock(cacheKey: string, sessionId: string | null): boolean {
  const sid = sessionId ?? 'anonymous'
  let sessions = buildLocks.get(cacheKey)
  if (!sessions) {
    sessions = new Set()
    buildLocks.set(cacheKey, sessions)
  }
  if (sessions.size > 0 && !sessions.has(sid)) return false
  sessions.add(sid)
  return true
}

function releaseBuildLock(cacheKey: string, sessionId: string | null) {
  const sid = sessionId ?? 'anonymous'
  const sessions = buildLocks.get(cacheKey)
  if (!sessions) return
  sessions.delete(sid)
  if (sessions.size === 0) buildLocks.delete(cacheKey)
}

export class ZipBuilder {
  #root: string
  #cache: CacheManager
  #queue: ConversionQueue

  constructor(root: string, cache: CacheManager, queue: ConversionQueue) {
    this.#root = root
    this.#cache = cache
    this.#queue = queue
  }

  #signalFor(job: JobState): AbortSignal | undefined {
    return job.abortController?.signal
  }

  async processReleaseJob(job: JobState) {
    const { release, opts } = job
    const albumDir = release.sourceDirName ?? release.slug
    const cacheVersion = await this.#cache.getCacheVersion(release.slug, albumDir)
    const cacheKey = this.#cache.downloadCacheKey(release.slug, albumDir, opts, cacheVersion, job.cacheVariant ?? 'full')
    const cacheDir = this.#cache.getCacheDir(albumDir, cacheKey)
    const ext = this.#cache.formatFileExt(opts.format)
    const extNoDot = ext.replace(/^\./, '')

    const zipFilename = `${release.slug}-${opts.format}.zip`
    const zipPath = path.join(cacheDir, zipFilename)
    const zipPartPath = `${zipPath}.part`
    const signal = this.#signalFor(job)
    let archive: ZipArchive | null = null
    let output: ReturnType<typeof createWriteStream> | null = null

    const teardownPartial = async () => {
      try { archive?.abort?.() } catch { /* ignore */ }
      try { output?.destroy() } catch { /* ignore */ }
      await rm(zipPartPath, { force: true }).catch(() => {})
    }

    if (await exists(zipPath)) {
      this.#cache.touchCacheEntry(cacheKey)
      job.filePath = zipPath
      job.filename = zipFilename
      job.done = true
      this.#queue.emitEvent(job, { type: 'done', filePath: zipPath, filename: zipFilename } satisfies JobEvent)
      return
    }

    if (!acquireBuildLock(cacheKey, job.sessionId)) {
      job.done = true
      job.error = 'Another download for this release is in progress'
      this.#queue.emitEvent(job, { type: 'error', error: job.error } satisfies JobEvent)
      return
    }

    try {
      await withLock(cacheKey, async () => {
        if (await exists(zipPath)) {
          job.filePath = zipPath
          job.filename = zipFilename
          job.done = true
          this.#queue.emitEvent(job, { type: 'done', filePath: zipPath, filename: zipFilename } satisfies JobEvent)
          return
        }

        if (job.cancelled) throw new JobCancelledError(job.error || 'Download cancelled')

        this.#queue.emitEvent(job, {
          type: 'meta',
          trackCount: release.tracks.length,
          tracks: release.tracks.map((t) => ({ index: t.index, title: t.title })),
        } satisfies JobEvent)

        await mkdir(cacheDir, { recursive: true })

        const keys = this.#cache.cacheKeysBySlug.get(release.slug) || new Set()
        keys.add(cacheKey)
        this.#cache.cacheKeysBySlug.set(release.slug, keys)
        this.#cache.addToCacheIndex(cacheKey, release.slug, albumDir)

        archive = new ZipArchive({ zlib: { level: 3 } })
        output = createWriteStream(zipPartPath)
        archive.pipe(output)

        this.#queue.emitEvent(job, { type: 'zip-progress', progress: 0 } satisfies JobEvent)

        for (const track of release.tracks) {
          if (job.cancelled) throw new JobCancelledError(job.error || 'Download cancelled')

          const sourceAbs = this.#cache.sourceAbsForTrack(track)
          if (!sourceAbs || !(await exists(sourceAbs))) {
            this.#queue.emitEvent(job, { type: 'convert-start', track: track.index, title: track.title } satisfies JobEvent)
            this.#queue.emitEvent(job, { type: 'error', error: `Source file for "${track.title}" not found` } satisfies JobEvent)
            continue
          }

          const stem = this.#cache.stemForTrack(track)
          const cachedFile = path.join(cacheDir, `${stem}${ext}`)

          if (!(await exists(cachedFile))) {
            this.#queue.emitEvent(job, { type: 'convert-start', track: track.index, title: track.title } satisfies JobEvent)

            const meta = this.#cache.metadataForTrack(release, track)
            const coverAbs = this.#cache.coverAbsForRelease(release)
            const coverExists = coverAbs ? await exists(coverAbs) : false

            const convertOpts = opts.normalize && opts.normalize !== 'off'
              ? {
                  ...opts,
                  plugins: [
                    ...(opts.plugins || []),
                    { name: 'loudnorm', params: { target: opts.normalize === 'loud' ? -11 : -14 } },
                    ...(opts.normalize === 'loud' ? [{ name: 'limiter', params: {} }] : []),
                  ],
                }
              : opts

            await convertAudioToFormatProgress(sourceAbs, cacheDir, stem, convertOpts, (pct) => {
              this.#queue.emitEvent(job, { type: 'convert-progress', track: track.index, progress: pct } satisfies JobEvent)
            }, meta, coverExists ? coverAbs! : undefined, signal)

            this.#queue.emitEvent(job, { type: 'convert-done', track: track.index } satisfies JobEvent)
          }

          if (job.cancelled) throw new JobCancelledError(job.error || 'Download cancelled')
          archive.file(cachedFile, { name: `tracks/${String(track.index).padStart(2, '0')} - ${track.title}.${extNoDot}` })
        }

        if (job.cancelled) throw new JobCancelledError(job.error || 'Download cancelled')

        if (release.coverUrl) {
          const coverAbs = path.resolve(this.#root, 'public', String(release.coverUrl).replace(/^\/+/, ''))
          try {
            if (await exists(coverAbs)) {
              archive.file(coverAbs, { name: `cover${path.extname(coverAbs) || '.jpg'}` })
            }
          } catch { /* ok */ }
        }

        // Stop zipping immediately if the client disconnects mid-finalize
        // (compressing a multi-GB album can take longer than the conversion).
        const cancelledWhileZipping = signal
          ? new Promise<never>((_, reject) => {
              if (signal.aborted) reject(new JobCancelledError(job.error || 'Download cancelled'))
              else signal.addEventListener('abort', () => reject(new JobCancelledError(job.error || 'Download cancelled')), { once: true })
            })
          : new Promise<never>(() => {})
        await Promise.race([archive.finalize(), cancelledWhileZipping])
        await new Promise<void>((resolve, reject) => {
          output!.on('close', () => resolve())
          output!.on('error', (err) => reject(err))
        })
        if (job.cancelled) throw new JobCancelledError(job.error || 'Download cancelled')
        await rename(zipPartPath, zipPath)
      })

      job.filePath = zipPath
      job.filename = zipFilename
      job.done = true
      this.#queue.emitEvent(job, { type: 'done', filePath: zipPath, filename: zipFilename } satisfies JobEvent)
    } finally {
      if (!(await exists(zipPath))) await teardownPartial()
      releaseBuildLock(cacheKey, job.sessionId)
      await this.#cache.cacheIndex.persist()
    }
  }

  async processTrackJob(job: JobState) {
    if (job.trackIndex == null) throw new Error('No track index for track job')
    const { release, opts, trackIndex } = job
    const albumDir = release.sourceDirName ?? release.slug
    const cacheVersion = await this.#cache.getCacheVersion(release.slug, albumDir)
    const cacheKey = this.#cache.downloadCacheKey(release.slug, albumDir, opts, cacheVersion, job.cacheVariant ?? 'full')
    const cacheDir = this.#cache.getCacheDir(albumDir, cacheKey)
    const ext = this.#cache.formatFileExt(opts.format)

    const track = release.tracks.find((t) => t.index === trackIndex)
    if (!track) throw new Error('Track not found')

    const sourceAbs = this.#cache.sourceAbsForTrack(track)
    if (!sourceAbs) throw new Error('Track source not found')

    const stem = this.#cache.stemForTrack(track)
    const cachedFile = path.join(cacheDir, `${stem}${ext}`)
    const signal = this.#signalFor(job)

    if (!acquireBuildLock(cacheKey, job.sessionId)) {
      job.done = true
      job.error = 'Another download for this track is in progress'
      this.#queue.emitEvent(job, { type: 'error', error: job.error } satisfies JobEvent)
      return
    }

    try {
      await withLock(cacheKey, async () => {
        if (await exists(cachedFile)) {
          this.#cache.touchCacheEntry(cacheKey)
          const fname = `${String(track.index).padStart(2, '0')} - ${track.title}${ext}`
          job.filePath = cachedFile
          job.filename = fname
          job.done = true
          this.#queue.emitEvent(job, { type: 'done', filePath: cachedFile, filename: fname } satisfies JobEvent)
          return
        }

        if (job.cancelled) throw new JobCancelledError(job.error || 'Download cancelled')

        await mkdir(cacheDir, { recursive: true })

        const keys = this.#cache.cacheKeysBySlug.get(release.slug) || new Set()
        keys.add(cacheKey)
        this.#cache.cacheKeysBySlug.set(release.slug, keys)
        this.#cache.addToCacheIndex(cacheKey, release.slug, albumDir)

        this.#queue.emitEvent(job, {
          type: 'meta',
          trackCount: 1,
          tracks: [{ index: track.index, title: track.title }],
        } satisfies JobEvent)

        this.#queue.emitEvent(job, { type: 'convert-start', track: track.index, title: track.title } satisfies JobEvent)

        const meta = this.#cache.metadataForTrack(release, track)
        const coverAbs = this.#cache.coverAbsForRelease(release)
        const coverExists = coverAbs ? await exists(coverAbs) : false

        const convertOpts = opts.normalize && opts.normalize !== 'off'
          ? {
              ...opts,
              plugins: [
                ...(opts.plugins || []),
                { name: 'loudnorm', params: { target: opts.normalize === 'loud' ? -11 : -14 } },
                ...(opts.normalize === 'loud' ? [{ name: 'limiter', params: {} }] : []),
              ],
            }
          : opts

        await convertAudioToFormatProgress(sourceAbs, cacheDir, stem, convertOpts, (pct) => {
          this.#queue.emitEvent(job, { type: 'convert-progress', track: track.index, progress: pct } satisfies JobEvent)
        }, meta, coverExists ? coverAbs! : undefined, signal)

        this.#queue.emitEvent(job, { type: 'convert-done', track: track.index } satisfies JobEvent)

        const fname = `${String(track.index).padStart(2, '0')} - ${track.title}${ext}`
        job.filePath = cachedFile
        job.filename = fname
        job.done = true
        this.#queue.emitEvent(job, { type: 'done', filePath: cachedFile, filename: fname } satisfies JobEvent)
      })
    } finally {
      releaseBuildLock(cacheKey, job.sessionId)
      await this.#cache.cacheIndex.persist()
    }
  }
}