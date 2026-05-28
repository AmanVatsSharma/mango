/**
 * Cache Service
 * 
 * High-performance in-memory cache with:
 * - TTL (Time To Live) support
 * - Automatic expiration
 * - LRU eviction
 * - Cache statistics
 * - Namespace support
 */

console.log("💾 [CACHE-SERVICE] Module loaded")

export interface CacheEntry<T> {
  value: T
  expiresAt: number
  hits: number
  createdAt: number
}

export interface CacheStats {
  size: number
  hits: number
  misses: number
  hitRate: number
  evictions: number
}

export interface CacheOptions {
  ttl?: number           // Time to live in milliseconds
  maxSize?: number       // Maximum cache size (LRU eviction)
  namespace?: string     // Cache namespace for isolation
}

class CacheService {
  private cache: Map<string, CacheEntry<any>>
  private hits: number
  private misses: number
  private evictions: number
  private cleanupInterval: NodeJS.Timeout | null
  private maxSize: number

  constructor(maxSize: number = 1000) {
    this.cache = new Map()
    this.hits = 0
    this.misses = 0
    this.evictions = 0
    this.cleanupInterval = null
    this.maxSize = maxSize
    this.startCleanup()
    console.log("🏗️ [CACHE-SERVICE] Service instance created with max size:", maxSize)
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, value: T, options: CacheOptions = {}): void {
    const { ttl = 5 * 60 * 1000, namespace = 'default' } = options
    const fullKey = this.getFullKey(key, namespace)
    
    // Check if we need to evict (LRU)
    if (this.cache.size >= this.maxSize && !this.cache.has(fullKey)) {
      this.evictLRU()
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttl,
      hits: 0,
      createdAt: Date.now()
    }

    this.cache.set(fullKey, entry)
    console.log(`💾 [CACHE-SERVICE] Cached: ${fullKey} (TTL: ${ttl}ms)`)
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string, options: CacheOptions = {}): T | null {
    const { namespace = 'default' } = options
    const fullKey = this.getFullKey(key, namespace)
    
    const entry = this.cache.get(fullKey)

    // Cache miss
    if (!entry) {
      this.misses++
      console.log(`❌ [CACHE-SERVICE] Cache miss: ${fullKey}`)
      return null
    }

    // Check if expired
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(fullKey)
      this.misses++
      console.log(`⏰ [CACHE-SERVICE] Cache expired: ${fullKey}`)
      return null
    }

    // Cache hit
    entry.hits++
    this.hits++
    console.log(`✅ [CACHE-SERVICE] Cache hit: ${fullKey} (hits: ${entry.hits})`)
    
    return entry.value as T
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string, options: CacheOptions = {}): boolean {
    const { namespace = 'default' } = options
    const fullKey = this.getFullKey(key, namespace)
    
    const entry = this.cache.get(fullKey)
    
    if (!entry) {
      return false
    }

    // Check if expired
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(fullKey)
      return false
    }

    return true
  }

  /**
   * Delete a value from cache
   */
  delete(key: string, options: CacheOptions = {}): boolean {
    const { namespace = 'default' } = options
    const fullKey = this.getFullKey(key, namespace)
    
    const deleted = this.cache.delete(fullKey)
    
    if (deleted) {
      console.log(`🗑️ [CACHE-SERVICE] Deleted: ${fullKey}`)
    }
    
    return deleted
  }

  /**
   * Clear entire cache or namespace
   */
  clear(namespace?: string): void {
    if (namespace) {
      const prefix = `${namespace}:`
      let cleared = 0
      
      for (const key of Array.from(this.cache.keys())) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key)
          cleared++
        }
      }
      
      console.log(`🗑️ [CACHE-SERVICE] Cleared namespace: ${namespace} (${cleared} entries)`)
    } else {
      this.cache.clear()
      console.log("🗑️ [CACHE-SERVICE] Cleared all cache")
    }
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = this.get<T>(key, options)
    
    if (cached !== null) {
      return cached
    }

    // Cache miss - fetch and cache
    console.log(`🔄 [CACHE-SERVICE] Fetching and caching: ${key}`)
    const value = await factory()
    this.set(key, value, options)
    
    return value
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      evictions: this.evictions
    }
  }

  /**
   * Get full key with namespace
   */
  private getFullKey(key: string, namespace: string): string {
    return `${namespace}:${key}`
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of Array.from(this.cache.entries())) {
      const lastAccess = entry.createdAt + (entry.hits * 1000) // Simple LRU approximation
      
      if (lastAccess < oldestTime) {
        oldestTime = lastAccess
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.evictions++
      console.log(`🗑️ [CACHE-SERVICE] Evicted LRU entry: ${oldestKey}`)
    }
  }

  /**
   * Start automatic cleanup of expired entries
   */
  private startCleanup(): void {
    // Cleanup every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 2 * 60 * 1000)

    console.log("🧹 [CACHE-SERVICE] Cleanup scheduled")
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [CACHE-SERVICE] Cleaned up ${cleaned} expired entries`)
    }
  }

  /**
   * Stop cleanup (for testing/shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      console.log("🛑 [CACHE-SERVICE] Cleanup stopped")
    }
  }
}

// Singleton instance
const cacheService = new CacheService()

/**
 * Cache namespaces for organization
 */
export const CacheNamespaces = {
  MARKET_DATA: 'market-data',
  USER_DATA: 'user-data',
  QUOTES: 'quotes',
  STOCKS: 'stocks',
  RISK_CONFIG: 'risk-config',
  POSITIONS: 'positions',
  ORDERS: 'orders',
  GENERAL: 'general'
}

/**
 * Common TTL presets
 */
export const CacheTTL = {
  SHORT: 30 * 1000,         // 30 seconds
  MEDIUM: 5 * 60 * 1000,    // 5 minutes
  LONG: 30 * 60 * 1000,     // 30 minutes
  VERY_LONG: 60 * 60 * 1000 // 1 hour
}

export { cacheService }

console.log("✅ [CACHE-SERVICE] Module initialized")
