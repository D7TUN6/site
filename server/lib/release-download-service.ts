import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { exists, runRebuild } from './media-convert.js'
import type { AudioFormat } from './media-convert.js'
import { CacheManager } from './cache-manager.js'
import { ConversionQueue } from './conversion-queue.js'
import { ZipBuilder } from './zip-builder.js'
import type { DownloadOptions, JobEvent, JobState, ManifestRelease } from './release-download-types.js'
import { PublicRequestError } from './release-download-types.js'
import { isPreOrder, isTrackLocked, parseReleaseDate } from './release-availability.js'
export type { DownloadOptions } from './release-download-types.js'
export type { AudioFormat } from './media-convert.js'
export { PublicRequestError }

const SLUG_RE = /^[a-z0-9-]{1,128}$/
const TRACK_INDEX_RE = /^\d{1,3}$/
const SUPPORTED_FORMATS: AudioFormat[] = ['wav', 'flac', 'ogg-opus', 'ogg-vorbis', 'aiff', 'raw']

// Options used when pre-building zips in the background (admin invalidation,
// release-day transition). Individual user requests with other options build
// their own cache dirs lazily.
const PREWARM_OPTS = {
  sampleRate: 44100,
  bitDepth: 16 as DownloadOptions['bitDepth'],
  channels: 2 as DownloadOptions['channels'],
  resampler: 'none' as DownloadOptions['resampler'],
  bitrateMode: 'vbr' as DownloadOptions['bitrateMode'],
  bitrate: 320,
}

// setTimeout() refuses delays >= 2^31 ms; arm long waits in chunks.
const MAX_TIMEOUT_MS = 2 ** 31 - 1

