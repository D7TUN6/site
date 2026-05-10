import { createReadStream } from 'node:fs'
import { readFile, access } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

const SLUG_RE = /^[a-z0-9-]{1,128}$/
const TRACK_INDEX_RE = /^\d{1,3}$/
const OUTPUT_FORMATS = new Set(['flac', 'mp3', 'ogg', 'wav'])

type ManifestTrack = { index: number; title: string; sourceUrl: string | null; previewUrl?: string | null; availableDownloadFormats: string[] }
type ManifestRelease = { slug: string; sourceDirName?: string; coverUrl?: string | null; tracks: ManifestTrack[] }

export class PublicRequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'PublicRequestError'
    this.status = status
  }
}

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

  isOutputFormat(value: string | null): value is 'flac' | 'mp3' | 'ogg' | 'wav' {
    return typeof value === 'string' && OUTPUT_FORMATS.has(value)
  }

  validateReleaseRequest(slug: string | null, format: string | null) {
    if (!slug || !SLUG_RE.test(slug) || !this.isOutputFormat(format)) throw new PublicRequestError(400, 'Invalid slug or format')
  }

  validateTrackRequest(slug: string | null, trackIndexRaw: string | null, format: string | null) {
    if (!slug || !SLUG_RE.test(slug) || !trackIndexRaw || !TRACK_INDEX_RE.test(trackIndexRaw) || !this.isOutputFormat(format)) {
      throw new PublicRequestError(400, 'Invalid slug, track, or format')
    }
  }

  getReleaseOrThrow(slug: string | null) {
    if (!slug) throw new PublicRequestError(404, 'Release not found')
    const release = this.#releaseBySlug.get(slug)
    if (!release) throw new PublicRequestError(404, 'Release not found')
    return release
  }

  getTrackOrThrow(release: ManifestRelease, trackIndexRaw: string | null, format: string) {
    const trackIndex = Number(trackIndexRaw)
    const track = release.tracks.find((entry) => entry.index === trackIndex)
    if (!track) throw new PublicRequestError(404, 'Track not found')
    if (!Array.isArray(track.availableDownloadFormats) || !track.availableDownloadFormats.includes(format)) {
      throw new PublicRequestError(400, 'Format is not available for this track')
    }
    return track
  }

  async ensureTrackDownloadCached(release: ManifestRelease, track: ManifestTrack, format: string) {
    if (!track.sourceUrl) throw new PublicRequestError(404, 'Track source file not found')
    const albumDir = release.sourceDirName ?? release.slug
    const stem = this.#downloadStemForTrack(track)
    const downloadAbs = path.resolve(this.#root, 'public', 'media', 'music', albumDir, 'tracks', 'download', `${stem}.${format}`)
    await access(downloadAbs)
    return toPublicPath(this.#root, downloadAbs)
  }

  async ensureReleaseArchiveCached(release: ManifestRelease, format: string) {
    if (!Array.isArray(release.tracks) || release.tracks.length === 0) {
      throw new PublicRequestError(400, 'No tracks found in release')
    }

    const zip = new JSZip()
    for (const track of release.tracks) {
      if (!track.sourceUrl) continue
      const albumDir = release.sourceDirName ?? release.slug
      const stem = this.#downloadStemForTrack(track)
      const downloadAbs = path.resolve(this.#root, 'public', 'media', 'music', albumDir, 'tracks', 'download', `${stem}.${format}`)
      await access(downloadAbs)
      zip.file(`tracks/${String(track.index).padStart(2, '0')} - ${track.title}.${format}`, createReadStream(downloadAbs), { binary: true })
    }

    if (release.coverUrl) {
      const coverAbs = path.resolve(this.#root, 'public', String(release.coverUrl).replace(/^\//, ''))
      try {
        await access(coverAbs)
        zip.file(`cover${path.extname(coverAbs).toLowerCase() || '.jpg'}`, createReadStream(coverAbs), { binary: true })
      } catch {
        // no cover in archive
      }
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    return { buffer, filename: `${release.slug}-${format}.zip` }
  }

  #downloadStemForTrack(track: ManifestTrack) {
    const candidate = track.previewUrl || track.sourceUrl || ''
    const sourceRelative = String(candidate).replace(/^\//, '')
    const sourceAbs = path.resolve(this.#root, 'public', sourceRelative)
    const ext = path.extname(sourceAbs).toLowerCase()
    return path.basename(sourceAbs, ext)
  }
}

function toPublicPath(root: string, abs: string): string {
  const rel = path.relative(path.join(root, 'public'), abs).split(path.sep).join('/')
  return `/${rel}`
}
