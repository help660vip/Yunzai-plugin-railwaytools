export const CACHE_POLICIES = Object.freeze({
  trainDetail: Object.freeze({ ttlMs: 60_000, staleTtlMs: 4 * 60_000 }),
  trainAssignment: Object.freeze({ ttlMs: 5 * 60_000, staleTtlMs: 30 * 60_000 }),
  stationScreen: Object.freeze({ ttlMs: 20_000, staleTtlMs: 60_000 }),
  cnrailSearch: Object.freeze({ ttlMs: 6 * 60 * 60_000, staleTtlMs: 2 * 24 * 60 * 60_000 }),
  route: Object.freeze({ ttlMs: 24 * 60 * 60_000, staleTtlMs: 7 * 24 * 60 * 60_000 }),
  station: Object.freeze({ ttlMs: 24 * 60 * 60_000, staleTtlMs: 7 * 24 * 60 * 60_000 }),
  ticketStations: Object.freeze({ ttlMs: 24 * 60 * 60_000, staleTtlMs: 7 * 24 * 60 * 60_000 }),
  ticketAvailability: Object.freeze({ ttlMs: 15_000, staleTtlMs: 30_000 }),
  ticketPrice: Object.freeze({ ttlMs: 15 * 60_000, staleTtlMs: 60 * 60_000 })
})

export class RailwayCacheDataError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RailwayCacheDataError'
    this.code = 'INVALID_CACHE_DATA'
  }
}

export class MemoryCacheAdapter {
  constructor() {
    this.entries = new Map()
  }

  async get(key) {
    return this.entries.get(key) ?? null
  }

  async set(key, entry) {
    this.entries.set(key, entry)
  }

  async delete(key) {
    this.entries.delete(key)
  }

  async clear() {
    this.entries.clear()
  }
}

export class RailwayCache {
  constructor({ adapter = new MemoryCacheAdapter(), policies = CACHE_POLICIES, now = Date.now } = {}) {
    this.adapter = adapter
    this.policies = policies
    this.now = now
    this.loading = new Map()
  }

  getPolicy(namespace, options) {
    const policy = this.policies[namespace] ?? {}
    const normalizeDuration = (value) => {
      const duration = Number(value)
      return Number.isFinite(duration) ? Math.max(0, duration) : 0
    }
    return {
      ttlMs: normalizeDuration(options.ttlMs ?? policy.ttlMs ?? 0),
      staleTtlMs: normalizeDuration(options.staleTtlMs ?? policy.staleTtlMs ?? 0)
    }
  }

  async safeGet(key) {
    try {
      return await this.adapter.get(key)
    } catch {
      return null
    }
  }

  async safeSet(key, entry) {
    try {
      await this.adapter.set(key, entry)
    } catch {
      // Cache adapter failures must not make an upstream query fail.
    }
  }

  async safeDelete(key) {
    try {
      await this.adapter.delete(key)
    } catch {
      // An unavailable external adapter is equivalent to a cache miss.
    }
  }

  async remember(namespace, key, loader, options = {}) {
    if (typeof loader !== 'function') throw new TypeError('Cache loader must be a function')

    const cacheKey = `${namespace}:${String(key)}`
    const now = this.now()
    const cached = await this.safeGet(cacheKey)
    if (cached && now < cached.expiresAt) return cached.value
    if (cached && now >= cached.staleUntil) await this.safeDelete(cacheKey)

    const existingLoad = this.loading.get(cacheKey)
    if (existingLoad) return existingLoad

    const { ttlMs, staleTtlMs } = this.getPolicy(namespace, options)
    const loading = (async () => {
      try {
        const value = await loader()
        if (typeof options.validate === 'function' && !options.validate(value)) {
          throw new RailwayCacheDataError(`Cache loader returned invalid data for ${namespace}`)
        }

        const loadedAt = this.now()
        await this.safeSet(cacheKey, {
          value,
          expiresAt: loadedAt + ttlMs,
          staleUntil: loadedAt + ttlMs + staleTtlMs
        })
        return value
      } catch (error) {
        if (cached && this.now() < cached.staleUntil) return cached.value
        throw error
      } finally {
        this.loading.delete(cacheKey)
      }
    })()

    this.loading.set(cacheKey, loading)
    return loading
  }

  async clear() {
    this.loading.clear()
    await this.adapter.clear()
  }
}

let activeCache = new RailwayCache()

export function cacheRailwayData(namespace, key, loader, options) {
  return activeCache.remember(namespace, key, loader, options)
}

export function configureRailwayCache(options = {}) {
  activeCache = options instanceof RailwayCache ? options : new RailwayCache(options)
  return activeCache
}

export async function clearRailwayCache() {
  await activeCache.clear()
}
