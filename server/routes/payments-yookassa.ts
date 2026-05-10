import express from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { OrderHub } from '../lib/order-hub.js'
import { enforceSameOrigin } from '../lib/request-origin.js'
import { createEmbeddedPayment, fetchPayment, minorToYooKassaValue } from '../lib/yookassa.js'
import { getOptionalEnv } from '../lib/config.js'
import { requireUser } from '../middleware/require-auth.js'

function nowMs() { return Date.now() }
function safeJsonStringify(value: unknown) { return JSON.stringify(value ?? null) }
function toMinorUnits(amountValue: string) { const m = amountValue.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/); if (!m) return null; return Number(m[1]) * 100 + Number(String(m[2] || '0').padEnd(2, '0')) }

export function createYooKassaRouter({ db, hub }: { db: DatabaseSync; hub: OrderHub }) {
  const router = express.Router()

  router.post('/create', enforceSameOrigin, requireUser, async (req, res) => {
    const shopId = getOptionalEnv('YOOKASSA_SHOP_ID', '')
    const secretKey = getOptionalEnv('YOOKASSA_SECRET_KEY', '')
    if (!shopId || !secretKey) return res.status(501).json({ error: 'YooKassa is not configured' })

    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : ''
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' })
    const order = db.prepare('SELECT * FROM orders WHERE id = ? LIMIT 1').get(orderId) as any
    if (!order) return res.status(404).json({ error: 'Not found' })
    if (order.user_id !== req.user!.id && !req.isAdmin) return res.status(403).json({ error: 'Forbidden' })

    const created = await createEmbeddedPayment({ amountMinor: order.items_total, currency: order.currency, description: `Order ${order.id} (${order.user_email})`, metadata: { orderId: order.id } })
    const updatedAt = nowMs()
    db.prepare('UPDATE orders SET status = ?, payment_provider = ?, payment_id = ?, payment_status = ?, updated_at = ? WHERE id = ?').run('pending_payment', 'yookassa', created.paymentId, created.status, updatedAt, order.id)
    db.prepare('INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)').run(order.id, 'payment_created', 'YooKassa payment created', safeJsonStringify({ paymentId: created.paymentId, status: created.status }), updatedAt)
    hub.publish({ orderId: order.id, payload: { type: 'payment.created', orderId: order.id, paymentId: created.paymentId } })
    return res.status(200).json({ ok: true, orderId: order.id, paymentId: created.paymentId, status: created.status, amount: { currency: order.currency, value: minorToYooKassaValue(order.items_total) }, confirmationToken: created.confirmationToken })
  })

  router.post('/webhook', async (req, res) => {
    const paymentId = typeof req.body?.object?.id === 'string' ? req.body.object.id : ''
    if (!paymentId) return res.status(400).json({ error: 'Missing payment id' })
    const order = db.prepare('SELECT * FROM orders WHERE payment_id = ? LIMIT 1').get(paymentId) as any
    if (!order) return res.status(200).json({ ok: true })
    const payment = await fetchPayment(paymentId).catch(() => null as any)
    if (!payment) return res.status(200).json({ ok: true })

    const minor = typeof payment?.amount?.value === 'string' ? toMinorUnits(payment.amount.value) : null
    const status = String(payment?.status || '')
    const paid = Boolean(payment?.paid)
    const updatedAt = nowMs()
    db.prepare('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, order.id)
    if (paid && status === 'succeeded' && order.status !== 'paid') {
      db.prepare('UPDATE orders SET status = ?, payment_amount = ?, paid_at = ?, updated_at = ? WHERE id = ?').run('paid', minor ?? order.items_total, updatedAt, updatedAt, order.id)
    }
    hub.publish({ orderId: order.id, payload: { type: 'payment.updated', orderId: order.id, paymentId, status, paid } })
    return res.status(200).json({ ok: true })
  })

  return router
}
