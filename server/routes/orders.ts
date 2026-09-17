import crypto from 'node:crypto'
import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { enforceSameOrigin } from '../lib/request-origin.js'
import { requireUser } from '../middleware/require-auth.js'
import { createSessionPlugin } from '../middleware/session.js'
import type { OrderHub } from '../lib/order-hub.js'
import { trackActiveNode } from '../lib/active-nodes.js'

type OrderRow = {
  id: string; user_id: number; user_email: string; status: string
  currency: string; items_total: number; shipping_provider: string
  pickup_point_json: string | null; payment_provider: string | null
  payment_id: string | null; payment_status: string | null
  payment_amount: number | null; paid_at: number | null
  shipping_eta: string | null; tracking_number: string | null
  tracking_status: string | null; customer_comment: string
  created_at: number; updated_at: number
}

function nowMs() { return Date.now() }
function safeParseJson(raw: unknown) { try { return typeof raw === 'string' ? JSON.parse(raw) : null } catch (err) { console.error('safeParseJson failed', err); return null } }
function moneyFromMinor(minor: unknown) {
  const safe = Number.isFinite(minor) ? Math.floor(Number(minor)) : 0
  const rub = Math.floor(safe / 100)
  const kop = Math.abs(safe % 100)
  return { currency: 'RUB', value: `${rub}.${String(kop).padStart(2, '0')}` }
}

