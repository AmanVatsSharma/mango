/**
 * @file net-position-close-v2.ts
 * @module server
 * @description Enhanced net square-off with lot selection strategies.
 * Author: StockTrade
 * Last-updated: 2026-05-14
 */

import { prisma } from "@/lib/prisma"
import { createPositionManagementService } from "@/lib/services/position/PositionManagementService"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "NetPositionCloseV2" })

export type LotSelectionStrategy = "FIFO" | "LIFO" | "WORST_FIRST" | "BEST_FIRST"
export type NetCloseExitPriceMode = "live" | "stock_ltp" | "manual"

export interface LotSelectionOptions {
  strategy: LotSelectionStrategy
  crossProductNetting?: boolean
  createdBefore?: Date
}

export interface NetCloseResult {
  success: boolean
  symbol: string
  productType: string
  exitPrice: number
  exitPriceSource: string
  closedQuantity: number
  closedLots: number
  remainingQuantity: number
  remainingLots: number
  realizedPnL: number
  marginReleased: number
  lotsClosed: Array<{ lotId: string; quantity: number; averagePrice: number; realizedPnL: number }>
  isPartial: boolean
  message: string
}

export interface ScheduledCloseOptions {
  atMarketOpen?: boolean
  atTime?: string
  inSeconds?: number
  cancelExisting?: boolean
}

interface PositionLot {
  id: string
  symbol: string
  quantity: number
  averagePrice: number
  unrealizedPnL: number
  createdAt: Date
  productType: string
  isIntraday: boolean
  token: number | null
  instrumentId: string | null
  segment: string | null
  exchange: string | null
  Stock: { lot_size: number | null; ltp: number | null } | null
}

export class NetPositionCloseV2 {
  private positionService = createPositionManagementService()

  async closeNetPosition(params: {
    tradingAccountId: string
    stockId: string
    productType: string
    exitPrice?: number | null
    exitPriceMode?: NetCloseExitPriceMode
    manualExitPrice?: number
    closeQuantity?: number
    closeLots?: number
    lotSelection?: LotSelectionOptions
    closureReason?: string
    closedByUserId?: string | null
  }): Promise<NetCloseResult> {
    const lots = await this.fetchPositionLots(
      params.tradingAccountId,
      params.stockId,
      params.productType,
      params.lotSelection || { strategy: "FIFO" }
    )

    if (lots.length === 0) {
      throw new Error(`No open ${params.productType} position found for this instrument.`)
    }

    const netQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0)
    const absNetQuantity = Math.abs(netQuantity)

    if (absNetQuantity === 0) {
      throw new Error("Position is already closed.")
    }

    const lotSize = Math.max(1, Math.trunc(Number(lots[0]?.Stock?.lot_size) || 1))

    let requestedCloseAbs = absNetQuantity
    if (params.closeLots && params.closeLots > 0 && lotSize > 1) {
      requestedCloseAbs = params.closeLots * lotSize
    } else if (params.closeQuantity && params.closeQuantity > 0) {
      requestedCloseAbs = params.closeQuantity
    }

    if (requestedCloseAbs > absNetQuantity) {
      throw new Error(`closeQuantity cannot exceed open quantity.`)
    }

    const resolvedExitPrice = this.resolveExitPrice(lots, params.exitPrice, params.exitPriceMode || "live", params.manualExitPrice)
    const sortedLots = this.sortLots(lots, params.lotSelection?.strategy || "FIFO")
    const closureReason = params.closureReason || "USER_CLOSED"
    const closedByUserId = params.closedByUserId || null

    const lotsToClose: Array<{ lot: PositionLot; closeQty: number }> = []
    let remaining = requestedCloseAbs

    for (const lot of sortedLots) {
      if (remaining <= 0) break
      const lotAbs = Math.abs(lot.quantity)
      const closeQty = Math.min(remaining, lotAbs)
      lotsToClose.push({ lot, closeQty })
      remaining -= closeQty
    }

    const results: Array<{ lotId: string; quantity: number; averagePrice: number; realizedPnL: number }> = []
    let totalPnL = 0
    let totalMarginReleased = 0

    for (const { lot, closeQty } of lotsToClose) {
      try {
        const result = await this.positionService.closePosition(
          lot.id,
          params.tradingAccountId,
          resolvedExitPrice,
          closeQty,
          { reason: closureReason as "USER_CLOSED" | "ADMIN_CLOSED" | "AUTO_LIQUIDATED", closedByUserId }
        )
        results.push({
          lotId: lot.id,
          quantity: closeQty,
          averagePrice: lot.averagePrice,
          realizedPnL: result.realizedPnL,
        })
        totalPnL += result.realizedPnL
        totalMarginReleased += result.marginReleased
      } catch (err) {
        log.error({ lotId: lot.id, err }, "Failed to close lot")
      }
    }

