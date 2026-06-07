import { mkdir, readdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import busboy from 'busboy';
import express from 'express';
import { enforceSameOrigin } from '../../lib/request-origin.js';
import { requireAdmin } from '../../middleware/require-auth.js';
import { ROOT, slugify } from './shared.js';
import { processGalleryImage, spawnRebuild, IMAGE_CONVERT_EXTS } from '../../lib/media-convert.js';
import { getOrder, setOrder, applyOrder } from './order-utils.js';
const GALLERY_ROOT = path.join(ROOT, 'public', 'media', 'gallery');
const GALLERY_IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp']);
async function invalidateGalleryCache() {
    try {
        await fetch(`http://127.0.0.1:${process.env.WEB_PORT || process.env.PORT || 3001}/api/gallery/invalidate`, { method: 'POST' });
    }
    catch { /* cache may not be running */ }
}
async function writeMdx(slug, data) {
    const dir = path.join(GALLERY_ROOT, slug);
    await mkdir(dir, { recursive: true });
    const tagsStr = data.tags.map((t) => `"${t}"`).join(', ');
    const mdx = `---
title: "${data.title.replace(/"/g, '\\"')}"
date: "${data.date}"
tags: [${tagsStr}]
cover: "${data.cover}"
images: [${data.images.map((i) => `"${i}"`).join(', ')}]
---
`;
    await writeFile(path.join(dir, 'index.mdx'), mdx, 'utf-8');
}
export function createAdminGalleryRouter() {
    const router = express.Router();
    router.get('/', requireAdmin, async (_req, res) => {
        try {
            const dirents = await readdir(GALLERY_ROOT, { withFileTypes: true }).catch(() => []);
            const entries = [];
            for (const d of dirents) {
                if (!d.isDirectory())
                    continue;
                const dir = path.join(GALLERY_ROOT, d.name);
                const images = [];
                let cover = '';
                const imgFiles = await readdir(dir).catch(() => []);
                for (const f of imgFiles) {
                    if (f === 'index.mdx')
                        continue;
                    if (GALLERY_IMG_EXT.has(path.extname(f).toLowerCase()) && !f.includes('-preview.')) {
                        if (!cover)
                            cover = `/media/gallery/${d.name}/${f}`;
                        images.push(f);
                    }
                }
                let mdxMeta = { title: d.name, date: '', tags: [] };
                try {
                    const raw = await readFile(path.join(dir, 'index.mdx'), 'utf-8');
                    const titleM = raw.match(/^title:\s*"([^"]*)"/m);
                    const dateM = raw.match(/^date:\s*"([^"]*)"/m);
                    const tagsM = raw.match(/^tags:\s*\[(.*?)\]/m);
                    if (titleM)
                        mdxMeta.title = titleM[1];
                    if (dateM)
                        mdxMeta.date = dateM[1];
                    if (tagsM)
                        mdxMeta.tags = tagsM[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
                }
                catch { /* mdx optional */ }
                entries.push({ slug: d.name, title: mdxMeta.title, date: mdxMeta.date, tags: mdxMeta.tags, images, cover });
            }
            entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
            const galleryOrder = await getOrder(GALLERY_ROOT);
            return res.status(200).json({ ok: true, entries: applyOrder(entries, GALLERY_ROOT, galleryOrder) });
        }
        catch (err) {
            console.error('admin gallery list failed', err);
            return res.status(500).json({ error: 'Unable to list gallery entries' });
        }
    });
    router.post('/', enforceSameOrigin, requireAdmin, async (req, res) => {
        const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
        if (!title)
            return res.status(400).json({ error: 'title is required' });
        const slug = slugify(title);
        if (!slug)
            return res.status(400).json({ error: 'Invalid title' });
        const dir = path.join(GALLERY_ROOT, slug);
        try {
            await access(dir);
            return res.status(409).json({ error: 'Entry with this slug already exists' });
        }
        catch { /* ok */ }
        const date = typeof req.body?.date === 'string' ? req.body.date.trim() : new Date().toLocaleDateString('en-GB').split('/').reverse().join('-');
        const tags = Array.isArray(req.body?.tags) ? req.body.tags.map(String) : [];
        try {
            await mkdir(dir, { recursive: true });
            await writeMdx(slug, { title, date, tags, cover: '', images: [] });
            await invalidateGalleryCache();
            spawnRebuild();
            return res.status(200).json({ ok: true, slug });
        }
        catch (err) {
            console.error('admin gallery create failed', err);
            return res.status(500).json({ error: 'Unable to create gallery entry' });
        }
    });
    router.post('/:slug/images', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = String(req.params.slug).replace(/[^a-z0-9-]/g, '');
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const entryDir = path.join(GALLERY_ROOT, slug);
        try {
            await access(entryDir);
        }
        catch {
            return res.status(404).json({ error: 'Entry not found' });
        }
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data'))
            return res.status(400).json({ error: 'Expected multipart/form-data' });
        const imagesDir = entryDir;
        const saved = [];
        try {
            await new Promise((resolve, reject) => {
                const bb = busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024, files: 100 } });
                const pending = [];
                bb.on('file', (_field, stream, info) => {
                    const ext = path.extname(info.filename).toLowerCase();
                    if (!GALLERY_IMG_EXT.has(ext)) {
                        stream.resume();
                        return;
                    }
                    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
                    const dest = path.join(imagesDir, filename);
                    const p = new Promise((r, j) => {
                        const ws = createWriteStream(dest);
                        stream.pipe(ws);
                        ws.on('finish', () => { saved.push(filename); r(); });
                        ws.on('error', j);
                        stream.on('error', j);
                    });
                    pending.push(p);
                });
                bb.on('error', reject);
                bb.on('finish', () => Promise.all(pending).then(() => resolve()).catch(reject));
                req.pipe(bb);
            });
            const processed = [];
            for (const file of saved) {
                const ext = path.extname(file).toLowerCase();
                if (IMAGE_CONVERT_EXTS.has(ext)) {
                    const src = path.join(imagesDir, file);
                    const result = await processGalleryImage(src, imagesDir);
                    processed.push(result.webp);
                }
                else if (ext === '.webp') {
                    const src = path.join(imagesDir, file);
                    const result = await processGalleryImage(src, imagesDir);
                    processed.push(result.webp);
                }
                else {
                    processed.push(file);
                }
            }
            let mdx = { title: slug, date: '', tags: [], cover: '', images: [] };
            try {
                const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8');
                const titleM = raw.match(/^title:\s*"([^"]*)"/m);
                const dateM = raw.match(/^date:\s*"([^"]*)"/m);
                const tagsM = raw.match(/^tags:\s*\[(.*?)\]/m);
                if (titleM)
                    mdx.title = titleM[1];
                if (dateM)
                    mdx.date = dateM[1];
                if (tagsM)
                    mdx.tags = tagsM[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
            }
            catch { /* ok */ }
            const imgFiles = await readdir(entryDir);
            const allImages = imgFiles.filter((f) => GALLERY_IMG_EXT.has(path.extname(f).toLowerCase()) && !f.includes('-preview.'));
            const cover = allImages.find((f) => f.includes('-preview.')) ? allImages.filter((f) => !f.includes('-preview.'))[0] || '' : allImages[0] || '';
            await writeMdx(slug, { title: mdx.title, date: mdx.date, tags: mdx.tags, cover, images: allImages });
            await invalidateGalleryCache();
            spawnRebuild();
            return res.json({ ok: true, files: processed });
        }
        catch (err) {
            console.error('admin gallery images upload failed', err);
            return res.status(500).json({ error: 'Unable to upload images' });
        }
    });
    router.patch('/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = String(req.params.slug).replace(/[^a-z0-9-]/g, '');
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const entryDir = path.join(GALLERY_ROOT, slug);
        try {
            await access(entryDir);
        }
        catch {
            return res.status(404).json({ error: 'Entry not found' });
        }
        let mdx = { title: slug, date: '', tags: [], cover: '', images: [] };
        try {
            const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8');
            const titleM = raw.match(/^title:\s*"([^"]*)"/m);
            const dateM = raw.match(/^date:\s*"([^"]*)"/m);
            const tagsM = raw.match(/^tags:\s*\[(.*?)\]/m);
            if (titleM)
                mdx.title = titleM[1];
            if (dateM)
                mdx.date = dateM[1];
            if (tagsM)
                mdx.tags = tagsM[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
        }
        catch { /* ok */ }
        if (typeof req.body?.title === 'string')
            mdx.title = req.body.title.trim();
        if (typeof req.body?.date === 'string')
            mdx.date = req.body.date.trim();
        if (Array.isArray(req.body?.tags))
            mdx.tags = req.body.tags.map(String);
        const imgFiles = await readdir(entryDir);
        const allImages = imgFiles.filter((f) => GALLERY_IMG_EXT.has(path.extname(f).toLowerCase()) && !f.includes('-preview.'));
        if (Array.isArray(req.body?.images)) {
            const existingSet = new Set(allImages);
            mdx.images = req.body.images.filter((f) => typeof f === 'string' && existingSet.has(f));
        }
        else {
            mdx.images = allImages;
        }
        mdx.cover = mdx.images.find((f) => !f.includes('-preview.')) || mdx.images[0] || '';
        try {
            await writeMdx(slug, mdx);
            await invalidateGalleryCache();
            spawnRebuild();
            return res.status(200).json({ ok: true });
        }
        catch (err) {
            console.error('admin gallery patch failed', err);
            return res.status(500).json({ error: 'Unable to update entry' });
        }
    });
    router.delete('/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = String(req.params.slug).replace(/[^a-z0-9-]/g, '');
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const entryDir = path.join(GALLERY_ROOT, slug);
        try {
            await access(entryDir);
        }
        catch {
            return res.status(404).json({ error: 'Entry not found' });
        }
        try {
            await rm(entryDir, { recursive: true, force: true });
            await invalidateGalleryCache();
            spawnRebuild();
            return res.status(200).json({ ok: true });
        }
        catch (err) {
            console.error('admin gallery delete failed', err);
            return res.status(500).json({ error: 'Unable to delete entry' });
        }
    });
    router.post('/:slug/images/reorder', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = String(req.params.slug).replace(/[^a-z0-9-]/g, '');
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const entryDir = path.join(GALLERY_ROOT, slug);
        try {
            await access(entryDir);
        }
        catch {
            return res.status(404).json({ error: 'Entry not found' });
        }
        const order = Array.isArray(req.body?.order) ? req.body.order : [];
        if (order.length === 0)
            return res.status(400).json({ error: 'Order array required' });
        try {
            let mdx = { title: slug, date: '', tags: [], cover: '', images: [] };
            try {
                const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8');
                const titleM = raw.match(/^title:\s*"([^"]*)"/m);
                const dateM = raw.match(/^date:\s*"([^"]*)"/m);
                const tagsM = raw.match(/^tags:\s*\[(.*?)\]/m);
                if (titleM)
                    mdx.title = titleM[1];
                if (dateM)
                    mdx.date = dateM[1];
                if (tagsM)
                    mdx.tags = tagsM[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
            }
            catch { /* ok */ }
            const allExisting = new Set(mdx.images);
            const filteredOrder = order.filter((f) => allExisting.has(f));
            mdx.images = filteredOrder;
            mdx.cover = filteredOrder.find((f) => !f.includes('-preview.')) || filteredOrder[0] || '';
            await writeMdx(slug, mdx);
            await invalidateGalleryCache();
            spawnRebuild();
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin gallery images reorder failed', err);
            return res.status(500).json({ error: 'Unable to reorder images' });
        }
    });
    router.delete('/:slug/images/:filename', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = String(req.params.slug).replace(/[^a-z0-9-]/g, '');
        const filename = String(req.params.filename).replace(/[^a-z0-9._-]/gi, '');
        if (!slug || !filename)
            return res.status(400).json({ error: 'Invalid params' });
        const entryDir = path.join(GALLERY_ROOT, slug);
        const targetFile = path.resolve(entryDir, filename);
        if (!targetFile.startsWith(GALLERY_ROOT + path.sep))
            return res.status(400).json({ error: 'Invalid path' });
        try {
            await rm(targetFile, { force: true });
            const ext = path.extname(filename).toLowerCase();
            const base = path.basename(filename, ext);
            await rm(path.join(entryDir, `${base}.webp`), { force: true });
            await rm(path.join(entryDir, `${base}.avif`), { force: true });
            await rm(path.join(entryDir, `${base}-preview.webp`), { force: true });
            const imgFiles = await readdir(entryDir);
            const remaining = imgFiles.filter((f) => GALLERY_IMG_EXT.has(path.extname(f).toLowerCase()) && !f.includes('-preview.'));
            let mdx = { title: slug, date: '', tags: [], cover: '', images: [] };
            try {
                const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8');
                const titleM = raw.match(/^title:\s*"([^"]*)"/m);
                const dateM = raw.match(/^date:\s*"([^"]*)"/m);
                const tagsM = raw.match(/^tags:\s*\[(.*?)\]/m);
                if (titleM)
                    mdx.title = titleM[1];
                if (dateM)
                    mdx.date = dateM[1];
                if (tagsM)
                    mdx.tags = tagsM[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
            }
            catch { /* ok */ }
            await writeMdx(slug, { ...mdx, cover: remaining[0] || '', images: remaining });
            await invalidateGalleryCache();
            spawnRebuild();
            return res.status(200).json({ ok: true });
        }
        catch (err) {
            console.error('admin gallery image delete failed', err);
            return res.status(500).json({ error: 'Unable to delete image' });
        }
    });
    router.post('/reorder', enforceSameOrigin, requireAdmin, async (req, res) => {
        try {
            const order = Array.isArray(req.body?.order) ? req.body.order : [];
            if (order.length === 0)
                return res.status(400).json({ error: 'Order array required' });
            await setOrder(GALLERY_ROOT, order);
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin gallery reorder failed', err);
            return res.status(500).json({ error: 'Unable to reorder' });
        }
    });
    return router;
}
