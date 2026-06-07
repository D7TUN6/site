import crypto from 'node:crypto';
import { mkdir, readdir, rm, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
export const ROOT = process.cwd();
export const SHOP_IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
export const SHOP_CONVERT_EXTS = new Set(['.jpg', '.jpeg', '.png']);
export const SHOP_ROOT = path.join(ROOT, 'public', 'media', 'shop');
export const loginRateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 5;
export function checkLoginRateLimit(key) {
    const now = Date.now();
    const entry = loginRateLimitMap.get(key);
    if (!entry || now > entry.resetAt) {
        loginRateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX)
        return false;
    entry.count++;
    return true;
}
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginRateLimitMap)
        if (now > entry.resetAt)
            loginRateLimitMap.delete(key);
}, 300_000).unref();
export function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-');
}
export const shopSlugify = slugify;
export function normalizeEmail(raw) { return typeof raw === 'string' ? raw.trim().toLowerCase() : ''; }
export function safeEqual(a, b) {
    const A = Buffer.from(String(a));
    const B = Buffer.from(String(b));
    return A.length === B.length && crypto.timingSafeEqual(A, B);
}
export function normalizeParam(value, pattern) {
    if (typeof value !== 'string')
        return '';
    return value.replace(pattern, '');
}
export function nowMs() { return Date.now(); }
export function safeParseJson(text) {
    if (typeof text !== 'string' || !text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
export function safeJsonStringify(value, maxLen = 8000) {
    const t = JSON.stringify(value ?? null);
    if (t.length > maxLen)
        throw new Error('Payload too large');
    return t;
}
export function normalizeStatus(raw) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (value === 'pending_payment' || value === 'paid' || value === 'shipped' || value === 'delivered' || value === 'canceled' || value === 'new')
        return value;
    return null;
}
export async function regenerateShopManifestLite() {
    const manifestPath = path.join(ROOT, 'src', 'generated', 'shop-manifest.json');
    const products = [];
    let dirents = [];
    try {
        dirents = await readdir(SHOP_ROOT, { withFileTypes: true });
    }
    catch { /* SHOP_ROOT may not exist yet */ }
    for (const d of dirents) {
        if (!d.isDirectory())
            continue;
        try {
            const data = JSON.parse(await readFile(path.join(SHOP_ROOT, d.name, 'product.json'), 'utf-8'));
            const images = Array.isArray(data.images) ? data.images : [];
            const coverImage = typeof data.coverImage === 'string' && data.coverImage ? data.coverImage : images[0] ?? null;
            let coverPreviewUrl = null;
            if (coverImage) {
                const baseUrl = `/media/shop/${d.name}/images`;
                const previewFile = coverImage.replace(/\.[^.]+$/, '-preview.webp');
                try {
                    await access(path.join(SHOP_ROOT, d.name, 'images', previewFile));
                    coverPreviewUrl = `${baseUrl}/${previewFile}`;
                }
                catch {
                    coverPreviewUrl = `${baseUrl}/${coverImage}`;
                }
            }
            products.push({
                slug: d.name,
                title: String(data.title || ''),
                category: String(data.category || ''),
                price: { currency: 'RUB', value: Math.floor(Number(data.price || 0) / 100) },
                unitAmount: Math.floor(Number(data.price || 0)),
                status: String(data.status || 'available'),
                quantity: Number.isFinite(data.quantity) ? Math.max(0, Math.floor(data.quantity)) : 0,
                images: images.map((f) => `/media/shop/${d.name}/images/${f}`),
                coverUrl: coverImage ? `/media/shop/${d.name}/images/${coverImage}` : null,
                coverPreviewUrl,
                descriptionMarkdown: String(data.description?.ru || data.description?.en || ''),
                description: { en: String(data.description?.en || ''), ru: String(data.description?.ru || '') }
            });
        }
        catch (error) {
            console.error('regenerateShopManifestLite:', String(error));
        }
    }
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, JSON.stringify({ products }, null, 2), 'utf-8');
}
export async function readProductJson(slug) {
    try {
        return JSON.parse(await readFile(path.join(SHOP_ROOT, slug, 'product.json'), 'utf-8'));
    }
    catch {
        return null;
    }
}
export async function writeProductJson(slug, data) {
    const dir = path.join(SHOP_ROOT, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'product.json'), JSON.stringify(data, null, 2), 'utf-8');
}
export async function processShopImage(src, destDir) {
    const ext = path.extname(src).toLowerCase();
    const base = path.basename(src, ext);
    const webpFilename = `${base}.webp`;
    const previewFilename = `${base}-preview.webp`;
    if (SHOP_CONVERT_EXTS.has(ext)) {
        await sharp(src).webp({ quality: 85 }).toFile(path.join(destDir, webpFilename));
        await rm(src, { force: true });
    }
    const webpPath = path.join(destDir, ext === '.webp' ? path.basename(src) : webpFilename);
    await sharp(ext === '.webp' ? src : webpPath)
        .resize(400)
        .webp({ quality: 70 })
        .toFile(path.join(destDir, previewFilename));
    return { webp: webpFilename, preview: previewFilename };
}
export async function removeShopImageFiles(imagesDir, filename) {
    await rm(path.join(imagesDir, filename), { force: true });
    const ext = path.extname(filename).toLowerCase();
    const base = path.basename(filename, ext);
    await rm(path.join(imagesDir, `${base}-preview.webp`), { force: true });
    if (ext !== '.webp') {
        await rm(path.join(imagesDir, `${base}.webp`), { force: true });
    }
}
