import type { LikesData, MetricsData } from '@/lib/api/social'

export async function fetchSocialData(slug: string): Promise<{ likesData: LikesData | null; metricsData: MetricsData | null }> {
  try {
    const [l, m] = await Promise.all([
      import('@/lib/api/social').then((mod) => mod.getLikes(slug)),
      import('@/lib/api/social').then((mod) => mod.getMetrics(slug)),
    ])
    return { likesData: l, metricsData: m }
  } catch {
    return { likesData: null, metricsData: null }
  }
}