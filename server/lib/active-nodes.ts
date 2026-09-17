// Sliding-window count of active visitor nodes. Every request touches the
// tracking identity (e.g. "<ip>::<user-agent>") with the current timestamp;
// entries older than the window are pruned. Unlike the old SSE-only counter
// this counts ordinary page viewers, so `GET /api/home/system`'s
// `active_nodes` is no longer stuck at 0 while clients are just browsing.
//
// `trackActiveNode(ident?)` also returns a release fn for backwards
// compatibility with the `createReleaseRouter` / `createOrdersRouter` SSE
// callers, which used to add/remove on connect/disconnect — with the window
// that release deletes the entry immediately (same observable result within a
// single request lifecycle).

const ACTIVE_WINDOW_MS = 60_000
const seen = new Map<string, number>()
let seq = 0

function nowMs(): number {
  return Date.now()
}

function prune(): void {
  const cutoff = nowMs() - ACTIVE_WINDOW_MS
  for (const [key, t] of seen) {
    if (t < cutoff) seen.delete(key)
  }
}

export function trackActiveNode(ident?: string): () => void {
  const key = ident ?? `anon:${nowMs()}:${++seq}`
  seen.set(key, nowMs())
  prune()
  let released = false
  return () => {
    if (released) return
    released = true
    seen.delete(key)
  }
}

export function getActiveNodes(): number {
  prune()
  return seen.size
}

export function resetActiveNodesForTests(): void {
  seen.clear()
}

export const activeNodesWindowMs = ACTIVE_WINDOW_MS