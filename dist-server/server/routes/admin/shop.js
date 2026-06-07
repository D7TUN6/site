import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import busboy from 'busboy';
import express from 'express';
import { enforceSameOrigin } from '../../lib/request-origin.js';
import { requireAdmin } from '../../middleware/require-auth.js';
import { SHOP_ROOT, SHOP_IMG_EXT, SHOP_CONVERT_EXTS, shopSlugify, normalizeParam, readProductJson, writeProductJson, regenerateShopManifestLite, processShopImage, removeShopImageFiles, } from './shared.js';
export function createAdminShopRouter({ db }) {
    const router = express.Router();
    router.get('/', requireAdmin, async (_req, res) => {
        try {
            const dirents = await readdir(SHOP_ROOT, { withFileTypes: true }).catch(() => []);
            const products = [];
            for (const d of dirents) {
                if (!d.isDirectory())
                    continue;
                const data = await readProductJson(d.name);
                if (!data)
                    continue;
                const images = Array.isArray(data.images) ? data.images : [];
                products.push({ slug: d.name, title: data.title || '', category: data.category || '', price: data.price || 0, status: data.status || 'available', quantity: data.quantity ?? 0, images, coverImage: data.coverImage || images[0] || null, description: data.description || { en: '', ru: '' } });
            }
            return res.json({ ok: true, products });
        }
        catch (err) {
            console.error('admin shop list failed', err);
            return res.status(500).json({ error: 'Unable to list products' });
        }
    });
    router.post('/', enforceSameOrigin, requireAdmin, async (req, res) => {
        const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
        if (!title)
            return res.status(400).json({ error: 'title is required' });
        const slug = shopSlugify(title);
        if (!slug)
            return res.status(400).json({ error: 'Invalid title' });
        if (await readProductJson(slug))
            return res.status(409).json({ error: 'Product with this slug already exists' });
        const data = { slug, title, category: typeof req.body?.category === 'string' ? req.body.category.trim() : '', price: Math.floor(Number(req.body?.price) || 0), status: ['available', 'sold_out', 'coming_soon'].includes(req.body?.status) ? req.body.status : 'available', quantity: Math.max(0, Math.floor(Number(req.body?.quantity) || 0)), images: [], coverImage: null, description: { en: typeof req.body?.descriptionEn === 'string' ? req.body.descriptionEn : '', ru: typeof req.body?.descriptionRu === 'string' ? req.body.descriptionRu : '' } };
        try {
            await writeProductJson(slug, data);
            await mkdir(path.join(SHOP_ROOT, slug, 'images'), { recursive: true });
            await regenerateShopManifestLite();
            return res.json({ ok: true, slug });
        }
        catch (err) {
            console.error('admin shop create failed', err);
            return res.status(500).json({ error: 'Unable to create product' });
        }
    });
    router.patch('/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = normalizeParam(req.params.slug, /[^a-z0-9-]/g);
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const data = await readProductJson(slug);
        if (!data)
            return res.status(404).json({ error: 'Product not found' });
        if (typeof req.body?.title === 'string')
            data.title = req.body.title.trim();
        if (typeof req.body?.category === 'string')
            data.category = req.body.category.trim();
        if (req.body?.price !== undefined)
            data.price = Math.floor(Number(req.body.price) || 0);
        if (['available', 'sold_out', 'coming_soon'].includes(req.body?.status))
            data.status = req.body.status;
        if (req.body?.quantity !== undefined)
            data.quantity = Math.max(0, Math.floor(Number(req.body.quantity) || 0));
        if (typeof req.body?.descriptionEn === 'string')
            data.description = { ...data.description, en: req.body.descriptionEn };
        if (typeof req.body?.descriptionRu === 'string')
            data.description = { ...data.description, ru: req.body.descriptionRu };
        if (typeof req.body?.coverImage === 'string') {
            const imgs = Array.isArray(data.images) ? data.images : [];
            data.coverImage = imgs.includes(req.body.coverImage) ? req.body.coverImage : (imgs[0] ?? null);
        }
        if (Array.isArray(req.body?.images)) {
            const existing = new Set(Array.isArray(data.images) ? data.images : []);
            data.images = req.body.images.filter((f) => typeof f === 'string' && existing.has(f));
        }
        try {
            await writeProductJson(slug, data);
            await regenerateShopManifestLite();
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin shop patch failed', err);
            return res.status(500).json({ error: 'Unable to update product' });
        }
    });
    router.delete('/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = normalizeParam(req.params.slug, /[^a-z0-9-]/g);
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        try {
            const targetDir = path.resolve(SHOP_ROOT, slug);
            if (!targetDir.startsWith(SHOP_ROOT + path.sep))
                return res.status(400).json({ error: 'Invalid slug' });
            await rm(targetDir, { recursive: true, force: true });
            await regenerateShopManifestLite();
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin shop delete failed', err);
            return res.status(500).json({ error: 'Unable to delete product' });
        }
    });
    router.post('/:slug/images/reorder', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = normalizeParam(req.params.slug, /[^a-z0-9-]/g);
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const data = await readProductJson(slug);
        if (!data)
            return res.status(404).json({ error: 'Product not found' });
        const order = Array.isArray(req.body?.order) ? req.body.order : [];
        if (order.length === 0)
            return res.status(400).json({ error: 'Order array required' });
        const existing = new Set(Array.isArray(data.images) ? data.images : []);
        data.images = order.filter((f) => existing.has(f));
        if (data.coverImage && !data.images.includes(data.coverImage))
            data.coverImage = data.images[0] ?? null;
        try {
            await writeProductJson(slug, data);
            await regenerateShopManifestLite();
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin shop image reorder failed', err);
            return res.status(500).json({ error: 'Unable to reorder images' });
        }
    });
    router.post('/:slug/images', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = normalizeParam(req.params.slug, /[^a-z0-9-]/g);
        if (!slug)
            return res.status(400).json({ error: 'Invalid slug' });
        const data = await readProductJson(slug);
        if (!data)
            return res.status(404).json({ error: 'Product not found' });
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data'))
            return res.status(400).json({ error: 'Expected multipart/form-data' });
        const imagesDir = path.join(SHOP_ROOT, slug, 'images');
        await mkdir(imagesDir, { recursive: true });
        const saved = [];
        try {
            await new Promise((resolve, reject) => {
                const bb = busboy({ headers: req.headers, limits: { fileSize: 30 * 1024 * 1024, files: 20 } });
                const pending = [];
                bb.on('file', (_field, stream, info) => {
                    const ext = path.extname(info.filename).toLowerCase();
                    if (!SHOP_IMG_EXT.has(ext)) {
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
                if (SHOP_CONVERT_EXTS.has(ext)) {
                    const src = path.join(imagesDir, file);
                    const { webp } = await processShopImage(src, imagesDir);
                    processed.push(webp);
                }
                else {
                    const src = path.join(imagesDir, file);
                    const { webp, preview } = await processShopImage(src, imagesDir);
                    if (ext !== '.webp')
                        await rm(src, { force: true });
                    processed.push(webp);
                }
            }
            data.images = [...(Array.isArray(data.images) ? data.images : []), ...processed];
            if (!data.coverImage && data.images.length > 0)
                data.coverImage = data.images[0];
            await writeProductJson(slug, data);
            await regenerateShopManifestLite();
            return res.json({ ok: true, files: processed });
        }
        catch (err) {
            console.error('admin shop image upload failed', err);
            return res.status(500).json({ error: 'Unable to upload images' });
        }
    });
    router.delete('/:slug/images/:filename', enforceSameOrigin, requireAdmin, async (req, res) => {
        const slug = normalizeParam(req.params.slug, /[^a-z0-9-]/g);
        const filename = normalizeParam(req.params.filename, /[^a-z0-9._-]/gi);
        if (!slug || !filename)
            return res.status(400).json({ error: 'Invalid params' });
        const data = await readProductJson(slug);
        if (!data)
            return res.status(404).json({ error: 'Product not found' });
        try {
            const imagesDir = path.resolve(SHOP_ROOT, slug, 'images');
            if (!imagesDir.startsWith(SHOP_ROOT + path.sep))
                return res.status(400).json({ error: 'Invalid slug' });
            const targetFile = path.resolve(imagesDir, filename);
            if (!targetFile.startsWith(imagesDir + path.sep))
                return res.status(400).json({ error: 'Invalid filename' });
            await removeShopImageFiles(imagesDir, filename);
            data.images = (Array.isArray(data.images) ? data.images : []).filter((f) => f !== filename);
            if (data.coverImage === filename)
                data.coverImage = data.images[0] ?? null;
            await writeProductJson(slug, data);
            await regenerateShopManifestLite();
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin shop image delete failed', err);
            return res.status(500).json({ error: 'Unable to delete image' });
        }
    });
    return router;
}