export class ReleaseDownloadService {
  #root: string
  #manifestPath: string
  #cache: CacheManager
  #queue: ConversionQueue
  #zip: ZipBuilder
  #releaseBySlug: Map<string, ManifestRelease>
  #regenerationTimer: ReturnType<typeof setTimeout> | null = null
  #transitionTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor({ root, manifestPath }: { root: string; manifestPath: string }) {
    this.#root = root
    this.#manifestPath = manifestPath
    this.#cache = new CacheManager(root)
    this.#queue = new ConversionQueue()
    this.#zip = new ZipBuilder(root, this.#cache, this.#queue)
    this.#releaseBySlug = this.#cache.releaseBySlug
  }

  async bootstrap() {
    const raw = await readFile(this.#manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as { releases?: ManifestRelease[] }
    const releases = Array.isArray(parsed.releases) ? parsed.releases : []
    this.#cache.setReleases(releases)
    this.#releaseBySlug = this.#cache.releaseBySlug
    await this.#cache.loadCacheKeys()
    this.#queue.startCleanup()
    this.#armReleaseTransitions()
  }

  invalidateCache(slug: string) {
    this.#cache.invalidateCache(slug)
    this.#scheduleRegeneration(slug)
    // Release dates may have been edited — re-arm the transition timers.
    this.#armReleaseTransitions()
  }

  reloadRelease(slug: string) {
    this.#cache.reloadRelease(slug)
    this.#armReleaseTransitions()
  }

  isValidFormat(value: string | null): value is AudioFormat {
    return typeof value === 'string' && (SUPPORTED_FORMATS as string[]).includes(value)
  }

  validateReleaseRequest(slug: string | null) {
    if (!slug || !SLUG_RE.test(slug)) throw new PublicRequestError(400, 'Invalid slug')
  }

  validateTrackRequest(slug: string | null, trackIndexRaw: string | null) {
    if (!slug || !SLUG_RE.test(slug) || !trackIndexRaw || !TRACK_INDEX_RE.test(trackIndexRaw)) {
      throw new PublicRequestError(400, 'Invalid slug or track')
    }
  }

  getReleaseOrThrow(slug: string | null) {
    if (!slug) throw new PublicRequestError(404, 'Release not found')
    const release = this.#releaseBySlug.get(slug)
    if (!release) throw new PublicRequestError(404, 'Release not found')
    return release
  }

  getTrackOrThrow(release: ManifestRelease, trackIndexRaw: string | null) {
    const trackIndex = Number(trackIndexRaw)
    const track = release.tracks.find((entry) => entry.index === trackIndex)
    if (!track) throw new PublicRequestError(404, 'Track not found')
    return track
  }

  getJob(id: string) {
    return this.#queue.getJob(id)
  }

  registerSubscriber(id: string) {
    this.#queue.registerSubscriber(id)
  }

  unregisterSubscriber(id: string): number {
    return this.#queue.unregisterSubscriber(id)
  }

  cancelJob(id: string, reason?: string): boolean {
    return this.#queue.cancelJob(id, reason)
  }

  async startRegenerateAllJob(sessionId: string | null = null): Promise<string> {
    const job = this.#queue.createJob('', null as unknown as ManifestRelease, null, null, sessionId)
    job.detached = true
    this.#processRegenerateAllJob(job).catch((err) => {
      job.error = err instanceof Error ? err.message : 'Regeneration failed'
      job.done = true
      this.#queue.emitEvent(job, { type: 'error', error: job.error } satisfies JobEvent)
    })
    return job.id
  }

  async startRegenerateManifestJob(sessionId: string | null = null): Promise<string> {
    const job = this.#queue.createJob('', null as unknown as ManifestRelease, null, null, sessionId)
    job.detached = true
    this.#processRegenerateManifestJob(job).catch((err) => {
      job.error = err instanceof Error ? err.message : 'Manifest regeneration failed'
      job.done = true
      this.#queue.emitEvent(job, { type: 'error', error: job.error } satisfies JobEvent)
    })
    return job.id
  }

  async startReleaseJob(slug: string, opts: DownloadOptions, sessionId: string | null = null): Promise<string> {
    const release = this.getReleaseOrThrow(slug)
    if (!Array.isArray(release.tracks) || release.tracks.length === 0) {
      throw new PublicRequestError(400, 'No tracks in release')
    }
    // During pre-order only previewable tracks are available for download.
    let jobRelease: ManifestRelease = release
    const preOrder = isPreOrder(release)
    if (preOrder) {
      const unlocked = release.tracks.filter((t) => !isTrackLocked(release, t))
      if (unlocked.length === 0) throw new PublicRequestError(403, 'Release is not available yet')
      jobRelease = { ...release, tracks: unlocked }
    }
    const job = this.#queue.createJob(slug, jobRelease, opts, null, sessionId)
    job.cacheVariant = preOrder ? 'preorder' : 'full'
    this.#zip.processReleaseJob(job).catch((err) => {
      job.error = err instanceof PublicRequestError ? err.message : (err instanceof Error ? err.message : 'Conversion failed')
      job.done = true
      this.#queue.emitEvent(job, { type: 'error', error: job.error } satisfies JobEvent)
    })
    return job.id
  }

  async startTrackJob(slug: string, trackIndex: number, opts: DownloadOptions, sessionId: string | null = null): Promise<string> {
    const release = this.getReleaseOrThrow(slug)
    const track = this.getTrackOrThrow(release, String(trackIndex))
    if (isTrackLocked(release, track)) {
      throw new PublicRequestError(403, 'Track is not available yet')
    }
    const job = this.#queue.createJob(slug, release, opts, trackIndex, sessionId)
    job.cacheVariant = isPreOrder(release) ? 'preorder' : 'full'
    this.#zip.processTrackJob(job).catch((err) => {
      job.error = err instanceof PublicRequestError ? err.message : (err instanceof Error ? err.message : 'Conversion failed')
      job.done = true
      this.#queue.emitEvent(job, { type: 'error', error: job.error } satisfies JobEvent)
    })
    return job.id
  }

  #scheduleRegeneration(slug: string) {
    if (this.#regenerationTimer) clearTimeout(this.#regenerationTimer)
    this.#regenerationTimer = setTimeout(async () => {
      this.#regenerationTimer = null
      try {
        await this.#refreshReleaseCaches(slug)
      } catch (err) {
        console.error(`Background cache regeneration failed for ${slug}:`, err)
      }
    }, 10_000)
  }

  // Rebuilds warm caches for a release after its content or availability
  // changed. Existing cache dirs are wiped via a version bump and rebuilt in
  // the CURRENT availability variant: pre-order releases get pre-order zips
  // (never full ones — that would leak locked tracks), released ones get full
  // zips. The format set is inferred from whatever was cached before.
  async #refreshReleaseCaches(slug: string) {
    const release = this.#releaseBySlug.get(slug)
    if (!release) return
    const albumDir = release.sourceDirName ?? release.slug
    const cacheRoot = path.resolve(this.#root, 'public', 'media', 'music', albumDir, 'tracks', 'cache')
    const entries = await readdir(cacheRoot).catch(() => [] as string[])
    const formats = new Set<AudioFormat>()
    let hadEntries = false
    for (const name of entries) {
      if (name.startsWith('.')) continue
      hadEntries = true
      // Legacy keys without a variant suffix may hold pre-order content and
      // are unreachable for new requests — their formats are still picked up
      // so equivalent variant dirs get built, then the dirs themselves are
      // swept by the version bump below.
      const fmt = await this.#formatOfCacheDir(path.join(cacheRoot, name))
      if (fmt) formats.add(fmt)
    }
    if (!hadEntries) return

    await this.#cache.bumpCacheVersion(slug, albumDir)
    const variant = isPreOrder(release) ? 'preorder' : 'full'
    for (const fmt of formats) {
      await this.#prebuildZip(slug, fmt, variant)
    }
  }

  async #formatOfCacheDir(dir: string): Promise<AudioFormat | null> {
    const files = await readdir(dir).catch(() => [] as string[])
    const audioFile = files.find((f) => !f.endsWith('.zip') && !f.startsWith('.'))
    if (!audioFile) return null
    const ext = path.extname(audioFile)
    if (ext === '.opus') return 'ogg-opus'
    if (ext === '.ogg') return 'ogg-vorbis'
    const fmt = ext.replace(/^\./, '') as AudioFormat
    return SUPPORTED_FORMATS.includes(fmt) ? fmt : null
  }

  async #prebuildZip(slug: string, format: AudioFormat, variant: 'full' | 'preorder') {
    const release = this.#releaseBySlug.get(slug)
    if (!release) return
    let jobRelease: ManifestRelease = release
    if (variant === 'preorder') {
      const unlocked = release.tracks.filter((t) => !isTrackLocked(release, t))
      if (unlocked.length === 0) return
      jobRelease = { ...release, tracks: unlocked }
    }
    try {
      const albumDir = release.sourceDirName ?? release.slug
      const opts: DownloadOptions = { format, ...PREWARM_OPTS }
      const cacheVersion = await this.#cache.getCacheVersion(slug, albumDir)
      const cacheKey = this.#cache.downloadCacheKey(slug, albumDir, opts, cacheVersion, variant)
      const zipPath = path.join(this.#cache.getCacheDir(albumDir, cacheKey), `${slug}-${format}.zip`)
      if (await exists(zipPath)) return
      const job = this.#queue.createJob(slug, jobRelease, opts, null, null)
      job.cacheVariant = variant
      job.detached = true
      await this.#zip.processReleaseJob(job)
      if (job.error) console.error(`  Prebuild failed for ${slug} (${format}, ${variant}): ${job.error}`)
    } catch (err) {
      console.error(`  Prebuild failed for ${slug} (${format}, ${variant}):`, err)
    }
  }

  // Schedules the release-day flip at 00:00 of each pre-order release's date:
  // stale pre-order/legacy caches are dropped and full-content zips are built
  // ahead of the first download. Timers are re-armed on every manifest change
  // and chunked to survive waits longer than setTimeout's limit.
  #armReleaseTransitions() {
    for (const slug of Array.from(this.#transitionTimers.keys())) this.#clearTransitionTimer(slug)
    for (const [slug, release] of this.#releaseBySlug) {
      const d = parseReleaseDate(release.releaseDate)
      if (!d) continue
      const arm = (remainingMs: number) => {
        const delay = Math.min(Math.max(remainingMs, 0) + 1_500, MAX_TIMEOUT_MS)
        const timer = setTimeout(() => {
          this.#transitionTimers.delete(slug)
          const rel = this.#releaseBySlug.get(slug)
          const next = rel ? parseReleaseDate(rel.releaseDate) : null
          const remaining = rel && next ? next.getTime() - Date.now() : -1
          if (rel && next && remaining > 0) {
            arm(remaining)
            return
          }
          void this.#runReleaseTransition(slug)
        }, delay)
        timer.unref?.()
        this.#transitionTimers.set(slug, timer)
      }
      arm(d.getTime() - Date.now())
    }
  }

  #clearTransitionTimer(slug: string) {
    const timer = this.#transitionTimers.get(slug)
    if (timer) clearTimeout(timer)
    this.#transitionTimers.delete(slug)
  }

  async #runReleaseTransition(slug: string) {
    try {
      const release = this.#releaseBySlug.get(slug)
      if (!release || isPreOrder(release)) return
      console.log(`[downloads] Release day for "${slug}" — rebuilding download caches with full track list`)
      await this.#refreshReleaseCaches(slug)
    } catch (err) {
      console.error(`Release-day transition failed for ${slug}:`, err)
    }
  }

  async #processRegenerateAllJob(job: JobState) {
    const slugs = Array.from(this.#releaseBySlug.keys())
    let index = 0

    for (const slug of slugs) {
      index++
      this.#queue.emitEvent(job, { type: 'regenerating', slug, index, total: slugs.length, message: `${index}/${slugs.length} — ${slug}` } satisfies JobEvent)

      try {
        await this.#refreshReleaseCaches(slug)
        this.#queue.emitEvent(job, { type: 'release-done', slug, message: `${slug} — OK` } satisfies JobEvent)
      } catch (err) {
        this.#queue.emitEvent(job, { type: 'release-error', slug, error: err instanceof Error ? err.message : 'Unknown error' } satisfies JobEvent)
      }
    }

    this.#queue.emitEvent(job, { type: 'all-done', message: `Regenerated ${index} release(s)` } satisfies JobEvent)
    job.done = true
    this.#queue.emitEvent(job, { type: 'done', filePath: '', filename: '' } satisfies JobEvent)
  }

  async #processRegenerateManifestJob(job: JobState) {
    this.#queue.emitEvent(job, { type: 'manifest-start' } satisfies JobEvent)
    try {
      await runRebuild()
      this.#queue.emitEvent(job, { type: 'manifest-done' } satisfies JobEvent)
    } catch (err) {
      this.#queue.emitEvent(job, { type: 'error', error: err instanceof Error ? err.message : 'Manifest generation failed' } satisfies JobEvent)
    }
    job.done = true
    this.#queue.emitEvent(job, { type: 'done', filePath: '', filename: '' } satisfies JobEvent)
  }
}
