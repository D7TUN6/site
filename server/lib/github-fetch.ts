// Outbound-fetch with an HTTP proxy honouring the standard env vars:
// HTTP_PROXY / HTTPS_PROXY (± lowercase) for the proxy URL and
// NO_PROXY / no_proxy for the bypass zone list.
//
// GitHub is slowed/blocked from the site's network, so the service unit is
// pointed at the local zapret-style proxy on 127.0.0.1:20171 (see
// ~/files/system encapsuled in hosts/desktop/modules/production/site.nix).
// Bun's fetch supports the explicit `proxy` option (Bun >= 1.0.23), which is
// used here deterministically instead of relying on implicit env sniffing.

let proxyOverride: string | null = null

// Allow tests to force a proxy value without touching process.env.
export function setProxyOverrideForTests(value: string | null): void {
  proxyOverride = value
}

export function resolveProxy(): string | null {
  if (proxyOverride !== null) return proxyOverride || null
  const candidates = [
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
  ]
  for (const c of candidates) {
    if (c && c.trim()) return c.trim()
  }
  return null
}

function noProxyZones(): string[] {
  const raw = process.env.NO_PROXY || process.env.no_proxy || ''
  return raw
    .split(',')
    .map((z) => z.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)
}

export function isProxyWanted(url: string): boolean {
  const proxy = resolveProxy()
  if (!proxy) return false
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (!hostname) return false
  return !noProxyZones().some((zone) => hostname === zone || hostname === `*.${zone}` || hostname.endsWith(`.${zone}`))
}

export async function fetchViaProxy(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('user-agent')) headers.set('user-agent', 'D7TUN6-site/1.0 (+github-stats)')
  const merged: RequestInit = {
    ...init,
    headers,
  }
  if (isProxyWanted(url)) {
    // Explicit proxy option; fall back to a direct request if it throws
    // (older Bun runtimes / misconfigured proxy).
    try {
      return await fetch(url, { ...merged, proxy: resolveProxy()! } as RequestInit & { proxy?: string })
    } catch (err) {
      console.warn('proxy fetch failed, falling back to direct:', String(err))
    }
  }
  return fetch(url, merged)
}