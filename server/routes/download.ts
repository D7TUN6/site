import path from 'node:path'
import { Elysia } from 'elysia'
import { stat } from 'node:fs/promises'
import type { ReleaseDownloadService, DownloadOptions } from '../lib/release-download-service.js'
import type { JobEvent } from '../lib/release-download-types.js'
import { getCookieByName } from '../lib/cookies.js'
import { trackActiveNode } from '../lib/active-nodes.js'

export function createDownloadRouter(service: ReleaseDownloadService) {
  function getSessionId(request: Request): string | null {
    return getCookieByName(request.headers.get('cookie'), 'sid')
  }

  return new Elysia({ prefix: '/api/download' })
    .post('/prepare', async ({ body, request, set }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const slug = b.slug
        const track = b.track
        const format = b.format
        const sampleRate = b.sampleRate
        const bitDepth = b.bitDepth
        const channels = b.channels
        const resampler = b.resampler
        const bitrateMode = b.bitrateMode
        const bitrate = b.bitrate

        if (!slug || typeof slug !== 'string') {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        if (!service.isValidFormat(typeof format === 'string' ? format : null)) {
          set.status = 400
          return { error: 'Unsupported format' }
        }

        const opts: DownloadOptions = {
          format: format as DownloadOptions['format'],
          sampleRate: Number(sampleRate) || 44100,
          bitDepth: (Number(bitDepth) || 16) as DownloadOptions['bitDepth'],
          channels: (Number(channels) || 2) as DownloadOptions['channels'],
          resampler: (resampler || 'none') as DownloadOptions['resampler'],
          bitrateMode: (bitrateMode || 'vbr') as DownloadOptions['bitrateMode'],
          bitrate: Number(bitrate) || 320,
          normalize: (b.normalize === 'standard' || b.normalize === 'loud') ? b.normalize : 'off',
        }

        const sessionId = getSessionId(request)

        let jobId: string
        if (track != null) {
          service.validateTrackRequest(slug, String(track))
          jobId = await service.startTrackJob(slug, Number(track), opts, sessionId)
        } else {
          service.validateReleaseRequest(slug)
          jobId = await service.startReleaseJob(slug, opts, sessionId)
        }

        return { jobId }
      } catch (err) {
        set.status = (err as { status?: number })?.status || 500
        return { error: err instanceof Error ? err.message : 'Internal error' }
      }
    })
    .get('/job/:jobId', async ({ params, request, set }) => {
      const jobId = params.jobId
      const job = service.getJob(jobId)

      if (!job) {
        set.status = 404
        return { error: 'Job not found' }
      }

      const sessionId = getSessionId(request)
      if (job.sessionId && job.sessionId !== sessionId) {
        set.status = 403
        return { error: 'Access denied' }
      }

      if (job.done && job.filePath) {
        const stats = await stat(job.filePath).catch(() => null)
        if (!stats) {
          set.status = 404
          return { error: 'File not found' }
        }

        const filename = encodeURIComponent(job.filename || 'download')
        const ext = path.extname(job.filename || '').toLowerCase()
        const isZip = ext === '.zip'
        set.headers['content-disposition'] = `attachment; filename*=UTF-8''${filename}; filename="${job.filename || 'download'}"`
        set.headers['content-type'] = isZip ? 'application/zip' : 'application/octet-stream'

        return new Response(Bun.file(job.filePath))
      }

      if (job.done && job.error) {
        set.status = 500
        return { error: job.error }
      }

      set.status = 202
      return { jobId, done: job.done }
    })
    .get('/job/:jobId/events', ({ params, request, set }) => {
      const jobId = params.jobId
      const job = service.getJob(jobId)

      if (!job) {
        set.status = 404
        return { error: 'Job not found' }
      }

      const sessionId = getSessionId(request)
      if (job.sessionId && job.sessionId !== sessionId) {
        set.status = 403
        return { error: 'Access denied' }
      }

      if (job.cancelled) {
        set.status = 410
        return { error: job.error || 'Download cancelled' }
      }

      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false
          const push = (chunk: string) => {
            if (!closed) {
              try { controller.enqueue(encoder.encode(chunk)) } catch { closed = true }
            }
          }
          const onEvent = (event: JobEvent) => {
            push(`data: ${JSON.stringify(event)}\n\n`)
          }

          for (const ev of job.events) {
            onEvent(ev as JobEvent)
          }

          if (job.done) {
            closed = true
            try { controller.close() } catch { /* already closed */ }
            return
          }

          // Track this SSE subscriber so the job can be cancelled when the
          // last client disconnects mid-conversion (page closed/navigated).
          service.registerSubscriber(jobId)
          job.emitter.on('event', onEvent)
          const releaseNode = trackActiveNode()

          // Keep SSE alive during long conversions (e.g. 192kHz/32-bit multi-hour files)
          const heartbeat = setInterval(() => {
            push(':heartbeat\n\n')
          }, 30_000)

          const cleanup = () => {
            if (closed) return
            closed = true
            releaseNode()
            clearInterval(heartbeat)
            try { controller.close() } catch { /* ignore */ }
            const remaining = service.unregisterSubscriber(jobId)
            const current = service.getJob(jobId)
            if (remaining === 0 && current && !current.done && !current.cancelled) {
              // The user left the site mid-conversion — stop the work instead
              // of letting ffmpeg keep re-encoding tracks nobody will receive.
              service.cancelJob(jobId, 'User disconnected — download cancelled')
            }
          }

          request.signal.addEventListener('abort', cleanup)
        },
      })

      set.headers['content-type'] = 'text/event-stream'
      set.headers['cache-control'] = 'no-cache'
      set.headers['connection'] = 'keep-alive'
      return new Response(stream)
    })
}
