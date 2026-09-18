import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { getSpecialData, saveSpecialData, sanitizeSpecial } from '../../lib/special-content.js'
import { broadcastSpecial } from '../../lib/special-events.js'

export function createAdminSpecialRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/special' })
    .get('/', ({ set }) => {
      try {
        set.headers['cache-control'] = 'no-cache'
        return { ok: true, special: getSpecialData(db) }
      } catch (err) {
        console.error('admin special get failed', err)
        set.status = 500
        return { ok: false, error: 'Unable to load special content' }
      }
    }, { beforeHandle: requireAdmin })
    .put('/', ({ body, set }) => {
      try {
        const incoming = (body as { special?: unknown } | undefined)?.special
        if (!incoming || typeof incoming !== 'object') {
          set.status = 400
          return { ok: false, error: 'Missing special payload' }
        }
        const saved = saveSpecialData(db, sanitizeSpecial(incoming))
        broadcastSpecial(saved)
        return { ok: true, special: saved }
      } catch (err) {
        console.error('admin special save failed', err)
        set.status = 500
        return { ok: false, error: 'Unable to save special content' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
