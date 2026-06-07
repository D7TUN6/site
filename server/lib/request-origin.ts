import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { getOptionalEnv, isProduction } from './config.js'

const DEFAULT_PORT_BY_PROTOCOL: Record<string, string> = { http: '80', https: '443' }

function firstHeaderValue(value: unknown) { return typeof value === 'string' ? value.split(',')[0].trim() : '' }
function normalizeOrigin(value: unknown, fallbackProtocol = ''): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim(); if (!trimmed || trimmed.toLowerCase() === 'null') return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `${fallbackProtocol}://${trimmed}`
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    const protocol = url.protocol.slice(0, -1).toLowerCase()
    if (!(protocol in DEFAULT_PORT_BY_PROTOCOL)) return null
    const hostname = url.hostname.toLowerCase()
    const port = url.port || DEFAULT_PORT_BY_PROTOCOL[protocol]
    return `${protocol}://${hostname}:${port}`
  } catch { return null }
}

function getExpectedOrigin(req: Request) {
  const protocol = firstHeaderValue(req.get('x-forwarded-proto')) || req.protocol
  const host = firstHeaderValue(req.get('x-forwarded-host')) || req.get('host')
  return normalizeOrigin(host, protocol)
}

function getSourceOrigin(req: Request) {
  const origin = normalizeOrigin(firstHeaderValue(req.get('origin')))
  if (origin) return origin
  return normalizeOrigin(firstHeaderValue(req.get('referer')))
}

function isLoopbackHost(hostname: string) {
  const value = hostname.toLowerCase()
  if (value === 'localhost') return true
  if (value === '127.0.0.1') return true
  if (value === '::1') return true
  if (/^127\.\d+\.\d+\.\d+$/.test(value)) return true
  if (/^192\.168\.\d+\.\d+$/.test(value)) return true
  if (/^10\.\d+\.\d+\.\d+$/.test(value)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(value)) return true
  return false
}

function hostFromNormalizedOrigin(origin: string) {
  const url = new URL(origin)
  return url.hostname.toLowerCase()
}

export function enforceSameOrigin(req: Request, res: Response, next: NextFunction) {
  // sec-fetch-site is the most authoritative signal from the browser
  const fetchSite = firstHeaderValue(req.get('sec-fetch-site'))
  if (fetchSite === 'same-origin' || fetchSite === 'none') return next()

  const expectedOrigin = getExpectedOrigin(req)
  const sourceOrigin = getSourceOrigin(req)
  const appOrigin = normalizeOrigin(getOptionalEnv('APP_ORIGIN'))

  // if browser sent a valid Origin, trust it as the authoritative source
  if (sourceOrigin) {
    // accept if it matches the expected request origin (from host headers)
    if (sourceOrigin === expectedOrigin) return next()

    // accept if it matches a configured APP_ORIGIN (for reverse proxy setups)
    if (appOrigin && sourceOrigin === appOrigin) return next()

    // in dev mode, allow loopback-to-loopback
    if (!isProduction() && expectedOrigin) {
      const expectedHost = hostFromNormalizedOrigin(expectedOrigin)
      const sourceHost = hostFromNormalizedOrigin(sourceOrigin)
      if (isLoopbackHost(expectedHost) && isLoopbackHost(sourceHost)) return next()
    }

    // production or mismatch — reject
    return res.status(403).json({ error: 'Cross-site requests are not allowed' })
  }

  // no Origin header — check X-Requested-With (legacy fetch indicator)
  const requestedWith = firstHeaderValue(req.get('x-requested-with'))
  if (requestedWith === 'fetch') return next()

  return res.status(403).json({ error: 'Cross-site requests are not allowed' })
}

export function safeEqual(a: string, b: string) {
  const A = Buffer.from(String(a))
  const B = Buffer.from(String(b))
  if (A.length !== B.length) return false
  return crypto.timingSafeEqual(A, B)
}
