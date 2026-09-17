const MAX_SOCIAL_LIMIT = 500

export function buildTimeRange(range: string): number {
  const now = Date.now()
  if (range === 'day') return now - 24 * 60 * 60 * 1000
  if (range === 'week') return now - 7 * 24 * 60 * 60 * 1000
  if (range === 'month') return now - 30 * 24 * 60 * 60 * 1000
  if (range === 'quarter') return now - 90 * 24 * 60 * 60 * 1000
  if (range === 'year') return now - 365 * 24 * 60 * 60 * 1000
  return 0
}

export function clampPagination(offset: string | undefined, limit: string | undefined): { offset: number; limit: number } {
  return {
    offset: Math.max(0, parseInt(offset || '0') || 0),
    limit: Math.min(Math.max(1, parseInt(limit || '100') || 100), MAX_SOCIAL_LIMIT),
  }
}
