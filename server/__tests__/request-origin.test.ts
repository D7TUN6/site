import { describe, it, expect } from 'bun:test'
import { enforceSameOrigin } from '../lib/request-origin.js'

const BASE_HEADERS = {
  'x-forwarded-proto': 'https',
  'host': 'example.com',
  'origin': 'https://example.com',
  'referer': '',
  'x-requested-with': '',
}

function makeCtx(headerOverrides: Record<string, string> = {}, url = 'https://example.com/api/test') {
  const request = new Request(url, { headers: { ...BASE_HEADERS, ...headerOverrides } })
  const set: { status?: number | string } = {}
  return { request, set }
}

describe('enforceSameOrigin', () => {
  it('allows same-origin requests', () => {
    const ctx = makeCtx()
    expect(enforceSameOrigin(ctx)).toBeUndefined()
    expect(ctx.set.status).toBeUndefined()
  })

  it('blocks cross-site requests via sec-fetch-site when origin mismatches', () => {
    const ctx = makeCtx({ 'sec-fetch-site': 'cross-site', 'origin': 'https://attacker.org' })
    const result = enforceSameOrigin(ctx)
    expect(ctx.set.status).toBe(403)
    expect(result).toEqual({ error: 'Cross-site requests are not allowed' })
  })

  it('allows "none" sec-fetch-site (direct navigation)', () => {
    const ctx = makeCtx({ 'sec-fetch-site': 'none' })
    expect(enforceSameOrigin(ctx)).toBeUndefined()
    expect(ctx.set.status).toBeUndefined()
  })

  it('allows request with X-Requested-With: fetch when no origin header', () => {
    const ctx = makeCtx({ 'origin': '', 'x-requested-with': 'fetch' })
    expect(enforceSameOrigin(ctx)).toBeUndefined()
    expect(ctx.set.status).toBeUndefined()
  })

  it('blocks cross-origin requests from different hosts', () => {
    const ctx = makeCtx({ 'origin': 'https://evil.com' })
    enforceSameOrigin(ctx)
    expect(ctx.set.status).toBe(403)
  })

  it('blocks when source origin differs from expected', () => {
    const ctx = makeCtx({ 'host': 'example.com', 'origin': 'https://attacker.org' })
    enforceSameOrigin(ctx)
    expect(ctx.set.status).toBe(403)
  })

  it('allows loopback origins in development', async () => {
    process.env.NODE_ENV = 'test'
    const { isProduction } = await import('../lib/config.js')
    // sanity: guard relies on non-production mode for loopback allowance
    expect(typeof isProduction).toBe('function')
    const ctx = makeCtx({ host: 'localhost:5173', origin: 'http://localhost:3001' }, 'http://localhost:5173/api/test')
    if (!process.env.PROD) {
      expect(enforceSameOrigin(ctx)).toBeUndefined()
    }
  })
})
