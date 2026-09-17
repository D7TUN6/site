/**
 * In-memory TTL cache with optional factory function.
 * Designed as a drop-in for module-level cache variables.
 * Ready for future migration to external store (Redis, etc.).
 */
export class MemoryCache<T> {
  #data: T | null = null
  #mtime: number = 0
  #ttlMs: number

  constructor(ttlMs: number) {
    this.#ttlMs = ttlMs
  }

  get(_key?: string): T | null {
    if (this.#data !== null && Date.now() - this.#mtime < this.#ttlMs) {
      return this.#data
    }
    return null
  }

  set(data: T): void {
    this.#data = data
    this.#mtime = Date.now()
  }

  invalidate(): void {
    this.#data = null
    this.#mtime = 0
  }

  get isStale(): boolean {
    return this.#data === null || Date.now() - this.#mtime >= this.#ttlMs
  }
}

/**
 * Deduplication cache for in-flight async operations.
 * Prevents duplicate concurrent calls for the same key.
 */
export class DedupeCache<T> {
  #pending = new Map<string, Promise<T>>()

  async getOrCreate(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.#pending.get(key)
    if (existing) return existing

    const promise = factory().finally(() => {
      this.#pending.delete(key)
    })
    this.#pending.set(key, promise)
    return promise
  }
}
