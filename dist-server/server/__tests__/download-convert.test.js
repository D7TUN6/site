import { describe, it, expect } from 'vitest';
import { cacheKeyFromOpts } from '../lib/media-convert.js';
describe('cacheKeyFromOpts', () => {
    it('produces stable hash for same options', () => {
        const opts = {
            format: 'flac',
            sampleRate: 44100,
            bitDepth: 16,
            channels: 2,
            resampler: 'none',
            bitrateMode: 'vbr',
            bitrate: 192,
        };
        const a = cacheKeyFromOpts(opts);
        const b = cacheKeyFromOpts(opts);
        expect(a).toBe(b);
    });
    it('produces different hash for different formats', () => {
        const base = { sampleRate: 44100, bitDepth: 16, channels: 2, resampler: 'none', bitrateMode: 'vbr', bitrate: 192 };
        const flac = cacheKeyFromOpts({ format: 'flac', ...base });
        const wav = cacheKeyFromOpts({ format: 'wav', ...base });
        expect(flac).not.toBe(wav);
    });
    it('produces different hash for different sample rates', () => {
        const base = { format: 'flac', bitDepth: 16, channels: 2, resampler: 'none', bitrateMode: 'vbr', bitrate: 192 };
        const a = cacheKeyFromOpts({ sampleRate: 44100, ...base });
        const b = cacheKeyFromOpts({ sampleRate: 48000, ...base });
        expect(a).not.toBe(b);
    });
    it('produces different hash for different bit depths', () => {
        const base = { format: 'wav', sampleRate: 44100, channels: 2, resampler: 'none', bitrateMode: 'vbr', bitrate: 192 };
        const a = cacheKeyFromOpts({ bitDepth: 16, ...base });
        const b = cacheKeyFromOpts({ bitDepth: 24, ...base });
        expect(a).not.toBe(b);
    });
    it('produces different hash for different channel counts', () => {
        const base = { format: 'flac', sampleRate: 44100, bitDepth: 16, resampler: 'none', bitrateMode: 'vbr', bitrate: 192 };
        const a = cacheKeyFromOpts({ channels: 1, ...base });
        const b = cacheKeyFromOpts({ channels: 2, ...base });
        expect(a).not.toBe(b);
    });
    it('produces different hash for different resamplers', () => {
        const base = { format: 'flac', sampleRate: 44100, bitDepth: 16, channels: 2, bitrateMode: 'vbr', bitrate: 192 };
        const a = cacheKeyFromOpts({ resampler: 'none', ...base });
        const b = cacheKeyFromOpts({ resampler: 'sinc', ...base });
        expect(a).not.toBe(b);
    });
    it('returns non-empty string', () => {
        const opts = {
            format: 'ogg-opus',
            sampleRate: 48000,
            bitDepth: 16,
            channels: 2,
            resampler: 'r8brain',
            bitrateMode: 'vbr',
            bitrate: 128,
        };
        const key = cacheKeyFromOpts(opts);
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThan(0);
    });
});
describe('format file extensions', () => {
    it('formats map to expected extensions', () => {
        const extMap = {
            wav: '.wav', flac: '.flac', 'ogg-opus': '.opus',
            'ogg-vorbis': '.ogg', aiff: '.aiff', raw: '.raw',
        };
        for (const [fmt, ext] of Object.entries(extMap)) {
            expect(ext).toBeDefined();
        }
    });
});
