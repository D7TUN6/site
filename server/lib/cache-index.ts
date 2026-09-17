import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import path from 'node:path'

export type CacheEntry = {
  cacheKey: string
  slug: string
  albumDir: string
  type: 'derived' | 'master'
  sizeBytes: number
  createdAt: number
  lastAccessedAt: number
}

export class CacheIndex {
  readonly #path: string
  #entries: CacheEntry[] = []
  #dirty = false

  constructor(root: string) {
    this.#path = path.join(root, 'server', 'generated', 'cache-index.json')
  }

  async load() {
    try {
      const raw = await readFile(this.#path, 'utf8')
      this.#entries = JSON.parse(raw) as CacheEntry[]
    } catch {
      this.#entries = []
    }
    this.#dirty = false
  }

  async persist() {
    if (!this.#dirty) return
    const tmp = this.#path + '.tmp'
    await mkdir(path.dirname(this.#path), { recursive: true })
    await writeFile(tmp, JSON.stringify(this.#entries), 'utf8')
    await rename(tmp, this.#path)
    this.#dirty = false
  }

  get entries(): CacheEntry[] {
    return this.#entries
  }

  add(entry: CacheEntry) {
    this.#entries.push(entry)
    this.#dirty = true
  }

  touch(cacheKey: string) {
    const entry = this.#entries.find(e => e.cacheKey === cacheKey)
    if (entry) {
      entry.lastAccessedAt = Date.now()
      this.#dirty = true
    }
  }

  getStale(olderThanMs: number, type?: 'derived'): CacheEntry[] {
    const cutoff = Date.now() - olderThanMs
    return this.#entries.filter(e =>
      (type ? e.type === type : true) && e.lastAccessedAt < cutoff
    )
  }

  remove(cacheKey: string) {
    const idx = this.#entries.findIndex(e => e.cacheKey === cacheKey)
    if (idx >= 0) {
      this.#entries.splice(idx, 1)
      this.#dirty = true
    }
  }

  findBySlug(slug: string): CacheEntry[] {
    return this.#entries.filter(e => e.slug === slug)
  }
}
