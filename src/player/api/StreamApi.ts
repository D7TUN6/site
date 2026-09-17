import { getAudioEngine } from '@/lib/audio/audio-engine.js'
import type { GlobalPlayerTrack, GlobalPlayerQueue } from '../types.js'

export function getTrackPlaybackUrl(track: GlobalPlayerTrack | undefined, queue: GlobalPlayerQueue | null): string {
  if (!track) return ''
  const slug = queue?.queueKey
  if (slug) {
    const quality = getAudioEngine().state.quality
    // The HLS playlist (~128k) matches the "medium" preset natively, so play
    // it directly. Every other quality is served by the /api/stream transcoder
    // (low/high/extreme via ffmpeg re-encode, superb as the lossless source).
    if (quality === 'medium' && track.streamUrl) return track.streamUrl
    return `/api/stream/${slug}::${track.index}?quality=${quality}`
  }
  if (track.url) return track.url
  return ''
}

export function buildSeekUrl(slug: string, trackIndex: number, quality: string, start: number): string {
  return `/api/stream/${slug}::${trackIndex}?quality=${quality}&start=${start}`
}
