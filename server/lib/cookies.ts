import type { Request } from 'express'

export function getCookie(req: Request, name: string): string | null {
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies
  if (!cookies) return null
  const value = cookies[name]
  return typeof value === 'string' && value.length > 0 ? value : null
}
