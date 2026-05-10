import type { Request, Response, NextFunction } from 'express'
import { isProduction } from './config.js'

const DEFAULT_PORT_BY_PROTOCOL: Record<string, string> = { http: '80', https: '443' }

function firstHeaderValue(value: unknown) { return typeof value === 'string' ? value.split(',')[0].trim() : '' }
function normalizeOrigin(value: unknown, fallbackProtocol = ''): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim(); if (!trimmed || trimmed.toLowerCase() === 'null') return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : fallbackProtocol ? `${fallbackProtocol}://${trimmed}` : ''
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
  const fetchSite = firstHeaderValue(req.get('sec-fetch-site'))
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return res.status(403).json({ error: 'Cross-site requests are not allowed' })
  }

  const expectedOrigin = getExpectedOrigin(req)
  if (!expectedOrigin) return res.status(400).json({ error: 'Unable to validate request origin' })

  const sourceOrigin = getSourceOrigin(req)
  if (!sourceOrigin) {
    const requestedWith = firstHeaderValue(req.get('x-requested-with'))
    if (requestedWith === 'fetch') return next()
    return res.status(403).json({ error: 'Cross-site requests are not allowed' })
  }

  if (sourceOrigin !== expectedOrigin) {
    if (!isProduction()) {
      const expectedHost = hostFromNormalizedOrigin(expectedOrigin)
      const sourceHost = hostFromNormalizedOrigin(sourceOrigin)
      if (isLoopbackHost(expectedHost) && isLoopbackHost(sourceHost)) return next()
    }
    return res.status(403).json({ error: 'Cross-site requests are not allowed' })
  }
  return next()
}
