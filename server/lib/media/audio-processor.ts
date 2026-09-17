import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { runFfmpeg, runFfmpegWithProgress } from './ffmpeg-pool.js'
import { audioConfig } from '../audio-config.js'
import { buildFilterChain } from './filter-chain.js'

export async function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const ff = spawn(audioConfig.ffmpeg.ffprobePath, [
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

export async function convertAudioToHls(src: string, destDir: string, keepSource = true): Promise<{ playlist: string }> {
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
  plugins?: Array<{ name: string; params: Record<string, number | string> }>
}

export type AudioMetadata = {
  title?: string
  artist?: string
  album?: string
  trackNumber?: number
  date?: string
  genre?: string
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

export function cacheKeyFromOpts(trackOrigin: string, opts: ConvertAudioOpts): string {
  const canonical = JSON.stringify({ trackOrigin, format: opts.format, sampleRate: opts.sampleRate, bitDepth: opts.bitDepth, channels: opts.channels, resampler: opts.resampler, bitrateMode: opts.bitrateMode, bitrate: opts.bitrate, plugins: opts.plugins })
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

export async function convertAudioToFormatProgress(
  src: string, destDir: string, stem: string, opts: ConvertAudioOpts,
  onProgress?: (pct: number) => void,
  metadata?: AudioMetadata,
  coverArtPath?: string,
  signal?: AbortSignal,
): Promise<string> {
  const ext = formatFileExt(opts.format)
  const outFile = `${stem}${ext}`
  const outPath = path.join(destDir, outFile)

  const audioFilters: string[] = []

  if (opts.resampler !== 'none') {
    const resamplerFlag = opts.resampler === 'sinc' ? 'resampler=soxr' : 'resampler=soxr:precision=28'
    audioFilters.push(`aresample=${opts.sampleRate}:${resamplerFlag}`)
  }

  if (opts.plugins && opts.plugins.length > 0) {
    audioFilters.push(...buildFilterChain(opts.plugins))
  }

  const canEmbedCover = coverArtPath && opts.format === 'flac'
  const args: string[] = ['-y']

  if (canEmbedCover) {
    args.push('-i', coverArtPath)
  }
  args.push('-i', src, '-map_metadata', '-1', '-sn', '-dn')

  if (audioFilters.length > 0) {
    args.push('-af', audioFilters.join(','))
  }

  args.push('-ar', String(opts.sampleRate))
  args.push('-ac', String(opts.channels))

  switch (opts.format) {
    case 'wav':
      args.push('-vn', '-c:a', pcmCodec(opts.bitDepth, true), '-f', 'wav')
      break
    case 'flac': {
      const sampleFmt = opts.bitDepth <= 16 ? 's16' : 's32'
      args.push('-c:a', 'flac', '-sample_fmt', sampleFmt, '-compression_level', '5')
      break
    }
    case 'aiff':
      args.push('-vn', '-c:a', pcmCodec(opts.bitDepth, false), '-f', 'aiff')
      break
    case 'raw':
      args.push('-vn', '-f', pcmCodec(opts.bitDepth, true))
      break
    case 'ogg-opus':
      args.push('-c:a', 'libopus', '-b:a', `${opts.bitrate}k`)
      args.push('-vbr', opts.bitrateMode === 'cbr' ? 'off' : 'on')
      break
    case 'ogg-vorbis':
      args.push('-c:a', 'libvorbis')
      if (opts.bitrateMode === 'vbr') {
        args.push('-qscale:a', '5')
      } else {
        args.push('-b:a', `${opts.bitrate}k`)
      }
      break
  }

  if (canEmbedCover) {
    args.push('-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-disposition:v', 'attached_pic')
  }

  if (metadata) {
    const sanitize = (s: string) => s.replace(/[;\n\r\0]/g, ' ')
    if (metadata.title) args.push('-metadata', `title=${sanitize(metadata.title)}`)
    if (metadata.artist) args.push('-metadata', `artist=${sanitize(metadata.artist)}`)
    if (metadata.album) args.push('-metadata', `album=${sanitize(metadata.album)}`)
    if (metadata.trackNumber != null) args.push('-metadata', `track=${metadata.trackNumber}`)
    if (metadata.date) args.push('-metadata', `date=${sanitize(metadata.date)}`)
    if (metadata.genre) args.push('-metadata', `genre=${sanitize(metadata.genre)}`)
  }

  args.push(outPath)

  await mkdir(destDir, { recursive: true })
  try {
    await runFfmpegWithProgress(args, onProgress, undefined, signal)
  } catch (err) {
    // A failed/cancelled conversion must not leave a partial file that a later
    // request would mistake for a complete cached conversion.
    await rm(outPath, { force: true }).catch(() => {})
    throw err
  }

  return outFile
}
