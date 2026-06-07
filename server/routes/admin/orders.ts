import crypto from 'node:crypto'
import express from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireEnv } from '../../lib/config.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { slugify, normalizeEmail, nowMs, safeParseJson, safeJsonStringify, normalizeStatus } from './shared.js'

export function createAdminOrdersRouter({ db }: { db: DatabaseSync }) {
  const router = express.Router()

  router.get('/', requireAdmin, (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)))
    const orders = db.prepare(`SELECT id,user_id,user_email,status,currency,items_total,shipping_provider,pickup_point_json,customer_comment,payment_provider,payment_id,payment_status,payment_amount,paid_at,shipping_eta,tracking_number,tracking_status,created_at,updated_at FROM orders ORDER BY created_at DESC LIMIT ?`).all(limit) as any[]
    return res.status(200).json({ ok: true, orders: orders.map((row) => ({
      id: row.id, userId: row.user_id, email: row.user_email, status: row.status, itemsTotalMinor: row.items_total,
      shippingProvider: row.shipping_provider, pickupPoint: safeParseJson(row.pickup_point_json), comment: row.customer_comment,
      payment: { provider: row.payment_provider, id: row.payment_id, status: row.payment_status, amountMinor: row.payment_amount, paidAt: row.paid_at },
      shippingEta: row.shipping_eta, tracking: { number: row.tracking_number, status: row.tracking_status }, createdAt: row.created_at, updatedAt: row.updated_at
    })) })
  })

  router.patch('/:orderId', enforceSameOrigin, requireAdmin, (req, res) => {
    const orderId = typeof req.params.orderId === 'string' ? req.params.orderId : ''
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' })
    const existing = db.prepare('SELECT id FROM orders WHERE id = ? LIMIT 1').get(orderId)
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const nextStatus = normalizeStatus(req.body?.status)
    const trackingNumber = typeof req.body?.trackingNumber === 'string' ? req.body.trackingNumber.trim() : null
    const trackingStatus = typeof req.body?.trackingStatus === 'string' ? req.body.trackingStatus.trim() : null
    const shippingEta = typeof req.body?.shippingEta === 'string' ? req.body.shippingEta.trim().slice(0, 120) : null
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 600) : null
    const pickupPoint = req.body?.pickupPoint && typeof req.body.pickupPoint === 'object' ? req.body.pickupPoint : null

    const updates: string[] = []
    const params: Array<string | number | null> = []
    if (nextStatus) { updates.push('status = ?'); params.push(nextStatus) }
    if (trackingNumber != null) { updates.push('tracking_number = ?'); params.push(trackingNumber || null) }
    if (trackingStatus != null) { updates.push('tracking_status = ?'); params.push(trackingStatus || null) }
    if (shippingEta != null) { updates.push('shipping_eta = ?'); params.push(shippingEta || null) }
    if (comment != null) { updates.push('customer_comment = ?'); params.push(comment) }
    if (pickupPoint != null) { updates.push('pickup_point_json = ?'); params.push(safeJsonStringify(pickupPoint)) }
    if (!updates.length) return res.status(400).json({ error: 'No changes' })
    updates.push('updated_at = ?'); params.push(nowMs()); params.push(orderId)

    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    db.prepare('INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)').run(orderId, 'admin_update', 'Admin updated order', safeJsonStringify({ status: nextStatus, trackingNumber, trackingStatus, shippingEta }), nowMs())
    return res.status(200).json({ ok: true })
  })

  router.post('/mock', enforceSameOrigin, requireAdmin, (req, res) => {
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

    return res.status(201).json({ ok: true, orderId })
  })

  return router
}
