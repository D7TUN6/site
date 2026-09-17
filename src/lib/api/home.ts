import { apiFetchJson } from '@/lib/api/http'

export type HomeLoadAvg = { one: number; five: number; fifteen: number }
export type HomeMem = { totalMb: number; availableMb: number; usedMb: number; usedPercent: number }
export type HomeNixos = { label: string; hash: string | null; fullStorePath: string }
export type HomeSystem = {
  ok: boolean
  hostUptimeSec: number
  serverUptimeSec: number
  cpuCount: number
  cpuParallelism: number
  cpuModel: string
  cpuPercent: number
  loadavg: HomeLoadAvg
  mem: HomeMem
  nixos: HomeNixos
  activeNodes: number
}

export type GithubContributedProject = { name: string; fullName: string; url: string; isFork: boolean }
export type GithubStats = {
  stars: number
  publicRepos: number
  followers: number
  commitsThisYear: number
  contributedProjects: GithubContributedProject[]
  fetchedAt: string
}
export type GithubCommit = { repo: string; sha: string; message: string; date: string; url: string }
export type HomeGithub = {
  ok: boolean
  stale?: boolean
  error?: string
  stats: GithubStats | null
  latestCommits: GithubCommit[]
}

export async function getHomeSystem(): Promise<HomeSystem> {
  return apiFetchJson<HomeSystem>('/api/home/system')
}

export type ProductionServiceState = 'up' | 'down' | 'error'
export type ProductionService = {
  id: string
  name: string
  group: string
  state: ProductionServiceState
  activeState: string
  subState: string
  uptimeSec: number
}
export type ProductionStatus = {
  ok: boolean
  stale?: boolean
  error?: string
  generatedAt: number
  hostUptimeSec: number
  services: ProductionService[]
}

export async function getHomeProduction(): Promise<ProductionStatus> {
  return apiFetchJson<ProductionStatus>('/api/home/production')
}

export async function getHomeGithub(): Promise<HomeGithub> {
  return apiFetchJson<HomeGithub>('/api/home/github')
}