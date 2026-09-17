import { readdir, readFile, stat, writeFile, access, mkdir, rename } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

type Track = {
  index: number
  title: string
  url: string
  streamUrl: string | null
  sourceUrl: string | null
  previewUrl: string | null
  duration: number | null
  sourceSampleRate: number | null
  sourceBitDepth: number | null
  links: { spotify: string | null; yandexMusic: string | null; bandcamp: string | null; soundcloud: string | null }
  previewable?: boolean
  isMain?: boolean
}

type Release = {
  slug: string
  albumName: string
  sourceDirName: string
  artist: string
  coverUrl: string
  coverPreviewUrl: string | null
  releaseDate: string
  releaseType?: string | null
  notes: string
  genre: { en: string; ru: string }
  genres: { main: string[]; sub: string[] }
  playlistM3uUrl: string | null
  playlistM3u8Url: string | null
  previewPlaylistM3uUrl: string | null
  previewPlaylistM3u8Url: string | null
  tracks: Track[]
  links: { spotify: string | null; yandexMusic: string | null; bandcamp: string | null; soundcloud: string | null }
  hidden?: boolean
}

const ROOT = process.cwd()
const MUSIC_ROOT = process.env.MUSIC_ROOT || path.join(ROOT, 'public', 'media', 'music')
const OUT_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')

const TRACK_EXT_RE = /\.(wav|mp3|flac|ogg|m4a|aac)$/i
const COVER_EXT_RE = /\.(jpg|jpeg|png|webp|avif)$/i

function slugify(value: string): string {
  return value.toLowerCase().replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-')
}
function normalizeTrackTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '').trim()
  // Strip numeric ordering prefixes used for ordering (e.g., "01__My Song" -> "My Song",
  // "1__1__introid" -> "introid", "1__000__bware" -> "bware")
  let title = withoutExt.replace(/^(\d+__)+/, '')
  // Strip trailing "number - " prefix left by some naming conventions
  // (e.g., "1 - an end is always the beginning" -> "an end is always the beginning")
  title = title.replace(/^\d+\s*-\s*/, '')
  return title
}
function toSafeTrackStem(fileName: string): string { return slugify(fileName.replace(/\.[^.]+$/, '')) }
function toPublicUrl(absPath: string): string { return `/${path.relative(path.join(ROOT, 'public'), absPath).split(path.sep).join('/')}` }

// A track's HLS/preview asset directory may be named after the raw source stem
// ("000__39 tone low"), a slugified stem ("1-fallen-kingdom"), or a slug with
// the numeric ordering prefix stripped ("winter-walk") depending on when it was
// generated. Build a candidate set so we can pair the lossless source file with
// its playlist entry by identity instead of position (playlist order and
// filename-sorted order differ for some releases, e.g. "A Path of Static Snow").
function trackAssetCandidates(fileName: string): string[] {
  const withoutExt = fileName.replace(/\.[^.]+$/, '').trim()
  const out: string[] = []
  const add = (s: string) => { const t = s.trim(); if (t && !out.includes(t)) out.push(t) }
  add(withoutExt)
  add(slugify(withoutExt))
  add(slugify(withoutExt.replace(/^(\d+__)+/, '')))
  add(slugify(normalizeTrackTitle(fileName)))
  return out
}
function urlAssetStem(url: string, subdir: string): string | null {
  const escaped = subdir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // .../stream/<slug>/index.m3u8  or  .../preview/<stem>.ogg
  const inner = new RegExp(`/${escaped}/([^/]+?)/[^/]+?\\.m3u8$`).exec(url)
  if (inner) return decodeURIComponent(inner[1])
  const file = new RegExp(`/${escaped}/([^/]+)\\.\\w+$`).exec(url)
  return file ? decodeURIComponent(file[1]) : null
}
function matchPlaylistEntry(entries: Array<{ title: string; url: string }>, fileName: string): { title: string; url: string } | null {
  const candidates = trackAssetCandidates(fileName)
  for (const entry of entries) {
    const slug = urlAssetStem(entry.url, 'stream') ?? urlAssetStem(entry.url, 'preview')
    if (slug && candidates.includes(slug)) return entry
  }
  for (const entry of entries) {
    if (slugify(entry.title) && candidates.includes(slugify(entry.title))) return entry
  }
  return null
}

