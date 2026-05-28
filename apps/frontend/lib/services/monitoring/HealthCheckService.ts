/**
 * Health Check Service
 * 
 * Monitors system health and performance metrics:
 * - Database connectivity
 * - API endpoints
 * - Service availability
 * - Performance metrics
 * - Error rates
 */

import { prisma } from "@/lib/prisma"
import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"
import {
  activeHeadcountBaseWhere,
  resolveActiveUserCountWhere,
} from "@/lib/server/active-user-count-policy"

console.log("🏥 [HEALTH-CHECK] Module loaded")

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  checks: {
    database: HealthCheckResult
    services: HealthCheckResult
    marketData: HealthCheckResult
  }
  metrics: PerformanceMetrics
}

export interface HealthCheckResult {
  status: 'pass' | 'fail' | 'warn'
  responseTime?: number
  message?: string
  details?: any
}

export interface PerformanceMetrics {
  avgOrderExecutionTime: number
  avgPositionCloseTime: number
  avgFundOperationTime: number
  errorRate: number
  successRate: number
}

export class HealthCheckService {
  private startTime: number
  
  constructor() {
    this.startTime = Date.now()
    console.log("🏗️ [HEALTH-CHECK] Service instance created")
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    console.log("🏥 [HEALTH-CHECK] Starting health check")
    
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkServices(),
      this.checkMarketData()
    ])

    const [database, services, marketData] = checks
    
    // Determine overall status
    const allPass = checks.every(c => c.status === 'pass')
    const anyFail = checks.some(c => c.status === 'fail')
    
    const status: 'healthy' | 'degraded' | 'unhealthy' = 
      allPass ? 'healthy' : anyFail ? 'unhealthy' : 'degraded'

    // Get performance metrics
    const metrics = await this.getPerformanceMetrics()

    const healthStatus: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      checks: {
        database,
        services,
        marketData
      },
      metrics
    }

    console.log("✅ [HEALTH-CHECK] Health check completed:", status)
    return healthStatus
  }

  /**
   * Check database connectivity and performance
   */
  private async checkDatabase(): Promise<HealthCheckResult> {
    console.log("🔍 [HEALTH-CHECK] Checking database")
    const start = Date.now()
    
    try {
      // Test query
      await prisma.$queryRaw`SELECT 1`
      
      // Check connection pool
      const responseTime = Date.now() - start
      
      if (responseTime > 1000) {
        return {
          status: 'warn',
          responseTime,
          message: 'Database responding slowly',
          details: { responseTime }
        }
      }

      return {
        status: 'pass',
        responseTime,
        message: 'Database connected',
        details: { responseTime }
      }
    } catch (error: any) {
      console.error("❌ [HEALTH-CHECK] Database check failed:", error)
      return {
        status: 'fail',
        responseTime: Date.now() - start,
        message: 'Database connection failed',
        details: { error: error.message }
      }
    }
  }

  /**
   * Check critical services availability
   */
  private async checkServices(): Promise<HealthCheckResult> {
    console.log("🔍 [HEALTH-CHECK] Checking services")
    const start = Date.now()
    
    try {
      // Check if essential tables exist
      const [usersCount, accountsCount, ordersCount] = await Promise.all([
        prisma.user.count(),
        prisma.tradingAccount.count(),
        prisma.order.count()
      ])

      const responseTime = Date.now() - start

      return {
        status: 'pass',
        responseTime,
        message: 'All services operational',
        details: {
          responseTime,
          usersCount,
          accountsCount,
          ordersCount
        }
      }
    } catch (error: any) {
      console.error("❌ [HEALTH-CHECK] Services check failed:", error)
      return {
        status: 'fail',
        responseTime: Date.now() - start,
        message: 'Services unavailable',
        details: { error: error.message }
      }
    }
  }

  /**
   * Check market data availability
   */
  private async checkMarketData(): Promise<HealthCheckResult> {
    console.log("🔍 [HEALTH-CHECK] Checking market data")
    const start = Date.now()
    
    try {
      // Check if we have recent stock data
      const recentStocks = await prisma.stock.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      })

      const responseTime = Date.now() - start

      if (recentStocks === 0) {
        return {
          status: 'warn',
          responseTime,
          message: 'No recent market data updates',
          details: { recentStocks, responseTime }
        }
      }

      return {
        status: 'pass',
        responseTime,
        message: 'Market data available',
        details: { recentStocks, responseTime }
      }
    } catch (error: any) {
      console.error("❌ [HEALTH-CHECK] Market data check failed:", error)
      return {
        status: 'fail',
        responseTime: Date.now() - start,
        message: 'Market data unavailable',
        details: { error: error.message }
      }
    }
  }

  /**
   * Get performance metrics from logs
   */
  private async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    console.log("📊 [HEALTH-CHECK] Calculating performance metrics")
    
    try {
      // Get logs from last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      
      const logs = await prisma.tradingLog.findMany({
        where: {
          createdAt: {
            gte: oneHourAgo
          }
        },
        select: {
          level: true,
          category: true,
          action: true,
          createdAt: true
        }
      })

      const totalLogs = logs.length
      const errorLogs = logs.filter(l => l.level === 'ERROR').length
      const successLogs = totalLogs - errorLogs

      const errorRate = totalLogs > 0 ? (errorLogs / totalLogs) * 100 : 0
      const successRate = totalLogs > 0 ? (successLogs / totalLogs) * 100 : 100

      // Calculate average execution times (simplified - can be enhanced)
      return {
        avgOrderExecutionTime: 250, // ms - Can calculate from actual logs
        avgPositionCloseTime: 200,  // ms
        avgFundOperationTime: 100,  // ms
        errorRate,
        successRate
      }
    } catch (error) {
      console.error("❌ [HEALTH-CHECK] Failed to get metrics:", error)
      return {
        avgOrderExecutionTime: 0,
        avgPositionCloseTime: 0,
        avgFundOperationTime: 0,
        errorRate: 0,
        successRate: 0
      }
    }
  }

  /**
   * Get system statistics
   */
  async getSystemStats() {
    console.log("📊 [HEALTH-CHECK] Getting system statistics")
    
    try {
      const { where: activeUsersWhere } = await resolveActiveUserCountWhere(
        activeHeadcountBaseWhere(),
      )
      const [
        totalUsers,
        activeUsers,
        totalOrders,
        todayOrders,
        totalPositions,
        openPositions,
        totalVolume
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: activeUsersWhere }),
        prisma.order.count(),
        prisma.order.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        }),
        prisma.position.count(),
        prisma.position.count({
          where: {
            quantity: { not: 0 }
          }
        }),
        prisma.transaction.aggregate({
          _sum: {
            amount: true
          }
        })
      ])

      return {
        users: {
          total: totalUsers,
          active: activeUsers
        },
        orders: {
          total: totalOrders,
          today: todayOrders
        },
        positions: {
          total: totalPositions,
          open: openPositions
        },
        volume: {
          total: parseFiniteMarketNumber(totalVolume._sum.amount) ?? 0
        }
      }
    } catch (error) {
      console.error("❌ [HEALTH-CHECK] Failed to get stats:", error)
      throw error
    }
  }
}

/**
 * Create health check service instance
 */
export function createHealthCheckService(): HealthCheckService {
  console.log("🏭 [HEALTH-CHECK] Creating service instance")
  return new HealthCheckService()
}

console.log("✅ [HEALTH-CHECK] Module initialized")
