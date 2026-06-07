import { describe, it, expect } from 'vitest';
function parseOptions(body) {
    const format = typeof body.format === 'string' ? body.format : 'flac';
    return {
        format,
        sampleRate: typeof body.sampleRate === 'number' ? body.sampleRate : 44100,
        bitDepth: (typeof body.bitDepth === 'number' ? body.bitDepth : 16),
        channels: (typeof body.channels === 'number' ? body.channels : 2),
        resampler: (typeof body.resampler === 'string' ? body.resampler : 'none'),
        bitrateMode: (typeof body.bitrateMode === 'string' ? body.bitrateMode : 'vbr'),
        bitrate: typeof body.bitrate === 'number' ? body.bitrate : 192,
    };
}
describe('parseOptions', () => {
    it('uses defaults when body is empty', () => {
        const opts = parseOptions({});
        expect(opts.format).toBe('flac');
        expect(opts.sampleRate).toBe(44100);
        expect(opts.bitDepth).toBe(16);
        expect(opts.channels).toBe(2);
        expect(opts.resampler).toBe('none');
        expect(opts.bitrateMode).toBe('vbr');
        expect(opts.bitrate).toBe(192);
    });
    it('parses all fields from body', () => {
        const opts = parseOptions({
            format: 'ogg-opus',
            sampleRate: 48000,
            bitDepth: 24,
            channels: 1,
            resampler: 'sinc',
            bitrateMode: 'cbr',
            bitrate: 128,
        });
        expect(opts.format).toBe('ogg-opus');
        expect(opts.sampleRate).toBe(48000);
        expect(opts.bitDepth).toBe(24);
        expect(opts.channels).toBe(1);
        expect(opts.resampler).toBe('sinc');
        expect(opts.bitrateMode).toBe('cbr');
        expect(opts.bitrate).toBe(128);
    });
    it('handles partial body gracefully', () => {
        const opts = parseOptions({ format: 'wav', sampleRate: 96000 });
        expect(opts.format).toBe('wav');
        expect(opts.sampleRate).toBe(96000);
        expect(opts.bitDepth).toBe(16);
        expect(opts.bitrate).toBe(192);
    });
});