export function createOrdersRouter({ db, hub }: { db: DatabaseSync; hub: OrderHub }) {
  return new Elysia({ prefix: '/api/orders' })
    .use(createSessionPlugin({ db }))

    .get('/mine', ({ user }) => {
      const rows = db.prepare(`SELECT id,status,items_total,shipping_provider,pickup_point_json,payment_provider,payment_status,payment_amount,paid_at,shipping_eta,tracking_number,tracking_status,created_at,updated_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`).all(user!.id) as Array<Pick<OrderRow, 'id' | 'status' | 'items_total' | 'shipping_provider' | 'pickup_point_json' | 'payment_provider' | 'payment_status' | 'payment_amount' | 'paid_at' | 'shipping_eta' | 'tracking_number' | 'tracking_status' | 'created_at' | 'updated_at'>>
      return { ok: true, orders: rows.map((row) => ({
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
      })) }
    }, { beforeHandle: requireUser })

    .get('/stream/all', ({ request, set, user }) => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false
          let releaseNode: (() => void) | null = trackActiveNode()
          const push = (chunk: string) => {
            if (!closed) {
              try { controller.enqueue(encoder.encode(chunk)) } catch { closed = true }
            }
          }

          push(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`)
          const unsub = hub.subscribe(({ orderId, payload }) => {
            const row = db.prepare('SELECT user_id FROM orders WHERE id = ? LIMIT 1').get(orderId) as { user_id: number } | undefined
            if (!row || !user || row.user_id !== user.id) return
            push(`event: order\ndata: ${JSON.stringify({ orderId, payload })}\n\n`)
          })
          const iv = setInterval(() => push(': ping\n\n'), 15000)

          const done = () => {
            if (closed) return
            closed = true
            releaseNode?.()
            releaseNode = null
            clearInterval(iv)
            unsub()
            try { controller.close() } catch { /* ignore */ }
          }

          request.signal.addEventListener('abort', done)
        },
      })

      set.headers['cache-control'] = 'no-store'
      set.headers['content-type'] = 'text/event-stream; charset=utf-8'
      set.headers['connection'] = 'keep-alive'
      return new Response(stream)
    }, { beforeHandle: requireUser })

    .get('/:orderId', ({ params, set, user, isAdmin }) => {
      const orderId = String(params.orderId || '')
      if (!orderId || !/^ord_\d+_[0-9a-f]{8}$/.test(orderId)) {
        set.status = 400
        return { error: 'Invalid order id' }
      }
      const order = db.prepare('SELECT * FROM orders WHERE id = ? LIMIT 1').get(orderId) as OrderRow | undefined
      if (!order) {
        set.status = 404
        return { error: 'Not found' }
      }
      if (order.user_id !== user!.id && !isAdmin) {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const items = db.prepare('SELECT product_slug,product_title,unit_price,quantity FROM order_items WHERE order_id = ? ORDER BY id ASC').all(orderId) as Array<{ product_slug: string; product_title: string; unit_price: number; quantity: number }>
      const events = db.prepare('SELECT id,kind,message,data_json,created_at FROM order_events WHERE order_id = ? ORDER BY id ASC').all(orderId) as Array<{ id: number; kind: string; message: string; data_json: string; created_at: number }>

      return { ok: true, order: {
        id: order.id, status: order.status, email: order.user_email, total: moneyFromMinor(order.items_total),
        shippingProvider: order.shipping_provider, pickupPoint: safeParseJson(order.pickup_point_json), comment: order.customer_comment,
        payment: { provider: order.payment_provider, id: order.payment_id, status: order.payment_status, amount: order.payment_amount != null ? moneyFromMinor(order.payment_amount) : null, paidAt: order.paid_at },
        shippingEta: order.shipping_eta, tracking: { number: order.tracking_number, status: order.tracking_status }, createdAt: order.created_at, updatedAt: order.updated_at
      }, items: items.map((it) => ({ slug: it.product_slug, title: it.product_title, unitPrice: moneyFromMinor(it.unit_price), quantity: it.quantity })), events: events.map((e) => ({ id: e.id, kind: e.kind, message: e.message, data: safeParseJson(e.data_json), createdAt: e.created_at })) }
    }, { beforeHandle: requireUser })

    .post('/', ({ body, set, user }) => {
      const b = (body || {}) as Record<string, unknown>
      const itemsRaw = Array.isArray(b.items) ? b.items : []
      if (!itemsRaw.length) {
        set.status = 400
        return { error: 'Cart is empty' }
      }

      let total = 0
      const norm: Array<{ slug: string; title: string; unitPrice: number; quantity: number }> = []
      for (const it of itemsRaw) {
        const item = it as Record<string, unknown> | null
        const slug = typeof item?.slug === 'string' ? item.slug.trim() : ''
        const title = typeof item?.title === 'string' ? item.title.trim() : slug
        const unitPrice = Math.max(0, Math.min(1_000_000, Math.floor(Number(item?.unitAmount ?? 0))))
        const quantity = Math.max(1, Math.min(1000, Math.floor(Number(item?.quantity ?? 0))))
        if (!slug || !quantity) continue
        total += unitPrice * quantity
        norm.push({ slug, title, unitPrice, quantity })
      }
      if (!norm.length) {
        set.status = 400
        return { error: 'Cart is empty' }
      }

      const ts = nowMs()
      const orderId = `ord_${ts}_${crypto.randomBytes(4).toString('hex')}`
      const pickupPointJson = JSON.stringify(b.pickupPoint ?? {})
      const shippingProvider = typeof b.shippingProvider === 'string' ? b.shippingProvider : 'custom'
      const comment = typeof b.comment === 'string' ? b.comment.slice(0, 600) : ''

      const insertOrder = db.prepare(`INSERT INTO orders (id,user_id,user_email,status,currency,items_total,shipping_provider,pickup_point_json,customer_comment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      const insertItem = db.prepare(`INSERT INTO order_items (order_id,product_slug,product_title,unit_price,quantity) VALUES (?,?,?,?,?)`)
      const insertEvent = db.prepare(`INSERT INTO order_events (order_id,kind,message,data_json,created_at) VALUES (?,?,?,?,?)`)

      let committed = false
      db.exec('BEGIN')
      try {
        insertOrder.run(orderId, user!.id, user!.email, 'new', 'RUB', total, shippingProvider, pickupPointJson, comment, ts, ts)
        for (const item of norm) insertItem.run(orderId, item.slug, item.title, item.unitPrice, item.quantity)
        insertEvent.run(orderId, 'created', 'Order created', JSON.stringify({ status: 'new' }), ts)
        db.exec('COMMIT')
        committed = true
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      } finally {
        if (!committed) db.exec('ROLLBACK')
      }
      hub.publish({ orderId, payload: { type: 'created', orderId, ts } })
      set.status = 201
      return { ok: true, orderId }
    }, { beforeHandle: [enforceSameOrigin, requireUser] })
}
