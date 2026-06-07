import express from 'express';
import { enforceSameOrigin } from '../../lib/request-origin.js';
import { requireAdmin } from '../../middleware/require-auth.js';
export function listActiveBanners(db, page) {
    const rows = db.prepare('SELECT id, text, page FROM banners WHERE page = ? AND active = 1 ORDER BY id DESC LIMIT 1').all(page);
    return rows;
}
export function createAdminBannersRouter({ db }) {
    const router = express.Router();
    router.get('/', requireAdmin, (_req, res) => {
        try {
            const rows = db.prepare('SELECT id, page, text, active, created_at, updated_at FROM banners ORDER BY page, id DESC').all();
            return res.json({ ok: true, banners: rows });
        }
        catch (err) {
            console.error('admin banners list failed', err);
            return res.status(500).json({ error: 'Unable to list banners' });
        }
    });
    router.post('/', enforceSameOrigin, requireAdmin, (req, res) => {
        try {
            const page = typeof req.body?.page === 'string' ? req.body.page.trim() : '';
            const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
            const active = req.body?.active === true || req.body?.active === 1 ? 1 : 0;
            if (!page || !text)
                return res.status(400).json({ error: 'page and text are required' });
            const now = Date.now();
            const result = db.prepare('INSERT INTO banners (page, text, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(page, text, active, now, now);
            return res.json({ ok: true, id: Number(result.lastInsertRowid) });
        }
        catch (err) {
            console.error('admin banners create failed', err);
            return res.status(500).json({ error: 'Unable to create banner' });
        }
    });
    router.patch('/:id', enforceSameOrigin, requireAdmin, (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!id)
                return res.status(400).json({ error: 'Invalid id' });
            const existing = db.prepare('SELECT id FROM banners WHERE id = ?').get(id);
            if (!existing)
                return res.status(404).json({ error: 'Banner not found' });
            const text = typeof req.body?.text === 'string' ? req.body.text.trim() : undefined;
            const active = req.body?.active !== undefined ? (req.body.active === true || req.body.active === 1 ? 1 : 0) : undefined;
            if (text !== undefined)
                db.prepare('UPDATE banners SET text = ?, updated_at = ? WHERE id = ?').run(text, Date.now(), id);
            if (active !== undefined)
                db.prepare('UPDATE banners SET active = ?, updated_at = ? WHERE id = ?').run(active, Date.now(), id);
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin banners update failed', err);
            return res.status(500).json({ error: 'Unable to update banner' });
        }
    });
    router.delete('/:id', enforceSameOrigin, requireAdmin, (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!id)
                return res.status(400).json({ error: 'Invalid id' });
            db.prepare('DELETE FROM banners WHERE id = ?').run(id);
            return res.json({ ok: true });
        }
        catch (err) {
            console.error('admin banners delete failed', err);
            return res.status(500).json({ error: 'Unable to delete banner' });
        }
    });
    return router;
}
