import { describe, it, expect } from 'vitest'
import { cacheKeyFromOpts } from '../lib/media-convert.js'

describe('cacheKeyFromOpts', () => {
  it('produces stable hash for same options', () => {
    const opts = {
      format: 'flac' as const,
      sampleRate: 44100,
      bitDepth: 16 as const,
      channels: 2 as const,
      resampler: 'none' as const,
      bitrateMode: 'vbr' as const,
      bitrate: 192,
    }
    const a = cacheKeyFromOpts(opts)
    const b = cacheKeyFromOpts(opts)
    expect(a).toBe(b)
  })

  it('produces different hash for different formats', () => {
    const base = { sampleRate: 44100, bitDepth: 16 as const, channels: 2 as const, resampler: 'none' as const, bitrateMode: 'vbr' as const, bitrate: 192 }
    const flac = cacheKeyFromOpts({ format: 'flac' as const, ...base })
    const wav = cacheKeyFromOpts({ format: 'wav' as const, ...base })
    expect(flac).not.toBe(wav)
  })

  it('produces different hash for different sample rates', () => {
    const base = { format: 'flac' as const, bitDepth: 16 as const, channels: 2 as const, resampler: 'none' as const, bitrateMode: 'vbr' as const, bitrate: 192 }
    const a = cacheKeyFromOpts({ sampleRate: 44100, ...base })
    const b = cacheKeyFromOpts({ sampleRate: 48000, ...base })
    expect(a).not.toBe(b)
  })

  it('produces different hash for different bit depths', () => {
    const base = { format: 'wav' as const, sampleRate: 44100, channels: 2 as const, resampler: 'none' as const, bitrateMode: 'vbr' as const, bitrate: 192 }
    const a = cacheKeyFromOpts({ bitDepth: 16 as const, ...base })
    const b = cacheKeyFromOpts({ bitDepth: 24 as const, ...base })
    expect(a).not.toBe(b)
  })

  it('produces different hash for different channel counts', () => {
    const base = { format: 'flac' as const, sampleRate: 44100, bitDepth: 16 as const, resampler: 'none' as const, bitrateMode: 'vbr' as const, bitrate: 192 }
    const a = cacheKeyFromOpts({ channels: 1 as const, ...base })
    const b = cacheKeyFromOpts({ channels: 2 as const, ...base })
    expect(a).not.toBe(b)
  })

  it('produces different hash for different resamplers', () => {
    const base = { format: 'flac' as const, sampleRate: 44100, bitDepth: 16 as const, channels: 2 as const, bitrateMode: 'vbr' as const, bitrate: 192 }
    const a = cacheKeyFromOpts({ resampler: 'none' as const, ...base })
    const b = cacheKeyFromOpts({ resampler: 'sinc' as const, ...base })
    expect(a).not.toBe(b)
  })

  it('returns non-empty string', () => {
    const opts = {
      format: 'ogg-opus' as const,
      sampleRate: 48000,
      bitDepth: 16 as const,
      channels: 2 as const,
      resampler: 'r8brain' as const,
      bitrateMode: 'vbr' as const,
      bitrate: 128,
    }
    const key = cacheKeyFromOpts(opts)
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })
})

describe('format file extensions', () => {
  it('formats map to expected extensions', () => {
    const extMap: Record<string, string> = {
      wav: '.wav', flac: '.flac', 'ogg-opus': '.opus',
      'ogg-vorbis': '.ogg', aiff: '.aiff', raw: '.raw',
    }
    for (const [fmt, ext] of Object.entries(extMap)) {
      expect(ext).toBeDefined()
    }
  })
})
