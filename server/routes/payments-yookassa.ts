import crypto from 'node:crypto'
import ipRangeCheck from 'ip-range-check'
import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import type { OrderHub } from '../lib/order-hub.js'
import { enforceSameOrigin } from '../lib/request-origin.js'
import { createEmbeddedPayment, fetchPayment, minorToYooKassaValue } from '../lib/yookassa.js'
import { getOptionalEnv } from '../lib/config.js'
import { requireUser } from '../middleware/require-auth.js'
import { createSessionPlugin } from '../middleware/session.js'
import { getRequestIp } from '../http/util.js'

type OrderRow = {
  id: string; user_id: number; user_email: string; status: string
  currency: string; items_total: number; payment_id: string | null
  payment_provider: string | null; payment_status: string | null
}

function nowMs() { return Date.now() }
function safeJsonStringify(value: unknown) { return JSON.stringify(value ?? null) }
function toMinorUnits(amountValue: string) { const m = amountValue.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/); if (!m) return null; return Number(m[1]) * 100 + Number(String(m[2] || '0').padEnd(2, '0')) }

const YOOKASSA_IPS = new Set(
  (getOptionalEnv('YOOKASSA_IPS', '185.71.76.0/27,185.71.77.0/27,77.75.153.0/25,77.75.156.0/23,2a02:5180::/32,91.225.249.0/24,91.226.215.0/24')).split(',').map(s => s.trim())
)

function ipInCidr(ip: string, cidr: string): boolean {
  return ipRangeCheck(ip, cidr)
}

function verifyWebhookSignature(ctx: { request: Request; server?: { requestIP?: (req: Request) => { address?: string } | null } | null }): boolean {
  const secretKey = getOptionalEnv('YOOKASSA_SECRET_KEY', '')
  if (!secretKey) return false
  const localAddr = ctx.server?.requestIP ? (ctx.server.requestIP(ctx.request)?.address ?? '') : ''
  const ip = getRequestIp(ctx) || localAddr || ''
  if (!ip || ![...YOOKASSA_IPS].some((cidr) => ipInCidr(ip.includes(':') ? ip.split('%')[0] : ip, cidr))) {
    return false
  }
  const authHeader = ctx.request.headers.get('authorization') || ''
  const match = authHeader.match(/^Basic\s+(.+)$/i)
  if (!match) return false
  const expected = Buffer.from(`:${secretKey}`)
  const actual = Buffer.from(match[1], 'base64')
  if (actual.length !== expected.length || actual.length === 0) return false
  return crypto.timingSafeEqual(actual, expected)
}

export function createYooKassaRouter({ db, hub }: { db: DatabaseSync; hub: OrderHub }) {
  return new Elysia({ prefix: '/api/payments/yookassa' })
    .use(createSessionPlugin({ db }))

    .post('/create', async ({ body, set, user, isAdmin }) => {
      const shopId = getOptionalEnv('YOOKASSA_SHOP_ID', '')
      const secretKey = getOptionalEnv('YOOKASSA_SECRET_KEY', '')
      if (!shopId || !secretKey) {
        set.status = 501
        return { error: 'YooKassa is not configured' }
      }

      const b = (body || {}) as Record<string, unknown>
      const orderId = typeof b.orderId === 'string' ? b.orderId.trim() : ''
      if (!orderId) {
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

      const recalc = db.prepare('SELECT SUM(unit_price * quantity) as total FROM order_items WHERE order_id = ?').get(order.id) as { total: number | null } | undefined
      const expectedTotal = recalc?.total ?? order.items_total
      if (expectedTotal !== order.items_total) {
        set.status = 400
        return { error: 'Order total mismatch' }
      }

      const created = await createEmbeddedPayment({ amountMinor: order.items_total, currency: order.currency, description: `Order ${order.id} (${order.user_email})`, metadata: { orderId: order.id } })
      const updatedAt = nowMs()
      db.prepare('UPDATE orders SET status = ?, payment_provider = ?, payment_id = ?, payment_status = ?, updated_at = ? WHERE id = ?').run('pending_payment', 'yookassa', created.paymentId, created.status, updatedAt, order.id)
      db.prepare('INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)').run(order.id, 'payment_created', 'YooKassa payment created', safeJsonStringify({ paymentId: created.paymentId, status: created.status }), updatedAt)
      hub.publish({ orderId: order.id, payload: { type: 'payment.created', orderId: order.id, paymentId: created.paymentId } })
      set.status = 200
      return { ok: true, orderId: order.id, paymentId: created.paymentId, status: created.status, amount: { currency: order.currency, value: minorToYooKassaValue(order.items_total) }, confirmationToken: created.confirmationToken }
    }, { beforeHandle: [enforceSameOrigin, requireUser] })

    .post('/webhook', async ({ body, request, server, set }) => {
      const ctx = { request, server }
      if (!verifyWebhookSignature(ctx)) {
        set.status = 401
        return { error: 'Invalid signature' }
      }

      const b = (body || {}) as { orderId?: unknown; event?: unknown; object?: { id?: unknown } }
      const paymentId = typeof b.object?.id === 'string' ? b.object.id : ''
      if (paymentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
        set.status = 400
        return { error: 'Invalid payment ID' }
      }
      const eventType = typeof b.event === 'string' ? b.event : ''
      if (!paymentId || eventType !== 'payment.waiting_for_capture' && eventType !== 'payment.succeeded') {
        set.status = 200
        return { ok: true }
      }

      const order = db.prepare('SELECT * FROM orders WHERE payment_id = ? LIMIT 1').get(paymentId) as OrderRow | undefined
      if (!order) {
        set.status = 200
        return { ok: true }
      }
      const payment = await fetchPayment(paymentId).catch(() => null)
      if (!payment) {
        set.status = 200
        return { ok: true }
      }

      const minor = typeof payment?.amount?.value === 'string' ? toMinorUnits(payment.amount.value) : null
      const status = String(payment?.status || '')
      const paid = Boolean(payment?.paid)
      const updatedAt = nowMs()

      const recalc = db.prepare('SELECT SUM(unit_price * quantity) as total FROM order_items WHERE order_id = ?').get(order.id) as { total: number | null } | undefined
      const expectedAmount = recalc?.total ?? order.items_total
      if (minor !== null && minor !== expectedAmount) {
        set.status = 200
        return { ok: true }
      }

      db.prepare('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, order.id)
      if (paid && status === 'succeeded' && order.status !== 'paid') {
        db.prepare('UPDATE orders SET status = ?, payment_amount = ?, paid_at = ?, updated_at = ? WHERE id = ?').run('paid', minor ?? order.items_total, updatedAt, updatedAt, order.id)
      }
      hub.publish({ orderId: order.id, payload: { type: 'payment.updated', orderId: order.id, paymentId, status, paid } })
      set.status = 200
      return { ok: true }
    })
}
