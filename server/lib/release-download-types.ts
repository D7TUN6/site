import { EventEmitter } from 'node:events'
import type { AudioFormat, AudioBitDepth, AudioChannels, AudioResampler, AudioBitrateMode } from './media-convert.js'

export type DownloadOptions = {
  format: AudioFormat
  sampleRate: number
  bitDepth: AudioBitDepth
  channels: AudioChannels
  resampler: AudioResampler
  bitrateMode: AudioBitrateMode
  bitrate: number
  normalize?: 'standard' | 'loud' | 'off'
  plugins?: Array<{ name: string; params: Record<string, number | string> }>
}

export type ManifestTrack = { index: number; title: string; sourceUrl: string | null; previewUrl?: string | null; sourceSampleRate?: number | null; previewable?: boolean; isMain?: boolean }
export type ManifestRelease = { slug: string; sourceDirName?: string; albumName?: string; artist?: string; coverUrl?: string | null; releaseDate?: string; releaseType?: string | null; genre?: { en?: string; ru?: string }; tracks: ManifestTrack[] }

export class PublicRequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'PublicRequestError'
    this.status = status
  }
}

// Thrown when a download job is cancelled mid-conversion (client left,
// idle timeout). The processing loop unwinds, releasing locks and
// killing in-flight ffmpeg processes.
export class JobCancelledError extends Error {
  constructor(message = 'Download cancelled') {
    super(message)
    this.name = 'JobCancelledError'
  }
}

export type JobEvent =
  | { type: 'meta'; trackCount: number; tracks: Array<{ index: number; title: string }> }
  | { type: 'convert-start'; track: number; title: string }
  | { type: 'convert-progress'; track: number; progress: number }
  | { type: 'convert-done'; track: number }
  | { type: 'zip-progress'; progress: number }
  | { type: 'done'; filePath: string; filename: string }
  | { type: 'error'; error: string }
  | { type: 'regenerating'; slug: string; index: number; total: number; message: string }
  | { type: 'release-done'; slug: string; message: string }
  | { type: 'release-error'; slug: string; error: string }
  | { type: 'manifest-start' }
  | { type: 'manifest-done' }
  | { type: 'all-done'; message: string }

export type JobState = {
  id: string
  slug: string
  release: ManifestRelease
  opts: DownloadOptions
  trackIndex: number | null
  emitter: EventEmitter
  done: boolean
  error?: string
  filePath?: string
  filename?: string
  events: unknown[]
  createdAt: number
  sessionId: string | null
  // Cancellation: set when the job should be torn down. In-flight conversion
  // aborts ffmpeg via abortController; the loop unwinds and the job finishes.
  cancelled?: boolean
  abortController?: AbortController
  // Detached (admin/background) jobs are never idle-cancelled.
  detached?: boolean
  // Distinguishes caches built from the pre-order track subset ('preorder')
  // from caches built from the full release ('full'). Mixing them up would
  // serve pre-order zips after the release drops (or leak locked tracks).
  cacheVariant?: 'full' | 'preorder'
}
