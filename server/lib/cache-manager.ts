import { readFile, readdir, writeFile, rm, stat } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { cacheKeyFromOpts, exists } from './media-convert.js'
import type { AudioFormat, AudioMetadata } from './media-convert.js'
import type { DownloadOptions, ManifestRelease } from './release-download-types.js'
import { CacheIndex } from './cache-index.js'

export { CacheIndex }

export class CacheManager {
  #root: string
  #releaseBySlug: Map<string, ManifestRelease>
  #cacheVersionBySlug = new Map<string, { version: number; mtime: number }>()
  #cacheKeysBySlug = new Map<string, Set<string>>()
  #cacheIndex: CacheIndex

  constructor(root: string, releaseBySlug?: Map<string, ManifestRelease>) {
    this.#root = root
    this.#releaseBySlug = releaseBySlug ?? new Map()
    this.#cacheIndex = new CacheIndex(root)
  }

  get cacheIndex() { return this.#cacheIndex }

  setReleases(releases: ManifestRelease[]) {
    this.#releaseBySlug = new Map(releases.map((entry) => [entry.slug, entry]))
  }

  get cacheKeysBySlug() { return this.#cacheKeysBySlug }
  get releaseBySlug() { return this.#releaseBySlug }

  async loadCacheKeys() {
    await this.#cacheIndex.load()
    for (const [slug, release] of this.#releaseBySlug) {
      const albumDir = release.sourceDirName ?? release.slug
      const tracksDir = path.resolve(this.#root, 'public', 'media', 'music', albumDir, 'tracks', 'cache')
      try {
        const entries = await readdir(tracksDir).catch(() => [] as string[])
        const keys = new Set<string>()
        for (const entry of entries) {
          if (entry.startsWith('.')) continue
          keys.add(entry)
          const entryPath = path.join(tracksDir, entry)
          const entryStat = await stat(entryPath).catch(() => null)
          if (entryStat?.isDirectory()) {
            const existing = this.#cacheIndex.entries.find(e => e.cacheKey === entry)
            if (!existing) {
              this.#cacheIndex.add({
                cacheKey: entry,
                slug,
                albumDir,
                type: 'derived',
                sizeBytes: entryStat.size,
                createdAt: Date.now(),
                lastAccessedAt: Date.now(),
              })
            }
          }
        }
        if (keys.size > 0) this.#cacheKeysBySlug.set(slug, keys)
      } catch { /* ok */ }
    }
    await this.#cacheIndex.persist()
  }

  touchCacheEntry(cacheKey: string) {
    this.#cacheIndex.touch(cacheKey)
  }

  async invalidateCache(slug: string) {
    const release = this.#releaseBySlug.get(slug)
    if (!release) return
    const albumDir = release.sourceDirName ?? release.slug
    await this.bumpCacheVersion(slug, albumDir)
    this.reloadRelease(slug)
  }

  reloadRelease(slug: string) {
    this.#releaseBySlug.delete(slug)
    const existing = this.#cacheVersionBySlug.get(slug)
    if (existing) {
      existing.version++
      existing.mtime = Date.now()
    }
  }

  async computeReleaseDigest(release: ManifestRelease): Promise<string> {
    const payload = JSON.stringify({
      tracks: release.tracks.map((t) => ({ index: t.index, title: t.title, sourceUrl: t.sourceUrl })),
      coverUrl: release.coverUrl,
      albumName: release.albumName,
    })
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16)
  }

  async getCacheVersion(slug: string, albumDir: string): Promise<number> {
    const existing = this.#cacheVersionBySlug.get(slug)
    if (existing) return existing.version
    const versionFile = path.resolve(this.#root, 'public', 'media', 'music', albumDir, '.cache-version')
    let version = 1
    if (await exists(versionFile)) {
      try {
        version = parseInt((await readFile(versionFile, 'utf8')).trim(), 10) || 1
      } catch { /* ok */ }
    }
    this.#cacheVersionBySlug.set(slug, { version, mtime: Date.now() })
    return version
  }

  async bumpCacheVersion(slug: string, albumDir: string) {
    const existing = this.#cacheVersionBySlug.get(slug)
    const version = existing ? existing.version + 1 : 2
    const versionFile = path.resolve(this.#root, 'public', 'media', 'music', albumDir, '.cache-version')
    await writeFile(versionFile, String(version), 'utf8')
    this.#cacheVersionBySlug.set(slug, { version, mtime: Date.now() })
    await this.#garbageCollect(slug, albumDir, version)
  }

  async #garbageCollect(slug: string, albumDir: string, keepVersion: number) {
    const cacheDir = path.resolve(this.#root, 'public', 'media', 'music', albumDir, 'tracks', 'cache')
    const entries = await readdir(cacheDir).catch(() => [] as string[])
    for (const entry of entries) {
      // Accept both variant-suffixed keys (<hash>_v3_full / _preorder) and
      // legacy plain keys (<hash>_v2). Anything unrecognisable is treated as
      // version 0 so it gets swept on the next bump.
      const match = entry.match(/_v(\d+)(?:_(?:full|preorder))?$/)
      const version = match ? Number(match[1]) : 0
      if (version < keepVersion) {
        await rm(path.join(cacheDir, entry), { recursive: true, force: true }).catch(() => {})
        this.#cacheIndex.remove(entry)
      }
    }
    await this.#cacheIndex.persist()
  }

  downloadCacheKey(slug: string, albumDir: string, opts: DownloadOptions, cacheVersion: number, variant?: string | null): string {
    const base = `${cacheKeyFromOpts(slug, opts)}_v${cacheVersion}`
    return variant ? `${base}_${variant}` : base
  }

  getCacheDir(albumDir: string, cacheKey: string): string {
    return path.resolve(this.#root, 'public', 'media', 'music', albumDir, 'tracks', 'cache', cacheKey)
  }

  stemForTrack(track: ManifestRelease['tracks'][0]): string {
    const candidate = track.previewUrl || track.sourceUrl || ''
    const sourceRelative = String(candidate).replace(/^\/+/, '')
    const sourceAbs = path.resolve(this.#root, 'public', sourceRelative)
    const ext = path.extname(sourceAbs).toLowerCase()
    return path.basename(sourceAbs, ext)
  }

  sourceAbsForTrack(track: ManifestRelease['tracks'][0]): string | null {
    if (!track.sourceUrl) return null
    const sourceRelative = String(track.sourceUrl).replace(/^\/+/, '')
    return path.resolve(this.#root, 'public', sourceRelative)
  }

  formatFileExt(fmt: AudioFormat): string {
    switch (fmt) {
      case 'wav': return '.wav'
      case 'flac': return '.flac'
      case 'ogg-opus': return '.opus'
      case 'ogg-vorbis': return '.ogg'
      case 'aiff': return '.aiff'
      case 'raw': return '.raw'
    }
  }

  metadataForTrack(release: ManifestRelease, track: ManifestRelease['tracks'][0]): AudioMetadata {
    const artist = release.artist || ''
    const album = release.albumName || release.slug
    return {
      title: track.title,
      artist,
      album,
      trackNumber: track.index,
      date: release.releaseDate,
      genre: release.genre?.en,
    }
  }

  coverAbsForRelease(release: ManifestRelease): string | null {
    if (!release.coverUrl) return null
    const coverAbs = path.resolve(this.#root, 'public', String(release.coverUrl).replace(/^\/+/, ''))
    return coverAbs
  }

  addToCacheIndex(cacheKey: string, slug: string, albumDir: string) {
    this.#cacheIndex.add({
      cacheKey,
      slug,
      albumDir,
      type: 'derived',
      sizeBytes: 0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    })
  }
}
