export type OrderHubPayload = { orderId: string; payload: unknown }

export type OrderHub = {
  publish: (event: OrderHubPayload) => void
  subscribe: (cb: (event: OrderHubPayload) => void) => () => void
}

export function createOrderHub(): OrderHub {
  const listeners = new Set<(event: OrderHubPayload) => void>()
  return {
    publish(event) {
      for (const listener of listeners) {
        try { listener(event) } catch (err) { console.error('OrderHub subscriber error:', err) }
      }
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  }
}
