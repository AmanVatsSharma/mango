/**
 * @file CircuitBreaker.ts
 * @module resilience
 * @description Circuit breaker implementation for broker API calls with automatic recovery.
 * Prevents cascade failures when external services are degraded.
 *
 * States:
 *   CLOSED: Normal operation, requests pass through
 *   OPEN: Failures exceeded threshold, requests fail fast
 *   HALF_OPEN: Testing if service recovered
 *
 * Author: StockTrade
 * Last-updated: 2026-05-14
 */

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  /** Failure threshold before opening circuit */
  failureThreshold: number
  /** Time in ms before attempting recovery (OPEN → HALF_OPEN) */
  resetTimeoutMs: number
  /** Success threshold in half-open before closing */
  successThreshold: number
  /** Monitor window in ms for failure counting */
  monitoringWindowMs: number
  /** Callback when circuit opens */
  onOpen?: (state: CircuitState, failureCount: number) => void
  /** Callback when circuit closes */
  onClose?: (state: CircuitState) => void
}

export interface CircuitBreakerMetrics {
  state: CircuitState
  failureCount: number
  successCount: number
  lastFailure: number | null
  lastSuccess: number | null
  totalRequests: number
  totalFailures: number
  totalSuccesses: number
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount: number = 0
  private successCount: number = 0
  private lastFailureTime: number | null = null
  private lastSuccessTime: number | null = null
  private readonly config: {
    failureThreshold: number
    resetTimeoutMs: number
    successThreshold: number
    monitoringWindowMs: number
    onOpen: ((state: CircuitState, failureCount: number) => void) | null
    onClose: ((state: CircuitState) => void) | null
  }
  private readonly name: string

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeoutMs: config.resetTimeoutMs ?? 30_000,
      successThreshold: config.successThreshold ?? 3,
      monitoringWindowMs: config.monitoringWindowMs ?? 60_000,
      onOpen: config.onOpen ?? null,
      onClose: config.onClose ?? null,
    }
  }

  /** Check if circuit allows requests */
  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true
    }

    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout has elapsed
      if (this.lastFailureTime !== null) {
        const elapsed = Date.now() - this.lastFailureTime
        if (elapsed >= this.config.resetTimeoutMs) {
          this.transitionTo(CircuitState.HALF_OPEN)
          return true
        }
      }
      return false
    }

    // HALF_OPEN always allows one test request
    return true
  }

  /** Record a successful execution */
  recordSuccess(): void {
    this.lastSuccessTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED)
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = Math.max(0, this.failureCount - 1)
    }
  }

  /** Record a failed execution */
  recordFailure(): void {
    this.lastFailureTime = Date.now()
    this.failureCount++

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open reopens the circuit
      this.transitionTo(CircuitState.OPEN)
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN)
      }
    }
  }

  /** Execute a function with circuit breaker protection */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    if (!this.canExecute()) {
      if (fallback) {
        return fallback()
      }
      throw new CircuitBreakerOpenError(
        `Circuit breaker '${this.name}' is OPEN. Service unavailable.`
      )
    }

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (error) {
      this.recordFailure()
      if (fallback) {
        return fallback()
      }
      throw error
    }
  }

  /** Get current metrics */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailure: this.lastFailureTime,
      lastSuccess: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state
    this.state = newState

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0
      this.successCount = 0
      this.config.onClose?.(newState)
    } else if (newState === CircuitState.OPEN) {
      this.successCount = 0
      this.config.onOpen?.(newState, this.failureCount)
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0
    }
  }

  private get totalRequests(): number {
    return this.totalSuccesses + this.totalFailures
  }

  private get totalFailures(): number {
    return this.failureCount
  }

  private get totalSuccesses(): number {
    return this.successCount
  }
}

export class CircuitBreakerOpenError extends Error {
  readonly name = "CircuitBreakerOpenError"
  constructor(message: string) {
    super(message)
  }
}

/** Factory for creating named circuit breakers */
const breakers = new Map<string, CircuitBreaker>()

export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  let breaker = breakers.get(name)
  if (!breaker) {
    breaker = new CircuitBreaker(name, config)
    breakers.set(name, breaker)
  }
  return breaker
}

/** Pre-configured circuit breakers for common services */
export const BrokerAPICircuitBreaker = (() => {
  return getCircuitBreaker("broker-api", {
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    successThreshold: 3,
    monitoringWindowMs: 60_000,
  })
})()

export const MarketDataCircuitBreaker = (() => {
  return getCircuitBreaker("market-data", {
    failureThreshold: 3,
    resetTimeoutMs: 15_000,
    successThreshold: 2,
    monitoringWindowMs: 30_000,
  })
})()
