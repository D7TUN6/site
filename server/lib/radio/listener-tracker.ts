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
