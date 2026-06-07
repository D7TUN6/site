import { createReadStream } from 'node:fs'
import { readFile, access, mkdir } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { convertAudioToFormat, cacheKeyFromOpts, exists } from './media-convert.js'
import type { ConvertAudioOpts, AudioFormat, AudioBitDepth, AudioChannels, AudioResampler, AudioBitrateMode } from './media-convert.js'

const SLUG_RE = /^[a-z0-9-]{1,128}$/
const TRACK_INDEX_RE = /^\d{1,3}$/

export type { AudioFormat, AudioBitDepth, AudioChannels, AudioResampler, AudioBitrateMode }

export type DownloadOptions = {
  format: AudioFormat
  sampleRate: number
  bitDepth: AudioBitDepth
  channels: AudioChannels
  resampler: AudioResampler
  bitrateMode: AudioBitrateMode
  bitrate: number
}

type ManifestTrack = { index: number; title: string; sourceUrl: string | null; previewUrl?: string | null; sourceSampleRate?: number | null }
type ManifestRelease = { slug: string; sourceDirName?: string; coverUrl?: string | null; tracks: ManifestTrack[] }

export class PublicRequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'PublicRequestError'
    this.status = status
  }
}

const SUPPORTED_FORMATS: AudioFormat[] = ['wav', 'flac', 'ogg-opus', 'ogg-vorbis', 'aiff', 'raw']

export class ReleaseDownloadService {
  #root: string
  #manifestPath: string
  #releaseBySlug = new Map<string, ManifestRelease>()

  constructor({ root, manifestPath }: { root: string; manifestPath: string }) {
    this.#root = root
    this.#manifestPath = manifestPath
  }

  async bootstrap() {
    const raw = await readFile(this.#manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as { releases?: ManifestRelease[] }
    const releases = Array.isArray(parsed.releases) ? parsed.releases : []
    this.#releaseBySlug = new Map(releases.map((entry) => [entry.slug, entry]))
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

  async ensureTrackConverted(release: ManifestRelease, track: ManifestTrack, opts: DownloadOptions) {
    if (!track.sourceUrl) throw new PublicRequestError(404, 'Track source file not found')
    const albumDir = release.sourceDirName ?? release.slug
    const sourceAbs = path.resolve(this.#root, 'public', String(track.sourceUrl).replace(/^\/+/, ''))
    const stem = this.#downloadStemForTrack(track)
    const cacheKey = cacheKeyFromOpts({
      format: opts.format,
      sampleRate: opts.sampleRate,
      bitDepth: opts.bitDepth,
      channels: opts.channels,
      resampler: opts.resampler,
      bitrateMode: opts.bitrateMode,
      bitrate: opts.bitrate,
    })
    const cacheDir = path.resolve(this.#root, 'public', 'media', 'music', albumDir, 'tracks', 'cache', cacheKey)
    const ext = formatFileExt(opts.format)
    const cachedFile = path.join(cacheDir, `${stem}${ext}`)

    if (!(await exists(cachedFile))) {
      if (!(await exists(sourceAbs))) throw new PublicRequestError(404, 'Source file not found')
      await convertAudioToFormat(sourceAbs, cacheDir, stem, opts)
    }

    const publicPath = `/${path.relative(path.join(this.#root, 'public'), cachedFile).split(path.sep).join('/')}`
    return publicPath
  }

  async ensureReleaseArchive(release: ManifestRelease, opts: DownloadOptions) {
    if (!Array.isArray(release.tracks) || release.tracks.length === 0) {
      throw new PublicRequestError(400, 'No tracks found in release')
    }

    const albumDir = release.sourceDirName ?? release.slug
    const cacheKey = cacheKeyFromOpts(opts)
    const cacheDir = path.resolve(this.#root, 'public', 'media', 'music', albumDir, 'tracks', 'cache', cacheKey)
    const ext = formatFileExt(opts.format)

    const zip = new JSZip()
    for (const track of release.tracks) {
      if (!track.sourceUrl) continue
      const stem = this.#downloadStemForTrack(track)
      const cachedFile = path.join(cacheDir, `${stem}${ext}`)

      if (!(await exists(cachedFile))) {
        const sourceAbs = path.resolve(this.#root, 'public', String(track.sourceUrl).replace(/^\/+/, ''))
        if (!(await exists(sourceAbs))) continue
        await convertAudioToFormat(sourceAbs, cacheDir, stem, opts)
      }

      zip.file(`tracks/${String(track.index).padStart(2, '0')} - ${track.title}${ext}`, createReadStream(cachedFile), { binary: true })
    }

    if (release.coverUrl) {
      const coverAbs = path.resolve(this.#root, 'public', String(release.coverUrl).replace(/^\/+/, ''))
      try {
        if (await exists(coverAbs)) {
          zip.file(`cover${path.extname(coverAbs).toLowerCase() || '.jpg'}`, createReadStream(coverAbs), { binary: true })
        }
      } catch { /* ok */ }
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    return { buffer, filename: `${release.slug}-${opts.format}.zip` }
  }

  #downloadStemForTrack(track: ManifestTrack) {
    const candidate = track.previewUrl || track.sourceUrl || ''
    const sourceRelative = String(candidate).replace(/^\/+/, '')
    const sourceAbs = path.resolve(this.#root, 'public', sourceRelative)
    const ext = path.extname(sourceAbs).toLowerCase()
    return path.basename(sourceAbs, ext)
  }
}

function formatFileExt(fmt: AudioFormat): string {
  switch (fmt) {
    case 'wav': return '.wav'
    case 'flac': return '.flac'
    case 'ogg-opus': return '.opus'
    case 'ogg-vorbis': return '.ogg'
    case 'aiff': return '.aiff'
    case 'raw': return '.raw'
  }
}
