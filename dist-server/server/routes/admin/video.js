import { mkdir, readdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import busboy from 'busboy';
import express from 'express';
import { enforceSameOrigin } from '../../lib/request-origin.js';
import { requireAdmin } from '../../middleware/require-auth.js';
import { ROOT, slugify } from './shared.js';
import { convertVideoToHls, spawnRebuild } from '../../lib/media-convert.js';
import { getOrder, setOrder, applyOrder } from './order-utils.js';
const VIDEO_ROOT = path.join(ROOT, 'public', 'media', 'video');
const VIDEO_EXT = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']);
async function invalidateVideoCache() {
    try {
        await fetch(`http://127.0.0.1:${process.env.WEB_PORT || process.env.PORT || 3001}/api/video/invalidate`, { method: 'POST' });
    }
    catch { /* ok */ }
}
async function writeMdx(slug, data) {
    const dir = path.join(VIDEO_ROOT, slug);
    await mkdir(dir, { recursive: true });
    const sourcesStr = data.sources.map((s) => `  - url: ${s.url}\n    type: ${s.type}`).join('\n');
    const mdx = `---
title: "${data.title.replace(/"/g, '\\"')}"
date: "${data.date}"
thumbnail: "${data.thumbnail}"
sources:
${sourcesStr}
---
`;
    await writeFile(path.join(dir, 'index.mdx'), mdx, 'utf-8');
}
export function createAdminVideoRouter() {
    const router = express.Router();
    router.get('/', requireAdmin, async (_req, res) => {
        try {
            const dirents = await readdir(VIDEO_ROOT, { withFileTypes: true }).catch(() => []);
            const entries = [];
            for (const d of dirents) {
                if (!d.isDirectory())
                    continue;
                const dir = path.join(VIDEO_ROOT, d.name);
                let mdxMeta = { title: d.name, date: '', thumbnail: '', sources: [] };
                try {
                    const raw = await readFile(path.join(dir, 'index.mdx'), 'utf-8');
                    const titleM = raw.match(/^title:\s*"([^"]*)"/m);
                    const dateM = raw.match(/^date:\s*"([^"]*)"/m);
                    const thumbM = raw.match(/^thumbnail:\s*"([^"]*)"/m);
                    if (titleM)
                        mdxMeta.title = titleM[1];
                    if (dateM)
                        mdxMeta.date = dateM[1];
                    if (thumbM)
                        mdxMeta.thumbnail = thumbM[1];
                    const sourcesSection = raw.match(/^sources:\n((?:\s+- .+\n?)*)/m);
                    if (sourcesSection) {
                        mdxMeta.sources = sourcesSection[1].trim().split('\n').map((line) => {
                            const item = {};
                            const parts = line.replace(/^\s*-\s*/, '').split(',').map((s) => s.trim());
                            for (const part of parts) {
                                const [k, ...v] = part.split(':');
                                if (k && v.length)
                                    item[k.trim()] = v.join(':').trim();
                            }
                            return item;
                        });
                    }
                }
                catch { /* ok */ }
                entries.push({ slug: d.name, ...mdxMeta });
            }
            entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
            const videoOrder = await getOrder(VIDEO_ROOT);
            return res.status(200).json({ ok: true, entries: applyOrder(entries, VIDEO_ROOT, videoOrder) });
        }
        catch (err) {
            console.error('admin video list failed', err);
            return res.status(500).json({ error: 'Unable to list video entries' });
        }
    });
    router.post('/', enforceSameOrigin, requireAdmin, async (req, res) => {
        const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
        if (!title)
            return res.status(400).json({ error: 'title is required' });
        const slug = slugify(title);
        if (!slug)
            return res.status(400).json({ error: 'Invalid title' });
        const dir = path.join(VIDEO_ROOT, slug);
        try {
            await access(dir);
            return res.status(409).json({ error: 'Entry with this slug already exists' });
        }
        catch { /* ok */ }
        const date = typeof req.body?.date === 'string' ? req.body.date.trim() : new Date().toISOString().split('T')[0];
        try {
            await mkdir(dir, { recursive: true });
            await writeMdx(slug, { title, date, thumbnail: '', sources: [] });
            await invalidateVideoCache();
            spawnRebuild();
            return res.status(200).json({ ok: true, slug });
        }
        catch (err) {
            console.error('admin video create failed', err);
            return res.status(500).json({ error: 'Unable to create video entry' });
        }
    });
    router.post('/:slug/upload', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = String(req.params.slug).replace(/[^a-z0-9-]/g, '');
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const entryDir = path.join(VIDEO_ROOT, slug);
        try {
            await access(entryDir);
        }
        catch {
            return res.status(404).json({ error: 'Entry not found' });
        }
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data'))
            return res.status(400).json({ error: 'Expected multipart/form-data' });
        const videoDir = path.join(entryDir, 'videos');
        await mkdir(videoDir, { recursive: true });
        let savedFile = '';
        try {
            await new Promise((resolve, reject) => {
                const bb = busboy({ headers: req.headers, limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1 } });
                bb.on('file', (_field, stream, info) => {
                    const ext = path.extname(info.filename).toLowerCase();
                    if (!VIDEO_EXT.has(ext)) {
                        stream.resume();
                        return;
                    }
                    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
                    const dest = path.join(videoDir, filename);
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
                return res.status(400).json({ error: 'No valid video file received' });
            const srcPath = path.join(videoDir, savedFile);
            const { playlist, thumbnail } = await convertVideoToHls(srcPath, videoDir, savedFile);
            let mdx = { title: slug, date: '', thumbnail: '', sources: [] };
            try {
                const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8');
                const titleM = raw.match(/^title:\s*"([^"]*)"/m);
                const dateM = raw.match(/^date:\s*"([^"]*)"/m);
                if (titleM)
                    mdx.title = titleM[1];
                if (dateM)
                    mdx.date = dateM[1];
            }
            catch { /* ok */ }
            mdx.thumbnail = thumbnail;
            mdx.sources = [
                { url: `/media/video/${slug}/videos/${playlist}`, type: 'application/vnd.apple.mpegurl', resolution: '720p' },
            ];
            await writeMdx(slug, mdx);
            await invalidateVideoCache();
            spawnRebuild();
            return res.json({ ok: true, slug, thumbnail, playlist });
        }
        catch (err) {
            console.error('admin video upload failed', err);
            return res.status(500).json({ error: 'Unable to upload video' });
        }
    });
    router.patch('/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = String(req.params.slug).replace(/[^a-z0-9-]/g, '');
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const entryDir = path.join(VIDEO_ROOT, slug);
        try {
            await access(entryDir);
        }
        catch {
            return res.status(404).json({ error: 'Entry not found' });
        }
        let mdx = { title: slug, date: '', thumbnail: '', sources: [] };
        try {
            const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8');
            const titleM = raw.match(/^title:\s*"([^"]*)"/m);
            const dateM = raw.match(/^date:\s*"([^"]*)"/m);
            const thumbM = raw.match(/^thumbnail:\s*"([^"]*)"/m);
            if (titleM)
                mdx.title = titleM[1];
            if (dateM)
                mdx.date = dateM[1];
            if (thumbM)
                mdx.thumbnail = thumbM[1];
        }
        catch { /* ok */ }
        if (typeof req.body?.title === 'string')
            mdx.title = req.body.title.trim();
        if (typeof req.body?.date === 'string')
            mdx.date = req.body.date.trim();
        try {
            await writeMdx(slug, mdx);
            await invalidateVideoCache();
            spawnRebuild();
            return res.status(200).json({ ok: true });
        }
        catch (err) {
            console.error('admin video patch failed', err);
            return res.status(500).json({ error: 'Unable to update entry' });
        }
    });
    router.delete('/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = String(req.params.slug).replace(/[^a-z0-9-]/g, '');
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const entryDir = path.join(VIDEO_ROOT, slug);
        try {
            await access(entryDir);
        }
        catch {
            return res.status(404).json({ error: 'Entry not found' });
        }
        try {
            await rm(entryDir, { recursive: true, force: true });
            await invalidateVideoCache();
            spawnRebuild();
            return res.status(200).json({ ok: true });
        }
        catch (err) {
            console.error('admin video delete failed', err);
            return res.status(500).json({ error: 'Unable to delete entry' });
        }
    });
    router.post('/reorder', enforceSameOrigin, requireAdmin, async (req, res) => {
        try {
            const order = Array.isArray(req.body?.order) ? req.body.order : [];
            if (order.length === 0)
                return res.status(400).json({ error: 'Order array required' });
            await setOrder(VIDEO_ROOT, order);
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin video reorder failed', err);
            return res.status(500).json({ error: 'Unable to reorder' });
        }
    });
    return router;
}
