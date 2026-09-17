import crypto from 'node:crypto'
import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireEnv } from '../../lib/config.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { normalizeEmail, nowMs, safeParseJson, safeJsonStringify, normalizeStatus } from './shared.js'

export function createAdminOrdersRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/orders' })
    .get('/', ({ query }) => {
      const limit = Math.max(1, Math.min(200, Number(query.limit || 100)))
      type AdminOrderRow = {
        id: string; user_id: number; user_email: string; status: string
        currency: string; items_total: number; shipping_provider: string
        pickup_point_json: string | null; customer_comment: string
        payment_provider: string | null; payment_id: string | null
        payment_status: string | null; payment_amount: number | null
        paid_at: number | null; shipping_eta: string | null
        tracking_number: string | null; tracking_status: string | null
        created_at: number; updated_at: number
      }
      const orders = db.prepare(`SELECT id,user_id,user_email,status,currency,items_total,shipping_provider,pickup_point_json,customer_comment,payment_provider,payment_id,payment_status,payment_amount,paid_at,shipping_eta,tracking_number,tracking_status,created_at,updated_at FROM orders ORDER BY created_at DESC LIMIT ?`).all(limit) as AdminOrderRow[]
      return { ok: true, orders: orders.map((row) => ({
        id: row.id, userId: row.user_id, email: row.user_email, status: row.status, itemsTotalMinor: row.items_total,
        shippingProvider: row.shipping_provider, pickupPoint: safeParseJson(row.pickup_point_json), comment: row.customer_comment,
        payment: { provider: row.payment_provider, id: row.payment_id, status: row.payment_status, amountMinor: row.payment_amount, paidAt: row.paid_at },
        shippingEta: row.shipping_eta, tracking: { number: row.tracking_number, status: row.tracking_status }, createdAt: row.created_at, updatedAt: row.updated_at
      })) }
    }, { beforeHandle: requireAdmin })
    .patch('/:orderId', ({ params, body, set }) => {
      const orderId = typeof params.orderId === 'string' ? params.orderId : ''
      if (!orderId) {
        set.status = 400
        return { error: 'Invalid order id' }
      }
      const existing = db.prepare('SELECT id FROM orders WHERE id = ? LIMIT 1').get(orderId)
      if (!existing) {
        set.status = 404
        return { error: 'Not found' }
      }

      const b = (body || {}) as Record<string, unknown>
      const nextStatus = normalizeStatus(b.status)
      const trackingNumber = typeof b.trackingNumber === 'string' ? b.trackingNumber.trim() : null
      const trackingStatus = typeof b.trackingStatus === 'string' ? b.trackingStatus.trim() : null
      const shippingEta = typeof b.shippingEta === 'string' ? b.shippingEta.trim().slice(0, 120) : null
      const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 600) : null
      const pickupPoint = b.pickupPoint && typeof b.pickupPoint === 'object' ? b.pickupPoint : null

      const updates: string[] = []
      const runParams: Array<string | number | null> = []
      if (nextStatus) { updates.push('status = ?'); runParams.push(nextStatus) }
      if (trackingNumber != null) { updates.push('tracking_number = ?'); runParams.push(trackingNumber || null) }
      if (trackingStatus != null) { updates.push('tracking_status = ?'); runParams.push(trackingStatus || null) }
      if (shippingEta != null) { updates.push('shipping_eta = ?'); runParams.push(shippingEta || null) }
      if (comment != null) { updates.push('customer_comment = ?'); runParams.push(comment) }
      if (pickupPoint != null) { updates.push('pickup_point_json = ?'); runParams.push(safeJsonStringify(pickupPoint)) }
      if (!updates.length) {
        set.status = 400
        return { error: 'No changes' }
      }
      updates.push('updated_at = ?'); runParams.push(nowMs()); runParams.push(orderId)

      db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...runParams)
      db.prepare('INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)').run(orderId, 'admin_update', 'Admin updated order', safeJsonStringify({ status: nextStatus, trackingNumber, trackingStatus, shippingEta }), nowMs())
      return { ok: true }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/mock', ({ set }) => {
      const now = nowMs()
      const adminEmail = normalizeEmail(requireEnv('ADMIN_EMAIL'))
      let user = db.prepare('SELECT id, email FROM users WHERE email = ? LIMIT 1').get(adminEmail) as { id: number; email: string } | undefined
      if (!user) {
        const inserted = db.prepare('INSERT INTO users (email, password_hash, email_verified, created_at, updated_at) VALUES (?, ?, 1, ?, ?)').run(adminEmail, '$2b$10$disabled.mock.user.cannot.login', now, now)
        user = { id: Number(inserted.lastInsertRowid), email: adminEmail }
      }

      const orderId = `ord_mock_${now}_${crypto.randomBytes(3).toString('hex')}`
      const itemSlug = 'mock-item'
      const itemTitle = 'Mock test product'
      const unitPrice = 130000
      const qty = 1
      const total = unitPrice * qty
      const pickupPoint = { provider: 'cdek', id: 'mock-cdek-1', name: 'CDEK mock PVZ', address: 'Nevsky Prospect, Saint Petersburg', lat: 59.9343, lon: 30.3351 }

      db.exec('BEGIN')
      try {
        db.prepare('INSERT INTO orders (id,user_id,user_email,status,currency,items_total,shipping_provider,pickup_point_json,customer_comment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(orderId, user.id, user.email, 'new', 'RUB', total, 'cdek', JSON.stringify(pickupPoint), 'Admin mock order', now, now)
        db.prepare('INSERT INTO order_items (order_id,product_slug,product_title,unit_price,quantity) VALUES (?,?,?,?,?)')
          .run(orderId, itemSlug, itemTitle, unitPrice, qty)
        db.prepare('INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(orderId, 'created', 'Mock order created by admin', safeJsonStringify({ status: 'new' }), now)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      set.status = 201
      return { ok: true, orderId }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
