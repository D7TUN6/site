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
}

type Release = {
  slug: string
  albumName: string
  sourceDirName: string
  coverUrl: string
  coverPreviewUrl: string | null
  releaseDate: string
  releaseType?: string | null
  notes: string
  genre: { en: string; ru: string }
  playlistM3uUrl: string | null
  playlistM3u8Url: string | null
  previewPlaylistM3uUrl: string | null
  previewPlaylistM3u8Url: string | null
  tracks: Track[]
  links: { spotify: string | null; yandexMusic: string | null; bandcamp: string | null; soundcloud: string | null }
  hidden?: boolean
}

const ROOT = process.cwd()
const MUSIC_ROOT = path.join(ROOT, 'public', 'media', 'music')
const OUT_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')

const TRACK_EXT_RE = /\.(wav|mp3|flac|ogg|m4a|aac)$/i
const COVER_EXT_RE = /\.(jpg|jpeg|png|webp|avif)$/i

function slugify(value: string): string {
  return value.toLowerCase().replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-')
}
function normalizeTrackTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '').trim()
  // Strip numeric prefix used for ordering (e.g., "01__My Song" -> "My Song")
  return withoutExt.replace(/^\d+__/, '')
}
function toSafeTrackStem(fileName: string): string { return slugify(fileName.replace(/\.[^.]+$/, '')) }
function toPublicUrl(absPath: string): string { return `/${path.relative(path.join(ROOT, 'public'), absPath).split(path.sep).join('/')}` }

function parseDateFromNotes(notes: string): string | null {
  const m = notes.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (!m) return null
  return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`
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

async function runFfmpeg(args: string[]) {
  await acquireFfmpegSlot()
  try {
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args])
      const err: Buffer[] = []
      ff.stderr.on('data', (c) => err.push(Buffer.from(c)))
      ff.on('error', reject)
      ff.on('close', (code) => {
        if (code === 0) return resolve()
        reject(new Error(Buffer.concat(err).toString('utf8') || `ffmpeg exit ${code}`))
      })
    })
  } finally {
    releaseFfmpegSlot()
  }
}

async function probeSourceInfo(filePath: string): Promise<{ sampleRate: number | null; bitDepth: number | null }> {
  await acquireFfmpegSlot()
  try {
    const out = await new Promise<string>((resolve, reject) => {
      const ff = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate,bits_per_raw_sample', '-of', 'default=noprint_wrappers=1', filePath])
      let data = ''
      ff.stdout.on('data', (c: Buffer) => { data += c.toString() })
      ff.on('error', reject)
      ff.on('close', (code) => {
        if (code === 0) resolve(data)
        else reject(new Error(`ffprobe exit ${code}`))
      })
    })
    const srMatch = out.match(/^sample_rate=(\d+)/m)
    const bdMatch = out.match(/^bits_per_raw_sample=(\d+)/m)
    return {
      sampleRate: srMatch ? parseInt(srMatch[1], 10) : null,
      bitDepth: bdMatch ? parseInt(bdMatch[1], 10) : null,
    }
  } catch {
    return { sampleRate: null, bitDepth: null }
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

function formatsForFile(fileName: string): DownloadFormat[] {
  const ext = path.extname(fileName).toLowerCase()
  if (ext === '.wav') return ['flac', 'mp3', 'ogg', 'wav']
  if (ext === '.flac') return ['flac', 'mp3', 'ogg']
  if (ext === '.mp3' || ext === '.m4a' || ext === '.aac') return ['mp3', 'ogg']
  if (ext === '.ogg') return ['ogg']
  return ['mp3', 'ogg']
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

async function buildRelease(albumName: string, force: boolean): Promise<Release> {
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
    
    // Try to find and move from wav or root
    const wavDir = path.join(tracksDir, 'wav')
    const from = (await exists(path.join(wavDir, fileName))) ? path.join(wavDir, fileName) : path.join(tracksDir, fileName)
    if (await exists(from)) {
      await rename(from, sourceFile).catch(() => {})
    }
  }

  const finalTrackFiles = (await readdir(sourceTracksDir).catch(() => [])).filter((f) => TRACK_EXT_RE.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  const fullPlaylist = await readPlaylistTracks(path.join(playlistsDir, 'full.m3u8'))
  const previewPlaylist = await readPlaylistTracks(path.join(playlistsDir, 'preview.m3u8'))

  const tracks: Track[] = []
  const trackPromises = finalTrackFiles.map(async (fileName, i) => {
    const abs = path.join(sourceTracksDir, fileName)
    await stat(abs)
    const stem = toSafeTrackStem(fileName)
    const sourceInfo = await probeSourceInfo(abs)

    const streamFallback = path.join(tracksDir, 'stream', stem, 'index.m3u8')
    const previewFallback = path.join(tracksDir, 'preview', `${stem}.ogg`)
    const pTrack = fullPlaylist[i]
    const pPrev = previewPlaylist[i]

    return {
      index: i + 1,
      title: pTrack?.title || normalizeTrackTitle(fileName),
      url: pTrack?.url || (await exists(streamFallback) ? toPublicUrl(streamFallback) : toPublicUrl(abs)),
      streamUrl: pTrack?.url || (await exists(streamFallback) ? toPublicUrl(streamFallback) : null),
      sourceUrl: toPublicUrl(abs),
      previewUrl: pPrev?.url || (await exists(previewFallback) ? toPublicUrl(previewFallback) : null),
      duration: null,
      sourceSampleRate: sourceInfo.sampleRate,
      sourceBitDepth: sourceInfo.bitDepth,
      links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null },
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
  
  const coverFallbackAbs = coverAbs ?? path.join(ROOT, 'public', 'media', 'background', 'bg.jpg')
  const coverPreviewAbs = path.join(coverDir, 'cover-preview.webp')

  return {
    slug: slugify(albumName), albumName, sourceDirName: albumName, coverUrl: toPublicUrl(coverFallbackAbs), coverPreviewUrl: (await exists(coverPreviewAbs)) ? toPublicUrl(coverPreviewAbs) : null,
    releaseDate, releaseType, notes, genre: { en: 'Electronic', ru: 'Электроника' },
    playlistM3uUrl: (await exists(path.join(playlistsDir, 'full.m3u'))) ? toPublicUrl(path.join(playlistsDir, 'full.m3u')) : null,
    playlistM3u8Url: (await exists(path.join(playlistsDir, 'full.m3u8'))) ? toPublicUrl(path.join(playlistsDir, 'full.m3u8')) : null,
    previewPlaylistM3uUrl: (await exists(path.join(playlistsDir, 'preview.m3u'))) ? toPublicUrl(path.join(playlistsDir, 'preview.m3u')) : null,
    previewPlaylistM3u8Url: (await exists(path.join(playlistsDir, 'preview.m3u8'))) ? toPublicUrl(path.join(playlistsDir, 'preview.m3u8')) : null,
    tracks,
    links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null },
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