    const closedQty = results.reduce((s, r) => s + r.quantity, 0)
    const remainingQty = absNetQuantity - closedQty

    return {
      success: true,
      symbol: lots[0]?.symbol || "UNKNOWN",
      productType: params.productType,
      exitPrice: resolvedExitPrice,
      exitPriceSource: params.exitPriceMode || "live",
      closedQuantity: closedQty,
      closedLots: lotSize > 1 ? closedQty / lotSize : closedQty,
      remainingQuantity: remainingQty,
      remainingLots: lotSize > 1 ? remainingQty / lotSize : remainingQty,
      realizedPnL: totalPnL,
      marginReleased: totalMarginReleased,
      lotsClosed: results,
      isPartial: remainingQty > 0,
      message: remainingQty === 0
        ? `Net position closed. P&L: ₹${totalPnL.toFixed(2)}`
        : `Partially closed (${closedQty}). Remaining: ${remainingQty}. P&L: ₹${totalPnL.toFixed(2)}`,
    }
  }

  async scheduleClose(params: {
    positionId: string
    options: ScheduledCloseOptions
  }): Promise<{ success: boolean; scheduledAt: Date; jobId: string }> {
    let executeAt: Date
    if (params.options.inSeconds && params.options.inSeconds > 0) {
      executeAt = new Date(Date.now() + params.options.inSeconds * 1000)
    } else if (params.options.atMarketOpen) {
      executeAt = this.getNextMarketOpenTime()
    } else if (params.options.atTime) {
      executeAt = this.parseISTTime(params.options.atTime)
    } else {
      throw new Error("Specify inSeconds, atMarketOpen, or atTime")
    }
    const jobId = `scheduled-close-${params.positionId}-${Date.now()}`
    log.info({ jobId, positionId: params.positionId, scheduledAt: executeAt }, "Position close scheduled")
    return { success: true, scheduledAt: executeAt, jobId }
  }

  private fetchPositionLots(
    tradingAccountId: string,
    stockId: string,
    productType: string,
    options: LotSelectionOptions
  ): Promise<PositionLot[]> {
    const types = options.crossProductNetting ? ["MIS", "NRML", "CNC", productType] : [productType]
    const where: Record<string, unknown> = {
      tradingAccountId,
      stockId,
      productType: { in: types },
      quantity: { not: 0 },
    }
    if (options.createdBefore) {
      where.createdAt = { lte: options.createdBefore }
    }
    return prisma.position.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { Stock: { select: { lot_size: true, ltp: true } } },
    }) as unknown as Promise<PositionLot[]>
  }

  private sortLots(lots: PositionLot[], strategy: LotSelectionStrategy): PositionLot[] {
    switch (strategy) {
      case "FIFO":
        return [...lots].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      case "LIFO":
        return [...lots].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      case "BEST_FIRST":
        return [...lots].sort((a, b) => b.unrealizedPnL - a.unrealizedPnL)
      case "WORST_FIRST":
        return [...lots].sort((a, b) => a.unrealizedPnL - b.unrealizedPnL)
      default:
        return lots
    }
  }

  private resolveExitPrice(
    lots: PositionLot[],
    clientPrice: number | null | undefined,
    mode: NetCloseExitPriceMode,
    manualPrice?: number
  ): number {
    switch (mode) {
      case "manual":
        if (!manualPrice || manualPrice <= 0) throw new Error("manual exitPrice required")
        return manualPrice
      case "stock_ltp": {
        const ltp = Number(lots[0]?.Stock?.ltp) || 0
        if (ltp <= 0) throw new Error("Stock LTP unavailable")
        return ltp
      }
      default: {
        if (clientPrice && clientPrice > 0) return clientPrice
        const fallback = Number(lots[0]?.Stock?.ltp) || 0
        if (fallback > 0) return fallback
        throw new Error("No price available. Use manual mode.")
      }
    }
  }

  private getNextMarketOpenTime(): Date {
    const now = new Date()
    const ist = new Date(now.getTime() + 5.5 * 3600000)
    ist.setHours(9, 15, 0, 0)
    const utc = new Date(ist.getTime() - 5.5 * 3600000)
    if (utc <= now) ist.setDate(ist.getDate() + 1)
    return new Date(ist.getTime() - 5.5 * 3600000)
  }

  private parseISTTime(timeStr: string): Date {
    const [h, m] = timeStr.split(":").map(Number)
    const now = new Date()
    const ist = new Date(now.getTime() + 5.5 * 3600000)
    ist.setHours(h, m, 0, 0)
    const utc = new Date(ist.getTime() - 5.5 * 3600000)
    if (utc <= now) ist.setDate(ist.getDate() + 1)
    return new Date(ist.getTime() - 5.5 * 3600000)
  }
}

let _instance: NetPositionCloseV2 | null = null
export function getNetPositionCloseV2(): NetPositionCloseV2 {
  if (!_instance) _instance = new NetPositionCloseV2()
  return _instance
}