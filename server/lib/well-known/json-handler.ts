import type { Elysia } from 'elysia'

export function jsonHandler(data: object, maxAge = 3600) {
  return ({ set }: { set: { headers: Record<string, unknown> } }) => {
    set.headers['content-type'] = 'application/json'
    set.headers['cache-control'] = `public, max-age=${maxAge}`
    set.headers['access-control-allow-origin'] = '*'
    return data
  }
}

export function originBase(): string {
  const u = process.env.APP_ORIGIN || 'http://localhost:3001'
  return u.replace(/\/+$/, '')
}

export type WellKnownPlugin = (app: Elysia) => Elysia