function parseDateFromNotes(notes: string): string | null {
  const m = notes.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (!m) return null
  let year = m[3]
  if (year.length === 2) year = '20' + year
  return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${year}`
}

async function exists(p: string): Promise<boolean> { try { await access(p); return true } catch { return false } }

const FFMPEG_CONCURRENCY = 4
let ffmpegActive = 0
const ffmpegQueue: Array<() => void> = []

function acquireFfmpegSlot(): Promise<void> {
  if (ffmpegActive < FFMPEG_CONCURRENCY) {
    ffmpegActive++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    ffmpegQueue.push(() => {
      ffmpegActive++
      resolve()
    })
  })
}

function releaseFfmpegSlot() {
  ffmpegActive--
  if (ffmpegQueue.length > 0) {
    const next = ffmpegQueue.shift()!
    next()
  }
}

async function probeSourceInfo(filePath: string): Promise<{ sampleRate: number | null; bitDepth: number | null; duration: number | null }> {
  await acquireFfmpegSlot()
  try {
    const out = await new Promise<string>((resolve, reject) => {
      const ff = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,bits_per_raw_sample:stream=duration:format=duration', '-of', 'default=noprint_wrappers=1', filePath])
      let data = ''
      let err = ''
      ff.stdout.on('data', (c: Buffer) => { data += c.toString() })
      ff.stderr.on('data', (c: Buffer) => { err += c.toString() })
      ff.on('error', reject)
      ff.on('close', (code) => {
        if (code === 0) resolve(data)
        else reject(new Error(err || `ffprobe exit ${code}`))
      })
    })
    const srMatch = out.match(/^sample_rate=(\d+)/m)
    const bdMatch = out.match(/^bits_per_raw_sample=(\d+)/m)
    // Prefer format duration (last occurrence) – stream duration for VBR mp3 can be wildly inaccurate
    const allDur = [...out.matchAll(/^duration=([\d.]+)/gm)]
    const durStr = allDur.length ? allDur[allDur.length - 1][1] : null
    return {
      sampleRate: srMatch ? parseInt(srMatch[1], 10) : null,
      bitDepth: bdMatch ? parseInt(bdMatch[1], 10) : null,
      duration: durStr ? parseFloat(durStr) : null,
    }
  } catch (err) {
    console.warn(`[generate-releases] ffprobe failed for ${path.basename(filePath)}: ${err instanceof Error ? err.message : err}`)
    console.warn('[generate-releases] track duration/sample rate will be null — is ffmpeg installed and on PATH?')
    return { sampleRate: null, bitDepth: null, duration: null }
  } finally {
    releaseFfmpegSlot()
  }
}

async function readPlaylistTracks(filePath: string): Promise<Array<{ title: string; url: string }>> {
  if (!(await exists(filePath))) return []
  const src = await readFile(filePath, 'utf8')
  const lines = src.split(/\r?\n/)
  const out: Array<{ title: string; url: string }> = []
  let title = ''
  for (const lineRaw of lines) {
    const line = lineRaw.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF:')) { const idx = line.indexOf(','); title = idx >= 0 ? line.slice(idx + 1).trim() : ''; continue }
    if (line.startsWith('#')) continue
    const resolved = line.startsWith('/') ? line : toPublicUrl(path.resolve(path.dirname(filePath), line))
    out.push({ title, url: resolved }); title = ''
  }
  return out
}

async function findTrackFiles(tracksDir: string): Promise<string[]> {
  const TRACK_EXT_RE = /\.(wav|mp3|flac|ogg|m4a|aac)$/i
  
  // First try source directory
  const sourceDir = path.join(tracksDir, 'source')
  try {
    const sourceFiles = (await readdir(sourceDir)).filter((f) => TRACK_EXT_RE.test(f))
    if (sourceFiles.length > 0) {
      return sourceFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    }
  } catch { /* source dir doesn't exist */ }
  
  // Then try wav directory
  const wavDir = path.join(tracksDir, 'wav')
  try {
    const wavFiles = (await readdir(wavDir)).filter((f) => TRACK_EXT_RE.test(f))
    if (wavFiles.length > 0) {
      return wavFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    }
  } catch { /* wav dir doesn't exist */ }
  
  // Finally try root tracks directory
  const rootFiles = (await readdir(tracksDir)).filter((f) => TRACK_EXT_RE.test(f))
  return rootFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

async function buildRelease(albumName: string, _force: boolean): Promise<Release> {
  const albumDir = path.join(MUSIC_ROOT, albumName)
  const coverDir = path.join(albumDir, 'cover')
  const tracksDir = path.join(albumDir, 'tracks')
  const notesFile = path.join(albumDir, 'notes', 'notes')
  const playlistsDir = path.join(albumDir, 'playlists')

  const sourceTracksDir = path.join(tracksDir, 'source')
  await mkdir(sourceTracksDir, { recursive: true })

  const trackFiles = await findTrackFiles(tracksDir)
  for (const fileName of trackFiles) {
    // Check if file is already in source
    const sourceFile = path.join(sourceTracksDir, fileName)
    if (await exists(sourceFile)) continue
    
    // Try to find and copy from wav or root (don't mutate source dirs)
    const wavDir = path.join(tracksDir, 'wav')
    const from = (await exists(path.join(wavDir, fileName))) ? path.join(wavDir, fileName) : path.join(tracksDir, fileName)
    if (await exists(from)) {
      try {
        const data = await readFile(from)
        await writeFile(sourceFile, data)
      } catch (err) {
        console.warn(`[generate-releases] failed to copy ${fileName}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  const finalTrackFiles = (await readdir(sourceTracksDir).catch(() => [])).filter((f) => TRACK_EXT_RE.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  const fullPlaylist = await readPlaylistTracks(path.join(playlistsDir, 'full.m3u8'))
  const previewPlaylist = await readPlaylistTracks(path.join(playlistsDir, 'preview.m3u8'))

  const linksFile = path.join(albumDir, '.links')
  let links: { spotify: string | null; yandexMusic: string | null; bandcamp: string | null; soundcloud: string | null } = { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null }
  try { const l = await readFile(linksFile, 'utf8'); const parsed = JSON.parse(l); if (parsed && typeof parsed === 'object') links = { ...links, ...parsed } } catch {}

  // Per-track overrides: previewable (pre-order) and isMain (starred track).
  // Stored as a flat map keyed by source filename in <album>/.track-meta.json
  // (or nested under a "tracks" object). Defaults: previewable=true, isMain=false.
  const trackMetaFile = path.join(albumDir, '.track-meta.json')
  let trackMeta: Record<string, { previewable?: boolean; isMain?: boolean }> = {}
  try {
    const m = await readFile(trackMetaFile, 'utf8')
    const parsed = JSON.parse(m)
    if (parsed && typeof parsed === 'object') {
      trackMeta = (parsed.tracks && typeof parsed.tracks === 'object') ? parsed.tracks : parsed
    }
  } catch {}

  const tracks: Track[] = []
  const trackPromises = finalTrackFiles.map(async (fileName, i) => {
    const abs = path.join(sourceTracksDir, fileName)
    await stat(abs)
    const sourceInfo = await probeSourceInfo(abs)

    const pTrack = matchPlaylistEntry(fullPlaylist, fileName)
    const pPrev = matchPlaylistEntry(previewPlaylist, fileName)

    const streamDir = (await exists(path.join(tracksDir, 'stream', toSafeTrackStem(fileName), 'index.m3u8')))
      ? toSafeTrackStem(fileName)
      : (await exists(path.join(tracksDir, 'stream', slugify(normalizeTrackTitle(fileName)), 'index.m3u8')))
        ? slugify(normalizeTrackTitle(fileName))
        : null
    const streamFallback = streamDir ? toPublicUrl(path.join(tracksDir, 'stream', streamDir, 'index.m3u8')) : null
    const previewFallback = (await exists(path.join(tracksDir, 'preview', slugify(normalizeTrackTitle(fileName)) + '.ogg')))
      ? toPublicUrl(path.join(tracksDir, 'preview', slugify(normalizeTrackTitle(fileName)) + '.ogg'))
      : null

    return {
      index: i + 1,
      title: pTrack?.title || normalizeTrackTitle(fileName),
      url: pTrack?.url || streamFallback || toPublicUrl(abs),
      streamUrl: pTrack?.url || streamFallback,
      sourceUrl: toPublicUrl(abs),
      previewUrl: pPrev?.url || previewFallback,
       duration: sourceInfo.duration,
       sourceSampleRate: sourceInfo.sampleRate,
       sourceBitDepth: sourceInfo.bitDepth,
       links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null },
       previewable: trackMeta[fileName]?.previewable !== false,
       isMain: trackMeta[fileName]?.isMain === true,
     }
  })
  tracks.push(...await Promise.all(trackPromises))

  const covers = (await readdir(coverDir).catch(() => [])).filter((f) => COVER_EXT_RE.test(f) && !/^cover-preview\./i.test(f))
  const coverAbs = covers[0] ? path.join(coverDir, covers[0]) : null
  const notes = (await readFile(notesFile, 'utf8').catch(() => '')).trim()
  
  // Read release type from .release-type file, fallback to album
  const releaseTypeFile = path.join(albumDir, '.release-type')
  const releaseType = await readFile(releaseTypeFile, 'utf8').catch(() => 'album').then(t => t.trim())
  
  // Read release date from .release-date file, fallback to parsing from notes or current date
  const releaseDateFile = path.join(albumDir, '.release-date')
  const releaseDate = await readFile(releaseDateFile, 'utf8').catch(() => '').then(d => d.trim()) || 
    parseDateFromNotes(notes) || 
    (() => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` })()
  
  // Read hidden flag from .release-hidden file
  const hiddenFile = path.join(albumDir, '.release-hidden')
  const isHidden = await readFile(hiddenFile, 'utf8').catch(() => '').then(h => h.trim() === 'true')

  // Read artist from .artist file (required per release)
  const artistFile = path.join(albumDir, '.artist')
  const artist = (await readFile(artistFile, 'utf8').catch(() => '')).trim()
  if (!artist) console.warn(`[generate-releases] no .artist file in ${albumName}, using empty artist`)

  // Read genres from .genre file (JSON: { main: string[], sub: string[] })
  const genreFile = path.join(albumDir, '.genre')
  let genres: { main: string[]; sub: string[] } = { main: [], sub: [] }
  try {
    const raw = await readFile(genreFile, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      genres = {
        main: Array.isArray(parsed.main) ? parsed.main.map((s: string) => String(s).trim().toLowerCase()).filter(Boolean) : [],
        sub: Array.isArray(parsed.sub) ? parsed.sub.map((s: string) => String(s).trim().toLowerCase()).filter(Boolean) : [],
      }
    }
  } catch {}
  // Backward compat: derive legacy genre from genres
  const genreEn = genres.main[0] || 'electronic'
  const genreRu = genres.main[0] || 'electronic'

  const coverFallbackAbs = coverAbs ?? path.join(ROOT, 'public', 'media', 'background', 'bg.jpg')
  const coverPreviewAbs = path.join(coverDir, 'cover-preview.webp')

  return {
    slug: slugify(albumName), albumName, sourceDirName: albumName, artist, coverUrl: toPublicUrl(coverFallbackAbs), coverPreviewUrl: (await exists(coverPreviewAbs)) ? toPublicUrl(coverPreviewAbs) : null,
    releaseDate, releaseType, notes, genre: { en: genreEn, ru: genreRu }, genres,
    playlistM3uUrl: (await exists(path.join(playlistsDir, 'full.m3u'))) ? toPublicUrl(path.join(playlistsDir, 'full.m3u')) : null,
    playlistM3u8Url: (await exists(path.join(playlistsDir, 'full.m3u8'))) ? toPublicUrl(path.join(playlistsDir, 'full.m3u8')) : null,
    previewPlaylistM3uUrl: (await exists(path.join(playlistsDir, 'preview.m3u'))) ? toPublicUrl(path.join(playlistsDir, 'preview.m3u')) : null,
    previewPlaylistM3u8Url: (await exists(path.join(playlistsDir, 'preview.m3u8'))) ? toPublicUrl(path.join(playlistsDir, 'preview.m3u8')) : null,
    tracks,
    links,
    hidden: isHidden,
  }
}

async function main() {
  const force = process.argv.includes('--force')
  const entries = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => [])
  const albumNames = entries.filter((d) => d.isDirectory()).map((d) => d.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const allReleases: Release[] = []
  for (const name of albumNames) allReleases.push(await buildRelease(name, force))
  // Filter out hidden releases from public manifest
  const releases = allReleases.filter((r) => !r.hidden)
  const payload = { generatedAt: new Date().toISOString(), releases }
  // Atomic write: write to temp file, then rename to prevent partial reads
  const tmpPath = OUT_PATH + '.tmp'
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`)
  await rename(tmpPath, OUT_PATH)
  console.log(`Generated ${releases.length} releases (${allReleases.length - releases.length} hidden)`)
  for (const r of releases) console.log(`- ${r.albumName} -> ${r.slug} (${r.tracks.length} tracks)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
