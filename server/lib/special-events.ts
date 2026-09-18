import type { SpecialData } from './special-content.js'

type Listener = (data: SpecialData) => void

const listeners = new Set<Listener>()

export function subscribeSpecialEvents(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function broadcastSpecial(data: SpecialData): void {
  for (const listener of [...listeners]) {
    try {
      listener(data)
    } catch {
      // A broken subscriber must never break the save request.
    }
  }
}
