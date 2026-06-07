import { mkdir, readdir, readFile, rename, rm, writeFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import busboy from 'busboy';
import express from 'express';
import { enforceSameOrigin } from '../../lib/request-origin.js';
import { requireAdmin } from '../../middleware/require-auth.js';
import { ROOT, slugify } from './shared.js';
import { processCoverImage, convertAudioToHls, spawnRebuild, IMAGE_CONVERT_EXTS } from '../../lib/media-convert.js';
const MDX_DIR = (lang) => path.join(ROOT, 'content', 'mdx', lang, 'releases');
const AUDIO_EXTS = new Set(['.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac', '.aiff', '.opus']);
const RELEASE_TYPES = ['lp', 'ep', 'single', 'remaster', 'unrelease', 'demo', 'album'];
const MUSIC_ROOT = path.join(ROOT, 'public', 'media', 'music');
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json');
const COVER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp']);
const TMP_DIR = path.join(ROOT, 'tmp');
// Ensure tmp dir exists
mkdir(TMP_DIR, { recursive: true }).catch(() => { });
async function readManifest() {
    try {
        const raw = await readFile(MANIFEST_PATH, 'utf-8');
        const manifest = JSON.parse(raw);
        return Array.isArray(manifest.releases) ? manifest.releases : [];
    }
    catch {
        return [];
    }
}
async function getAlbumDir(slug) {
    const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => []);
    const existing = dirents.find((d) => d.isDirectory() && slugify(d.name) === slug);
    return existing ? { dir: path.join(MUSIC_ROOT, existing.name), name: existing.name } : null;
}
async function writeReleaseMdx(slug, albumDir) {
    const manifestReleases = await readManifest();
    const mRelease = manifestReleases.find(r => r.slug === slug);
    if (!mRelease)
        return;
    const albumName = path.basename(albumDir);
    let coverUrl = `/media/music/${albumName}/cover/cover.jpg`;
    try {
        const files = await readdir(path.join(albumDir, 'cover'));
        const webp = files.find(f => f.endsWith('.webp') && !f.startsWith('cover-preview'));
        if (webp)
            coverUrl = `/media/music/${albumName}/cover/${webp}`;
    }
    catch { }
    let notes = '';
    try {
        notes = await readFile(path.join(albumDir, 'notes', 'notes'), 'utf-8');
    }
    catch { }
    const tracks = (mRelease.tracks ?? []).map((t, i) => ({
        index: i + 1,
        title: t.title ?? '',
        url: t.sourceUrl ?? '',
        streamUrl: t.streamUrl || t.sourceUrl || '',
    }));
    const trackJson = JSON.stringify(tracks.map(t => ({
        title: t.title,
        url: t.streamUrl || t.url,
    })), null, 2);
    function mdxContent(lang, genre, backText, notesTitle) {
        const back = lang === 'en' ? `/en/music` : `/ru/music`;
        const escapedNotes = notes.replace(/`/g, '\\`');
        const date = mRelease?.releaseDate ?? '';
        return `import ReleasePlayer from "@/components/ReleasePlayer.vue";

[← ${backText}](${back})

# ${albumName}

<ReleasePlayer albumSlug={"${slug}"} artist="D7TUN6" albumTitle={"${albumName.replace(/"/g, '\\"')}"} coverUrl={"${coverUrl}"} releaseDate={"${date}"} genre={"${genre}"} tracks={${trackJson}} />

<div class="release-notes">

## ${notesTitle}

\`\`\`text
${escapedNotes}
\`\`\`

</div>
`;
    }
    const mdxEn = mdxContent('en', 'Electronic', 'Back to Discography', 'Notes');
    const mdxRu = mdxContent('ru', 'Электроника', 'Назад к дискографии', 'Заметки');
    await mkdir(MDX_DIR('en'), { recursive: true });
    await mkdir(MDX_DIR('ru'), { recursive: true });
    await writeFile(path.join(MDX_DIR('en'), `${slug}.mdx`), mdxEn, 'utf-8');
    await writeFile(path.join(MDX_DIR('ru'), `${slug}.mdx`), mdxRu, 'utf-8');
}
export function createAdminReleasesRouter() {
    const router = express.Router();
    router.get('/', requireAdmin, async (_req, res) => {
        try {
            const manifestReleases = await readManifest();
            const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => []);
            const releases = await Promise.all(dirents.filter((d) => d.isDirectory()).map(async (d) => {
                const slug = slugify(d.name);
                const mRelease = manifestReleases.find((r) => r.slug === slug);
                // Read tracks from manifest if available, otherwise from filesystem (e.g. hidden releases)
                let tracks = [];
                if (mRelease?.tracks) {
                    tracks = mRelease.tracks.map((t) => {
                        let filename = '';
                        if (t.sourceUrl) {
                            const tracksPrefix = `/media/music/${d.name}/tracks/`;
                            const fullRel = t.sourceUrl.startsWith(tracksPrefix) ? t.sourceUrl.slice(tracksPrefix.length) : path.basename(t.sourceUrl);
                            filename = fullRel.startsWith('source/') ? fullRel.slice('source/'.length) : fullRel;
                        }
                        return { filename, title: t.title ?? '' };
                    });
                }
                else {
                    // Read from filesystem for hidden/unlisted releases not in manifest
                    const sourceDir = path.join(MUSIC_ROOT, d.name, 'tracks', 'source');
                    try {
                        const audioExtRe = /\.(wav|mp3|flac|ogg|m4a|aac)$/i;
                        const files = (await readdir(sourceDir)).filter((f) => audioExtRe.test(f)).sort();
                        tracks = files.map((f) => ({ filename: f, title: '' }));
                    }
                    catch { /* no source dir */ }
                }
                // Read cover from filesystem when not in manifest
                let coverUrl = mRelease?.coverUrl ?? null;
                let coverPreviewUrl = mRelease?.coverPreviewUrl ?? null;
                if (!coverUrl) {
                    const coverDir = path.join(MUSIC_ROOT, d.name, 'cover');
                    try {
                        const coverFiles = await readdir(coverDir);
                        const webp = coverFiles.find((f) => f.endsWith('.webp') && !f.startsWith('cover-preview'));
                        if (webp)
                            coverUrl = `/media/music/${d.name}/cover/${webp}`;
                        const preview = coverFiles.find((f) => f.startsWith('cover-preview'));
                        if (preview)
                            coverPreviewUrl = `/media/music/${d.name}/cover/${preview}`;
                    }
                    catch { }
                }
                // Read release metadata from filesystem when not in manifest
                let releaseDate = mRelease?.releaseDate ?? null;
                if (!releaseDate) {
                    try {
                        releaseDate = (await readFile(path.join(MUSIC_ROOT, d.name, '.release-date'), 'utf-8')).trim() || null;
                    }
                    catch { }
                }
                let releaseType = mRelease?.releaseType ?? null;
                if (!releaseType) {
                    try {
                        releaseType = (await readFile(path.join(MUSIC_ROOT, d.name, '.release-type'), 'utf-8')).trim() || null;
                    }
                    catch { }
                }
                const notesPath = path.join(MUSIC_ROOT, d.name, 'notes', 'notes');
                let notes = '';
                try {
                    notes = await readFile(notesPath, 'utf-8');
                }
                catch { /* notes file optional */ }
                let isHidden = false;
                try {
                    const h = await readFile(path.join(MUSIC_ROOT, d.name, '.release-hidden'), 'utf-8');
                    isHidden = h.trim() === 'true';
                }
                catch { }
                return {
                    slug, albumName: d.name, tracks,
                    coverUrl, coverPreviewUrl,
                    notes, releaseDate,
                    releaseType: releaseType ?? 'album',
                    hidden: isHidden
                };
            }));
            return res.status(200).json({ ok: true, releases });
        }
        catch (err) {
            console.error('admin releases list failed', err);
            return res.status(500).json({ error: 'Unable to list releases' });
        }
    });
    router.post('/', enforceSameOrigin, requireAdmin, async (req, res) => {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
            // Fallback to JSON for old clients
            const albumName = typeof req.body?.albumName === 'string' ? req.body.albumName.trim() : '';
            if (!albumName)
                return res.status(400).json({ error: 'albumName is required' });
            const slug = slugify(albumName);
            if (!slug)
                return res.status(400).json({ error: 'Invalid album name' });
            const newDir = path.join(MUSIC_ROOT, albumName);
            try {
                await access(newDir);
                return res.status(409).json({ error: 'Release with this name already exists' });
            }
            catch { /* ok */ }
            const releaseType = typeof req.body?.releaseType === 'string' && RELEASE_TYPES.includes(req.body.releaseType) ? req.body.releaseType : 'album';
            const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';
            try {
                await mkdir(path.join(newDir, 'tracks', 'source'), { recursive: true });
                await mkdir(path.join(newDir, 'tracks', 'stream'), { recursive: true });
                await mkdir(path.join(newDir, 'tracks', 'preview'), { recursive: true });
                await mkdir(path.join(newDir, 'cover'), { recursive: true });
                await mkdir(path.join(newDir, 'playlists'), { recursive: true });
                await mkdir(path.join(newDir, 'notes'), { recursive: true });
                if (notes)
                    await writeFile(path.join(newDir, 'notes', 'notes'), notes, 'utf-8');
                spawnRebuild();
                writeReleaseMdx(slug, newDir).catch((e) => console.error('writeReleaseMdx failed', e));
                return res.status(200).json({ ok: true, slug });
            }
            catch (err) {
                console.error('admin release create failed', err);
                return res.status(500).json({ error: 'Unable to create release' });
            }
        }
        // multipart/form-data: albumName, releaseType, releaseDate, notes, hidden, tracks[], cover
        let albumName = '';
        let releaseType = 'album';
        let releaseDate = '';
        let notes = '';
        let hidden = false;
        const trackFiles = [];
        const trackNames = [];
        let coverFile = null;
        try {
            await new Promise((resolve, reject) => {
                const bb = busboy({ headers: req.headers, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2GB per file
                const pending = [];
                bb.on('field', (name, val) => {
                    if (name === 'albumName')
                        albumName = val.trim();
                    else if (name === 'releaseType')
                        releaseType = val.trim();
                    else if (name === 'releaseDate')
                        releaseDate = val.trim();
                    else if (name === 'notes')
                        notes = val;
                    else if (name === 'hidden')
                        hidden = val === 'true';
                    else if (name === 'trackNames')
                        trackNames.push(val);
                });
                bb.on('file', (field, stream, info) => {
                    if (field === 'cover') {
                        const ext = path.extname(info.filename).toLowerCase();
                        if (!COVER_EXTS.has(ext) && !IMAGE_CONVERT_EXTS.has(ext)) {
                            stream.resume();
                            return;
                        }
                        const tmpPath = path.join(TMP_DIR, `cover-${Date.now()}${ext}`);
                        const ws = createWriteStream(tmpPath);
                        stream.pipe(ws);
                        pending.push(new Promise((r, j) => { ws.on('finish', () => { coverFile = { filename: info.filename, path: tmpPath }; r(); }); ws.on('error', j); stream.on('error', j); }));
                    }
                    else if (field === 'tracks') {
                        const ext = path.extname(info.filename).toLowerCase();
                        if (!AUDIO_EXTS.has(ext)) {
                            stream.resume();
                            return;
                        }
                        const tmpPath = path.join(TMP_DIR, `track-${Date.now()}-${info.filename}`);
                        const ws = createWriteStream(tmpPath);
                        stream.pipe(ws);
                        pending.push(new Promise((r, j) => { ws.on('finish', () => { trackFiles.push({ filename: info.filename, path: tmpPath }); r(); }); ws.on('error', j); stream.on('error', j); }));
                    }
                    else {
                        stream.resume();
                    }
                });
                bb.on('error', reject);
                bb.on('finish', () => Promise.all(pending).then(() => resolve()).catch(reject));
                req.pipe(bb);
            });
            if (!albumName)
                return res.status(400).json({ error: 'albumName is required' });
            const slug = slugify(albumName);
            if (!slug)
                return res.status(400).json({ error: 'Invalid album name' });
            const newDir = path.join(MUSIC_ROOT, albumName);
            try {
                await access(newDir);
                return res.status(409).json({ error: 'Release with this name already exists' });
            }
            catch { /* ok */ }
            if (!RELEASE_TYPES.includes(releaseType))
                releaseType = 'album';
            await mkdir(path.join(newDir, 'tracks', 'source'), { recursive: true });
            await mkdir(path.join(newDir, 'tracks', 'stream'), { recursive: true });
            await mkdir(path.join(newDir, 'tracks', 'preview'), { recursive: true });
            await mkdir(path.join(newDir, 'cover'), { recursive: true });
            await mkdir(path.join(newDir, 'playlists'), { recursive: true });
            await mkdir(path.join(newDir, 'notes'), { recursive: true });
            if (notes)
                await writeFile(path.join(newDir, 'notes', 'notes'), notes, 'utf-8');
            if (releaseDate)
                await writeFile(path.join(newDir, '.release-date'), releaseDate, 'utf-8');
            if (releaseType !== 'album')
                await writeFile(path.join(newDir, '.release-type'), releaseType, 'utf-8');
            if (hidden)
                await writeFile(path.join(newDir, '.release-hidden'), 'true', 'utf-8');
            // Move uploaded tracks to source dir
            const sourceDir = path.join(newDir, 'tracks', 'source');
            const streamDir = path.join(newDir, 'tracks', 'stream');
            console.log('Processing tracks:', trackFiles.length, 'files');
            for (let i = 0; i < trackFiles.length; i++) {
                const track = trackFiles[i];
                const customName = trackNames[i];
                const ext = path.extname(track.filename);
                const finalName = customName ? `${customName}${ext}` : track.filename;
                const dest = path.join(sourceDir, finalName);
                console.log(`Moving track ${i}: ${track.path} -> ${dest}`);
                await rename(track.path, dest);
                // Generate HLS in background
                const trackStreamDir = path.join(streamDir, path.basename(finalName, ext));
                await mkdir(trackStreamDir, { recursive: true });
                convertAudioToHls(dest, trackStreamDir, finalName).catch((e) => console.error('HLS gen failed for', finalName, e));
            }
            // Process cover
            if (coverFile) {
                const cover = coverFile;
                const coverDir = path.join(newDir, 'cover');
                const coverExt = path.extname(cover.filename).toLowerCase();
                const coverDest = path.join(coverDir, `cover${coverExt}`);
                await rename(cover.path, coverDest);
                await processCoverImage(coverDest, coverDir).catch((e) => console.error('Cover processing failed', e));
            }
            spawnRebuild();
            writeReleaseMdx(slug, newDir).catch((e) => console.error('writeReleaseMdx failed', e));
            return res.status(200).json({ ok: true, slug });
        }
        catch (err) {
            console.error('admin release create failed', err);
            // Cleanup tmp files
            for (const track of trackFiles) {
                await rm(track.path, { force: true }).catch(() => { });
            }
            if (coverFile) {
                const cover = coverFile;
                await rm(cover.path, { force: true }).catch(() => { });
            }
            return res.status(500).json({ error: 'Unable to create release' });
        }
    });
    router.post('/:slug/cover', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
        const album = await getAlbumDir(slug);
        if (!album)
            return res.status(404).json({ error: 'Release not found' });
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data'))
            return res.status(400).json({ error: 'Expected multipart/form-data' });
        const coverDir = path.join(album.dir, 'cover');
        await mkdir(coverDir, { recursive: true });
        let savedFile = '';
        try {
            await new Promise((resolve, reject) => {
                const bb = busboy({ headers: req.headers, limits: { files: 1 } });
                bb.on('file', (_field, stream, info) => {
                    const ext = path.extname(info.filename).toLowerCase();
                    if (!COVER_EXTS.has(ext)) {
                        stream.resume();
                        return;
                    }
                    const filename = `cover${ext}`;
                    const dest = path.join(coverDir, filename);
                    savedFile = filename;
                    const ws = createWriteStream(dest);
                    stream.pipe(ws);
                    new Promise((r, j) => { ws.on('finish', r); ws.on('error', j); stream.on('error', j); });
                });
                bb.on('error', reject);
                bb.on('finish', resolve);
                req.pipe(bb);
            });
            if (!savedFile)
                return res.status(400).json({ error: 'No valid image file received' });
            const srcPath = path.join(coverDir, savedFile);
            const { webp, preview } = await processCoverImage(srcPath, coverDir);
            // remove old cover files
            const coverFiles = await readdir(coverDir).catch(() => []);
            for (const f of coverFiles) {
                if (f !== webp && f !== preview && !f.startsWith('cover'))
                    continue;
                if (f === webp || f === preview)
                    continue;
                await rm(path.join(coverDir, f), { force: true }).catch(() => { });
            }
            spawnRebuild();
            writeReleaseMdx(slug, album.dir).catch((e) => console.error('writeReleaseMdx failed', e));
            return res.json({ ok: true, coverUrl: `/media/music/${album.name}/cover/${webp}`, coverPreviewUrl: `/media/music/${album.name}/cover/${preview}` });
        }
        catch (err) {
            console.error('admin release cover upload failed', err);
            return res.status(500).json({ error: 'Unable to upload cover' });
        }
    });
    router.delete('/:slug/cover', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
        const album = await getAlbumDir(slug);
        if (!album)
            return res.status(404).json({ error: 'Release not found' });
        const coverDir = path.join(album.dir, 'cover');
        try {
            const files = await readdir(coverDir).catch(() => []);
            for (const f of files) {
                await rm(path.join(coverDir, f), { force: true }).catch(() => { });
            }
            spawnRebuild();
            writeReleaseMdx(slug, album.dir).catch((e) => console.error('writeReleaseMdx failed', e));
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin release cover delete failed', err);
            return res.status(500).json({ error: 'Unable to delete cover' });
        }
    });
    router.post('/:slug/tracks', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
        const album = await getAlbumDir(slug);
        if (!album)
            return res.status(404).json({ error: 'Release not found' });
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data'))
            return res.status(400).json({ error: 'Expected multipart/form-data' });
        const tracksDir = path.join(album.dir, 'tracks');
        const sourceDir = path.join(tracksDir, 'source');
        const streamDir = path.join(tracksDir, 'stream');
        const previewDir = path.join(tracksDir, 'preview');
        await mkdir(sourceDir, { recursive: true });
        await mkdir(streamDir, { recursive: true });
        await mkdir(previewDir, { recursive: true });
        const saved = [];
        try {
            await new Promise((resolve, reject) => {
                const bb = busboy({ headers: req.headers, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2GB per file
                const pending = [];
                bb.on('file', (_field, stream, info) => {
                    const ext = path.extname(info.filename).toLowerCase();
                    if (!AUDIO_EXTS.has(ext)) {
                        stream.resume();
                        return;
                    }
                    const safeName = path.basename(info.filename);
                    const dest = path.join(sourceDir, safeName);
                    saved.push(safeName);
                    const ws = createWriteStream(dest);
                    stream.pipe(ws);
                    pending.push(new Promise((r, j) => { ws.on('finish', r); ws.on('error', j); stream.on('error', j); }));
                });
                bb.on('error', reject);
                bb.on('finish', () => Promise.all(pending).then(() => resolve()).catch(reject));
                req.pipe(bb);
            });
            if (!saved.length)
                return res.status(400).json({ error: 'No valid audio files received' });
            // Generate HLS stream for each track in background
            for (const filename of saved) {
                const srcPath = path.join(sourceDir, filename);
                const trackStreamDir = path.join(streamDir, path.basename(filename, path.extname(filename)));
                await mkdir(trackStreamDir, { recursive: true });
                convertAudioToHls(srcPath, trackStreamDir, filename).catch((e) => console.error('HLS gen failed for', filename, e));
            }
            spawnRebuild();
            writeReleaseMdx(slug, album.dir).catch((e) => console.error('writeReleaseMdx failed', e));
            return res.json({ ok: true, files: saved });
        }
        catch (err) {
            console.error('admin release tracks upload failed', err);
            return res.status(500).json({ error: 'Unable to upload tracks' });
        }
    });
    router.post('/:slug/tracks/reorder', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
        const album = await getAlbumDir(slug);
        if (!album)
            return res.status(404).json({ error: 'Release not found' });
        const order = Array.isArray(req.body?.order) ? req.body.order : [];
        if (order.length === 0)
            return res.status(400).json({ error: 'Order array required' });
        const sourceDir = path.join(album.dir, 'tracks', 'source');
        try {
            const files = await readdir(sourceDir).catch(() => []);
            // First, clean up any leftover .reorder-tmp files from previous aborted reorders
            for (const f of files) {
                if (f.endsWith('.reorder-tmp')) {
                    const clean = f.slice(0, -'.reorder-tmp'.length);
                    await rename(path.join(sourceDir, f), path.join(sourceDir, clean)).catch(() => { });
                }
            }
            // Now apply new order using a .reorder-tmp suffix for atomicity
            const prefixLen = String(order.length).length;
            const reorderSuffix = `.reorder-tmp`;
            // Only process files that are in the order array
            const renamed = [];
            for (let i = 0; i < order.length; i++) {
                const raw = order[i];
                if (!raw || raw.includes('..'))
                    continue;
                // Strip any directory prefix (e.g. "source/") for matching
                const original = raw.replace(/^.*[\/\\]/, '');
                // Find the file in source dir (it may still have old numeric prefix)
                const sourceFile = files.find(f => f === original || f.replace(/^\d+__/, '') === original);
                if (!sourceFile)
                    continue;
                const padded = String(i + 1).padStart(prefixLen, '0');
                const newName = `${padded}__${original}${reorderSuffix}`;
                await rename(path.join(sourceDir, sourceFile), path.join(sourceDir, newName));
                renamed.push({ from: newName, to: `${padded}__${original}` });
            }
            // Second pass: strip the reorderSuffix atomically
            for (const { from, to } of renamed) {
                await rename(path.join(sourceDir, from), path.join(sourceDir, to));
            }
            // Clean up any leftover reorder-tmp files
            const finalFiles = await readdir(sourceDir).catch(() => []);
            for (const f of finalFiles) {
                if (f.endsWith(reorderSuffix)) {
                    const clean = f.slice(0, -reorderSuffix.length);
                    await rename(path.join(sourceDir, f), path.join(sourceDir, clean)).catch(() => { });
                }
            }
            return res.json({ ok: true, message: 'Track order saved' });
        }
        catch (err) {
            console.error('admin release tracks reorder failed', err);
            return res.status(500).json({ error: 'Unable to reorder tracks' });
        }
    });
    router.patch('/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const album = await getAlbumDir(slug);
        if (!album)
            return res.status(404).json({ error: 'Release not found' });
        const albumDir = album.dir;
        const newAlbumName = typeof req.body?.albumName === 'string' ? req.body.albumName.trim() || null : null;
        const newNotes = typeof req.body?.notes === 'string' ? req.body.notes : null;
        const newReleaseType = typeof req.body?.releaseType === 'string' ? req.body.releaseType : null;
        const newHidden = req.body?.hidden !== undefined ? Boolean(req.body.hidden) : null;
        const trackRenames = req.body?.trackRenames && typeof req.body.trackRenames === 'object' ? req.body.trackRenames : null;
        const trackDeletes = Array.isArray(req.body?.trackDeletes) ? req.body.trackDeletes : null;
        try {
            if (newNotes !== null) {
                const notesDir = path.join(albumDir, 'notes');
                await mkdir(notesDir, { recursive: true });
                await writeFile(path.join(notesDir, 'notes'), newNotes, 'utf-8');
            }
            if (newReleaseType !== null) {
                // release type is stored in the manifest after rebuild; for now we write it as a marker file
                const typeFile = path.join(albumDir, '.release-type');
                await writeFile(typeFile, newReleaseType, 'utf-8');
            }
            if (newHidden !== null) {
                const hiddenFile = path.join(albumDir, '.release-hidden');
                if (newHidden)
                    await writeFile(hiddenFile, 'true', 'utf-8');
                else
                    await rm(hiddenFile, { force: true }).catch(() => { });
            }
            if (Array.isArray(trackDeletes)) {
                const tracksDir = path.join(albumDir, 'tracks');
                for (const filename of trackDeletes) {
                    if (typeof filename !== 'string' || filename.includes('..'))
                        continue;
                    for (const subDir of ['source', 'stream', 'preview']) {
                        const p = path.resolve(path.join(tracksDir, subDir), filename);
                        if (p.startsWith(path.join(tracksDir, subDir) + path.sep)) {
                            await rm(p, { force: true }).catch(() => { });
                        }
                    }
                }
            }
            if (trackRenames) {
                const tracksDir = path.join(albumDir, 'tracks');
                for (const [oldName, newName] of Object.entries(trackRenames)) {
                    if (oldName.includes('..') || newName.includes('..'))
                        continue;
                    for (const subDir of ['source', 'stream', 'preview']) {
                        const oldPath = path.resolve(path.join(tracksDir, subDir), oldName);
                        const newPath = path.resolve(path.join(tracksDir, subDir), newName);
                        if (oldPath.startsWith(path.join(tracksDir, subDir) + path.sep) && newPath.startsWith(path.join(tracksDir, subDir) + path.sep)) {
                            await rename(oldPath, newPath).catch(() => { });
                        }
                    }
                }
            }
            let finalDir = albumDir;
            if (newAlbumName && newAlbumName !== album.name) {
                const newDir = path.join(MUSIC_ROOT, newAlbumName);
                await rename(albumDir, newDir);
                finalDir = newDir;
            }
            spawnRebuild();
            writeReleaseMdx(slugify(path.basename(finalDir)), finalDir).catch((e) => console.error('writeReleaseMdx failed', e));
            return res.status(200).json({ ok: true, slug: slugify(path.basename(finalDir)) });
        }
        catch (err) {
            console.error('admin release patch failed', err);
            return res.status(500).json({ error: 'Unable to update release' });
        }
    });
    router.delete('/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const album = await getAlbumDir(slug);
        if (!album)
            return res.status(404).json({ error: 'Release not found' });
        try {
            await rm(album.dir, { recursive: true, force: true });
            await rm(path.join(MDX_DIR('en'), `${slug}.mdx`), { force: true });
            await rm(path.join(MDX_DIR('ru'), `${slug}.mdx`), { force: true });
            spawnRebuild();
            return res.status(200).json({ ok: true });
        }
        catch (err) {
            console.error('admin release delete failed', err);
            return res.status(500).json({ error: 'Unable to delete release' });
        }
    });
    // Startup cleanup: recover _tmp_ files left from previous failed reorders
    cleanupTempFiles(MUSIC_ROOT).catch(() => { });
    return router;
}
async function cleanupTempFiles(root) {
    try {
        const dirs = await readdir(root, { withFileTypes: true });
        for (const d of dirs) {
            if (!d.isDirectory())
                continue;
            const sourceDir = path.join(root, d.name, 'tracks', 'source');
            try {
                const files = await readdir(sourceDir);
                let changed = false;
                for (const f of files) {
                    if (f.endsWith('.reorder-tmp')) {
                        const clean = f.slice(0, -13);
                        await rename(path.join(sourceDir, f), path.join(sourceDir, clean)).catch(() => { });
                        changed = true;
                    }
                    // Recover files with _tmp_ prefix from old race condition bugs
                    const oldTmp = f.match(/^_+tmp_\d+_+(.+)$/);
                    if (oldTmp && oldTmp[1]) {
                        const cleanName = oldTmp[1];
                        await rename(path.join(sourceDir, f), path.join(sourceDir, cleanName)).catch(() => { });
                        changed = true;
                    }
                }
                if (changed)
                    console.log(`[admin] cleaned up temp files in ${d.name}/tracks/source/`);
            }
            catch { /* no source dir, skip */ }
        }
    }
    catch { /* no music root */ }
}
