/**
 * @file BulkOperationsService.ts
 * @module admin
 * @description Bulk operations for admin position and order management.
 * Supports batch close, modify, and cancel operations with progress tracking.
 *
 * Author: StockTrade
 * Last-updated: 2026-05-14
 */

import { prisma } from "@/lib/prisma"
import { createPositionManagementService, type PositionClosureContext } from "@/lib/services/position/PositionManagementService"
import { createOrderExecutionService } from "@/lib/services/order/OrderExecutionService"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "BulkOperationsService" })

// ─── Types ───────────────────────────────────────────────────────────────────

export type BulkOperationStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "PARTIAL" | "FAILED"

export interface BulkOperationResult {
  operationId: string
  status: BulkOperationStatus
  totalItems: number
  successCount: number
  failureCount: number
  results: BulkItemResult[]
  startedAt: Date
  completedAt: Date | null
  errors: string[]
}

export interface BulkItemResult {
  itemId: string
  success: boolean
  message?: string
  data?: Record<string, unknown>
  error?: string
}

export interface BulkPositionCloseInput {
  positionId: string
  tradingAccountId: string
  closeQuantity?: number
  exitPrice?: number
  reason: PositionClosureContext
}

export interface BulkPositionModifyInput {
  positionId: string
  tradingAccountId: string
  updates: {
    stopLoss?: number | null
    target?: number | null
  }
}

