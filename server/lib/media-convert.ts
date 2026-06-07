import { spawn } from 'node:child_process'
import { mkdir, rm, access, rename } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

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

export async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

export async function runFfmpeg(args: string[]): Promise<void> {
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

export async function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const ff = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])
    let out = ''
    const err: Buffer[] = []
    ff.stdout.on('data', (c) => out += String(c))
    ff.stderr.on('data', (c) => err.push(Buffer.from(c)))
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code === 0) resolve(parseFloat(out.trim()) || 0)
      else reject(new Error(Buffer.concat(err).toString('utf8') || `ffprobe exit ${code}`))
    })
  })
}

export const IMAGE_CONVERT_EXTS = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.bmp'])

export async function processGalleryImage(src: string, destDir: string): Promise<{ webp: string; preview: string; avif: string }> {
  const ext = path.extname(src).toLowerCase()
  const base = path.basename(src, ext)
  const webpFilename = `${base}.webp`
  const avifFilename = `${base}.avif`
  const previewFilename = `${base}-preview.webp`

  const webpPath = path.join(destDir, webpFilename)
  const avifPath = path.join(destDir, avifFilename)
  const previewPath = path.join(destDir, previewFilename)

  if (IMAGE_CONVERT_EXTS.has(ext)) {
    await sharp(src).webp({ quality: 82 }).toFile(webpPath)
    await sharp(src).avif({ quality: 65 }).toFile(avifPath).catch(() => {})
    await rm(src, { force: true })
  } else if (ext === '.webp') {
    await sharp(src).avif({ quality: 65 }).toFile(avifPath).catch(() => {})
  }

  await sharp(webpPath || src)
    .resize(400)
    .webp({ quality: 70 })
    .toFile(previewPath)

  return { webp: webpFilename, preview: previewFilename, avif: avifFilename }
}

export async function processCoverImage(src: string, destDir: string): Promise<{ webp: string; preview: string }> {
  const ext = path.extname(src).toLowerCase()
  const base = path.basename(src, ext)
  const webpFilename = `${base}.webp`
  const previewFilename = `${base}-preview.webp`

  const webpPath = path.join(destDir, webpFilename)
  const previewPath = path.join(destDir, previewFilename)

  if (IMAGE_CONVERT_EXTS.has(ext)) {
    await sharp(src).webp({ quality: 85 }).toFile(webpPath)
    await rm(src, { force: true })
  }

  await sharp(webpPath || src)
    .resize(400)
    .webp({ quality: 70 })
    .toFile(previewPath)

  return { webp: webpFilename, preview: previewFilename }
}

export async function convertVideoToHls(src: string, destDir: string, filename: string): Promise<{ playlist: string; thumbnail: string }> {
  const stem = path.basename(filename, path.extname(filename))
  const hlsDir = path.join(destDir, 'hls')
  await mkdir(hlsDir, { recursive: true })

  const playlistPath = path.join(hlsDir, 'index.m3u8')
  const thumbnailPath = path.join(destDir, `${stem}-thumb.webp`)

  await runFfmpeg([
    '-y', '-i', src,
    '-vf', 'scale=-2:720',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0',
    '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
    playlistPath,
  ])

  await runFfmpeg([
    '-y', '-i', src,
    '-vf', 'scale=640:-1',
    '-vframes', '1',
    thumbnailPath,
  ])

  await rm(src, { force: true })

  return { playlist: `hls/index.m3u8`, thumbnail: `${stem}-thumb.webp` }
}

export async function convertAudioToHls(src: string, destDir: string, filename: string, keepSource = true): Promise<{ playlist: string }> {
  const stem = path.basename(filename, path.extname(filename))
  const hlsDir = path.join(destDir, 'hls')
  await mkdir(hlsDir, { recursive: true })

  const playlistPath = path.join(hlsDir, 'index.m3u8')

  await runFfmpeg([
    '-y', '-i', src,
    '-c:a', 'aac', '-b:a', '128k',
    '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0',
    '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
    playlistPath,
  ])

  if (!keepSource) {
    await rm(src, { force: true })
  }

  return { playlist: `hls/index.m3u8` }
}

export async function generateVideoThumbnail(src: string, destDir: string): Promise<string> {
  const ext = path.extname(src).toLowerCase()
  const base = path.basename(src, ext)
  const thumbFilename = `${base}-thumb.webp`
  const thumbPath = path.join(destDir, thumbFilename)

  await runFfmpeg([
    '-y', '-i', src,
    '-vf', 'scale=640:-1',
    '-vframes', '1',
    thumbPath,
  ])

  return thumbFilename
}

