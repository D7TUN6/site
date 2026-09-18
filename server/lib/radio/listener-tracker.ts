import { getRequestIp } from '../../http/util.js'

export const activeListeners = new Map<string, number>()
const LISTENER_TTL = 120_000

setInterval(() => {
  const now = Date.now()
  for (const [ip, ts] of activeListeners) {
    if (now - ts > LISTENER_TTL) activeListeners.delete(ip)
  }
}, 30_000).unref()

type MinimalCtx = Parameters<typeof getRequestIp>[0]

export function getClientIp(ctx: MinimalCtx): string {
  return getRequestIp(ctx)
}

// A single listener can show up under several addresses (IPv4/IPv6, changing
// Cloudflare edges), so prefer the client's stable per-tab id when it is a
// sane string and only fall back to the address otherwise.
export function listenerKey(rawId: unknown, ip: string): string {
  const id = typeof rawId === 'string' ? rawId.trim() : ''
  return id.length > 0 && id.length <= 128 ? `id:${id}` : `ip:${ip}`
}
