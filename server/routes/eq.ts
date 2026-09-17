import { Elysia } from 'elysia'
import { AutoEqService } from '../lib/autoeq-service.js'

export function createEqRouter(cacheDir: string) {
  const service = new AutoEqService(cacheDir)

  return new Elysia({ prefix: '/api' })
    .get('/eq/search', async ({ query, set }) => {
      try {
        const q = typeof query.q === 'string' ? query.q : ''
        const results = await service.search(q)
        return { results }
      } catch (err) {
        set.status = 500
        return { error: 'Search failed', detail: err instanceof Error ? err.message : 'Unknown' }
      }
    })
    .get('/eq/profile', async ({ query, set }) => {
      try {
        const id = query.id
        if (typeof id !== 'string' || !id) {
          set.status = 400
          return { error: 'Missing id parameter' }
        }

        const profile = await service.getProfile(id)
        return profile
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown'
        if (msg.startsWith('Profile not found')) {
          set.status = 404
          return { error: msg }
        }
        if (msg.startsWith('Invalid profile')) {
          set.status = 400
          return { error: msg }
        }
        set.status = 500
        return { error: 'Profile fetch failed', detail: msg }
      }
    })
}
