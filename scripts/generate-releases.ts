import { readdir, readFile, stat, writeFile, access, mkdir, copyFile, rename } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

type DownloadFormat = 'flac' | 'mp3' | 'ogg' | 'wav'

type Track = {
  index: number
  title: string
  url: string
  streamUrl: string | null
  sourceUrl: string | null
  previewUrl: string | null
  duration: number | null
  availableDownloadFormats: DownloadFormat[]
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
  availableDownloadFormats: DownloadFormat[]
  tracks: Track[]
  links: { spotify: string | null; yandexMusic: string | null; bandcamp: string | null; soundcloud: string | null }
}

const ROOT = process.cwd()
const MUSIC_ROOT = path.join(ROOT, 'public', 'media', 'music')
const OUT_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')

const TRACK_EXT_RE = /\.(wav|mp3|flac|ogg|m4a|aac)$/i
const COVER_EXT_RE = /\.(jpg|jpeg|png|webp|avif)$/i

function slugify(value: string): string {
  return value.toLowerCase().replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-')
}
function normalizeTrackTitle(fileName: string): string { return fileName.replace(/\.[^.]+$/, '').trim() }
function toSafeTrackStem(fileName: string): string { return slugify(fileName.replace(/\.[^.]+$/, '')) }
function toPublicUrl(absPath: string): string { return `/${path.relative(path.join(ROOT, 'public'), absPath).split(path.sep).join('/')}` }

