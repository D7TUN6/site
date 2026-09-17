import { fetchViaProxy } from './github-fetch.js'

export const GITHUB_USERNAME = 'D7TUN6'
const GITHUB_API = 'https://api.github.com'
const CACHE_TTL_MS = 10 * 60 * 1000

export type GithubCommit = {
  repo: string
  sha: string
  message: string
  date: string
  url: string
}

export type GithubStats = {
  stars: number
  publicRepos: number
  followers: number
  commitsThisYear: number
  contributedProjects: Array<{ name: string; fullName: string; url: string; isFork: boolean }>
  fetchedAt: string
}

export type GithubStatsResult = {
  ok: boolean
  stale?: boolean
  error?: string
  stats: GithubStats | null
  latestCommits: GithubCommit[]
}

type CacheEntry = { promise: Promise<GithubStatsResult>; at: number; value: GithubStatsResult | null }

let cacheEntry: CacheEntry | null = null

async function githubJson<T>(fetchImpl: FetchLike, path: string, qs: Record<string, string> = {}, accept = 'application/vnd.github+json'): Promise<T | null> {
  const params = new URLSearchParams(qs).toString()
  const url = `${GITHUB_API}${path}${params ? `?${params}` : ''}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetchImpl(url, {
      headers: { accept },
      signal: controller.signal,
    })
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        // Rate-limited — surface via the sentinel below.
        return null
      }
      return null
    }
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

type RepoItem = {
  full_name: string
  stargazers_count: number
  fork: boolean
  parent?: { full_name: string | null }
}

type UserItem = {
  public_repos: number
  followers: number
  html_url: string
}

type CommitItem = {
  sha: string
  html_url: string
  commit: { message: string; committer: { date: string } }
}

type CommitSearchItem = CommitItem

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

async function fetchStats(fetchImpl: FetchLike): Promise<GithubStatsResult> {
  const year = new Date().getFullYear()
  const [user, repos, yearRes, latestRes] = await Promise.all([
    githubJson<UserItem>(fetchImpl, `/users/${GITHUB_USERNAME}`),
    githubJson<RepoItem[]>(fetchImpl, `/users/${GITHUB_USERNAME}/repos`, { per_page: '100', sort: 'updated' }),
    githubJson<{ total_count: number } | null>(fetchImpl, '/search/commits', {
      q: `author:${GITHUB_USERNAME} committer-date:>=${year}-01-01`,
      per_page: '1',
    }),
    githubJson<{ items: CommitSearchItem[] } | null>(fetchImpl, '/search/commits', {
      q: `author:${GITHUB_USERNAME}`,
      sort: 'committer-date',
      order: 'desc',
      per_page: '3',
    }),
  ])

  // Search API can 403 on rate limits while core still works — degrade.
  const yearCount = yearRes && Number.isFinite(Number(yearRes.total_count)) ? Number(yearRes.total_count) : 0
  const commitsThisYear = yearCount > 0 ? yearCount : null
  if (!user || !Array.isArray(repos) || user === null) {
    throw new Error('GitHub user/repos API unavailable (rate limit or network)')
  }

  const stars = repos.filter((r) => !r.fork).reduce((sum, r) => sum + (r.stargazers_count || 0), 0)
  const contributedProjects = repos
    .filter((r) => r.fork)
    .map((r) => {
      const parent = r.parent?.full_name || r.full_name.replace(/^[^/]+\//, '')
      return { name: parent.split('/').pop() || parent, fullName: parent, url: `https://github.com/${parent}`, isFork: true }
    })

  const stats: GithubStats = {
    stars,
    publicRepos: user.public_repos,
    followers: user.followers,
    commitsThisYear: commitsThisYear ?? 0,
    contributedProjects,
    fetchedAt: new Date().toISOString(),
  }

  const latestCommits: GithubCommit[] = (latestRes?.items ?? []).map((c) => {
    const repo = repoFromCommitUrl(c.html_url)
    return {
      repo,
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0].trim(),
      date: c.commit.committer.date.slice(0, 10),
      url: c.html_url,
    }
  })

  return { ok: true, stats, latestCommits }
}

function repoFromCommitUrl(commitUrl: string): string {
  const m = commitUrl.match(/github\.com\/([^/]+\/[^/]+)\/commit\//)
  return m ? m[1] : 'd7tun6'
}

// Module-level cache with stale-while-revalidate: a good response lives TTL;
// a failure returns the last good payload flagged `stale: true` instead of
// letting the homepage widget go dead during a GitHub outage.
export function getGithubStats(): Promise<GithubStatsResult> {
  const now = Date.now()
  if (cacheEntry && now - cacheEntry.at < CACHE_TTL_MS) return cacheEntry.promise

  const entry: CacheEntry = { promise: Promise.resolve() as unknown as Promise<GithubStatsResult>, at: now, value: null }
  const pending = fetchStats(fetchViaProxy)
    .catch((_err) => {
      if (entry.value) {
        const v = entry.value
        return v.ok ? { ok: true, stale: true, stats: v.stats, latestCommits: v.latestCommits } : v
      }
      return { ok: false, error: 'GitHub API unreachable', stats: null, latestCommits: [] }
    })
    .then((v) => {
      entry.value = v
      return v
    })
  entry.promise = pending
  cacheEntry = entry
  return pending
}

// For tests: reset the module cache between cases.
export function resetGithubStatsCacheForTests(): void {
  cacheEntry = null
}