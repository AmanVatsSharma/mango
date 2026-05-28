/**
 * Performance Monitor
 * 
 * Tracks and analyzes performance metrics:
 * - Operation execution times
 * - Success/failure rates
 * - Bottleneck detection
 * - Performance trends
 */

console.log("⚡ [PERFORMANCE-MONITOR] Module loaded")

export interface PerformanceMetric {
  operation: string
  startTime: number
  endTime?: number
  duration?: number
  success: boolean
  error?: string
  metadata?: any
}

export interface OperationStats {
  operation: string
  count: number
  avgDuration: number
  minDuration: number
  maxDuration: number
  successRate: number
  errorRate: number
  lastExecuted: string
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]>
  private activeOperations: Map<string, number>

  constructor() {
    this.metrics = new Map()
    this.activeOperations = new Map()
    console.log("🏗️ [PERFORMANCE-MONITOR] Monitor instance created")
  }

  /**
   * Start tracking an operation
   */
  startOperation(operation: string, metadata?: any): string {
    const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    this.activeOperations.set(operationId, Date.now())
    
    console.log(`⏱️ [PERFORMANCE-MONITOR] Started tracking: ${operation}`)
    
    return operationId
  }

  /**
   * End tracking an operation
   */
  endOperation(operationId: string, operation: string, success: boolean, error?: string, metadata?: any): void {
    const startTime = this.activeOperations.get(operationId)
    
    if (!startTime) {
      console.warn(`⚠️ [PERFORMANCE-MONITOR] Operation not found: ${operationId}`)
      return
    }

    const endTime = Date.now()
    const duration = endTime - startTime

    const metric: PerformanceMetric = {
      operation,
      startTime,
      endTime,
      duration,
      success,
      error,
      metadata
    }

    // Store metric
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, [])
    }
    
    this.metrics.get(operation)!.push(metric)

    // Clean up old metrics (keep last 1000 per operation)
    const operationMetrics = this.metrics.get(operation)!
    if (operationMetrics.length > 1000) {
      operationMetrics.shift()
    }

    // Remove from active operations
    this.activeOperations.delete(operationId)

    const statusEmoji = success ? '✅' : '❌'
    console.log(`${statusEmoji} [PERFORMANCE-MONITOR] ${operation} completed in ${duration}ms`)
  }

  /**
   * Get statistics for an operation
   */
  getOperationStats(operation: string): OperationStats | null {
    const metrics = this.metrics.get(operation)
    
    if (!metrics || metrics.length === 0) {
      return null
    }

    const durations = metrics.map(m => m.duration!).filter(d => d !== undefined)
    const successCount = metrics.filter(m => m.success).length
    const errorCount = metrics.length - successCount

    const stats: OperationStats = {
      operation,
      count: metrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: (successCount / metrics.length) * 100,
      errorRate: (errorCount / metrics.length) * 100,
      lastExecuted: new Date(metrics[metrics.length - 1].endTime!).toISOString()
    }

    return stats
  }

  /**
   * Get all operation statistics
   */
  getAllStats(): OperationStats[] {
    const allStats: OperationStats[] = []
    
    for (const [operation] of Array.from(this.metrics)) {
      const stats = this.getOperationStats(operation)
      if (stats) {
        allStats.push(stats)
      }
    }

    return allStats.sort((a, b) => b.count - a.count)
  }

  /**
   * Get slow operations (> threshold ms)
   */
  getSlowOperations(thresholdMs: number = 1000): PerformanceMetric[] {
    const slowOps: PerformanceMetric[] = []
    
    for (const [, metrics] of Array.from(this.metrics)) {
      const slow = metrics.filter((m: PerformanceMetric) => m.duration && m.duration > thresholdMs)
      slowOps.push(...slow)
    }

    return slowOps.sort((a, b) => (b.duration || 0) - (a.duration || 0))
  }

  /**
   * Get failed operations
   */
  getFailedOperations(limit: number = 100): PerformanceMetric[] {
    const failed: PerformanceMetric[] = []
    
    for (const [, metrics] of Array.from(this.metrics)) {
      const failures = metrics.filter((m: PerformanceMetric) => !m.success)
      failed.push(...failures)
    }

    return failed
      .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
      .slice(0, limit)
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const allStats = this.getAllStats()
    
    const totalOperations = allStats.reduce((sum, stat) => sum + stat.count, 0)
    const avgSuccessRate = allStats.length > 0
      ? allStats.reduce((sum, stat) => sum + stat.successRate, 0) / allStats.length
      : 100

    const avgDuration = allStats.length > 0
      ? allStats.reduce((sum, stat) => sum + stat.avgDuration, 0) / allStats.length
      : 0

    return {
      totalOperations,
      avgSuccessRate,
      avgDuration,
      activeOperations: this.activeOperations.size,
      trackedOperationTypes: this.metrics.size,
      stats: allStats
    }
  }

  /**
   * Clear old metrics
   */
  clearMetrics(olderThanMs?: number): void {
    if (!olderThanMs) {
      this.metrics.clear()
      console.log("🗑️ [PERFORMANCE-MONITOR] All metrics cleared")
      return
    }

    const cutoff = Date.now() - olderThanMs
    
    for (const [operation, metrics] of Array.from(this.metrics)) {
      const filtered = metrics.filter((m: PerformanceMetric) => (m.endTime || 0) > cutoff)
      if (filtered.length === 0) {
        this.metrics.delete(operation)
      } else {
        this.metrics.set(operation, filtered)
      }
    }

    console.log(`🗑️ [PERFORMANCE-MONITOR] Cleared metrics older than ${olderThanMs}ms`)
  }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor()

/**
 * Decorator for automatic performance tracking
 */
export function trackPerformance(operationName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const operationId = performanceMonitor.startOperation(operationName, { 
        method: propertyKey,
        args: args.length 
      })

      try {
        const result = await originalMethod.apply(this, args)
        performanceMonitor.endOperation(operationId, operationName, true, undefined, { result: 'success' })
        return result
      } catch (error: any) {
        performanceMonitor.endOperation(operationId, operationName, false, error.message)
        throw error
      }
    }

    return descriptor
  }
}

/**
 * Utility function for manual tracking
 */
export async function trackOperation<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: any
): Promise<T> {
  const operationId = performanceMonitor.startOperation(operation, metadata)

  try {
    const result = await fn()
    performanceMonitor.endOperation(operationId, operation, true, undefined, metadata)
    return result
  } catch (error: any) {
    performanceMonitor.endOperation(operationId, operation, false, error.message, metadata)
    throw error
  }
}

export { performanceMonitor }

console.log("✅ [PERFORMANCE-MONITOR] Module initialized")
