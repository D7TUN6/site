import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { getSystemTelemetry } from '../lib/system-telemetry.js'
import { trackActiveNode, getActiveNodes, resetActiveNodesForTests } from '../lib/active-nodes.js'
import { getGithubStats, resetGithubStatsCacheForTests, GITHUB_USERNAME } from '../lib/github-stats.js'
import { setProxyOverrideForTests, isProxyWanted, resolveProxy } from '../lib/github-fetch.js'

describe('system telemetry', () => {
  it('returns uptime/load/mem with sane shapes', async () => {
    const t = await getSystemTelemetry()
    expect(Number.isFinite(t.hostUptimeSec)).toBe(true)
    expect(Number.isFinite(t.serverUptimeSec)).toBe(true)
    expect(t.serverUptimeSec).toBeLessThanOrEqual(t.hostUptimeSec)
    expect(typeof t.loadavg.one).toBe('number')
    expect(typeof t.loadavg.five).toBe('number')
    expect(typeof t.loadavg.fifteen).toBe('number')
    expect(t.cpuCount).toBeGreaterThan(0)
    expect(t.cpuPercent).toBeGreaterThanOrEqual(0)
    expect(t.cpuPercent).toBeLessThanOrEqual(100)
    expect(t.mem.totalMb).toBeGreaterThan(0)
    expect(t.mem.usedPercent).toBeGreaterThanOrEqual(0)
    expect(t.mem.usedPercent).toBeLessThanOrEqual(100)
    expect(t.nixos.hash === null || typeof t.nixos.hash === 'string').toBe(true)
  })
})

describe('active nodes', () => {
  beforeEach(() => resetActiveNodesForTests())

  it('increments and releases', () => {
    const release = trackActiveNode()
    expect(getActiveNodes()).toBe(1)
    const second = trackActiveNode()
    expect(getActiveNodes()).toBe(2)
    release()
    expect(getActiveNodes()).toBe(1)
    second()
    expect(getActiveNodes()).toBe(0)
  })

  it('release is idempotent', () => {
    const release = trackActiveNode()
    release()
    release()
    expect(getActiveNodes()).toBe(0)
  })
})

describe('github stats (cached, proxied)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    resetGithubStatsCacheForTests()
    setProxyOverrideForTests('http://127.0.0.1:20171')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    setProxyOverrideForTests(null)
    resetGithubStatsCacheForTests()
  })

  function mockFetch() {
    globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.includes('/users/D7TUN6/repos')) {
        return json([
          { full_name: 'D7TUN6/BoxChat', stargazers_count: 3, fork: false },
          { full_name: 'D7TUN6/site', stargazers_count: 0, fork: false },
          { full_name: 'D7TUN6/nixpkgs', stargazers_count: 400, fork: true, parent: { full_name: 'NixOS/nixpkgs' } },
        ])
      }
      if (url.includes('/users/D7TUN6')) {
        return json({ public_repos: 11, followers: 2, html_url: 'https://github.com/D7TUN6' })
      }
      if (url.includes('/search/commits') && url.includes('%3E%3D')) {
        return json({ total_count: 54, items: [] })
      }
      if (url.includes('/search/commits')) {
        return json({
          items: [
            { sha: 'aaaa1111', html_url: 'https://github.com/D7TUN6/site/commit/aaaa1111', commit: { message: 'first line\nsecond', committer: { date: '2026-05-10T12:00:00Z' } } },
            { sha: 'bbbb2222', html_url: 'https://github.com/D7TUN6/BoxChat/commit/bbbb2222', commit: { message: 'fix stuff', committer: { date: '2026-04-19T12:00:00Z' } } },
          ],
        })
      }
      return json({})
    }) as unknown as typeof fetch
  }

  it('parses stars, contribution forks, commits-this-year and latest log', async () => {
    mockFetch()
    const res = await getGithubStats()
    expect(res.ok).toBe(true)
    expect(res.stats?.stars).toBe(3)
    expect(res.stats?.publicRepos).toBe(11)
    expect(res.stats?.commitsThisYear).toBe(54)
    expect(res.stats?.contributedProjects).toHaveLength(1)
    expect(res.stats?.contributedProjects[0].fullName).toBe('NixOS/nixpkgs')
    expect(res.latestCommits).toHaveLength(2)
    expect(res.latestCommits[0].repo).toBe('D7TUN6/site')
    expect(res.latestCommits[0].message).toBe('first line')
    expect(res.latestCommits[0].sha).toBe('aaaa111')
  })

  it('serves cached result on a subsequent request', async () => {
    mockFetch()
    await getGithubStats()
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    const cached = await getGithubStats()
    expect(cached.ok).toBe(true)
    expect(cached.stats?.stars).toBe(3)
  })

  it('reports failure only when nothing cached', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    const res = await getGithubStats()
    expect(res.ok).toBe(false)
  })
})

describe('proxy resolution', () => {
  it('resolves from env override and honours no_proxy zones', () => {
    setProxyOverrideForTests('http://127.0.0.1:20171')
    expect(resolveProxy()).toBe('http://127.0.0.1:20171')
    expect(isProxyWanted('https://api.github.com/users/x')).toBe(true)
    expect(isProxyWanted(`https://github.com/${GITHUB_USERNAME}`)).toBe(true)
    setProxyOverrideForTests(null)
  })
})