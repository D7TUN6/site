import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
const ROOT = process.cwd();
const GALLERY_DIR = path.join(ROOT, 'public', 'media', 'gallery');
let cached = null;
let cachePromise = null;
function parseFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match)
        return {};
    const body = match[1];
    const attrs = {};
    for (const line of body.split('\n')) {
        const sep = line.indexOf(':');
        if (sep === -1)
            continue;
        const key = line.slice(0, sep).trim();
        let raw = line.slice(sep + 1).trim();
        let val = raw.replace(/^["']|["']$/g, '');
        if (raw === 'true')
            val = true;
        else if (raw === 'false')
            val = false;
        else if (/^\d+$/.test(raw))
            val = Number(raw);
        else if (raw.startsWith('[') && raw.endsWith(']')) {
            val = raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        }
        attrs[key] = val;
    }
    return attrs;
}
async function loadAllEntries() {
    let dirs;
    try {
        dirs = await readdir(GALLERY_DIR, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const entries = [];
    for (const dirent of dirs) {
        if (!dirent.isDirectory())
            continue;
        const slug = dirent.name;
        const mdxPath = path.join(GALLERY_DIR, slug, 'index.mdx');
        try {
            const raw = await readFile(mdxPath, 'utf-8');
            const attrs = parseFrontmatter(raw);
            entries.push({
                slug,
                title: String(attrs.title ?? slug),
                date: String(attrs.date ?? ''),
                tags: Array.isArray(attrs.tags) ? attrs.tags : [],
                images: Array.isArray(attrs.images) ? attrs.images : [],
                cover: String(attrs.cover ?? ''),
            });
        }
        catch {
            continue;
        }
    }
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return entries;
}
function getGalleryEntries() {
    if (cached)
        return Promise.resolve(cached);
    if (cachePromise)
        return cachePromise;
    cachePromise = loadAllEntries().then((e) => { cached = e; return e; });
    return cachePromise;
}
export function createGalleryRouter() {
    const router = express.Router();
    router.get('/entries', async (_req, res) => {
        try {
            const entries = await getGalleryEntries();
            res.json({ ok: true, entries });
        }
        catch (err) {
            console.error('gallery entries failed', err);
            res.status(500).json({ error: 'Unable to load gallery' });
        }
    });
    router.get('/entries/:slug', async (req, res) => {
        try {
            const entries = await getGalleryEntries();
            const entry = entries.find((e) => e.slug === req.params.slug);
            if (!entry)
                return res.status(404).json({ error: 'Not found' });
            res.json({ ok: true, entry });
        }
        catch (err) {
            console.error('gallery entry failed', err);
            res.status(500).json({ error: 'Unable to load entry' });
        }
    });
    router.post('/invalidate', (_req, res) => {
        cached = null;
        cachePromise = null;
        res.json({ ok: true });
    });
    return router;
}