export type AudioFormat = 'wav' | 'flac' | 'ogg-opus' | 'ogg-vorbis' | 'aiff' | 'raw'
export type AudioBitDepth = 8 | 16 | 24 | 32 | 64
export type AudioChannels = 1 | 2 | 4 | 8
export type AudioResampler = 'none' | 'sinc' | 'r8brain'
export type AudioBitrateMode = 'cbr' | 'vbr'

export type ConvertAudioOpts = {
  format: AudioFormat
  sampleRate: number
  bitDepth: AudioBitDepth
  channels: AudioChannels
  resampler: AudioResampler
  bitrateMode: AudioBitrateMode
  bitrate: number
}

function pcmCodec(depth: AudioBitDepth, le: boolean): string {
  if (depth === 8) return 'pcm_u8'
  if (depth === 16) return le ? 'pcm_s16le' : 'pcm_s16be'
  if (depth === 24) return le ? 'pcm_s24le' : 'pcm_s24be'
  if (depth === 32) return le ? 'pcm_s32le' : 'pcm_s32be'
  return le ? 'pcm_s64le' : 'pcm_s64be'
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

export function cacheKeyFromOpts(opts: ConvertAudioOpts): string {
  const str = `${opts.format}|${opts.sampleRate}|${opts.bitDepth}|${opts.channels}|${opts.resampler}|${opts.bitrateMode}|${opts.bitrate}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export async function convertAudioToFormat(src: string, destDir: string, stem: string, opts: ConvertAudioOpts): Promise<string> {
  const ext = formatFileExt(opts.format)
  const outFile = `${stem}${ext}`
  const outPath = path.join(destDir, outFile)

  const audioFilters: string[] = []

  if (opts.resampler !== 'none') {
    const resamplerFlag = opts.resampler === 'sinc' ? 'resampler=soxr' : 'resampler=soxr:precision=28'
    audioFilters.push(`aresample=${opts.sampleRate}:${resamplerFlag}`)
  }

  const args: string[] = ['-y', '-i', src, '-map_metadata', '-1', '-vn', '-sn', '-dn']

  if (audioFilters.length > 0) {
    args.push('-af', audioFilters.join(','))
  }

  args.push('-ar', String(opts.sampleRate))
  args.push('-ac', String(opts.channels))

  switch (opts.format) {
    case 'wav':
      args.push('-c:a', pcmCodec(opts.bitDepth, true), '-f', 'wav')
      break
    case 'flac': {
      const sampleFmt = opts.bitDepth <= 16 ? 's16' : 's32'
      args.push('-c:a', 'flac', '-sample_fmt', sampleFmt, '-compression_level', '5')
      break
    }
    case 'aiff':
      args.push('-c:a', pcmCodec(opts.bitDepth, false), '-f', 'aiff')
      break
    case 'raw':
      args.push('-f', pcmCodec(opts.bitDepth, true))
      break
    case 'ogg-opus':
      args.push('-c:a', 'libopus', '-b:a', `${opts.bitrate}k`)
      args.push('-vbr', opts.bitrateMode === 'cbr' ? 'off' : 'on')
      break
    case 'ogg-vorbis':
      args.push('-c:a', 'libvorbis', '-b:a', `${opts.bitrate}k`)
      if (opts.bitrateMode === 'vbr') args.push('-qscale:a', '5')
      break
  }

  args.push(outPath)

  await mkdir(destDir, { recursive: true })
  await runFfmpeg(args)

  return outFile
}

let rebuildTimeout: ReturnType<typeof setTimeout> | null = null

export function spawnRebuild() {
  if (rebuildTimeout) return // already scheduled
  rebuildTimeout = setTimeout(() => {
    rebuildTimeout = null
    // Regenerate releases manifest (frontend fetches it at runtime via /api/releases/manifest)
    const generator = spawn('node', ['node_modules/tsx/dist/cli.mjs', 'scripts/generate-releases.ts'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let genOutput = ''
    generator.stdout.on('data', (c: Buffer) => { genOutput += c.toString() })
    generator.stderr.on('data', (c: Buffer) => { genOutput += c.toString() })
    generator.on('close', (genCode) => {
      if (genCode !== 0) console.error('Release manifest generation failed:', genOutput)
      else console.log('Release manifest regenerated:', genOutput.trim())
    })
  }, 2000) // 2 second debounce
}
