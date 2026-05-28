/**
 * @file PositionManagementService.ts
 * @module position
 * @description Position lifecycle service with atomic close/update flows and P&L calculations.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-31
 * @updated 2026-04-08 — Margin release uses opening-side risk row for options (NRML_OPT_BUY vs SELL).
 * @updated 2026-04-20 — Migrate console.* calls to Pino logger.
 */

import { executeInTransaction } from "@/lib/services/utils/prisma-transaction"
import { PositionRepository } from "@/lib/repositories/PositionRepository"
import { OrderRepository } from "@/lib/repositories/OrderRepository"
import { TransactionRepository } from "@/lib/repositories/TransactionRepository"
import { FundManagementService } from "@/lib/services/funds/FundManagementService"
import { MarginCalculator } from "@/lib/services/risk/MarginCalculator"
import { marginRiskSideForPositionCloseOpening } from "@/lib/services/risk/risk-margin-side"
import { TradingLogger } from "@/lib/services/logging/TradingLogger"
import { OrderType, OrderSide, OrderPurpose, OrderStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
// Trading-upr: invalidate the per-user daily-PnL cache when a position closes so the
// next order admission sees the freshly realized PnL instead of the 5s-stale value.
import { bustDailyPnLCache } from "@/lib/services/risk/daily-loss-summary"
import { parseFinitePositionNumber } from "@/lib/services/position/position-number-utils"
import { getBaseUrl } from "@/Branding"
import { resolvePositionProductType } from "@/lib/services/position/position-product-type-utils"
import { normalizeQuotePrices } from "@/lib/services/position/quote-normalizer"
import { baseLogger } from "@/lib/observability/logger"

const logger = baseLogger.child({ module: "PositionManagementService" })

logger.info({}, "Module loaded")

const POSITION_CLOSE_ADVISORY_LOCK_NS = 910_002

export interface ClosePositionResult {
  success: boolean
  positionId: string
  exitOrderId: string
  realizedPnL: number
  exitPrice: number
  marginReleased: number
  closedQuantity: number
  remainingQuantity: number
  isPartial: boolean
  closedLots: number | null
  remainingLots: number | null
  message: string
}

/**
 * Closure reason codes. Written to `Position.closureReason` when a position
 * is fully closed so the admin blotter can tell user vs admin vs auto-liquidation
 * apart without having to reverse-engineer it from Order.closeMetadata.
 */
export type ClosureReason =
  | "USER_CLOSED"        // Retail user closed via /api/trading/positions
  | "ADMIN_CLOSED"       // Admin force-close or net-close
  | "AUTO_LIQUIDATED"    // Risk monitor / margin liquidator
  | "EXPIRY_SQUAREOFF"   // Expiry-day squareoff job
  | "SYSTEM_CLOSED"      // Queued worker close without explicit context
  | "MANUAL_OTHER"       // Fallback when caller omits closureContext (warns)

export interface PositionClosureContext {
  reason: ClosureReason
  closedByUserId?: string | null
  note?: string | null
}

export interface UpdatePositionResult {
  success: boolean
  positionId: string
  message: string
}

export type QueuedCloseFillResult =
  | { kind: "executed"; userId?: string; symbol: string; quantity: number; orderSide: OrderSide }
  | { kind: "skipped"; reason: "not_pending" | "wrong_purpose" | "lock_not_acquired" | "already_closed" }
  | { kind: "cancelled"; code: string; reason: string }

function shortOrderRef(id: string): string {
  if (!id || typeof id !== "string") return "unknown"
  return id.length > 8 ? id.slice(-8) : id
}

export class PositionManagementService {
  private positionRepo: PositionRepository
  private orderRepo: OrderRepository
  private transactionRepo: TransactionRepository
  private fundService: FundManagementService
  private marginCalculator: MarginCalculator
  private logger: TradingLogger

  /**
   * Compute a deterministic advisory lock key for position close.
   * Uses `pg_try_advisory_xact_lock(bigint)` so the lock is held only for the transaction.
   */
  private buildPositionCloseAdvisoryLockSql(positionId: string): Prisma.Sql {
    return Prisma.sql`
      SELECT pg_try_advisory_xact_lock(
        ((${POSITION_CLOSE_ADVISORY_LOCK_NS}::bigint << 32) | (hashtext(${positionId}::text)::bigint & 4294967295))
      ) AS locked
    `
  }

  constructor(tradingLogger?: TradingLogger) {
    this.positionRepo = new PositionRepository()
    this.orderRepo = new OrderRepository()
    this.transactionRepo = new TransactionRepository()
    this.marginCalculator = new MarginCalculator()
    this.logger = tradingLogger || new TradingLogger()
    this.fundService = new FundManagementService(this.logger)

    logger.info({}, "Service instance created")
  }

  private async resolveReferencePriceForPosition(position: any): Promise<number> {
    const instrumentId =
      typeof position?.Stock?.instrumentId === "string" ? position.Stock.instrumentId.trim() : ""
    const averagePrice = parseFinitePositionNumber(position?.averagePrice) ?? 0

    if (instrumentId.length > 0) {
      try {
        const livePrice = await this.getCurrentPrice(instrumentId)
        if (livePrice > 0) {
          return livePrice
        }
      } catch (error) {
        logger.warn(
          { positionId: position?.id, instrumentId, message: (error as any)?.message || String(error) },
          "Live reference price fetch failed, using fallback",
        )
      }
    }

    if (averagePrice > 0) {
      return averagePrice
    }

    throw new Error("Unable to determine reference price for SL/Target validation")
  }

  private validateDirectionalStopsForPosition(input: {
    quantity: number
    referencePrice: number
    stopLoss?: number | null
    target?: number | null
  }): void {
    const { quantity, referencePrice, stopLoss, target } = input
    if (!Number.isFinite(quantity) || quantity === 0) return
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) return

    if (quantity > 0) {
      if (stopLoss != null && stopLoss >= referencePrice) {
        throw new Error("For LONG positions, stop-loss must be below current price.")
      }
      if (target != null && target <= referencePrice) {
        throw new Error("For LONG positions, target must be above current price.")
      }
      if (stopLoss != null && target != null && stopLoss >= target) {
        throw new Error("For LONG positions, stop-loss must be below target.")
      }
      return
    }

    if (stopLoss != null && stopLoss <= referencePrice) {
      throw new Error("For SHORT positions, stop-loss must be above current price.")
    }
    if (target != null && target >= referencePrice) {
      throw new Error("For SHORT positions, target must be below current price.")
    }
    if (stopLoss != null && target != null && target >= stopLoss) {
      throw new Error("For SHORT positions, target must be below stop-loss.")
    }
  }

  /**
   * Close a position
   * - Fetches current LTP (or uses provided price)
   * - Calculates P&L
   * - Creates exit order
   * - Releases margin
   * - Credits/Debits P&L
   */
  async closePosition(
    positionId: string,
    tradingAccountId: string,
    exitPriceOverride?: number,  // Optional: Use this price instead of fetching live data
    closeQuantityOverride?: number, // Optional: absolute quantity to close for partial exits
    closureContext?: PositionClosureContext, // Optional: reason + actor + note written to Position on full close
  ): Promise<ClosePositionResult> {
    logger.info({ positionId, tradingAccountId, closureContext }, "Closing position")
    if (!closureContext) {
      logger.warn({ positionId }, "closePosition called without closureContext — defaulting to MANUAL_OTHER")
    }
    const resolvedClosureContext: PositionClosureContext =
      closureContext ?? { reason: "MANUAL_OTHER" }

    await this.logger.logPosition("POSITION_CLOSE_START", `Closing position: ${positionId}`, {
      positionId,
      tradingAccountId
    })

    try {
      // Step 1: Get position details
      const position = await this.positionRepo.findById(positionId)

      if (!position) {
        logger.error({ positionId }, "Position not found")
        throw new Error("Position not found")
      }

      if (position.quantity === 0) {
        logger.warn({ positionId }, "Position already closed; skipping")
        return {
          success: true,
          positionId,
          exitOrderId: "",
          realizedPnL: 0,
          exitPrice: exitPriceOverride && exitPriceOverride > 0 ? exitPriceOverride : 0,
          marginReleased: 0,
          closedQuantity: 0,
          remainingQuantity: 0,
          isPartial: false,
          closedLots: null,
          remainingLots: null,
          message: "Position already closed; skipped",
        }
      }

      logger.info(
        { positionId, symbol: position.symbol, quantity: position.quantity, averagePrice: parseFinitePositionNumber(position.averagePrice) ?? 0 },
        "Position found",
      )

      // Step 2: Get current LTP (exit price)
      let exitPrice: number
      const normalizedExitPriceOverride = parseFinitePositionNumber(exitPriceOverride)
      
      if (normalizedExitPriceOverride !== null && normalizedExitPriceOverride > 0) {
        logger.info({ positionId, exitPrice: normalizedExitPriceOverride }, "Using provided exit price")
        exitPrice = normalizedExitPriceOverride
      } else {
        try {
          exitPrice = await this.getCurrentPrice(position.Stock?.instrumentId || '')
          logger.info({ positionId, exitPrice }, "Exit price from market data")
        } catch (error: any) {
          logger.warn({ positionId, symbol: position.symbol }, "Failed to fetch live price, using fallback")

          // Fallback to position's Stock LTP or average price
          const stockLtp = parseFinitePositionNumber(position.Stock?.ltp)
          const avgPriceFallback = parseFinitePositionNumber(position.averagePrice) ?? 0
          exitPrice = stockLtp !== null && stockLtp > 0 ? stockLtp : avgPriceFallback

          if (!exitPrice || exitPrice <= 0) {
            throw new Error("Unable to determine exit price. Please try again or specify a price.")
          }

          logger.info({ positionId, exitPrice }, "Using fallback exit price")
        }
      }

      // Step 3: Apply synthetic bid/ask spread — BUY closes at ASK (higher), SELL closes at BID (lower).
      // Mirrors MarketRealismService.applyBidAskSpread so close price is consistent with order fills.
      if (exitPrice > 0) {
        const positionQty = Math.trunc(parseFinitePositionNumber(position.quantity) ?? 0)
        try {
          const { loadMarketControlConfig } = await import("@/lib/market-control/market-control-loader")
          const cfg = await loadMarketControlConfig()
          const segKey = (position.Stock?.segment || "NSE").toUpperCase()
          const segRule = cfg.segments[segKey] ?? cfg.segments["DEFAULT"] ?? { spread: { min: 0.05, max: 0.20 } }
          const spreadPct =
            segRule.spread.min +
            Math.random() * Math.max(0, segRule.spread.max - segRule.spread.min)
          const halfSpread = spreadPct / 2 / 100
          const exitSide = positionQty > 0 ? "SELL" : "BUY"
          exitPrice =
            exitSide === "SELL"
              ? Number((exitPrice * (1 - halfSpread)).toFixed(2))
              : Number((exitPrice * (1 + halfSpread)).toFixed(2))
          logger.info(
            { positionId, exitPrice, rawPrice: normalizedExitPriceOverride, spreadPct, exitSide },
            "Bid/ask spread applied to exit price",
          )
        } catch (err) {
          logger.warn({ positionId, err }, "Failed to apply spread to exit price; using raw price")
        }
      }

      // Step 4: Resolve close quantity (full vs partial)
      const quantity = Math.trunc(parseFinitePositionNumber(position.quantity) ?? 0)
      const avgPrice = parseFinitePositionNumber(position.averagePrice) ?? 0
      const absoluteOpenQuantity = Math.abs(quantity)
      if (absoluteOpenQuantity <= 0) {
        throw new Error("Position already closed")
      }

      const lotSize = Math.max(1, Math.trunc(parseFinitePositionNumber(position.Stock?.lot_size) ?? 1))
      const normalizedCloseQuantityOverride = parseFinitePositionNumber(closeQuantityOverride)
      let closeQuantityAbs = absoluteOpenQuantity
      if (normalizedCloseQuantityOverride !== null) {
        if (!Number.isInteger(normalizedCloseQuantityOverride) || normalizedCloseQuantityOverride <= 0) {
          throw new Error("closeQuantity must be a positive integer")
        }
        closeQuantityAbs = Math.trunc(normalizedCloseQuantityOverride)
      }
      if (closeQuantityAbs > absoluteOpenQuantity) {
        throw new Error(`closeQuantity cannot exceed open quantity (${absoluteOpenQuantity})`)
      }
      if (lotSize > 1 && closeQuantityAbs % lotSize !== 0) {
        throw new Error(`closeQuantity must be a multiple of lot size (${lotSize})`)
      }

      const signedCloseQuantity = quantity > 0 ? closeQuantityAbs : -closeQuantityAbs
      const remainingQuantity = quantity - signedCloseQuantity
      const isPartialClose = Math.abs(remainingQuantity) > 0
      const realizedPnL = (exitPrice - avgPrice) * signedCloseQuantity

      logger.info(
        { positionId, exitPrice, avgPrice, quantity, closeQuantityAbs, remainingQuantity, isPartialClose, realizedPnL },
        "P&L calculation",
      )

      await this.logger.logPosition("PNL_CALCULATED", "P&L calculated", {
        positionId,
        exitPrice,
        avgPrice,
        closeQuantityAbs,
        remainingQuantity,
        realizedPnL
      })

      // Step 4: Calculate margin to release
      const turnover = closeQuantityAbs * avgPrice
      const segment = position.Stock?.segment || 'NSE'
      const productTypeResolution = resolvePositionProductType({
        quantity,
        orders: position.orders,
        defaultProductType: position.productType || "MIS",
      })
      const productType = productTypeResolution.productType

      if (productTypeResolution.source === "entry_executed_order") {
        logger.info(
          { positionId, orderId: productTypeResolution.orderId, productType, entrySide: productTypeResolution.entrySide },
          "Found productType from entry-side executed order",
        )
      } else if (productTypeResolution.source === "latest_executed_order") {
        logger.info(
          { positionId, orderId: productTypeResolution.orderId, productType },
          "Using productType from latest executed order",
        )
      } else {
        logger.warn({ positionId, productType }, "No executed order found, using default productType")
      }

      logger.info(
        { positionId, segment, productType, quantity: closeQuantityAbs, avgPrice, turnover },
        "Calculating margin release",
      )
      
      const exitOrderSide = quantity > 0 ? "SELL" : "BUY"
      const marginCalc = await this.marginCalculator.calculateMargin(
        segment,
        productType,
        closeQuantityAbs,
        avgPrice,
        parseFinitePositionNumber(position.Stock?.lot_size) ?? 1,
        exitOrderSide,
        {
          optionType: position.Stock?.optionType,
          marginRiskSide: marginRiskSideForPositionCloseOpening(quantity),
        },
      )

      const marginToRelease = marginCalc.requiredMargin

      logger.info(
        { positionId, marginToRelease, productType, leverage: marginCalc.leverage, turnover },
        "Margin to release",
      )

      // Step 5: Execute in transaction
      type ClosePositionTxResult =
        | { skipped: true; exitOrderId: ""; reason: "lock_not_acquired" | "already_closed" }
        | { skipped: false; exitOrderId: string; realizedPnL: number; remainingQuantity: number }

      const result: ClosePositionTxResult = await executeInTransaction(async (tx) => {
        // Advisory lock (per-position) to keep close idempotent across UI + worker + cron.
        const lockRows = await tx.$queryRaw<{ locked: boolean }[]>(
          this.buildPositionCloseAdvisoryLockSql(positionId)
        )
        const locked = lockRows?.[0]?.locked === true
        if (!locked) {
          logger.warn({ positionId }, "Close lock not acquired; skipping")
          return { exitOrderId: "", skipped: true, reason: "lock_not_acquired" }
        }

        const fresh = await tx.position.findUnique({
          where: { id: positionId },
          select: { quantity: true, unrealizedPnL: true, dayPnL: true },
        })
        if (!fresh) {
          throw new Error("Position not found")
        }
        const freshQuantity = Math.trunc(parseFinitePositionNumber(fresh.quantity) ?? 0)
        if (freshQuantity === 0) {
          logger.warn({ positionId }, "Position already closed under lock; skipping")
          return { exitOrderId: "", skipped: true, reason: "already_closed" }
        }
        const freshAbsoluteQuantity = Math.abs(freshQuantity)
        if (closeQuantityAbs > freshAbsoluteQuantity) {
          throw new Error(`closeQuantity cannot exceed open quantity (${freshAbsoluteQuantity})`)
        }
        if (lotSize > 1 && closeQuantityAbs % lotSize !== 0) {
          throw new Error(`closeQuantity must be a multiple of lot size (${lotSize})`)
        }

        const txSignedCloseQuantity = freshQuantity > 0 ? closeQuantityAbs : -closeQuantityAbs
        const txRemainingQuantity = freshQuantity - txSignedCloseQuantity
        const txRealizedPnL = (exitPrice - avgPrice) * txSignedCloseQuantity

        // Create exit order (opposite side)
        const exitSide = freshQuantity > 0 ? OrderSide.SELL : OrderSide.BUY
        
        logger.info({ positionId, exitSide }, "Creating exit order")

        // Verify stockId exists to prevent foreign key constraint errors
        if (!position.stockId) {
          logger.error({ positionId }, "Position has no stockId")
          throw new Error("Position data incomplete - missing stock reference")
        }
        
        const stockExists = await tx.stock.findUnique({
          where: { id: position.stockId },
          select: { id: true }
        })
        
        if (!stockExists) {
          logger.error({ positionId, stockId: position.stockId, symbol: position.symbol }, "Stock not found in database")
          throw new Error(`Stock not found: ${position.symbol}. Cannot close position.`)
        }
        
        const exitOrder = await this.orderRepo.create(
          {
            tradingAccountId,
            stockId: position.stockId,
            symbol: position.symbol,
            quantity: closeQuantityAbs,
            price: exitPrice,
            orderType: OrderType.MARKET,
            orderSide: exitSide,
            orderPurpose: OrderPurpose.CLOSE,
            productType,
            status: 'EXECUTED'
          },
          tx
        )

        // Mark order as executed immediately
        await this.orderRepo.markExecuted(
          exitOrder.id,
          closeQuantityAbs,
          exitPrice,
          tx
        )

        logger.info({ positionId, exitOrderId: exitOrder.id }, "Exit order created")

        if (txRemainingQuantity === 0) {
          // Close position (set quantity to 0)
          await this.positionRepo.close(positionId, txRealizedPnL, tx, resolvedClosureContext)
          logger.info({ positionId }, "Position marked as fully closed")
        } else {
          const currentUnrealized = parseFinitePositionNumber(fresh.unrealizedPnL) ?? 0
          const currentDayPnL = parseFinitePositionNumber(fresh.dayPnL) ?? currentUnrealized
          const unrealizedPerUnit = freshAbsoluteQuantity > 0 ? currentUnrealized / freshAbsoluteQuantity : 0
          const dayPnLPerUnit = freshAbsoluteQuantity > 0 ? currentDayPnL / freshAbsoluteQuantity : 0
          await this.positionRepo.update(
            positionId,
            {
              quantity: txRemainingQuantity,
              unrealizedPnL: unrealizedPerUnit * Math.abs(txRemainingQuantity),
              dayPnL: dayPnLPerUnit * Math.abs(txRemainingQuantity),
            },
            tx,
          )
          logger.info(
            { positionId, previousQuantity: freshQuantity, closeQuantity: txSignedCloseQuantity, remainingQuantity: txRemainingQuantity },
            "Position partially closed",
          )
        }

        // Release margin
        logger.info({ positionId, marginToRelease }, "Releasing margin")
        await this.fundService.releaseMarginTx(
          tx,
          tradingAccountId,
          marginToRelease,
          `Margin released for closed position ${position.symbol}`,
          { positionId, orderId: exitOrder.id }
        )

        // Credit or Debit P&L
        if (txRealizedPnL > 0) {
          logger.info({ positionId, realizedPnL: txRealizedPnL }, "Crediting profit")
          await this.fundService.creditTx(
            tx,
            tradingAccountId,
            Math.abs(txRealizedPnL),
            `Profit from ${position.symbol} position`,
            { positionId, orderId: exitOrder.id }
          )
        } else if (txRealizedPnL < 0) {
          logger.info({ positionId, realizedPnL: txRealizedPnL }, "Debiting loss")
          await this.fundService.debitTx(
            tx,
            tradingAccountId,
            Math.abs(txRealizedPnL),
            `Loss from ${position.symbol} position`,
            { positionId, orderId: exitOrder.id },
            { allowInsufficientAvailable: true },
          )
        }

        return {
          exitOrderId: exitOrder.id,
          realizedPnL: txRealizedPnL,
          remainingQuantity: txRemainingQuantity,
          skipped: false,
        }
      })

      if (result.skipped) {
        return {
          success: true,
          positionId,
          exitOrderId: "",
          realizedPnL: 0,
          exitPrice,
          marginReleased: 0,
          closedQuantity: 0,
          remainingQuantity: 0,
          isPartial: false,
          closedLots: null,
          remainingLots: null,
          message: "Position close skipped (already closing/closed).",
        }
      }

      await this.logger.logPosition("POSITION_CLOSED", `Position closed successfully: ${positionId}`, {
        positionId,
        realizedPnL: result.realizedPnL,
        closedQuantity: closeQuantityAbs,
        remainingQuantity: result.remainingQuantity,
        exitPrice,
        marginReleased: marginToRelease
      })

      // Trading-upr: bust the daily PnL cache so the next order admission sees the
      // freshly realized PnL instead of the stale 5s cached value. Best-effort: we don't
      // know the userId from the position alone but we can resolve it cheaply from the
      // tradingAccount row that's already loaded.
      try {
        const tradingAccount = await prisma.tradingAccount.findUnique({
          where: { id: tradingAccountId },
          select: { userId: true },
        })
        if (tradingAccount?.userId) {
          bustDailyPnLCache(tradingAccount.userId)
        }
      } catch (cacheBustErr) {
        // Cache invalidation failure is non-fatal — TTL will expire within 5s anyway.
        logger.warn({ err: cacheBustErr, positionId }, "Failed to bust daily PnL cache (non-fatal)")
      }

      const response: ClosePositionResult = {
        success: true,
        positionId,
        exitOrderId: result.exitOrderId,
        realizedPnL: result.realizedPnL,
        exitPrice,
        marginReleased: marginToRelease,
        closedQuantity: closeQuantityAbs,
        remainingQuantity: result.remainingQuantity,
        isPartial: result.remainingQuantity !== 0,
        closedLots: lotSize > 1 ? closeQuantityAbs / lotSize : null,
        remainingLots: lotSize > 1 ? Math.abs(result.remainingQuantity) / lotSize : null,
        message:
          result.remainingQuantity === 0
            ? `Position closed. P&L: ₹${result.realizedPnL.toFixed(2)}`
            : `Position partially closed (${closeQuantityAbs}). Remaining: ${Math.abs(result.remainingQuantity)}. Realized P&L: ₹${result.realizedPnL.toFixed(2)}`
      }

      logger.info({ positionId, tradingAccountId, response }, "Position closing completed")
      return response

    } catch (error: any) {
      logger.error({ positionId, tradingAccountId, error }, "Position closing failed")
      await this.logger.error("POSITION_CLOSE_FAILED", error.message, error, {
        positionId,
        tradingAccountId
      })
      throw error
    }
  }

  /**
   * Fills a pre-queued CLOSE-purpose `Order` row (PENDING) inside an existing transaction.
   * Caller must hold the order execution advisory lock. Acquires per-position close advisory lock here.
   */
  async applyQueuedCloseOrderFillTx(
    tx: Prisma.TransactionClient,
    input: {
      pendingOrderId: string
      executionPrice: number
      order: {
        id: string
        tradingAccountId: string
        symbol: string
        quantity: number
        orderSide: OrderSide
        orderType: OrderType
        productType: string
        status: OrderStatus
        orderPurpose: OrderPurpose
        positionId: string | null
        stockId: string | null
        tradingAccount?: { userId: string } | null
      }
    },
  ): Promise<QueuedCloseFillResult> {
    const { pendingOrderId, executionPrice } = input
    const order = input.order
    const tradingAccountId = order.tradingAccountId

    if (order.status !== OrderStatus.PENDING) {
      return { kind: "skipped", reason: "not_pending" }
    }
    if (order.orderPurpose !== OrderPurpose.CLOSE) {
      return { kind: "skipped", reason: "wrong_purpose" }
    }
    if (!order.positionId || !order.stockId) {
      return {
        kind: "cancelled",
        code: "CLOSE_ORDER_INVARIANT",
        reason: "Queued close order missing position or stock link.",
      }
    }
    const positionId = order.positionId

    if (!Number.isFinite(executionPrice) || executionPrice <= 0) {
      return {
        kind: "cancelled",
        code: "CLOSE_ORDER_BAD_PRICE",
        reason: "Invalid execution price for queued close.",
      }
    }

    const lockRows = await tx.$queryRaw<{ locked: boolean }[]>(
      this.buildPositionCloseAdvisoryLockSql(positionId),
    )
    if (lockRows?.[0]?.locked !== true) {
      return { kind: "skipped", reason: "lock_not_acquired" }
    }

    const position = await tx.position.findUnique({
      where: { id: positionId },
      include: {
        Stock: true,
        orders: {
          select: { productType: true, orderSide: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    })

    if (!position) {
      return {
        kind: "cancelled",
        code: "CLOSE_ORDER_POSITION_MISSING",
        reason: "Position not found for queued close.",
      }
    }
    if (position.tradingAccountId !== tradingAccountId) {
      return {
        kind: "cancelled",
        code: "CLOSE_ORDER_ACCOUNT_MISMATCH",
        reason: "Position does not belong to this trading account.",
      }
    }
    if (position.stockId !== order.stockId) {
      return {
        kind: "cancelled",
        code: "CLOSE_ORDER_STOCK_MISMATCH",
        reason: "Order stock does not match position.",
      }
    }

    const freshQty = Math.trunc(parseFinitePositionNumber(position.quantity) ?? 0)
    if (freshQty === 0) {
      return { kind: "skipped", reason: "already_closed" }
    }

    const closeQuantityAbs = Math.max(1, Math.trunc(order.quantity))
    const absoluteOpen = Math.abs(freshQty)
    const expectedExitSide = freshQty > 0 ? OrderSide.SELL : OrderSide.BUY

    if (order.orderSide !== expectedExitSide) {
      return {
        kind: "cancelled",
        code: "CLOSE_ORDER_SIDE_MISMATCH",
        reason: `Exit side must be ${expectedExitSide} for this position.`,
      }
    }
    if (closeQuantityAbs > absoluteOpen) {
      return {
        kind: "cancelled",
        code: "CLOSE_ORDER_QTY_EXCEEDS_OPEN",
        reason: `close quantity cannot exceed open (${absoluteOpen}).`,
      }
    }

    const lotSize = Math.max(1, Math.trunc(parseFinitePositionNumber(position.Stock?.lot_size) ?? 1))
    if (lotSize > 1 && closeQuantityAbs % lotSize !== 0) {
      return {
        kind: "cancelled",
        code: "CLOSE_ORDER_LOT_BOUNDARY",
        reason: `close quantity must be a multiple of lot size (${lotSize}).`,
      }
    }

    const avgPrice = parseFinitePositionNumber(position.averagePrice) ?? 0
    const productTypeResolution = resolvePositionProductType({
      quantity: freshQty,
      orders: position.orders,
      defaultProductType: position.productType || "MIS",
    })
    const productType = productTypeResolution.productType
    const segment = position.Stock?.segment || "NSE"
    const exitOrderSide = freshQty > 0 ? "SELL" : "BUY"
    const marginCalc = await this.marginCalculator.calculateMargin(
      segment,
      productType,
      closeQuantityAbs,
      avgPrice,
      parseFinitePositionNumber(position.Stock?.lot_size) ?? 1,
      exitOrderSide,
      {
        optionType: position.Stock?.optionType,
        marginRiskSide: marginRiskSideForPositionCloseOpening(freshQty),
      },
    )
    const marginToRelease = marginCalc.requiredMargin

    const signedCloseQuantity = freshQty > 0 ? closeQuantityAbs : -closeQuantityAbs
    const txRemainingQuantity = freshQty - signedCloseQuantity
    const txRealizedPnL = (executionPrice - avgPrice) * signedCloseQuantity

    const stockExists = await tx.stock.findUnique({
      where: { id: position.stockId },
      select: { id: true },
    })
    if (!stockExists) {
      return {
        kind: "cancelled",
        code: "CLOSE_ORDER_STOCK_MISSING",
        reason: `Stock not found: ${position.symbol}.`,
      }
    }

    const priceStamp = await tx.order.updateMany({
      where: { id: pendingOrderId, status: OrderStatus.PENDING },
      data: {
        price: executionPrice,
        positionId,
        productType,
      },
    })
    if (priceStamp.count !== 1) {
      return { kind: "skipped", reason: "not_pending" }
    }

    await this.orderRepo.markExecuted(pendingOrderId, closeQuantityAbs, executionPrice, tx)

    if (txRemainingQuantity === 0) {
      // Queued close worker path: default reason is SYSTEM_CLOSED since the
      // original actor is only recorded in Order.closeMetadata. The admin
      // blotter reads that metadata when it wants the originating user.
      await this.positionRepo.close(positionId, txRealizedPnL, tx, {
        reason: "SYSTEM_CLOSED",
      })
    } else {
      const freshU = position
      const currentUnrealized = parseFinitePositionNumber(freshU.unrealizedPnL) ?? 0
      const currentDayPnL = parseFinitePositionNumber(freshU.dayPnL) ?? currentUnrealized
      const unrealizedPerUnit = absoluteOpen > 0 ? currentUnrealized / absoluteOpen : 0
      const dayPnLPerUnit = absoluteOpen > 0 ? currentDayPnL / absoluteOpen : 0
      await this.positionRepo.update(
        positionId,
        {
          quantity: txRemainingQuantity,
          unrealizedPnL: unrealizedPerUnit * Math.abs(txRemainingQuantity),
          dayPnL: dayPnLPerUnit * Math.abs(txRemainingQuantity),
        },
        tx,
      )
    }

    await this.fundService.releaseMarginTx(
      tx,
      tradingAccountId,
      marginToRelease,
      `Margin released (queued close): ${position.symbol}. Order ref: ${shortOrderRef(pendingOrderId)}.`,
      { positionId, orderId: pendingOrderId },
    )

    if (txRealizedPnL > 0) {
      await this.fundService.creditTx(
        tx,
        tradingAccountId,
        Math.abs(txRealizedPnL),
        `Realized P&L (queued close): ${position.symbol}. Order ref: ${shortOrderRef(pendingOrderId)}.`,
        { positionId, orderId: pendingOrderId },
      )
    } else if (txRealizedPnL < 0) {
      await this.fundService.debitTx(
        tx,
        tradingAccountId,
        Math.abs(txRealizedPnL),
        `Realized P&L (queued close): ${position.symbol}. Order ref: ${shortOrderRef(pendingOrderId)}.`,
        { positionId, orderId: pendingOrderId },
        { allowInsufficientAvailable: true },
      )
    }

    await this.transactionRepo.updateMany({ orderId: pendingOrderId }, { positionId }, tx)

    return {
      kind: "executed",
      userId: order.tradingAccount?.userId,
      symbol: order.symbol,
      quantity: closeQuantityAbs,
      orderSide: order.orderSide,
    }
  }

  /**
   * Update position stop-loss and target
   */
  async updatePosition(
    positionId: string,
    updates: {
      stopLoss?: number | null
      target?: number | null
    }
  ): Promise<UpdatePositionResult> {
    logger.info({ positionId, updates }, "Updating position")

    await this.logger.logPosition("POSITION_UPDATE_START", `Updating position: ${positionId}`, {
      positionId,
      updates
    })

    try {
      const position = await this.positionRepo.findById(positionId)
      if (!position) {
        throw new Error("Position not found")
      }

      const positionQuantity = Math.trunc(parseFinitePositionNumber(position.quantity) ?? 0)
      if (positionQuantity === 0) {
        throw new Error("Cannot update closed position")
      }

      const normalizedStopLoss =
        updates.stopLoss === undefined ? undefined : updates.stopLoss === null ? null : parseFinitePositionNumber(updates.stopLoss)
      const normalizedTarget =
        updates.target === undefined ? undefined : updates.target === null ? null : parseFinitePositionNumber(updates.target)
      if (updates.stopLoss !== undefined && updates.stopLoss !== null && normalizedStopLoss === null) {
        throw new Error("Invalid stop-loss value")
      }
      if (updates.target !== undefined && updates.target !== null && normalizedTarget === null) {
        throw new Error("Invalid target value")
      }
      const normalizedUpdates = {
        stopLoss: normalizedStopLoss === undefined ? undefined : normalizedStopLoss,
        target: normalizedTarget === undefined ? undefined : normalizedTarget,
      }

      const shouldValidateStopLoss = normalizedStopLoss !== undefined && normalizedStopLoss !== null
      const shouldValidateTarget = normalizedTarget !== undefined && normalizedTarget !== null
      const shouldValidateDirections = shouldValidateStopLoss || shouldValidateTarget

      if (shouldValidateDirections) {
        const referencePrice = await this.resolveReferencePriceForPosition(position)
        this.validateDirectionalStopsForPosition({
          quantity: positionQuantity,
          referencePrice,
          stopLoss: shouldValidateStopLoss ? normalizedStopLoss : undefined,
          target: shouldValidateTarget ? normalizedTarget : undefined,
        })
      }

      await executeInTransaction(async (tx) => {
        const freshPosition = await this.positionRepo.findById(positionId, tx)

        if (!freshPosition) {
          throw new Error("Position not found")
        }

        if (freshPosition.quantity === 0) {
          throw new Error("Cannot update closed position")
        }

        // Update position
        await this.positionRepo.update(positionId, normalizedUpdates, tx)

        logger.info({ positionId }, "Position updated")
      })

      await this.logger.logPosition("POSITION_UPDATED", `Position updated successfully: ${positionId}`, {
        positionId,
        updates
      })

      return {
        success: true,
        positionId,
        message: "Position updated successfully"
      }

    } catch (error: any) {
      logger.error({ positionId, updates, error }, "Position update failed")
      await this.logger.error("POSITION_UPDATE_FAILED", error.message, error, {
        positionId,
        updates
      })
      throw error
    }
  }

  private async getCurrentPriceSnapshot(
    instrumentId: string,
    averagePrice: number,
  ): Promise<{ currentPrice: number; prevClose: number }> {
    if (!instrumentId) {
      throw new Error("Instrument ID is required")
    }
    logger.info({ instrumentId }, "Fetching current price")

    try {
      const baseUrl = getBaseUrl()
      const response = await fetch(
        `${baseUrl}/api/quotes?q=${instrumentId}&mode=ltp`,
        { cache: "no-store" },
      )

      const data = await response.json()
      logger.debug({ instrumentId, data }, "Price response")

      const payload = data?.success ? data.data : data
      const quote = payload?.[instrumentId] ?? payload?.data?.[instrumentId] ?? null

      const stock = await prisma.stock.findFirst({
        where: { instrumentId },
        select: { ltp: true },
      })

      const normalized = normalizeQuotePrices({
        quote,
        stockLtp: parseFinitePositionNumber(stock?.ltp),
        averagePrice,
      })

      if (normalized.currentPrice > 0) {
        return {
          currentPrice: normalized.currentPrice,
          prevClose: normalized.prevClose > 0 ? normalized.prevClose : averagePrice,
        }
      }

      throw new Error("Unable to determine current price")
    } catch (error: any) {
      logger.error({ instrumentId, error }, "Failed to fetch price")
      throw new Error("Failed to fetch current market price")
    }
  }

  /**
   * Get current market price for a stock
   */
  private async getCurrentPrice(instrumentId: string): Promise<number> {
    const snapshot = await this.getCurrentPriceSnapshot(instrumentId, 0)
    return snapshot.currentPrice
  }

  /**
   * Calculate unrealized P&L for active positions
   */
  async calculateUnrealizedPnL(
    tradingAccountId: string
  ): Promise<{
    totalUnrealizedPnL: number
    positions: Array<{
      positionId: string
      symbol: string
      unrealizedPnL: number
      currentPrice: number
    }>
  }> {
    logger.info({ tradingAccountId }, "Calculating unrealized P&L")

    const positions = await this.positionRepo.findActive(tradingAccountId)
    const results: Array<any> = []
    let totalUnrealizedPnL = 0

    for (const position of positions) {
      try {
        const avgPrice = parseFinitePositionNumber(position.averagePrice) ?? 0
        const snapshot = await this.getCurrentPriceSnapshot(position.Stock?.instrumentId || "", avgPrice)
        const currentPrice = snapshot.currentPrice
        const prevClose = snapshot.prevClose > 0 ? snapshot.prevClose : avgPrice
        const quantity = parseFinitePositionNumber(position.quantity) ?? 0
        const unrealizedPnL = (currentPrice - avgPrice) * quantity
        const dayPnL = (currentPrice - prevClose) * quantity

        results.push({
          positionId: position.id,
          symbol: position.symbol,
          unrealizedPnL,
          currentPrice
        })

        totalUnrealizedPnL += unrealizedPnL

        // Update position with latest unrealized P&L
        await this.positionRepo.update(position.id, {
          unrealizedPnL,
          dayPnL,
        })

      } catch (error) {
        logger.error({ tradingAccountId, symbol: position.symbol, error }, "Failed to calculate P&L")
      }
    }

    logger.info({ tradingAccountId, totalUnrealizedPnL }, "Total unrealized P&L calculated")

    return {
      totalUnrealizedPnL,
      positions: results
    }
  }

  /**
   * Get position summary for account
   */
  async getPositionSummary(tradingAccountId: string) {
    logger.info({ tradingAccountId }, "Getting position summary")

    const [activePositions, stats, pnlData] = await Promise.all([
      this.positionRepo.findActive(tradingAccountId),
      this.positionRepo.getStatistics(tradingAccountId),
      this.calculateUnrealizedPnL(tradingAccountId)
    ])

    const summary = {
      activePositions: activePositions.length,
      totalPositions: stats.total,
      closedPositions: stats.closed,
      totalUnrealizedPnL: pnlData.totalUnrealizedPnL,
      totalRealizedPnL: stats.totalRealizedPnL,
      winRate: stats.winRate,
      profitable: stats.profitable,
      losing: stats.losing
    }

    logger.info({ tradingAccountId, summary }, "Position summary fetched")
    return summary
  }
}

/**
 * Create position management service instance
 */
export function createPositionManagementService(tradingLogger?: TradingLogger): PositionManagementService {
  logger.info({}, "Creating service instance")
  return new PositionManagementService(tradingLogger)
}

logger.info({}, "Module initialized")