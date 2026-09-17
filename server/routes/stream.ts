import { Readable } from 'node:stream'
import { readFile, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { Elysia } from 'elysia'
import { acquireFfmpegSlot, releaseFfmpegSlot } from '../lib/media/ffmpeg-pool.js'

type Quality = 'extreme_lobit' | 'low' | 'medium' | 'high' | 'superb'

const QUALITIES: Record<Quality, { codec: string; bitrate: string | null; channels: number; sampleRate: number | null; format: string; mime: string; ext: string }> = {
  extreme_lobit: { codec: 'libmp3lame', bitrate: '32k', channels: 1, sampleRate: 22050, format: 'mp3', mime: 'audio/mpeg', ext: 'mp3' },
  low:           { codec: 'libmp3lame', bitrate: '64k', channels: 2, sampleRate: 44100, format: 'mp3', mime: 'audio/mpeg', ext: 'mp3' },
  medium:        { codec: 'libmp3lame', bitrate: '128k', channels: 2, sampleRate: 44100, format: 'mp3', mime: 'audio/mpeg', ext: 'mp3' },
  high:          { codec: 'libmp3lame', bitrate: '192k', channels: 2, sampleRate: 44100, format: 'mp3', mime: 'audio/mpeg', ext: 'mp3' },
  superb:        { codec: 'flac', bitrate: null, channels: 2, sampleRate: null, format: 'flac', mime: 'audio/flac', ext: 'flac' },
}

export function createStreamRouter(manifestPath: string, publicDir: string) {
  let manifest: { releases: Array<{ slug: string; sourceDirName: string; tracks: Array<{ index: number; title: string; sourceUrl: string | null }> }> } | null = null
  let manifestMtimeMs = 0

  async function loadManifest(): Promise<NonNullable<typeof manifest>> {
    // Reload whenever the manifest file changes on disk (uploads/reorders
    // rewrite it); otherwise tracks would 404 until the next server restart.
    const mtime = await stat(manifestPath).then((s) => s.mtimeMs).catch(() => 0)
    if (!manifest || mtime !== manifestMtimeMs) {
      const raw = await readFile(manifestPath, 'utf-8')
      manifest = JSON.parse(raw)
      manifestMtimeMs = mtime
    }
    return manifest!
  }

  return new Elysia({ prefix: '/api' })
    .get('/stream/:trackId', async ({ params, query, request, set }) => {
      const trackId = params.trackId
      const qualityParam = (typeof query.quality === 'string' ? query.quality : 'medium') as Quality

      if (!QUALITIES[qualityParam]) {
        set.status = 400
        return { error: `Invalid quality. Use: ${Object.keys(QUALITIES).join(', ')}` }
      }

      const parts = trackId.split('::')
      if (parts.length !== 2) {
        set.status = 400
        return { error: 'Invalid trackId format. Use {slug}::{index}' }
      }

      const [slug, indexStr] = parts
      const index = Number(indexStr)
      if (!Number.isInteger(index) || index < 1) {
        set.status = 400
        return { error: 'Invalid track index' }
      }

      const m = await loadManifest()
      const release = m.releases.find(r => r.slug === slug)
      if (!release) {
        set.status = 404
        return { error: 'Release not found' }
      }

      const track = release.tracks.find(t => t.index === index)
      if (!track || !track.sourceUrl) {
        set.status = 404
        return { error: 'Track not found or no source file' }
      }

      const sourcePath = path.resolve(path.join(publicDir, track.sourceUrl.replace(/^\//, '')))
      if (!sourcePath.startsWith(path.resolve(publicDir) + path.sep)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      try {
        await stat(sourcePath)
      } catch {
        set.status = 404
        return { error: 'Source file not found on disk' }
      }

      const quality = QUALITIES[qualityParam]

      const disposition = `inline; filename="${track.title}.${quality.ext}"`

      if (qualityParam === 'superb') {
        // Bun.file responses handle Range requests automatically.
        set.headers['content-type'] = quality.mime
        set.headers['content-disposition'] = disposition
        set.headers['accept-ranges'] = 'bytes'
        return new Response(Bun.file(sourcePath))
      }

      set.headers['content-type'] = quality.mime
      set.headers['content-disposition'] = disposition

      const ffArgs = [
        '-y',
        ...(query.start != null && query.start !== '' ? ['-ss', String(Number(query.start) || 0)] : []),
        '-i', sourcePath,
        '-map', '0:a:0',
        '-c:a', quality.codec,
        ...(quality.bitrate ? ['-b:a', quality.bitrate] : []),
        ...(quality.sampleRate ? ['-ar', String(quality.sampleRate)] : []),
        '-ac', String(quality.channels),
        '-f', quality.format,
        'pipe:1',
      ]

      await acquireFfmpegSlot()
      const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...ffArgs], { stdio: ['ignore', 'pipe', 'pipe'] })

      const stdoutWeb = Readable.toWeb(ff.stdout) as unknown as ReadableStream<Uint8Array>

      let slotReleased = false
      ff.on('error', () => {
        if (!slotReleased) { slotReleased = true; releaseFfmpegSlot() }
      })
      ff.on('close', () => {
        if (!slotReleased) { slotReleased = true; releaseFfmpegSlot() }
      })
      request.signal.addEventListener('abort', () => {
        if (!ff.killed && ff.exitCode === null) {
          ff.kill('SIGTERM')
        }
      })

      set.headers['content-type'] = quality.mime
      return new Response(stdoutWeb)
    })
}
