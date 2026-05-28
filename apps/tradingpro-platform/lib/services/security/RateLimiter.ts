/**
 * Rate Limiter Service
 * 
 * Protects APIs from abuse with:
 * - Request rate limiting
 * - IP-based throttling
 * - User-based throttling
 * - Configurable windows
 * - Automatic cleanup
 */

console.log("🛡️ [RATE-LIMITER] Module loaded")

export interface RateLimitConfig {
  windowMs: number     // Time window in milliseconds
  maxRequests: number  // Max requests per window
  message?: string     // Custom error message
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfter?: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry>
  private cleanupInterval: NodeJS.Timeout | null

  constructor() {
    this.limits = new Map()
    this.cleanupInterval = null
    this.startCleanup()
    console.log("🏗️ [RATE-LIMITER] Service instance created")
  }

  /**
   * Check if request is allowed
   */
  check(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now()
    const entry = this.limits.get(key)

    // No existing entry or expired
    if (!entry || now >= entry.resetAt) {
      const resetAt = now + config.windowMs
      this.limits.set(key, {
        count: 1,
        resetAt
      })

      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetAt: new Date(resetAt)
      }
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      
      console.warn(`⚠️ [RATE-LIMITER] Rate limit exceeded for key: ${key}`)
      
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
        retryAfter
      }
    }

    // Increment count
    entry.count++
    this.limits.set(key, entry)

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: new Date(entry.resetAt)
    }
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.limits.delete(key)
    console.log(`🔄 [RATE-LIMITER] Reset rate limit for key: ${key}`)
  }

  /**
   * Start automatic cleanup of expired entries
   */
  private startCleanup(): void {
    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000)

    console.log("🧹 [RATE-LIMITER] Cleanup scheduled")
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of Array.from(this.limits.entries())) {
      if (now >= entry.resetAt) {
        this.limits.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [RATE-LIMITER] Cleaned up ${cleaned} expired entries`)
    }
  }

  /**
   * Stop cleanup (for testing/shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      console.log("🛑 [RATE-LIMITER] Cleanup stopped")
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    const now = Date.now()
    let active = 0
    let expired = 0

    for (const [, entry] of Array.from(this.limits.entries())) {
      if (now < entry.resetAt) {
        active++
      } else {
        expired++
      }
    }

    return {
      total: this.limits.size,
      active,
      expired
    }
  }
}

// Singleton instance
const rateLimiter = new RateLimiter()

/**
 * Predefined rate limit configurations
 */
export const RateLimitPresets = {
  // Strict: 10 requests per minute
  STRICT: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many requests. Please try again later.'
  },
  
  // Standard: 30 requests per minute
  STANDARD: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Rate limit exceeded. Please slow down.'
  },
  
  // Generous: 100 requests per minute
  GENEROUS: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    message: 'Rate limit exceeded.'
  },
  
  // Trading: 20 trades per minute
  TRADING: {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'Trading rate limit exceeded. Please wait before placing more orders.'
  },
  
  // Auth: 5 attempts per 15 minutes
  AUTH: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: 'Too many authentication attempts. Please try again later.'
  },
  
  // API: 1000 requests per hour
  API: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 1000,
    message: 'API rate limit exceeded.'
  }
}

/**
 * Helper function to generate rate limit key
 */
export function getRateLimitKey(type: string, identifier: string): string {
  return `${type}:${identifier}`
}

/**
 * Middleware function for rate limiting
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RateLimitPresets.STANDARD
): RateLimitResult {
  return rateLimiter.check(identifier, config)
}

/**
 * Reset rate limit for identifier
 */
export function resetRateLimit(identifier: string): void {
  rateLimiter.reset(identifier)
}

/**
 * Get rate limiter statistics
 */
export function getRateLimiterStats() {
  return rateLimiter.getStats()
}

export { rateLimiter }

console.log("✅ [RATE-LIMITER] Module initialized")