function parseDateFromNotes(notes: string): string | null {
  const m = notes.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (!m) return null
  return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`
}

async function exists(p: string): Promise<boolean> { try { await access(p); return true } catch { return false } }

async function runFfmpeg(args: string[]) {
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
}

async function ensureTranscodedFormats(sourceAbs: string, stem: string, tracksDir: string, coverAbs: string | null, force: boolean) {
  const fmtDir = path.join(tracksDir, 'download')
  await mkdir(fmtDir, { recursive: true })

  const flacOut = path.join(fmtDir, `${stem}.flac`)
  const mp3Out = path.join(fmtDir, `${stem}.mp3`)
  const oggOut = path.join(fmtDir, `${stem}.ogg`)
  const wavOut = path.join(fmtDir, `${stem}.wav`)

  const ext = path.extname(sourceAbs).toLowerCase()
  const withCover = async (baseArgs: string[], output: string, codec: 'flac' | 'mp3') => {
    if (coverAbs && await exists(coverAbs)) {
      if (codec === 'mp3') {
        await runFfmpeg([
          '-y', '-i', sourceAbs, '-i', coverAbs,
          '-map', '0:a', '-map', '1:v',
          '-map_metadata', '-1', '-sn', '-dn', '-ac', '2',
          ...baseArgs,
          '-id3v2_version', '3',
          '-metadata:s:v', 'title=Album cover',
          '-metadata:s:v', 'comment=Cover (front)',
          output,
        ])
        return
      }
      await runFfmpeg([
        '-y', '-i', sourceAbs, '-i', coverAbs,
        '-map', '0:a', '-map', '1:v',
        '-map_metadata', '-1', '-sn', '-dn', '-ac', '2',
        ...baseArgs,
        '-disposition:v', 'attached_pic',
        output,
      ])
      return
    }
    await runFfmpeg(['-y', '-i', sourceAbs, '-map_metadata', '-1', '-vn', '-sn', '-dn', '-ac', '2', ...baseArgs, output])
  }

  if ((ext === '.wav' || ext === '.flac') && (force || !(await exists(flacOut)))) {
    await withCover(['-c:a', 'flac', '-sample_fmt', 's16', '-ar', '44100'], flacOut, 'flac')
  }
  if (ext !== '.mp3' && (force || !(await exists(mp3Out)))) {
    await withCover(['-c:a', 'libmp3lame', '-b:a', '320k', '-ar', '44100'], mp3Out, 'mp3')
  }
  if (ext === '.mp3' && (force || !(await exists(mp3Out)))) {
    await withCover(['-c:a', 'libmp3lame', '-b:a', '320k', '-ar', '44100'], mp3Out, 'mp3')
  }
  if (force || !(await exists(oggOut))) await runFfmpeg(['-y', '-i', sourceAbs, '-map_metadata', '-1', '-vn', '-sn', '-dn', '-ac', '2', '-c:a', 'libopus', '-b:a', '192k', '-vbr', 'on', '-ar', '48000', oggOut])
  if (ext === '.wav' && (force || !(await exists(wavOut)))) {
    await runFfmpeg(['-y', '-i', sourceAbs, '-map_metadata', '-1', '-vn', '-sn', '-dn', '-ac', '2', '-c:a', 'pcm_s16le', '-ar', '44100', wavOut])
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

async function buildRelease(albumName: string, force: boolean): Promise<Release> {
  const albumDir = path.join(MUSIC_ROOT, albumName)
  const coverDir = path.join(albumDir, 'cover')
  const tracksDir = path.join(albumDir, 'tracks')
  const notesFile = path.join(albumDir, 'notes', 'notes')
  const playlistsDir = path.join(albumDir, 'playlists')

  const sourceTracksDir = path.join(tracksDir, 'source')
  await mkdir(sourceTracksDir, { recursive: true })

  const rootTrackFiles = (await readdir(tracksDir).catch(() => [])).filter((f) => TRACK_EXT_RE.test(f))
  for (const fileName of rootTrackFiles) {
    const from = path.join(tracksDir, fileName)
    const to = path.join(sourceTracksDir, fileName)
    if (!(await exists(to))) {
      await rename(from, to).catch(() => {})
    }
  }

  const trackFiles = (await readdir(sourceTracksDir).catch(() => [])).filter((f) => TRACK_EXT_RE.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  const covers = (await readdir(coverDir).catch(() => [])).filter((f) => COVER_EXT_RE.test(f) && !/^cover-preview\./i.test(f))
  const coverAbs = covers[0] ? path.join(coverDir, covers[0]) : null
  const downloadDir = path.join(tracksDir, 'download')
  await mkdir(downloadDir, { recursive: true })
  if (coverAbs && await exists(coverAbs)) {
    await copyFile(coverAbs, path.join(downloadDir, 'cover.jpg')).catch(() => {})
  }
  const fullPlaylist = await readPlaylistTracks(path.join(playlistsDir, 'full.m3u8'))
  const previewPlaylist = await readPlaylistTracks(path.join(playlistsDir, 'preview.m3u8'))

  const tracks: Track[] = []
  for (const [i, fileName] of trackFiles.entries()) {
    const abs = path.join(sourceTracksDir, fileName)
    await stat(abs)
    const stem = toSafeTrackStem(fileName)
    await ensureTranscodedFormats(abs, stem, tracksDir, coverAbs, force)

    const streamFallback = path.join(tracksDir, 'stream', stem, 'index.m3u8')
    const previewFallback = path.join(tracksDir, 'preview', `${stem}.ogg`)
    const pTrack = fullPlaylist[i]
    const pPrev = previewPlaylist[i]

    tracks.push({
      index: i + 1,
      title: pTrack?.title || normalizeTrackTitle(fileName),
      url: pTrack?.url || (await exists(streamFallback) ? toPublicUrl(streamFallback) : toPublicUrl(abs)),
      streamUrl: pTrack?.url || (await exists(streamFallback) ? toPublicUrl(streamFallback) : null),
      sourceUrl: toPublicUrl(abs),
      previewUrl: pPrev?.url || (await exists(previewFallback) ? toPublicUrl(previewFallback) : null),
      duration: null,
      availableDownloadFormats: formatsForFile(fileName),
      links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null },
    })
  }

  const notes = (await readFile(notesFile, 'utf8').catch(() => '')).trim()
  const releaseDate = parseDateFromNotes(notes) || (() => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` })()
  const coverFallbackAbs = coverAbs ?? path.join(ROOT, 'public', 'media', 'background', 'bg.jpg')
  const coverPreviewAbs = path.join(coverDir, 'cover-preview.webp')
  const allFormats: DownloadFormat[] = ['flac', 'mp3', 'ogg', 'wav'].filter((fmt) => tracks.length > 0 && tracks.every((t) => t.availableDownloadFormats.includes(fmt as DownloadFormat))) as DownloadFormat[]

  return {
    slug: slugify(albumName), albumName, sourceDirName: albumName, coverUrl: toPublicUrl(coverFallbackAbs), coverPreviewUrl: (await exists(coverPreviewAbs)) ? toPublicUrl(coverPreviewAbs) : null,
    releaseDate, releaseType: 'album', notes, genre: { en: 'Electronic', ru: 'Электроника' },
    playlistM3uUrl: (await exists(path.join(playlistsDir, 'full.m3u'))) ? toPublicUrl(path.join(playlistsDir, 'full.m3u')) : null,
    playlistM3u8Url: (await exists(path.join(playlistsDir, 'full.m3u8'))) ? toPublicUrl(path.join(playlistsDir, 'full.m3u8')) : null,
    previewPlaylistM3uUrl: (await exists(path.join(playlistsDir, 'preview.m3u'))) ? toPublicUrl(path.join(playlistsDir, 'preview.m3u')) : null,
    previewPlaylistM3u8Url: (await exists(path.join(playlistsDir, 'preview.m3u8'))) ? toPublicUrl(path.join(playlistsDir, 'preview.m3u8')) : null,
    availableDownloadFormats: allFormats, tracks,
    links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null },
  }
}

async function main() {
  const force = process.argv.includes('--force')
  const entries = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => [])
  const albumNames = entries.filter((d) => d.isDirectory()).map((d) => d.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const releases: Release[] = []
  for (const name of albumNames) releases.push(await buildRelease(name, force))
  const payload = { generatedAt: new Date().toISOString(), releases }
  await writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`Generated ${releases.length} releases`)
  for (const r of releases) console.log(`- ${r.albumName} -> ${r.slug} (${r.tracks.length} tracks)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
