import { getOptionalEnv } from './config.js'

type FfmpegPreset = {
  codec: string
  bitrate: string | null
  channels: number
  sampleRate: number | null
  format: string
  mime: string
  ext: string
  filters?: string[]
}

export type AudioEngineConfig = {
  ffmpeg: {
    path: string
    ffprobePath: string
    concurrency: number
    timeoutMs: number
    niceLevel: number
    ioClass: 'idle' | 'best-effort' | 'realtime'
    threads: number | null
  }
  cache: {
    ttlMs: number
    staleThresholdMs: number
    janitorIntervalMs: number
    janitorEnabled: boolean
  }
  streaming: {
    presets: Record<string, FfmpegPreset>
  }
  defaults: {
    format: string
    sampleRate: number
    bitDepth: number
    channels: number
    resampler: string
    bitrateMode: string
    bitrate: number
  }
}

export const audioConfig: AudioEngineConfig = {
  ffmpeg: {
    path: getOptionalEnv('FFMPEG_PATH', 'ffmpeg'),
    ffprobePath: getOptionalEnv('FFPROBE_PATH', 'ffprobe'),
    // Oversubscription warning: every audio conversion is ~1 decode thread.
    // On an idle 6c/12t box 8 fits; leave a thread free so the API stays
    // responsive instead of racing python/nginx for CPU.
    concurrency: Number(getOptionalEnv('FFMPEG_CONCURRENCY', '8')),
    timeoutMs: Number(getOptionalEnv('FFMPEG_TIMEOUT_MS', '600000')),
    // nice 0 + best-effort IO: conversions are the foreground user request.
    // The old default (nice 19, ionice idle) starves ffmpeg under any load —
    // with a strictly RT-tuned kernel (rt-bore + SCHED_OTHER) it crawls even
    // on an otherwise idle deskmachine because the nice-adjusted task only gets
    // remnant runqueue time. Tune down via FFMPEG_NICE_LEVEL if the box is busy
    // serving simultaneously.
    niceLevel: Number(getOptionalEnv('FFMPEG_NICE_LEVEL', '0')),
    ioClass: (getOptionalEnv('FFMPEG_IO_CLASS', 'best-effort') as AudioEngineConfig['ffmpeg']['ioClass']),
    threads: getOptionalEnv('FFMPEG_THREADS', '') ? Number(getOptionalEnv('FFMPEG_THREADS')) : null,
  },
  cache: {
    ttlMs: Number(getOptionalEnv('AUDIO_CACHE_TTL_MS', '86400000')),
    staleThresholdMs: Number(getOptionalEnv('AUDIO_CACHE_STALE_THRESHOLD_MS', '7776000000')),
    janitorIntervalMs: Number(getOptionalEnv('AUDIO_CACHE_JANITOR_INTERVAL_MS', '86400000')),
    janitorEnabled: getOptionalEnv('AUDIO_CACHE_JANITOR_ENABLED', 'true') === 'true',
  },
  streaming: {
    presets: {
      aac_128: {
        codec: 'aac', bitrate: '128k', channels: 2, sampleRate: null,
        format: 'aac', mime: 'audio/aac', ext: '.aac',
      },
      opus_96: {
        codec: 'libopus', bitrate: '96k', channels: 2, sampleRate: 48000,
        format: 'ogg-opus', mime: 'audio/ogg', ext: '.opus',
      },
    },
  },
  defaults: {
    format: 'flac',
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    resampler: 'none',
    bitrateMode: 'vbr',
    bitrate: 320,
  },
}
