import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { getSpecialData, localizeSpecial, type Lang, type SpecialData } from '../lib/special-content.js'
import { subscribeSpecialEvents } from '../lib/special-events.js'

function resolveLang(value: unknown): Lang {
  return value === 'ru' ? 'ru' : 'en'
}

export function createSpecialRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/special' })
    .get('/', ({ query, set }) => {
      const lang = resolveLang(query['lang'])
      set.headers['cache-control'] = 'no-cache'
      return { ok: true, lang, special: localizeSpecial(getSpecialData(db), lang) }
    })
    .get('/events', ({ query, request, set }) => {
      const lang = resolveLang(query['lang'])
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false
          const push = (chunk: string) => {
            if (closed) return
            try {
              controller.enqueue(encoder.encode(chunk))
            } catch {
              closed = true
            }
          }
          const send = (data: SpecialData) => {
            push(`data: ${JSON.stringify({ ok: true, lang, special: localizeSpecial(data, lang) })}\n\n`)
          }

          push(':connected\n\n')
          const unsubscribe = subscribeSpecialEvents(send)
          const heartbeat = setInterval(() => push(':heartbeat\n\n'), 30_000)

          const cleanup = () => {
            if (closed) return
            closed = true
            clearInterval(heartbeat)
            unsubscribe()
            try { controller.close() } catch { /* already closed */ }
          }

          request.signal.addEventListener('abort', cleanup)
        },
      })

      set.headers['content-type'] = 'text/event-stream'
      set.headers['cache-control'] = 'no-cache'
      set.headers['connection'] = 'keep-alive'
      return new Response(stream)
    })
}
