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

function getExpectedOrigin(headers: Headers, fallbackProtocol = 'http'): string | null {
  const protocol = firstHeaderValue(headers.get('x-forwarded-proto')) || fallbackProtocol
  const host = firstHeaderValue(headers.get('x-forwarded-host')) || headers.get('host') || ''
  return normalizeOrigin(host, protocol || fallbackProtocol)
}

function getSourceOrigin(headers: Headers): string | null {
  const origin = normalizeOrigin(firstHeaderValue(headers.get('origin')))
  if (origin) return origin
  return normalizeOrigin(firstHeaderValue(headers.get('referer')))
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

type OriginGuardContext = { request: Request; set: { status?: number | string } }

export function enforceSameOrigin({ request, set }: OriginGuardContext) {
  const headers = request.headers
  const fetchSite = firstHeaderValue(headers.get('sec-fetch-site'))
  if (fetchSite === 'same-origin' || fetchSite === 'none') return

  const expectedOrigin = getExpectedOrigin(headers, new URL(request.url).protocol.replace(':', ''))
  const sourceOrigin = getSourceOrigin(headers)
  const appOrigin = normalizeOrigin(getOptionalEnv('APP_ORIGIN'))

  if (sourceOrigin) {
    if (expectedOrigin && sourceOrigin === expectedOrigin) return
    if (appOrigin && sourceOrigin === appOrigin) return
    if (!isProduction() && expectedOrigin) {
      const expectedHost = hostFromNormalizedOrigin(expectedOrigin)
      const sourceHost = hostFromNormalizedOrigin(sourceOrigin)
      if (isLoopbackHost(expectedHost) && isLoopbackHost(sourceHost)) return
    }
    set.status = 403
    return { error: 'Cross-site requests are not allowed' }
  }

  const requestedWith = firstHeaderValue(headers.get('x-requested-with'))
  if (requestedWith === 'fetch') return

  set.status = 403
  return { error: 'Cross-site requests are not allowed' }
}
