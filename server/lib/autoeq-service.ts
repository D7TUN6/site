import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { serverFetch } from './http-agent.js'

const GITHUB_API = 'https://api.github.com/repos/jaakkopasanen/AutoEQ/contents/results'
const RAW_BASE = 'https://raw.githubusercontent.com/jaakkopasanen/AutoEQ/master/results'
const INDEX_TTL = 4 * 60 * 60 * 1000

type EqModelEntry = {
  brand: string
  model: string
  path: string
}

type ProfileFilter = {
  type: 'peaking' | 'lowshelf' | 'highshelf'
  frequency: number
  gain: number
  q: number
}

type EqProfile = {
  preamp: number
  filters: ProfileFilter[]
}

function mapFilterType(type: string): ProfileFilter['type'] {
  switch (type.toUpperCase()) {
    case 'PK': return 'peaking'
    case 'LSC': return 'lowshelf'
    case 'HSC': return 'highshelf'
    default: return 'peaking'
  }
}

const FILTER_RE = /^filter\s+\d+:\s+(?:(?:on|off)\s+)?(\w+)\s+fc\s+([\d.]+)(?:\s+hz)?\s+gain\s+([-.\d]+)(?:\s+db)?\s+q\s+([\d.]+)/i
const PREAMP_RE = /^preamp:\s+([-.\d]+)/i

function parsePeaceEq(text: string): EqProfile {
  const lines = text.split('\n')
  let preamp = 0
  const filters: ProfileFilter[] = []

  for (const line of lines) {
    const preampMatch = line.match(PREAMP_RE)
    if (preampMatch) {
      preamp = parseFloat(preampMatch[1]) || 0
      continue
    }
    const filterMatch = line.match(FILTER_RE)
    if (filterMatch) {
      filters.push({
        type: mapFilterType(filterMatch[1]),
        frequency: parseFloat(filterMatch[2]) || 0,
        gain: parseFloat(filterMatch[3]) || 0,
        q: parseFloat(filterMatch[4]) || 1,
      })
    }
  }

  return { preamp, filters }
}

function validateProfile(profile: EqProfile): string | null {
  if (profile.filters.length === 0) return 'Profile contains no filters'
  for (const f of profile.filters) {
    if (f.frequency <= 0) return 'Filter has invalid frequency (<= 0)'
    if (isNaN(f.gain)) return 'Filter has invalid gain'
    if (f.q <= 0 || isNaN(f.q)) return 'Filter has invalid Q value (<= 0)'
    if (f.q > 100) return 'Filter Q value unreasonably high (> 100)'
    if (Math.abs(f.gain) > 40) return 'Filter gain exceeds ±40 dB'
  }
  return null
}

export class AutoEqService {
  #cacheDir: string
  #index: EqModelEntry[] | null = null
  #lastFetch: number = 0

  constructor(cacheDir: string) {
    this.#cacheDir = cacheDir
  }

  async #ensureIndex(): Promise<EqModelEntry[]> {
    if (this.#index && Date.now() - this.#lastFetch < INDEX_TTL) return this.#index

    const cachePath = path.join(this.#cacheDir, 'autoeq-index.json')
    try {
      const cacheStat = await stat(cachePath)
      if (Date.now() - cacheStat.mtimeMs < INDEX_TTL) {
        const raw = await readFile(cachePath, 'utf-8')
        this.#index = JSON.parse(raw)
        this.#lastFetch = Date.now()
        return this.#index!
      }
    } catch { /* cache miss */ }

    try {
      const entries = await this.#fetchIndexFromGitHub()
      this.#index = entries
      this.#lastFetch = Date.now()
      await mkdir(this.#cacheDir, { recursive: true })
      await writeFile(cachePath, JSON.stringify(entries))
      return entries
    } catch (err) {
      console.error('AutoEq fetchIndex failed', err)
      if (this.#index) return this.#index
      try {
        const raw = await readFile(cachePath, 'utf-8')
        this.#index = JSON.parse(raw)
        this.#lastFetch = Date.now()
        return this.#index!
      } catch { /* no cache fallback */ }
      return []
    }
  }

  async #fetchIndexFromGitHub(): Promise<EqModelEntry[]> {
    const brands = await this.#githubList('')

    const entries: EqModelEntry[] = []
    for (const brand of brands) {
      if (!brand.type || brand.type !== 'dir') continue
      try {
        const models = await this.#githubList(brand.name)
        for (const model of models) {
          if (!model.type || model.type !== 'dir') continue
          entries.push({
            brand: brand.name,
            model: model.name,
            path: `${brand.name}/${model.name}`,
          })
        }
      } catch (err) {
        console.error('AutoEq skip brand failed', err)
      }
    }

    return entries
  }

  async #githubList(subpath: string): Promise<Array<{ name: string; type: string }>> {
    const url = subpath ? `${GITHUB_API}/${encodeURIComponent(subpath)}` : GITHUB_API
    const res = await serverFetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'd7tun6-site' },
    })
    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
    const data = await res.json() as Array<{ name: string; type: string }>
    return data
  }

  async search(query: string): Promise<EqModelEntry[]> {
    const index = await this.#ensureIndex()
    const q = query.toLowerCase().trim()
    if (!q) return index.slice(0, 50)

    return index
      .filter(e => e.brand.toLowerCase().includes(q) || e.model.toLowerCase().includes(q))
      .slice(0, 50)
  }

  async getProfile(id: string): Promise<EqProfile> {
    const index = await this.#ensureIndex()
    const entry = index.find(e => e.path === id)
    if (!entry) throw new Error(`Profile not found: ${id}`)

    const filename = `${entry.model} ParametricEQ.txt`
    const url = `${RAW_BASE}/${encodeURIComponent(entry.brand)}/${encodeURIComponent(entry.model)}/${encodeURIComponent(filename)}`

    const res = await serverFetch(url)
    if (!res.ok) throw new Error(`Failed to fetch profile (HTTP ${res.status}) for ${entry.brand} ${entry.model}`)

    const text = await res.text()
    const profile = parsePeaceEq(text)
    const validationError = validateProfile(profile)
    if (validationError) throw new Error(`Invalid profile for ${entry.brand} ${entry.model}: ${validationError}`)

    return profile
  }
}
