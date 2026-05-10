import crypto from 'node:crypto'
import express from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { enforceSameOrigin } from '../lib/request-origin.js'
import { requireUser } from '../middleware/require-auth.js'
import type { OrderHub } from '../lib/order-hub.js'

function nowMs() { return Date.now() }
function safeParseJson(raw: unknown) { try { return typeof raw === 'string' ? JSON.parse(raw) : null } catch { return null } }
function moneyFromMinor(minor: unknown) {
  const safe = Number.isFinite(minor) ? Math.floor(Number(minor)) : 0
  const rub = Math.floor(safe / 100)
  const kop = Math.abs(safe % 100)
  return { currency: 'RUB', value: `${rub}.${String(kop).padStart(2, '0')}` }
}

export function createOrdersRouter({ db, hub }: { db: DatabaseSync; hub: OrderHub }) {
  const router = express.Router()

  router.get('/mine', requireUser, (req, res) => {
    const rows = db.prepare(`SELECT id,status,items_total,shipping_provider,pickup_point_json,payment_provider,payment_status,payment_amount,paid_at,shipping_eta,tracking_number,tracking_status,created_at,updated_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`).all(req.user!.id)
    return res.json({ ok: true, orders: rows.map((row: any) => ({
      id: row.id,
      status: row.status,
      total: moneyFromMinor(row.items_total),
      shippingProvider: row.shipping_provider,
      pickupPoint: safeParseJson(row.pickup_point_json),
      payment: { provider: row.payment_provider, status: row.payment_status, amount: row.payment_amount != null ? moneyFromMinor(row.payment_amount) : null, paidAt: row.paid_at },
      shippingEta: row.shipping_eta,
      tracking: { number: row.tracking_number, status: row.tracking_status },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })) })
  })

  router.get('/:orderId', requireUser, (req, res) => {
    const orderId = String(req.params.orderId || '')
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' })
    const order = db.prepare('SELECT * FROM orders WHERE id = ? LIMIT 1').get(orderId) as any
    if (!order) return res.status(404).json({ error: 'Not found' })
    if (order.user_id !== req.user!.id && !req.isAdmin) return res.status(403).json({ error: 'Forbidden' })

    const items = db.prepare('SELECT product_slug,product_title,unit_price,quantity FROM order_items WHERE order_id = ? ORDER BY id ASC').all(orderId) as any[]
    const events = db.prepare('SELECT id,kind,message,data_json,created_at FROM order_events WHERE order_id = ? ORDER BY id ASC').all(orderId) as any[]

    return res.json({ ok: true, order: {
      id: order.id, status: order.status, email: order.user_email, total: moneyFromMinor(order.items_total),
      shippingProvider: order.shipping_provider, pickupPoint: safeParseJson(order.pickup_point_json), comment: order.customer_comment,
      payment: { provider: order.payment_provider, id: order.payment_id, status: order.payment_status, amount: order.payment_amount != null ? moneyFromMinor(order.payment_amount) : null, paidAt: order.paid_at },
      shippingEta: order.shipping_eta, tracking: { number: order.tracking_number, status: order.tracking_status }, createdAt: order.created_at, updatedAt: order.updated_at
    }, items: items.map((it) => ({ slug: it.product_slug, title: it.product_title, unitPrice: moneyFromMinor(it.unit_price), quantity: it.quantity })), events: events.map((e) => ({ id: e.id, kind: e.kind, message: e.message, data: safeParseJson(e.data_json), createdAt: e.created_at })) })
  })

  router.get('/stream/all', requireUser, (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Connection', 'keep-alive')
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`)
    const unsub = hub.subscribe(({ orderId, payload }) => {
      const row = db.prepare('SELECT user_id FROM orders WHERE id = ? LIMIT 1').get(orderId) as any
      if (!row || row.user_id !== req.user!.id) return
      res.write(`event: order\ndata: ${JSON.stringify({ orderId, payload })}\n\n`)
    })
    const iv = setInterval(() => res.write(': ping\n\n'), 15000)
    req.on('close', () => { clearInterval(iv); unsub() })
  })

  router.post('/', enforceSameOrigin, requireUser, (req, res) => {
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : []
    if (!itemsRaw.length) return res.status(400).json({ error: 'Cart is empty' })

    let total = 0
    const norm: Array<{ slug: string; title: string; unitPrice: number; quantity: number }> = []
    for (const it of itemsRaw) {
      const slug = typeof it?.slug === 'string' ? it.slug.trim() : ''
      const title = typeof it?.title === 'string' ? it.title.trim() : slug
      const unitPrice = Math.max(0, Math.floor(Number(it?.unitAmount ?? 0)))
      const quantity = Math.max(0, Math.floor(Number(it?.quantity ?? 0)))
      if (!slug || !quantity) continue
      total += unitPrice * quantity
      norm.push({ slug, title, unitPrice, quantity })
    }
    if (!norm.length) return res.status(400).json({ error: 'Cart is empty' })

    const ts = nowMs()
    const orderId = `ord_${ts}_${crypto.randomBytes(4).toString('hex')}`
    const pickupPointJson = JSON.stringify(req.body?.pickupPoint ?? {})
    const shippingProvider = typeof req.body?.shippingProvider === 'string' ? req.body.shippingProvider : 'custom'
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.slice(0, 600) : ''

    const insertOrder = db.prepare(`INSERT INTO orders (id,user_id,user_email,status,currency,items_total,shipping_provider,pickup_point_json,customer_comment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    const insertItem = db.prepare(`INSERT INTO order_items (order_id,product_slug,product_title,unit_price,quantity) VALUES (?,?,?,?,?)`)
    const insertEvent = db.prepare(`INSERT INTO order_events (order_id,kind,message,data_json,created_at) VALUES (?,?,?,?,?)`)

    db.exec('BEGIN')
    try {
      insertOrder.run(orderId, req.user!.id, req.user!.email, 'new', 'RUB', total, shippingProvider, pickupPointJson, comment, ts, ts)
      for (const item of norm) insertItem.run(orderId, item.slug, item.title, item.unitPrice, item.quantity)
      insertEvent.run(orderId, 'created', 'Order created', JSON.stringify({ status: 'new' }), ts)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    hub.publish({ orderId, payload: { type: 'created', orderId, ts } })
    return res.status(201).json({ ok: true, orderId })
  })

  return router
}
