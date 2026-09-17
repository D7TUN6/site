import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'

export function listActiveBanners(db: DatabaseSync, page: string): Array<{ id: number; text: string; page: string }> {
  const rows = db.prepare('SELECT id, text, page FROM banners WHERE page = ? AND active = 1 ORDER BY id DESC LIMIT 1').all(page) as Array<{ id: number; text: string; page: string }>
  return rows
}

export function createAdminBannersRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/banners' })
    .get('/', ({ set }) => {
      try {
        const rows = db.prepare('SELECT id, page, text, active, created_at, updated_at FROM banners ORDER BY page, id DESC').all() as Array<{ id: number; page: string; text: string; active: number; created_at: number; updated_at: number }>
        return { ok: true, banners: rows }
      } catch (err) {
        console.error('admin banners list failed', err)
        set.status = 500
        return { error: 'Unable to list banners' }
      }
    }, { beforeHandle: requireAdmin })
    .post('/', ({ body, set }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const page = typeof b.page === 'string' ? b.page.trim() : ''
        const text = typeof b.text === 'string' ? b.text.trim() : ''
        const active = b.active === true || b.active === 1 ? 1 : 0
        if (!page || !text) {
          set.status = 400
          return { error: 'page and text are required' }
        }
        const now = Date.now()
        const result = db.prepare('INSERT INTO banners (page, text, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(page, text, active, now, now)
        return { ok: true, id: Number(result.lastInsertRowid) }
      } catch (err) {
        console.error('admin banners create failed', err)
        set.status = 500
        return { error: 'Unable to create banner' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .patch('/:id', ({ params, body, set }) => {
      try {
        const id = Number(params.id)
        if (!id) {
          set.status = 400
          return { error: 'Invalid id' }
        }
        const existing = db.prepare('SELECT id FROM banners WHERE id = ?').get(id) as { id: number } | undefined
        if (!existing) {
          set.status = 404
          return { error: 'Banner not found' }
        }
        const b = (body || {}) as Record<string, unknown>
        const text = typeof b.text === 'string' ? b.text.trim() : undefined
        const page = typeof b.page === 'string' ? b.page.trim() : undefined
        const active = b.active !== undefined ? (b.active === true || b.active === 1 ? 1 : 0) : undefined
        if (text !== undefined) db.prepare('UPDATE banners SET text = ?, updated_at = ? WHERE id = ?').run(text, Date.now(), id)
        if (page !== undefined) db.prepare('UPDATE banners SET page = ?, updated_at = ? WHERE id = ?').run(page, Date.now(), id)
        if (active !== undefined) db.prepare('UPDATE banners SET active = ?, updated_at = ? WHERE id = ?').run(active, Date.now(), id)
        return { ok: true }
      } catch (err) {
        console.error('admin banners update failed', err)
        set.status = 500
        return { error: 'Unable to update banner' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:id', ({ params, set }) => {
      try {
        const id = Number(params.id)
        if (!id) {
          set.status = 400
          return { error: 'Invalid id' }
        }
        db.prepare('DELETE FROM banners WHERE id = ?').run(id)
        return { ok: true }
      } catch (err) {
        console.error('admin banners delete failed', err)
        set.status = 500
        return { error: 'Unable to delete banner' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