export interface BulkOrderCancelInput {
  orderId: string
  tradingAccountId: string
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class BulkOperationsService {
  private positionService = createPositionManagementService()
  private orderService = createOrderExecutionService()

  /**
   * Bulk close multiple positions
   */
  async bulkClosePositions(
    items: BulkPositionCloseInput[],
    adminUserId: string,
    options: {
      stopOnFirstError?: boolean
      batchSize?: number
      delayBetweenBatchesMs?: number
    } = {}
  ): Promise<BulkOperationResult> {
    const operationId = `bulk-close-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const startedAt = new Date()
    const {
      stopOnFirstError = false,
      batchSize = 10,
      delayBetweenBatchesMs = 100,
    } = options

    log.info(
      { operationId, totalItems: items.length, adminUserId },
      "Starting bulk position close"
    )

    const results: BulkItemResult[] = []
    const errors: string[] = []
    let successCount = 0
    let failureCount = 0

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)

      for (const item of batch) {
        if (stopOnFirstError && errors.length > 0) break

        try {
          const result = await this.positionService.closePosition(
            item.positionId,
            item.tradingAccountId,
            item.exitPrice,
            item.closeQuantity,
            {
              ...item.reason,
              closedByUserId: adminUserId,
            }
          )

          results.push({
            itemId: item.positionId,
            success: true,
            message: result.message,
            data: {
              exitPrice: result.exitPrice,
              realizedPnL: result.realizedPnL,
              closedQuantity: result.closedQuantity,
              remainingQuantity: result.remainingQuantity,
            },
          })
          successCount++
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          results.push({
            itemId: item.positionId,
            success: false,
            error: errorMsg,
          })
          errors.push(`Position ${item.positionId}: ${errorMsg}`)
          failureCount++

          log.error(
            { operationId, positionId: item.positionId, error: errorMsg },
            "Bulk close failed for position"
          )
        }
      }

      // Delay between batches to avoid rate limiting
      if (i + batchSize < items.length && delayBetweenBatchesMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatchesMs))
      }
    }

    const completedAt = new Date()
    const status: BulkOperationResult["status"] =
      failureCount === 0
        ? "COMPLETED"
        : failureCount === items.length
          ? "FAILED"
          : "PARTIAL"

    log.info(
      {
        operationId,
        status,
        successCount,
        failureCount,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
      "Bulk position close completed"
    )

    return {
      operationId,
      status,
      totalItems: items.length,
      successCount,
      failureCount,
      results,
      startedAt,
      completedAt,
      errors,
    }
  }

  /**
   * Bulk modify multiple positions (SL/TP)
   */
  async bulkModifyPositions(
    items: BulkPositionModifyInput[],
    adminUserId: string,
    options: {
      stopOnFirstError?: boolean
      batchSize?: number
      delayBetweenBatchesMs?: number
    } = {}
  ): Promise<BulkOperationResult> {
    const operationId = `bulk-modify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const startedAt = new Date()
    const {
      stopOnFirstError = false,
      batchSize = 20,
      delayBetweenBatchesMs = 50,
    } = options

    log.info(
      { operationId, totalItems: items.length, adminUserId },
      "Starting bulk position modify"
    )

    const results: BulkItemResult[] = []
    const errors: string[] = []
    let successCount = 0
    let failureCount = 0

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)

      for (const item of batch) {
        if (stopOnFirstError && errors.length > 0) break

        try {
          const result = await this.positionService.updatePosition(
            item.positionId,
            item.updates
          )

          results.push({
            itemId: item.positionId,
            success: true,
            message: result.message,
            data: {
              updatedFields: Object.keys(item.updates),
            },
          })
          successCount++
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          results.push({
            itemId: item.positionId,
            success: false,
            error: errorMsg,
          })
          errors.push(`Position ${item.positionId}: ${errorMsg}`)
          failureCount++

          log.error(
            { operationId, positionId: item.positionId, error: errorMsg },
            "Bulk modify failed for position"
          )
        }
      }

      if (i + batchSize < items.length && delayBetweenBatchesMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatchesMs))
      }
    }

    const completedAt = new Date()
    const status: BulkOperationResult["status"] =
      failureCount === 0
        ? "COMPLETED"
        : failureCount === items.length
          ? "FAILED"
          : "PARTIAL"

    log.info(
      {
        operationId,
        status,
        successCount,
        failureCount,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
      "Bulk position modify completed"
    )

    return {
      operationId,
      status,
      totalItems: items.length,
      successCount,
      failureCount,
      results,
      startedAt,
      completedAt,
      errors,
    }
  }

  /**
   * Bulk cancel multiple pending orders
   */
  async bulkCancelOrders(
    items: BulkOrderCancelInput[],
    adminUserId: string,
    options: {
      stopOnFirstError?: boolean
      batchSize?: number
      delayBetweenBatchesMs?: number
    } = {}
  ): Promise<BulkOperationResult> {
    const operationId = `bulk-cancel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const startedAt = new Date()
    const {
      stopOnFirstError = false,
      batchSize = 25,
      delayBetweenBatchesMs = 50,
    } = options

    log.info(
      { operationId, totalItems: items.length, adminUserId },
      "Starting bulk order cancel"
    )

    const results: BulkItemResult[] = []
    const errors: string[] = []
    let successCount = 0
    let failureCount = 0

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)

      for (const item of batch) {
        if (stopOnFirstError && errors.length > 0) break

        try {
          const result = await this.orderService.cancelOrder(item.orderId)

          results.push({
            itemId: item.orderId,
            success: true,
            message: result.message,
          })
          successCount++
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          results.push({
            itemId: item.orderId,
            success: false,
            error: errorMsg,
          })
          errors.push(`Order ${item.orderId}: ${errorMsg}`)
          failureCount++

          log.error(
            { operationId, orderId: item.orderId, error: errorMsg },
            "Bulk cancel failed for order"
          )
        }
      }

      if (i + batchSize < items.length && delayBetweenBatchesMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatchesMs))
      }
    }

    const completedAt = new Date()
    const status: BulkOperationResult["status"] =
      failureCount === 0
        ? "COMPLETED"
        : failureCount === items.length
          ? "FAILED"
          : "PARTIAL"

    log.info(
      {
        operationId,
        status,
        successCount,
        failureCount,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
      "Bulk order cancel completed"
    )

    return {
      operationId,
      status,
      totalItems: items.length,
      successCount,
      failureCount,
      results,
      startedAt,
      completedAt,
      errors,
    }
  }

  /**
   * Get positions aggregation by user, symbol, or segment
   */
  async getPositionsAggregation(params: {
    groupBy: "user" | "symbol" | "segment" | "productType"
    filters?: {
      userId?: string
      tradingAccountId?: string
      openOnly?: boolean
      fromDate?: Date
      toDate?: Date
    }
  }): Promise<Record<string, {
    count: number
    totalQuantity: number
    totalUnrealizedPnL: number
    totalRealizedPnL: number
  }>> {
    const { groupBy, filters = {} } = params

    const where: Record<string, unknown> = {}

    if (filters.tradingAccountId) where.tradingAccountId = filters.tradingAccountId
    if (filters.openOnly) where.quantity = { not: 0 }
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {}
      if (filters.fromDate) (where.createdAt as Record<string, Date>).gte = filters.fromDate
      if (filters.toDate) (where.createdAt as Record<string, Date>).lte = filters.toDate
    }

    const positions = await prisma.position.findMany({
      where,
      select: {
        symbol: true,
        segment: true,
        productType: true,
        quantity: true,
        unrealizedPnL: true,
        tradingAccount: {
          select: {
            userId: true,
          },
        },
      },
    })

    // Group by specified field
    const groups: Record<string, {
      count: number
      totalQuantity: number
      totalUnrealizedPnL: number
      totalRealizedPnL: number
    }> = {}

    for (const pos of positions) {
      let key: string
      switch (groupBy) {
        case "user":
          key = pos.tradingAccount.userId || "unknown"
          break
        case "symbol":
          key = pos.symbol
          break
        case "segment":
          key = pos.segment || "unknown"
          break
        case "productType":
          key = pos.productType
          break
      }

      if (!groups[key]) {
        groups[key] = { count: 0, totalQuantity: 0, totalUnrealizedPnL: 0, totalRealizedPnL: 0 }
      }

      groups[key].count++
      groups[key].totalQuantity += Number(pos.quantity) || 0
      groups[key].totalUnrealizedPnL += Number(pos.unrealizedPnL) || 0
    }

    return groups
  }

  /**
   * Get order analytics summary
   */
  async getOrderAnalytics(params: {
    fromDate?: Date
    toDate?: Date
    userId?: string
    symbol?: string
  }): Promise<{
    totalOrders: number
    pendingOrders: number
    executedOrders: number
    cancelledOrders: number
    rejectedOrders: number
    fillRate: number
    avgExecutionTimeMs: number | null
    topSymbols: Array<{ symbol: string; count: number }>
    failureReasons: Array<{ reason: string; count: number }>
  }> {
    const where: Record<string, unknown> = {}

    if (params.userId) where.tradingAccount = { userId: params.userId }
    if (params.symbol) where.symbol = { contains: params.symbol, mode: "insensitive" }
    if (params.fromDate || params.toDate) {
      where.createdAt = {}
      if (params.fromDate) (where.createdAt as Record<string, Date>).gte = params.fromDate
      if (params.toDate) (where.createdAt as Record<string, Date>).lte = params.toDate
    }

    const [orders, statusCounts, symbols, failures] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          status: true,
          executedAt: true,
          createdAt: true,
          failureReason: true,
        },
      }),
      prisma.order.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
      prisma.order.groupBy({
        by: ["symbol"],
        where,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      prisma.order.findMany({
        where: { ...where, status: "CANCELLED" },
        select: { failureReason: true },
      }),
    ])

    const statusMap = statusCounts.reduce(
      (acc, s) => {
        acc[s.status] = s._count
        return acc
      },
      {} as Record<string, number>
    )

    const totalOrders = orders.length
    const pendingOrders = statusMap["PENDING"] || 0
    const executedOrders = statusMap["EXECUTED"] || 0
    const cancelledOrders = statusMap["CANCELLED"] || 0
    const rejectedOrders = 0 // Add rejected status if needed

    const executedOrdersWithTime = orders.filter(
      (o) => o.status === "EXECUTED" && o.executedAt && o.createdAt
    )
    const avgExecutionTimeMs =
      executedOrdersWithTime.length > 0
        ? executedOrdersWithTime.reduce((sum, o) => {
            const exec = new Date(o.executedAt!).getTime()
            const created = new Date(o.createdAt).getTime()
            return sum + (exec - created)
          }, 0) / executedOrdersWithTime.length
        : null

    const fillRate = totalOrders > 0 ? (executedOrders / totalOrders) * 100 : 0

    const failureReasons: Record<string, number> = {}
    for (const order of failures) {
      if (order.failureReason) {
        failureReasons[order.failureReason] =
          (failureReasons[order.failureReason] || 0) + 1
      }
    }

    const topSymbols = symbols.map((s) => ({
      symbol: s.symbol,
      count: s._count.id,
    }))

    return {
      totalOrders,
      pendingOrders,
      executedOrders,
      cancelledOrders,
      rejectedOrders,
      fillRate,
      avgExecutionTimeMs,
      topSymbols,
      failureReasons: Object.entries(failureReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    }
  }
}

// Singleton
let bulkService: BulkOperationsService | null = null

export function getBulkOperationsService(): BulkOperationsService {
  if (!bulkService) {
    bulkService = new BulkOperationsService()
  }
  return bulkService
}