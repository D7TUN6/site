import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Elysia } from 'elysia'
import { getSystemTelemetry } from '../lib/system-telemetry.js'
import { getActiveNodes } from '../lib/active-nodes.js'
import { getGithubStats } from '../lib/github-stats.js'

// JSON written every minute by the root-side systemd service
// `d7tun6-production-status.service` (see ~/files/system/.../production/status.nix).
const PRODUCTION_STATUS_FILE = () => join(process.cwd(), 'server', 'generated', 'production-status.json')
const PRODUCTION_STALE_MS = 150_000

// Homepage data endpoints: system telemetry + backend-cached GitHub profile
// stats. These are feature-agnostic and cheap, just Nginx-friendly.
export function createHomeRouter() {
  return new Elysia({ prefix: '/api/home' })
    .get('/system', async ({ set }) => {
      set.headers['cache-control'] = 'no-cache'
      return { ok: true, ...(await getSystemTelemetry()), activeNodes: getActiveNodes() }
    })
    .get('/github', async ({ set }) => {
      set.headers['cache-control'] = 'no-cache'
      const result = await getGithubStats()
      if (!result.ok) {
        set.status = 502
        return { ok: false, error: result.error || 'GitHub stats unavailable' }
      }
      return { ok: true, stale: Boolean(result.stale), stats: result.stats, latestCommits: result.latestCommits }
    })
    .get('/production', ({ set }) => {
      set.headers['cache-control'] = 'no-cache'
      try {
        const data = JSON.parse(readFileSync(PRODUCTION_STATUS_FILE(), 'utf8'))
        if (!data || data.ok !== true || !Array.isArray(data.services)) throw new Error('bad production-status file')
        const services = data.services.filter((s: { group?: string }) => s?.group !== 'ai')
        return { ok: true, stale: Date.now() - Number(data.generatedAt) > PRODUCTION_STALE_MS, ...data, services }
      } catch {
        set.status = 503
        return { ok: false, error: 'production status unavailable' }
      }
    })
}