import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { runFfmpeg, exists, probeAudioDuration } from '../lib/media-convert.js';
const ROOT = process.cwd();
const RADIO_DIR = path.join(ROOT, 'public', 'media', 'radio');
const SEGMENTS_DIR = path.join(RADIO_DIR, 'segments');
const STREAM_FILE = path.join(RADIO_DIR, 'stream.m3u8');
const CATALOG_FILE = path.join(RADIO_DIR, '.catalog.json');
let schedule = [];
let lastRegeneratedAt = null;
let currentTimeline = [];
let totalDuration = 0;
let isRegenerating = false;
let regeneratedAtEpoch = 0;
// listener tracking: ip -> last activity timestamp (ms)
const activeListeners = new Map();
const LISTENER_TTL = 120_000; // 2 min without activity = stale
// clean stale listeners every 30s
setInterval(() => {
    const now = Date.now();
    for (const [ip, ts] of activeListeners) {
        if (now - ts > LISTENER_TTL)
            activeListeners.delete(ip);
    }
}, 30_000).unref();
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}
async function loadSchedule() {
    try {
        const raw = await readFile(path.join(RADIO_DIR, 'schedule.json'), 'utf-8');
        schedule = JSON.parse(raw);
    }
    catch {
        schedule = [];
    }
}
async function readManifest(manifestPath) {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.releases) ? parsed.releases : [];
}
export async function isStreamStale(manifestPath) {
    try {
        // validate content: must be non-empty and valid HLS header
        const raw = await readFile(STREAM_FILE, { encoding: 'utf8', flag: 'r' });
        if (raw.length < 20 || !raw.startsWith('#EXTM3U'))
            return true;
        const streamStat = await stat(STREAM_FILE);
        const manifestStat = await stat(manifestPath);
        return manifestStat.mtimeMs > streamStat.mtimeMs;
    }
    catch {
        return true;
    }
}
/** Remove segment files whose names don't match the canonical 3-digit pattern. */
async function cleanOrphanSegments() {
    try {
        const dir = await readdir(SEGMENTS_DIR);
        for (const f of dir) {
            if (!/^segment_\d{3}\.ts$/.test(f) && /^segment_\d+\.ts$/.test(f)) {
                await rm(path.join(SEGMENTS_DIR, f), { force: true }).catch(() => { });
            }
        }
    }
    catch { /* ok */ }
}
/** Rebuild stream.m3u8 from existing segment files (without running ffmpeg). */
export async function rebuildM3u8FromSegments() {
    try {
        const files = await readdir(SEGMENTS_DIR);
        const segs = files.filter(f => /^segment_\d+\.ts$/.test(f))
            .sort((a, b) => {
            const na = parseInt(a.replace('segment_', '').replace('.ts', ''));
            const nb = parseInt(b.replace('segment_', '').replace('.ts', ''));
            return na - nb;
        });
        if (segs.length === 0)
            return false;
        let m3u8 = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n';
        for (const s of segs)
            m3u8 += '#EXTINF:10.0000,\n' + s + '\n';
        m3u8 += '#EXT-X-ENDLIST\n';
        await writeFile(STREAM_FILE, m3u8, 'utf-8');
        return true;
    }
    catch {
        return false;
    }
}
function getBroadcastPosition() {
    if (totalDuration <= 0 || regeneratedAtEpoch <= 0)
        return 0;
    const elapsed = (Date.now() - regeneratedAtEpoch) / 1000;
    return elapsed % totalDuration;
}
// check every hour if stream is stale and regenerate if no listeners
export function startPeriodicRegeneration(manifestPath) {
    setInterval(async () => {
        if (isRegenerating)
            return;
        if (activeListeners.size > 0)
            return;
        if (!(await exists(STREAM_FILE)))
            return;
        try {
            const streamStat = await stat(STREAM_FILE);
            const manifestStat = await stat(manifestPath);
            if (manifestStat.mtimeMs <= streamStat.mtimeMs)
                return;
        }
        catch {
            return;
        }
        isRegenerating = true;
        try {
            await regenerateRadioStream(manifestPath);
            await loadTimeline();
        }
        catch (e) {
            console.error('periodic regeneration failed', e);
        }
        finally {
            isRegenerating = false;
        }
    }, 3_600_000).unref(); // every hour
}
export async function isSafeToRegenerate() {
    return activeListeners.size === 0;
}
export async function regenerateRadioStream(manifestPath) {
    const releases = await readManifest(manifestPath);
    const sourceFiles = [];
    const trackInfos = [];
    for (const release of releases) {
        if (!Array.isArray(release.tracks))
            continue;
        const sorted = [...release.tracks].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        const album = release.albumName || release.sourceDirName || '';
        const coverUrl = release.coverPreviewUrl || release.coverUrl || '';
        for (const track of sorted) {
            if (!track.sourceUrl)
                continue;
            const abs = path.resolve(ROOT, 'public', track.sourceUrl.replace(/^\/+/, ''));
            if (await exists(abs)) {
                sourceFiles.push(abs);
                trackInfos.push({ name: track.title, album, coverUrl });
            }
        }
    }
    if (sourceFiles.length === 0)
        return;
    // shuffle the playlist for random order
    const zipped = sourceFiles.map((f, i) => ({ file: f, info: trackInfos[i] }));
    for (let i = zipped.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [zipped[i], zipped[j]] = [zipped[j], zipped[i]];
    }
    sourceFiles.length = 0;
    trackInfos.length = 0;
    for (const z of zipped) {
        sourceFiles.push(z.file);
        trackInfos.push(z.info);
    }
    // write to temp dir, then swap atomically to avoid corrupting playback
    const TMP = RADIO_DIR + '.tmp-' + process.pid;
    const tmpSegments = path.join(TMP, 'segments');
    const tmpStream = path.join(TMP, 'stream.m3u8');
    await mkdir(tmpSegments, { recursive: true });
    const n = sourceFiles.length;
    const filterParts = sourceFiles.map((_, i) => `[${i}:a]aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo[a${i}]`);
    const concatInputs = sourceFiles.map((_, i) => `[a${i}]`).join('');
    const inputs = sourceFiles.flatMap((f) => ['-i', f]);
    // ffmpeg writes to temp dir
    await runFfmpeg([
        '-y', ...inputs,
        '-filter_complex', `${filterParts.join(';')};${concatInputs}concat=n=${n}:v=0:a=1[a]`,
        '-map', '[a]',
        '-c:a', 'aac', '-b:a', '128k',
        '-f', 'hls', '-hls_time', '10', '-hls_list_size', '0',
        '-hls_base_url', '/media/radio/segments/',
        '-hls_segment_filename', path.join(tmpSegments, 'segment_%03d.ts'),
        tmpStream,
    ]);
    // probe durations and build timeline
    const durations = await Promise.all(sourceFiles.map((f) => probeAudioDuration(f).catch(() => 0)));
    const timeline = [];
    let offset = 0;
    for (let i = 0; i < trackInfos.length; i++) {
        const d = durations[i] || 0;
        timeline.push({
            title: trackInfos[i].name,
            album: trackInfos[i].album,
            artist: 'D7TUN6',
            coverUrl: trackInfos[i].coverUrl,
            duration: d,
            startOffset: offset,
        });
        offset += d;
    }
    currentTimeline = timeline;
    totalDuration = offset;
    regeneratedAtEpoch = Date.now();
    const trackNames = trackInfos.map((t) => t.name);
    const generatedAt = new Date().toISOString();
    const catalogData = {
        tracks: trackNames, count: trackNames.length, generatedAt,
        totalDuration, regeneratedAtEpoch, timeline,
    };
    await writeFile(path.join(TMP, '.catalog.json'), JSON.stringify(catalogData, null, 2), 'utf-8');
    // atomic-ish swap: rename old aside, move new in, remove old
    const OLD = RADIO_DIR + '.old-' + process.pid;
    await rm(OLD, { force: true, recursive: true }).catch(() => { });
    await mkdir(OLD, { recursive: true });
    // rename may fail with EXDEV across filesystems — fall back to cp+rm
    const move = async (src, dst) => {
        try {
            await rename(src, dst);
        }
        catch (e) {
            if (e?.code === 'EXDEV') {
                await cp(src, dst, { recursive: true, force: true });
                await rm(src, { force: true, recursive: true });
            }
            else {
                throw e;
            }
        }
    };
    // save old files aside
    await move(SEGMENTS_DIR, OLD + '/segments').catch(() => { });
    await move(STREAM_FILE, OLD + '/stream.m3u8').catch(() => { });
    await move(CATALOG_FILE, OLD + '/.catalog.json').catch(() => { });
    // install new files
    await move(TMP + '/segments', SEGMENTS_DIR);
    await move(TMP + '/stream.m3u8', STREAM_FILE);
    await move(TMP + '/.catalog.json', CATALOG_FILE);
    // cleanup old files
    await rm(OLD, { force: true, recursive: true }).catch(() => { });
    await rm(TMP, { force: true, recursive: true }).catch(() => { });
    // write index.mdx (not critical, can fail)
    try {
        await writeFile(path.join(RADIO_DIR, 'index.mdx'), `---
tracks:\n${trackNames.map((t) => `  - ${t}`).join('\n')}
schedule:\n${schedule.map((s) => `  - day: "${s.day}"\n    start: "${s.start}"\n    end: "${s.end}"\n    label: "${s.label}"`).join('\n')}
---
`, 'utf-8');
    }
    catch { /* ok */ }
    lastRegeneratedAt = generatedAt;
}
export async function loadTimeline() {
    try {
        const raw = await readFile(CATALOG_FILE, 'utf-8');
        const catalog = JSON.parse(raw);
        if (Array.isArray(catalog.timeline))
            currentTimeline = catalog.timeline;
        if (typeof catalog.totalDuration === 'number')
            totalDuration = catalog.totalDuration;
        if (typeof catalog.regeneratedAtEpoch === 'number')
            regeneratedAtEpoch = catalog.regeneratedAtEpoch;
        if (typeof catalog.generatedAt === 'string')
            lastRegeneratedAt = catalog.generatedAt;
    }
    catch { /* ok */ }
}
export function createRadioRouter({ manifestPath }) {
    const router = express.Router();
    // cleanup orphan segment files and rebuild m3u8 if needed
    cleanOrphanSegments();
    readFile(STREAM_FILE, { encoding: 'utf8', flag: 'r' }).then((raw) => {
        if (raw.length < 20 || !raw.startsWith('#EXTM3U')) {
            console.error('radio: m3u8 corrupt — rebuilding from segments');
            rebuildM3u8FromSegments().catch((err) => console.error('radio: m3u8 rebuild failed', err));
        }
    }).catch(() => {
        // no m3u8 file at all — try rebuild from segments
        rebuildM3u8FromSegments().catch((err) => console.error('radio: m3u8 rebuild failed', err));
    });
    // periodic regeneration check (every hour)
    startPeriodicRegeneration(manifestPath);
    router.get('/state', async (_req, res) => {
        await loadSchedule();
        let trackCount = 0;
        let regeneratedAt = lastRegeneratedAt;
        try {
            const raw = await readFile(path.join(RADIO_DIR, '.catalog.json'), 'utf-8');
            const catalog = JSON.parse(raw);
            trackCount = catalog.count;
            regeneratedAt = regeneratedAt ?? catalog.generatedAt;
        }
        catch { /* ok */ }
        const state = {
            isLive: false,
            listeners: activeListeners.size,
            currentTrack: null,
            streamUrl: '/media/radio/stream.m3u8',
            schedule,
            trackCount,
            regeneratedAt,
        };
        res.json({ ok: true, ...state });
    });
    router.get('/stream', async (_req, res) => {
        // validate content: must have valid m3u8 header
        try {
            const raw = await readFile(STREAM_FILE, { encoding: 'utf8', flag: 'r' });
            if (raw.length >= 20 && raw.startsWith('#EXTM3U')) {
                res.sendFile(STREAM_FILE);
                return;
            }
        }
        catch { /* file missing or unreadable */ }
        res.status(503).type('text/plain')
            .send('Radio stream not available.');
    });
    router.get('/segments/:segment', (req, res) => {
        const segmentPath = path.resolve(SEGMENTS_DIR, req.params.segment);
        if (!segmentPath.startsWith(SEGMENTS_DIR + path.sep)) {
            res.status(400).json({ error: 'Invalid path' });
            return;
        }
        res.sendFile(segmentPath, (err) => {
            if (err) {
                if (!res.headersSent)
                    res.status(404).json({ error: 'Segment not found' });
            }
        });
    });
    router.get('/tracks', async (_req, res) => {
        try {
            const raw = await readFile(path.join(RADIO_DIR, '.catalog.json'), 'utf-8');
            const catalog = JSON.parse(raw);
            res.json({ ok: true, tracks: catalog.tracks });
        }
        catch {
            res.json({ ok: true, tracks: [] });
        }
    });
    router.post('/listeners', (req, res) => {
        const delta = typeof req.body?.delta === 'number' ? req.body.delta : 0;
        const ip = getClientIp(req);
        if (delta > 0) {
            activeListeners.set(ip, Date.now());
        }
        else if (delta < 0) {
            activeListeners.delete(ip);
        }
        res.json({ ok: true, listeners: activeListeners.size });
    });
    router.post('/now-playing', (req, res) => {
        const position = typeof req.body?.position === 'number' ? req.body.position : 0;
        const entry = currentTimeline.find((e) => position >= e.startOffset && position < e.startOffset + e.duration);
        if (!entry) {
            res.json({ ok: false });
            return;
        }
        res.json({
            ok: true,
            title: entry.title,
            album: entry.album,
            artist: entry.artist,
            coverUrl: entry.coverUrl,
            duration: entry.duration,
            elapsed: position - entry.startOffset,
            position,
        });
    });
    // simulate continuous broadcast: time since regeneration, wrapped by total duration
    // simulate continuous broadcast: time since regeneration, wrapped by total duration
    router.get('/broadcast', (_req, res) => {
        const position = getBroadcastPosition();
        // fallback: compute ISO from epoch if module variable not yet loaded
        const regeneratedAt = lastRegeneratedAt ?? (regeneratedAtEpoch > 0 ? new Date(regeneratedAtEpoch).toISOString() : null);
        res.json({
            ok: true,
            position,
            totalDuration,
            regeneratedAt,
        });
    });
    // fallback: serve old-format segment requests (before -hls_base_url was added)
    router.get('/:segment', (req, res, next) => {
        const name = req.params.segment;
        if (!/^segment_\d{3}\.ts$/.test(name))
            return next();
        const segmentPath = path.resolve(SEGMENTS_DIR, name);
        if (!segmentPath.startsWith(SEGMENTS_DIR + path.sep)) {
            res.status(400).json({ error: 'Invalid path' });
            return;
        }
        res.sendFile(segmentPath, (err) => {
            if (err) {
                if (!res.headersSent)
                    res.status(404).json({ error: 'Segment not found' });
            }
        });
    });
    return router;
}
