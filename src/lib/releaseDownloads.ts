import type { ReleaseEntry, AudioFormat, AudioBitDepth, AudioChannels, AudioResampler, AudioBitrateMode } from '@/types/content'

export type DownloadFormatArgs = {
  format: AudioFormat
  sampleRate: number
  bitDepth: AudioBitDepth
  channels: AudioChannels
  resampler: AudioResampler
  bitrateMode: AudioBitrateMode
  bitrate: number
  normalize?: 'standard' | 'loud' | 'off'
}

export type DownloadProgressEvent =
  | { type: 'meta'; trackCount: number; tracks: Array<{ index: number; title: string }> }
  | { type: 'convert-start'; track: number; title: string }
  | { type: 'convert-progress'; track: number; progress: number }
  | { type: 'convert-done'; track: number }
  | { type: 'zip-progress'; progress: number }
  | { type: 'done'; filePath: string; filename: string }
  | { type: 'error'; error: string }

function parseDownloadFileName(contentDisposition: string | null, fallbackName: string): string {
  if (!contentDisposition) return fallbackName
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try { return decodeURIComponent(utf8Match[1]) } catch { console.warn('Failed to decode download filename'); return utf8Match[1] }
  }
  const simpleMatch = contentDisposition.match(/filename="([^"]+)"/i)
  if (simpleMatch?.[1]) return simpleMatch[1]
  return fallbackName
}

function abortError(): Error {
  return new DOMException('Aborted', 'AbortError')
}

function awaitJobDone(
  jobId: string,
  onProgress: (event: DownloadProgressEvent) => void,
  signal?: AbortSignal,
): Promise<{ filePath: string; filename: string }> {
  const es = new EventSource(`/api/download/job/${encodeURIComponent(jobId)}/events`)
  let esClosed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const settleFailure = (err: Error) => {
    if (esClosed) return
    esClosed = true
    es.close()
    if (signal) signal.removeEventListener('abort', handleAbort)
    reject(err)
  }

  let reject: (err: Error) => void = () => {}

  const handleAbort = () => {
    settleFailure(abortError())
  }

  return new Promise<{ filePath: string; filename: string }>((resolve, rejectPromise) => {
    reject = rejectPromise

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as DownloadProgressEvent
        onProgress(event)
        if (event.type === 'done') {
          if (esClosed) return
          esClosed = true
          es.close()
          if (signal) signal.removeEventListener('abort', handleAbort)
          resolve(event)
        } else if (event.type === 'error') {
          settleFailure(new Error(event.error))
        }
      } catch { console.warn('Failed to parse release download progress event') }
    }

    // Browser EventSource auto-reconnects on transient errors.
    // Only fail if the connection stays broken for a prolonged period.
    es.onerror = () => {
      if (esClosed) return
      if (es.readyState === EventSource.CLOSED) {
        settleFailure(new Error('Connection lost'))
        return
      }
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          settleFailure(new Error('Connection lost'))
        }, 30_000)
      }
    }
    // Clear the timeout when a message arrives (connection recovered)
    es.addEventListener('message', () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }, { once: false })

    if (signal) {
      if (signal.aborted) {
        handleAbort()
        return
      }
      signal.addEventListener('abort', handleAbort, { once: true })
    }
  })
}

async function downloadFromJob(jobId: string, signal?: AbortSignal): Promise<{ blob: Blob; contentDisposition: string | null }> {
  const fileResp = await fetch(`/api/download/job/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    signal,
  })
  if (!fileResp.ok) {
    const body = await fileResp.json().catch(() => null)
    throw new Error(body?.error || 'Download failed')
  }
  return { blob: await fileResp.blob(), contentDisposition: fileResp.headers.get('content-disposition') }
}

export async function downloadReleaseWithProgress(
  release: ReleaseEntry,
  opts: DownloadFormatArgs,
  onProgress: (event: DownloadProgressEvent) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const payload = { slug: release.slug, ...opts }
  const resp = await fetch('/api/download/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.error || 'Failed to start download')
  }
  const { jobId } = await resp.json()

  const { filename } = await awaitJobDone(jobId, onProgress, signal)
  const { blob, contentDisposition } = await downloadFromJob(jobId, signal)
  Object.defineProperty(blob, 'name', { value: parseDownloadFileName(contentDisposition, filename) })
  return blob
}

export async function downloadTrackWithProgress(
  release: ReleaseEntry,
  trackIndex: number,
  opts: DownloadFormatArgs,
  onProgress: (event: DownloadProgressEvent) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const payload = { slug: release.slug, track: String(trackIndex), ...opts }
  const resp = await fetch('/api/download/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.error || 'Failed to start download')
  }
  const { jobId } = await resp.json()

  const { filename } = await awaitJobDone(jobId, onProgress, signal)
  const { blob, contentDisposition } = await downloadFromJob(jobId, signal)
  Object.defineProperty(blob, 'name', { value: parseDownloadFileName(contentDisposition, filename) })
  return blob
}