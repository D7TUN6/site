export type MinimalContext = {
  request: Request
  server?: { requestIP?(req: Request): { address?: string } | null } | null
}

export function getRequestIp({ request, server }: MinimalContext): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first
  try {
    const ip = server?.requestIP?.(request)
    if (ip?.address) return ip.address
  } catch { /* socket already closed */ }
  return 'unknown'
}
