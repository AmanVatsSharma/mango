/**
 * File:        lib/services/order/OrderExecutionService.ts
 * Module:      Order Execution · placement, scheduling, modification, cancellation
 * Purpose:     Core service responsible for the entire order lifecycle: validation, margin
 *              admission, DB row creation, scheduled execution (with timeout), position
 *              update, transaction reconciliation, and notifications. All multi-row mutations
 *              run inside Prisma transactions for atomicity.
 *
 * Exports:
 *   - OrderExecutionService                  — main class (placeOrder/executeOrderWithTimeout/cancelOrder/modifyOrder)
 *   - createOrderExecutionService(logger?)   — factory with optional TradingLogger DI
 *
 * Depends on:
 *   - @/lib/observability/logger             — Pino child logger (Trading-gl1)
 *   - @/lib/services/logging/TradingLogger   — DB-backed audit trail (terminal events only)
 *   - @/lib/services/risk/MarginCalculator   — leverage + margin fraction lookup
 *   - @/lib/services/order/MarketRealismService — bid-ask + slippage step
 *   - @/lib/market-control/market-control-resolver — user-effective spread/slippage/tilt
 *
 * Side-effects:
 *   - Writes Order, Position, Transaction rows
 *   - Mutates TradingAccount.availableMargin/balance
 *   - Pushes notifications via NotificationService
 *   - Pino logs at info/warn/error levels (Trading-gl1 — was console.log)
 *
 * Key invariants:
 *   - Order admission is atomic with margin block + charge debit (one tx)
 *   - Cancellation reconciles by RELEASING the recorded blockedMargin (asymmetric path
 *     vs. recompute is a known limitation tracked in Trading-voj)
 *   - All segment names normalized via normalizeRiskConfigSegment before lookup
 *
 * Read order:
 *   1. placeOrder — entry point + validation flow
 *   2. resolveExecutionPriceForPlacement — server-WS-first price chain
 *   3. executeOrderWithTimeout / executeOrder — fill-side with position update
 *   4. cancelOrder / modifyOrder — admission reconciliation
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08 (Trading-gl1 — console.log → Pino sweep)
 */

import { executeInTransaction } from "@/lib/services/utils/prisma-transaction"
import { OrderRepository } from "@/lib/repositories/OrderRepository"
import { PositionRepository } from "@/lib/repositories/PositionRepository"
import { FundManagementService } from "@/lib/services/funds/FundManagementService"
import { MarginCalculator } from "@/lib/services/risk/MarginCalculator"
import {
  marginRiskSideForOffsetRelease,
  marginRiskSideForSignedPositionQty,
} from "@/lib/services/risk/risk-margin-side"
import { normalizeRiskConfigProductType } from "@/lib/services/risk/risk-config-normalizer"
import { TradingLogger } from "@/lib/services/logging/TradingLogger"
import { OrderType, OrderSide, OrderStatus, Prisma } from "@prisma/client"
import type { Stock } from "@prisma/client"
import { prisma } from "@/lib/prisma"
// PriceResolutionService deleted in Trading-0gu — was instantiated but never
// invoked. resolveExecutionPriceForPlacement runs the canonical inline chain
// (server WS → admin bypass → client fallback). Multi-tier-cache resolver is
// not currently a requirement; bring it back as a real wiring if needed.
import { MarketRealismService } from "@/lib/services/order/MarketRealismService"
import { TransactionRepository } from "@/lib/repositories/TransactionRepository"
import { NotificationService } from "@/lib/services/notifications/NotificationService"
import { parseFiniteOrderNumber } from "@/lib/services/order/order-number-utils"
import { parseExpiryDateCandidate } from "@/lib/utils/expiry-date"
import { getWorkersSnapshot } from "@/lib/server/workers/registry"
// Phase 9.5 — Winner Mitigation enforcement on order admission.
import { getControl as getWinnerControl } from "@/lib/winners/control-service"
import { evaluateOrderAgainstControl } from "@/lib/winners/order-gate"
import {
  getServerMarketDataService,
  SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
} from "@/lib/market-data/server-market-data.service"
import {
  parseTokenFromInstrumentId,
  parsePositiveIntegerMarketNumber,
  resolveSubscriptionIdentity,
} from "@/lib/market-data/utils/quote-lookup"
import {
  reconcileOrderAdmissionAfterFillTx,
  releaseOrderAdmissionOnCancelTx,
} from "@/lib/services/order/order-admission-margin"
import type { PlaceOrderInput } from "@/lib/services/order/place-order-input.types"
import { hydratePlaceOrderFromWatchlist } from "@/lib/services/order/place-order-watchlist-hydration"
import {
  UserSuspendedTradingError,
  DailyTradeCapTradingError,
  PositionSizeCapTradingError,
  OrderValueCapTradingError,
  MaxOpenPositionsCapTradingError,
  DailyLossCapTradingError,
} from "@/lib/services/risk/trading-funds-errors"
import { getTodayPnLSummary, bustDailyPnLCache } from "@/lib/services/risk/daily-loss-summary"
import { classifyOrderDirection } from "@/lib/services/order/order-direction-classifier"
import { isFOSegment } from "@/lib/server/instrument-segment-normalize"
import { loadMarketControlConfig } from "@/lib/market-control/market-control-loader"
import { resolveMarketControls, type EffectiveControls } from "@/lib/market-control/market-control-resolver"
import { getUserMarketGroup } from "@/lib/market-control/user-group"
import { getUserActiveSegmentIds } from "@/lib/market-control/user-segment-lookup"
import { UserMarketControlOverrideRepository } from "@/lib/repositories/UserMarketControlOverrideRepository"
import type { UserOverrideV1 } from "@/lib/market-control/market-control-config.schema"
import { baseLogger } from "@/lib/observability/logger"

export type { PlaceOrderInput } from "@/lib/services/order/place-order-input.types"

// Trading-gl1: structured Pino child for the order-execution path. Replaces ~70 console.*
// calls. The DB-backed TradingLogger is preserved (DI'd into the constructor) for terminal
// audit events; observability + dev-debug logs go through this Pino child instead.
const log = baseLogger.child({ module: "OrderExecutionService" })

/** Short order/deposit/withdrawal ID for statement descriptions (last 8 chars). */
function shortRefId(id: string): string {
  if (!id || typeof id !== "string") return "unknown"
  return id.length > 8 ? id.slice(-8) : id
}

export interface OrderExecutionResult {
  success: boolean
  orderId: string
  message: string
  executionScheduled: boolean
  marginBlocked: number
  chargesDeducted: number
  status?: OrderStatus
  failureCode?: string | null
  failureReason?: string | null
}

function resolveMarketOrderTimingConfig(input: { envKey: string; fallback: number; min: number }): number {
  const parsed = parseFiniteOrderNumber(process.env[input.envKey])
  if (parsed === null) {
    return input.fallback
  }
  return Math.max(input.min, Math.trunc(parsed))
}

function resolveDefaultProductTypeForSegment(segment: string): string {
  // Single source of truth lives in instrument-segment-normalize.ts so adding a new venue
  // (e.g. NSEIX_FO, NCO_FO) automatically gets the right product-type default. Pre-2026-05
  // this was a hand-rolled enumeration that silently misrouted BSE_FO/NCO_FO/CDS_FO/BCD_FO
  // to CNC, breaking margin treatment for those order paths.
  return isFOSegment(segment) ? "NRML" : "CNC"
}

function normalizeOrderProductType(rawProductType: unknown, normalizedSegment: string): string {
  const fallback = resolveDefaultProductTypeForSegment(normalizedSegment)
  const resolvedRaw =
    typeof rawProductType === "string" && rawProductType.trim().length > 0 ? rawProductType : fallback
  return normalizeRiskConfigProductType(resolvedRaw)
}

const MARKET_SERVER_QUOTE_MAX_AGE_MS = resolveMarketOrderTimingConfig({
  envKey: "MARKET_SERVER_QUOTE_MAX_AGE_MS",
  fallback: 60_000,
  min: 1_000,
})
const MARKET_SERVER_QUOTE_WAIT_TIMEOUT_MS = resolveMarketOrderTimingConfig({
  envKey: "MARKET_SERVER_QUOTE_WAIT_TIMEOUT_MS",
  fallback: 1_500,
  min: 0,
})
const MARKET_SERVER_QUOTE_WAIT_POLL_MS = resolveMarketOrderTimingConfig({
  envKey: "MARKET_SERVER_QUOTE_WAIT_POLL_MS",
  fallback: 100,
  min: 25,
})
const EXCHANGE_REJECTED_STALE_QUOTE_CODE = "EXCHANGE_REJECTED_STALE_QUOTE"
const EXCHANGE_REJECTED_NO_LIVE_QUOTE_REASON =
  "Exchange rejected: live quote unavailable for this instrument."
const EXCHANGE_REJECTED_STALE_QUOTE_REASON = `Exchange rejected: stale quote (>${Math.max(
  1,
  Math.round(MARKET_SERVER_QUOTE_MAX_AGE_MS / 1000),
)}s). Please retry.`
type ExchangeRejectionDetail = "NO_FRESH_SERVER_QUOTE" | "SERVER_FEED_DISCONNECTED"

class ExchangeRejectedOrderError extends Error {
  readonly failureCode: string
  readonly failureReason: string
  readonly rejectionDetail: ExchangeRejectionDetail

  constructor(
    failureCode: string,
    failureReason: string,
    rejectionDetail: ExchangeRejectionDetail = "NO_FRESH_SERVER_QUOTE",
  ) {
    super(failureReason)
    this.name = "ExchangeRejectedOrderError"
    this.failureCode = failureCode
    this.failureReason = failureReason
    this.rejectionDetail = rejectionDetail
  }
}

type PricingPath = "SERVER" | "CLIENT_FALLBACK" | "ADMIN_BYPASS"
type PricingSourceDetail =
  | "SERVER_WS"
  | "SERVER_STOCK_CACHE"
  | "SERVER_PRICE_RESOLVER"
  | "LIMIT_ORDER"
  | "CLIENT_PRICE"
  | "CLIENT_LTP"
  | "CLIENT_CLOSE"

interface ExecutionPriceDecision {
  executionPrice: number
  pricingPath: PricingPath
  sourceDetail: PricingSourceDetail
  workerHealth: string
}

export class OrderExecutionService {
  private orderRepo: OrderRepository
  private positionRepo: PositionRepository
  private fundService: FundManagementService
  private marginCalculator: MarginCalculator
  private logger: TradingLogger
  private marketRealism: MarketRealismService
  private transactionRepo: TransactionRepository

  constructor(logger?: TradingLogger) {
    this.orderRepo = new OrderRepository()
    this.positionRepo = new PositionRepository()
    this.marginCalculator = new MarginCalculator()
    this.logger = logger || new TradingLogger()
    this.fundService = new FundManagementService(this.logger)
    this.marketRealism = new MarketRealismService()
    this.transactionRepo = new TransactionRepository()
    
    log.info("🏗️ [ORDER-EXECUTION-SERVICE] Service instance created with enhanced price resolution")
  }

  /**
   * Place an order (main entry point) - INSTANT EXECUTION
   * - Validates order
   * - Uses dialog price directly (no price resolution delay)
   * - Calculates margin
   * - Blocks funds
   * - Creates order
   * - Executes immediately (no 3-second delay)
   */
  async placeOrder(input: PlaceOrderInput): Promise<OrderExecutionResult> {
    const nowMs = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now())
    const t0 = nowMs()
    const marks: Array<{ label: string; at: number }> = []
    const mark = (label: string) => {
      const at = nowMs()
      marks.push({ label, at })
      return at
    }
    const logTimingSummary = (extra?: Record<string, unknown>) => {
      try {
        const steps = marks.map((m, i) => {
          const prev = i === 0 ? t0 : marks[i - 1]!.at
          return { step: m.label, ms: Math.round(m.at - prev) }
        })
        log.debug({
          totalMs: Math.round(nowMs() - t0),
          steps,
          ...extra
        }, "⏱️ [ORDER-EXECUTION-SERVICE] placeOrder timing")
      } catch (e) {
        log.warn({ value: e }, "⚠️ [ORDER-EXECUTION-SERVICE] Failed to log timing summary")
      }
    }

    mark("start")

    const accountForUser = await prisma.tradingAccount.findUnique({
      where: { id: input.tradingAccountId },
      select: { userId: true },
    })
    const resolvedUserId = input.userId ?? accountForUser?.userId ?? null
    const baseForHydrate =
      resolvedUserId && !input.userId ? { ...input, userId: resolvedUserId } : input
    const { input: working, merged: watchlistMerged } = await hydratePlaceOrderFromWatchlist(
      baseForHydrate,
      resolvedUserId,
    )

    if (working.watchlistItemId && watchlistMerged) {
      await this.logger.logOrder("ORDER_WATCHLIST_HYDRATE", "Merged watchlist item fields into order payload", {
        watchlistItemId: working.watchlistItemId,
        symbol: working.symbol,
        segment: working.segment,
        token: working.token,
        hasStrike: working.strikePrice != null,
        optionType: working.optionType,
      })
    }

    const normalizedSegment = (working.segment || working.exchange || "NSE").toUpperCase()
    const normalizedProductType = normalizeOrderProductType(working.productType, normalizedSegment)
    const normalizedLotSize = working.lotSize && working.lotSize > 0 ? working.lotSize : 1

    log.debug({
      symbol: working.symbol,
      quantity: working.quantity,
      orderType: working.orderType,
      orderSide: working.orderSide,
      dialogPrice: working.price,
      segment: normalizedSegment,
      productType: normalizedProductType,
      token: working.token,
      instrumentId: working.instrumentId,
    }, "🚀 [ORDER-EXECUTION-SERVICE] Placing order (INSTANT MODE):")

    await this.logger.logOrder("ORDER_PLACEMENT_START", `Placing ${working.orderSide} order for ${working.symbol}`, {
      symbol: working.symbol,
      quantity: working.quantity,
      orderType: working.orderType,
      productType: normalizedProductType,
      segment: normalizedSegment,
      token: working.token,
      instrumentId: working.instrumentId,
      watchlistItemId: working.watchlistItemId,
    })
    mark("logOrder_start")

    try {
      // Step 1: Validate order
      await this.validateOrder(working)
      log.info("✅ [ORDER-EXECUTION-SERVICE] Order validation passed")
      mark("validateOrder")

      // Step 2: Resolve execution price with worker-aware server policy
      const priceDecision = await this.resolveExecutionPriceForPlacement(working)
      const rawExecutionPrice = priceDecision.executionPrice
      log.debug({
        rawExecutionPrice,
        pricingPath: priceDecision.pricingPath,
        sourceDetail: priceDecision.sourceDetail,
        workerHealth: priceDecision.workerHealth,
      }, "💰 [ORDER-EXECUTION-SERVICE] Resolved execution price:")
      mark("resolvePrice")

      // Step 2a: Resolve unified market controls (spread / slippage / anti-scalp / kill switch).
      const marketControlConfig = await loadMarketControlConfig()
      const userGroup =
        working.userGroup ?? (await getUserMarketGroup(resolvedUserId))
      const userSegmentIds = resolvedUserId
        ? await getUserActiveSegmentIds(resolvedUserId).catch(() => [] as string[])
        : []
      const userOverrideRow = resolvedUserId
        ? await UserMarketControlOverrideRepository.findByUserId(resolvedUserId).catch(() => null)
        : null
      const userOverride: UserOverrideV1 | null =
        marketControlConfig.perUserOverridesEnabled && userOverrideRow && userOverrideRow.enabled
          ? {
              enabled: userOverrideRow.enabled,
              spreadMult: userOverrideRow.spreadMult,
              slipMult: userOverrideRow.slipMult,
              antiScalpRelaxed: userOverrideRow.antiScalpRelaxed,
              forceWorstFill: userOverrideRow.forceWorstFill,
              marginMultiplier: userOverrideRow.marginMultiplier,
              tiltBiasPct: userOverrideRow.tiltBiasPct,
              reason: userOverrideRow.reason ?? undefined,
            }
          : null
      const effectiveControls: EffectiveControls = resolveMarketControls(marketControlConfig, {
        segment: normalizedSegment,
        symbol: working.symbol,
        orderSide: working.orderSide,
        userGroup,
        userSegmentIds,
        userOverride,
        quantity: working.quantity,
        lotSize: normalizedLotSize,
        orderValueRupees: rawExecutionPrice * working.quantity,
      })
      mark("resolveControls")

      if (effectiveControls.blocked) {
        throw new ExchangeRejectedOrderError(
          "KILL_SWITCH_ACTIVE",
          effectiveControls.blockedReason ??
            `${working.orderSide} disabled for ${effectiveControls.resolvedSegmentKey}/${working.symbol}`,
          "NO_FRESH_SERVER_QUOTE",
        )
      }

      // Step 2b: Apply bid-ask spread (BUY executes at ASK, SELL at BID).
      // When UI passes a spreadOverride (locked at order-sheet open time) we honour it so the user
      // sees exactly what they paid. Otherwise we use the freshly-resolved spread from controls.
      const spreadToApply =
        working.spreadOverride && working.spreadOverride > 0
          ? working.spreadOverride
          : effectiveControls.spreadPct
      // Admin-resolved slippage from market-controls. Pre-fix this value was discarded and
      // a hardcoded random band always ran (Trading-li7). Forwarding it as an explicit
      // override gives admin slippage configuration actual runtime effect.
      const slippageToApply =
        typeof effectiveControls.slippagePct === "number" && effectiveControls.slippagePct > 0
          ? effectiveControls.slippagePct
          : undefined
      // Trading-37t: tilt was applied at fill time only — placement preview
      // diverged from the actual fill by up to tiltBiasPct. Now mirrored at
      // placement so the displayed executionPrice reflects what the user pays.
      const tiltBiasToApply =
        typeof effectiveControls.tiltBiasPct === "number" && effectiveControls.tiltBiasPct > 0
          ? effectiveControls.tiltBiasPct
          : undefined
      const realismResult = await this.marketRealism.applyMarketRealism(
        rawExecutionPrice,
        working.orderSide,
        normalizedSegment,
        working.quantity,
        normalizedLotSize,
        spreadToApply,
        slippageToApply,
        tiltBiasToApply,
      )
      const executionPrice = realismResult.executionPrice
      log.debug({
        rawPrice: rawExecutionPrice,
        executionPrice,
        spreadPercent: realismResult.spreadPercent,
        slippagePercent: realismResult.slippagePercent,
        orderSide: working.orderSide,
        userGroup,
        resolvedSegment: effectiveControls.resolvedSegmentKey,
      }, "💱 [ORDER-EXECUTION-SERVICE] Bid-ask spread applied:")
      mark("applySpread")

      // Trading-u60: maxPositionSize check now that we have a real execution
      // price. Skipped for default 0 (= unlimited). MARKET orders couldn't be
      // checked at validateOrder time because input.price is undefined.
      const loadedRiskLimit = (working as PlaceOrderInput & {
        _riskLimit?: {
          status: string
          maxLeverage: number | null
          maxPositionSize: number | null
          maxDailyTrades: number | null
        } | null
      })._riskLimit
      if (
        loadedRiskLimit?.maxPositionSize &&
        loadedRiskLimit.maxPositionSize > 0
      ) {
        const orderNotional = executionPrice * working.quantity * normalizedLotSize
        if (orderNotional > loadedRiskLimit.maxPositionSize) {
          log.warn({
            tradingAccountId: working.tradingAccountId,
            orderNotional,
            maxPositionSize: loadedRiskLimit.maxPositionSize,
          }, "⛔ [ORDER-EXECUTION-SERVICE] order rejected: notional exceeds maxPositionSize")
          throw new PositionSizeCapTradingError(
            `Order notional ₹${Math.round(orderNotional).toLocaleString()} exceeds your per-position cap ₹${Math.round(
              loadedRiskLimit.maxPositionSize,
            ).toLocaleString()}.`,
          )
        }
      }

      // Trading-woj: per-user maxLeverage clamp passed to MarginCalculator.
      // Schema default is 1 — treat ≤ 1 as "no opinion" so we never accidentally
      // force everyone to 1x leverage just because the row exists with default
      // value. Only positive values > 1 act as a real ceiling.
      const userMaxLeverage =
        loadedRiskLimit?.maxLeverage && loadedRiskLimit.maxLeverage > 1
          ? loadedRiskLimit.maxLeverage
          : undefined

      // Step 3: Calculate margin and charges. Admin marginMultiplier from market-controls
      // is now threaded through (pre-fix it was snapshotted to executionContext but never
      // applied to actual required margin — Trading-bry).
      const marginCalc = await this.marginCalculator.calculateMargin(
        normalizedSegment,
        normalizedProductType,
        working.quantity,
        executionPrice,
        normalizedLotSize,
        working.orderSide,
        { optionType: working.optionType },
        effectiveControls.marginMultiplier,
        userMaxLeverage,
      )
      mark("calculateMargin")

      log.debug({ value: marginCalc }, "📊 [ORDER-EXECUTION-SERVICE] Margin calculation:")

      // Trading-vsb: per-segment caps from RiskConfig — exposed on marginCalc
      // so we don't pay a second DB roundtrip. maxOrderValue is a notional
      // ceiling per individual order; maxPositions is a count cap on
      // concurrent open positions in the segment.
      if (marginCalc.maxOrderValue && marginCalc.maxOrderValue > 0) {
        const orderNotional = executionPrice * working.quantity * normalizedLotSize
        if (orderNotional > marginCalc.maxOrderValue) {
          log.warn({
            tradingAccountId: working.tradingAccountId,
            segment: normalizedSegment,
            orderNotional,
            maxOrderValue: marginCalc.maxOrderValue,
          }, "⛔ [ORDER-EXECUTION-SERVICE] order rejected: notional exceeds segment maxOrderValue")
          throw new OrderValueCapTradingError(
            `Order notional ₹${Math.round(orderNotional).toLocaleString()} exceeds the ${normalizedSegment} ` +
              `segment cap ₹${Math.round(marginCalc.maxOrderValue).toLocaleString()}.`,
          )
        }
      }

      if (marginCalc.maxPositions && marginCalc.maxPositions > 0) {
        // Count distinct OPEN positions for this account in the resolved
        // segment. We allow add-to-existing-position orders even when at
        // cap — the cap is on distinct INSTRUMENTS held simultaneously, not
        // on lot-adds to an already-open instrument. So the cap blocks only
        // when the order's symbol isn't currently held.
        const existingForSymbol = await prisma.position.findFirst({
          where: {
            tradingAccountId: working.tradingAccountId,
            symbol: working.symbol,
            closedAt: null,
          },
          select: { id: true },
        })
        if (!existingForSymbol) {
          const openCountForSegment = await prisma.position.count({
            where: {
              tradingAccountId: working.tradingAccountId,
              segment: normalizedSegment,
              closedAt: null,
            },
          })
          if (openCountForSegment >= marginCalc.maxPositions) {
            log.warn({
                tradingAccountId: working.tradingAccountId,
                segment: normalizedSegment,
                openCountForSegment,
                maxPositions: marginCalc.maxPositions,
              }, "⛔ [ORDER-EXECUTION-SERVICE] order rejected: open-position cap reached for segment")
            throw new MaxOpenPositionsCapTradingError(
              `Open-position cap reached for ${normalizedSegment} ` +
                `(${openCountForSegment}/${marginCalc.maxPositions}). Close existing positions first.`,
            )
          }
        }
      }

      await this.logger.logOrder("MARGIN_CALCULATED", "Margin and charges calculated", {
        requiredMargin: marginCalc.requiredMargin,
        brokerage: marginCalc.brokerage,
        totalCharges: marginCalc.totalCharges,
        totalRequired: marginCalc.totalRequired,
        chargesBreakdown: marginCalc.chargesBreakdown,
        priceSource: priceDecision.pricingPath,
        priceSourceDetail: priceDecision.sourceDetail,
        workerHealth: priceDecision.workerHealth,
        executionPrice: executionPrice,
      })

      // Step 4: Validate sufficient funds
      const validation = await this.marginCalculator.validateMargin(
        working.tradingAccountId,
        marginCalc.requiredMargin,
        marginCalc.totalCharges
      )
      mark("validateMargin")

      if (!validation.isValid) {
        log.error({ err: validation }, "❌ [ORDER-EXECUTION-SERVICE] Insufficient funds:")
        throw new Error(
          `Insufficient funds. Required: ₹${validation.requiredAmount}, Available: ₹${validation.availableMargin}, Shortfall: ₹${validation.shortfall}`
        )
      }

      log.info("✅ [ORDER-EXECUTION-SERVICE] Sufficient funds available")
      mark("fundsOk")

      // Step 5: Execute in transaction (atomic operation)
      const result = await executeInTransaction(async (tx) => {
        const txStart = nowMs()
        // Resolve stock first to validate lot multiples for derivatives
        const stockRecord = await this.ensureStockForOrder(tx, {
          ...working,
          segment: normalizedSegment,
          productType: normalizedProductType,
          lotSize: normalizedLotSize,
        })
        log.debug({ elapsedMs: Math.round(nowMs() - txStart) }, "⏱️ [ORDER-EXECUTION-SERVICE] ensureStockForOrder ms")

        // Enforce lot multiple validation for any derivative segment. The predicate covers
        // legacy aliases the order route may still pass through (NFO/BFO/FNO/MCX) plus every
        // *_FO suffix `normalizeInstrumentSegment` produces — so adding a new venue can't
        // silently bypass exchange-required lot multiples.
        const segForValidation = (stockRecord.segment || normalizedSegment || '').toUpperCase()
        if (isFOSegment(segForValidation)) {
          const lot = Math.max(
            1,
            Math.trunc(
              parseFiniteOrderNumber(stockRecord.lot_size) ??
                parseFiniteOrderNumber(normalizedLotSize) ??
                1,
            ),
          )
          if (lot > 1) {
            if (working.quantity % lot !== 0) {
              throw new Error(`Quantity must be a multiple of lot size (${lot}) for ${segForValidation}`)
            }
          }
        }

        // Create order first, then attach all downstream transactions to it
        log.info("📝 [ORDER-EXECUTION-SERVICE] Creating order record")
        // Snapshot of resolved market controls so the worker can re-apply the same spread
        // against a fresh quote at fill time. Shape matches EffectiveControls (subset).
        const executionContext = {
          v: 1,
          userGroup,
          userSegmentIds,
          appliedSegmentId: effectiveControls.appliedSegmentOverride?.segmentId ?? null,
          userOverrideApplied: effectiveControls.userOverrideApplied ? true : false,
          marginMultiplier: effectiveControls.marginMultiplier,
          resolvedSegmentKey: effectiveControls.resolvedSegmentKey,
          spreadPct: realismResult.spreadPercent,
          slippagePct: realismResult.slippagePercent,
          tiltBiasPct: effectiveControls.tiltBiasPct,
          forceWorstFill: effectiveControls.forceWorstFill,
          killSwitchAtPlacement: effectiveControls.killSwitch,
          antiScalping: effectiveControls.antiScalping,
          priceTilt: effectiveControls.priceTilt,
          limitOrder: effectiveControls.orderBehavior.limitOrder,
          marketOrder: effectiveControls.orderBehavior.marketOrder,
          symbolOverrideKey:
            effectiveControls.symbolOverride ? `${effectiveControls.resolvedSegmentKey}:${working.symbol.toUpperCase()}` : null,
          placedAt: new Date().toISOString(),
          rawLtp: rawExecutionPrice,
        }
        const order = await this.orderRepo.create(
          {
            tradingAccountId: working.tradingAccountId,
            stockId: stockRecord.id,
            symbol: working.symbol,
            quantity: working.quantity,
            price: executionPrice,
            orderType: working.orderType,
            orderSide: working.orderSide,
            productType: normalizedProductType,
            status: 'PENDING',
            blockedMargin: marginCalc.requiredMargin,
            placementCharges: marginCalc.totalCharges,
            executionContext,
          },
          tx
        )
        log.debug({ value: order.id }, "✅ [ORDER-EXECUTION-SERVICE] Order created:")

        // Block margin — skip when 0 (debitTx-style fund ops expect positive amounts; keeps ledger clean)
        if (marginCalc.requiredMargin > 0) {
          log.debug({ value: marginCalc.requiredMargin }, "🔒 [ORDER-EXECUTION-SERVICE] Blocking margin:")
          await this.fundService.blockMarginTx(
            tx,
            working.tradingAccountId,
            marginCalc.requiredMargin,
            `Margin blocked for order: ${working.orderSide} ${working.quantity} ${working.symbol} @ ₹${Number(executionPrice).toFixed(2)} (${normalizedProductType}, ${normalizedSegment}). Amount: ₹${Number(marginCalc.requiredMargin).toLocaleString()}. Order ref: ${shortRefId(order.id)}.`,
            { orderId: order.id }
          )
          log.debug({ elapsedMs: Math.round(nowMs() - txStart) }, "⏱️ [ORDER-EXECUTION-SERVICE] blockMargin ms")
        } else {
          log.info("🔒 [ORDER-EXECUTION-SERVICE] Skipping margin block (required margin is 0)")
        }

        // Deduct charges — skip when totalCharges is 0 (MarginCalculator floors; debitTx rejects <= 0)
        if (marginCalc.totalCharges > 0) {
          log.debug({ value: marginCalc.totalCharges }, "💸 [ORDER-EXECUTION-SERVICE] Deducting charges:")
          await this.fundService.debitTx(
            tx,
            working.tradingAccountId,
            marginCalc.totalCharges,
            `Brokerage and charges: ${working.orderSide} ${working.quantity} ${working.symbol}. Amount: ₹${Number(marginCalc.totalCharges).toFixed(2)}. Order ref: ${shortRefId(order.id)}.`,
            { orderId: order.id }
          )
          log.debug({ elapsedMs: Math.round(nowMs() - txStart) }, "⏱️ [ORDER-EXECUTION-SERVICE] debitCharges ms")
        } else {
          log.info("💸 [ORDER-EXECUTION-SERVICE] Skipping charge debit (total charges is 0)")
        }
        log.debug({ elapsedMs: Math.round(nowMs() - txStart) }, "⏱️ [ORDER-EXECUTION-SERVICE] tx_total_ms_so_far")

        return {
          orderId: order.id,
          marginBlocked: marginCalc.requiredMargin,
          chargesDeducted: marginCalc.totalCharges,
          executionPrice,
          stockId: stockRecord.id
        }
      })
      mark("dbTransaction")

      await this.logger.logOrder("ORDER_PLACED", `Order placed successfully: ${result.orderId}`, {
        orderId: result.orderId,
        marginBlocked: result.marginBlocked,
        chargesDeducted: result.chargesDeducted,
        stockId: result.stockId,
        priceSource: priceDecision.pricingPath,
        priceSourceDetail: priceDecision.sourceDetail,
        workerHealth: priceDecision.workerHealth,
      })
      mark("logOrder_placed")

      const response: OrderExecutionResult = {
        success: true,
        orderId: result.orderId,
        message: "Order accepted",
        executionScheduled: true,
        marginBlocked: result.marginBlocked,
        chargesDeducted: result.chargesDeducted,
        status: OrderStatus.PENDING,
        failureCode: null,
        failureReason: null,
      }

      log.debug({ value: response }, "🎉 [ORDER-EXECUTION-SERVICE] Order placement completed (ACCEPTED):")
      logTimingSummary({ orderId: result.orderId, symbol: working.symbol })
      return response

    } catch (error: any) {
      if (error instanceof ExchangeRejectedOrderError && working.orderType === OrderType.MARKET) {
        const rejectedOrder = await this.createExchangeRejectedOrder({
          input: working,
          normalizedSegment,
          normalizedProductType,
          normalizedLotSize,
          failureCode: error.failureCode,
          failureReason: error.failureReason,
        })

        await this.logger.warn("ORDER_EXCHANGE_REJECTED", error.failureReason, {
          symbol: working.symbol,
          quantity: working.quantity,
          orderType: working.orderType,
          orderSide: working.orderSide,
          failureCode: error.failureCode,
          rejectionDetail: error.rejectionDetail,
          orderId: rejectedOrder.orderId,
        })
        logTimingSummary({
          rejected: true,
          symbol: working.symbol,
          orderId: rejectedOrder.orderId,
          failureCode: error.failureCode,
          rejectionDetail: error.rejectionDetail,
        })
        return {
          success: true,
          orderId: rejectedOrder.orderId,
          message: error.failureReason,
          executionScheduled: false,
          marginBlocked: 0,
          chargesDeducted: 0,
          status: OrderStatus.CANCELLED,
          failureCode: error.failureCode,
          failureReason: error.failureReason,
        }
      }

      log.error({ err: error }, "❌ [ORDER-EXECUTION-SERVICE] Order placement failed:")
      await this.logger.error("ORDER_PLACEMENT_FAILED", error.message, error, {
        symbol: working.symbol,
        quantity: working.quantity,
      })
      logTimingSummary({ failed: true, symbol: working.symbol, message: error?.message })
      throw error
    }
  }

  private async createExchangeRejectedOrder(input: {
    input: PlaceOrderInput
    normalizedSegment: string
    normalizedProductType: string
    normalizedLotSize: number
    failureCode: string
    failureReason: string
  }): Promise<{ orderId: string; stockId: string }> {
    const { normalizedSegment, normalizedProductType, normalizedLotSize, failureCode, failureReason } = input
    const attemptedPrice =
      this.normalizePositiveExecutionPrice(input.input.price) ??
      this.normalizePositiveExecutionPrice(input.input.ltp) ??
      null

    return executeInTransaction(async (tx) => {
      const stockRecord = await this.ensureStockForOrder(tx, {
        ...input.input,
        segment: normalizedSegment,
        productType: normalizedProductType,
        lotSize: normalizedLotSize,
      })
      const order = await this.orderRepo.create(
        {
          tradingAccountId: input.input.tradingAccountId,
          stockId: stockRecord.id,
          symbol: input.input.symbol,
          quantity: input.input.quantity,
          price: attemptedPrice,
          orderType: input.input.orderType,
          orderSide: input.input.orderSide,
          productType: normalizedProductType,
          status: OrderStatus.CANCELLED,
          failureCode,
          failureReason,
        },
        tx,
      )
      return { orderId: order.id, stockId: stockRecord.id }
    })
  }

  /**
   * Execute order with timeout (INSTANT MODE)
   * No delay - executes immediately in background with 10-second timeout
   */
  private async executeOrderWithTimeout(
    orderId: string, 
    input: PlaceOrderInput, 
    executionPrice: number
  ): Promise<void> {
    log.debug({ value: orderId }, "⚡ [ORDER-EXECUTION-SERVICE] Executing order with timeout:")

    if (!input.stockId) {
      throw new Error(`Stock reference missing while executing order ${orderId}`)
    }

    const normalizedSegment = (input.segment || input.exchange || 'NSE').toUpperCase()
    const normalizedProductType = normalizeOrderProductType(input.productType, normalizedSegment)
    const normalizedLotSize = input.lotSize && input.lotSize > 0 ? input.lotSize : 1
    const enrichedInput: PlaceOrderInput = {
      ...input,
      segment: normalizedSegment,
      productType: normalizedProductType,
      lotSize: normalizedLotSize
    }

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Order execution timeout after 10 seconds`))
      }, 10000) // 10 seconds timeout
    })

    try {
      // Race between execution and timeout
      await Promise.race([
        this.executeOrder(orderId, enrichedInput, executionPrice),
        timeoutPromise
      ])
      
      log.debug({ value: orderId }, "✅ [ORDER-EXECUTION-SERVICE] Order executed successfully:")
    } catch (error: any) {
      log.error({ err: error }, "❌ [ORDER-EXECUTION-SERVICE] Order execution failed or timed out:")
      
      // Mark order as rejected and release margin
      try {
        await executeInTransaction(async (tx) => {
          const row = await tx.order.findUnique({ where: { id: orderId } })
          if (!row || row.status !== OrderStatus.PENDING) {
            return
          }
          await this.orderRepo.update(orderId, { status: OrderStatus.CANCELLED }, tx)

          let blockedMargin = row.blockedMargin ?? 0
          let placementCharges = row.placementCharges ?? 0
          if (blockedMargin <= 0 && placementCharges <= 0 && executionPrice > 0) {
            const marginCalc = await this.marginCalculator.calculateMargin(
              normalizedSegment,
              normalizedProductType,
              input.quantity,
              executionPrice,
              normalizedLotSize,
              input.orderSide,
              { optionType: input.optionType },
            )
            blockedMargin = marginCalc.requiredMargin
          }

          await releaseOrderAdmissionOnCancelTx(tx, this.fundService, {
            orderId,
            tradingAccountId: input.tradingAccountId,
            blockedMargin,
            placementCharges,
            marginReleaseDescription: `Margin released: order failed. Symbol: ${input.symbol}. Released: ₹${Number(blockedMargin).toLocaleString()}. Order ref: ${shortRefId(orderId)}. Reason: ${error.message}`,
            chargesRefundDescription: `Charges refunded: order failed before execution. Symbol: ${input.symbol}. Refunded: ₹${Number(placementCharges).toLocaleString()}. Order ref: ${shortRefId(orderId)}.`,
          })
        })
        
        log.info("✅ [ORDER-EXECUTION-SERVICE] Order marked as rejected and margin released")
      } catch (cleanupError) {
        log.error({ err: cleanupError }, "❌ [ORDER-EXECUTION-SERVICE] Failed to cleanup rejected order:")
      }
      
      await this.logger.error("ORDER_EXECUTION_FAILED", error.message, error, {
        orderId,
        symbol: input.symbol
      })
      
      throw error
    }
  }

  /**
   * @deprecated Old method - replaced by executeOrderWithTimeout
   */
  private scheduleExecution(orderId: string, input: PlaceOrderInput, executionPrice: number): void {
    log.warn("⚠️ [ORDER-EXECUTION-SERVICE] DEPRECATED: scheduleExecution called - use executeOrderWithTimeout instead")
    this.executeOrderWithTimeout(orderId, input, executionPrice).catch((err) => {
      log.error({ err, orderId }, "scheduleExecution background failure")
    })
  }

  /**
   * Execute order (called after 3-second delay)
   * - Updates position
   * - Marks order as executed
   * - Logs everything
   */
  private async executeOrder(
    symbolForLog: string,
    input: PlaceOrderInput,
    executionPrice: number,
    existingOrderId?: string
  ): Promise<void> {
    const orderId = existingOrderId || 'new-order'
    log.debug({ value: orderId }, "🎯 [ORDER-EXECUTION-SERVICE] Executing order:")

    if (!input.stockId) {
      throw new Error(`Stock reference missing while executing order ${orderId}`)
    }
    // Capture for TS narrowing inside transaction callback
    const stockId: string = input.stockId

    const runtimeSegment = (input.segment || input.exchange || 'NSE').toUpperCase()
    const runtimeProductType = normalizeOrderProductType(input.productType, runtimeSegment)
    const runtimeLotSize = input.lotSize && input.lotSize > 0 ? input.lotSize : 1

    await this.logger.logOrder("ORDER_EXECUTION_START", `Executing order: ${orderId}`, {
      orderId,
      symbol: input.symbol,
      executionPrice,
      segment: runtimeSegment,
      productType: runtimeProductType
    })

    try {
      await executeInTransaction(async (tx) => {
        const admissionSnap = await tx.order.findUnique({
          where: { id: orderId },
          select: { blockedMargin: true, placementCharges: true },
        })
        const admissionBm = admissionSnap?.blockedMargin ?? 0
        const admissionPc = admissionSnap?.placementCharges ?? 0

        // Calculate signed quantity (positive for BUY, negative for SELL)
        const signedQuantity = input.orderSide === OrderSide.BUY 
          ? input.quantity 
          : -input.quantity

        log.debug({ value: signedQuantity }, "📊 [ORDER-EXECUTION-SERVICE] Signed quantity:")

        // Upsert position (create or update)
        log.info("📈 [ORDER-EXECUTION-SERVICE] Updating position")
        const upsertResult = await this.positionRepo.upsertWithBreakdown(
          input.tradingAccountId,
          stockId,
          input.symbol,
          signedQuantity,
          executionPrice,
          {
            productType: runtimeProductType,
            isIntraday: runtimeProductType === "MIS",
            instrumentId: input.instrumentId ?? null,
            segment: runtimeSegment,
            exchange: (input.exchange || runtimeSegment || "NSE").toUpperCase(),
            strikePrice: input.strikePrice ?? null,
            optionType: input.optionType ?? null,
            expiry: input.expiry ?? null,
            token: this.resolveInputToken(input),
            uirId: input.uirId ?? null,
            canonicalSymbol: input.canonicalSymbol ?? null,
          },
          tx
        )
        const position = upsertResult.primaryPosition

        log.debug({ value: position.id }, "✅ [ORDER-EXECUTION-SERVICE] Position updated:")

        // When the incoming order offsets existing lots, settle realized PnL + release margin.
        for (const offset of upsertResult.offsets || []) {
          const consumedQty = Math.max(0, Math.trunc(offset.consumedAbsQuantity))
          if (consumedQty <= 0) continue

          const contextPositionId = offset.closedRecordPositionId || offset.positionId
          const segment = offset.segment || runtimeSegment
          const lotSize = offset.lotSize && offset.lotSize > 0 ? offset.lotSize : runtimeLotSize

          const marginCalc = await this.marginCalculator.calculateMargin(
            segment,
            runtimeProductType,
            consumedQty,
            offset.averagePrice,
            lotSize,
            input.orderSide,
            {
              optionType: input.optionType,
              marginRiskSide: marginRiskSideForOffsetRelease(input.orderSide),
            },
          )
          const marginToRelease = Math.max(0, Math.trunc(marginCalc.requiredMargin))
          if (marginToRelease > 0) {
            await this.fundService.releaseMarginTx(
              tx,
              input.tradingAccountId,
              marginToRelease,
              `Margin released on offset close: ${input.orderSide} ${consumedQty} ${input.symbol}. Released: ₹${Number(marginToRelease).toLocaleString()}. Order ref: ${shortRefId(orderId)}.`,
              { orderId, positionId: contextPositionId },
            )
          }

          const realizedPnL = Number.isFinite(offset.realizedPnL) ? offset.realizedPnL : 0
          if (realizedPnL > 0) {
            await this.fundService.creditTx(
              tx,
              input.tradingAccountId,
              realizedPnL,
              `Realized P&L credit: ${input.orderSide} ${consumedQty} ${input.symbol}. Profit: ₹${Number(realizedPnL).toFixed(2)}. Order ref: ${shortRefId(orderId)}.`,
              { orderId, positionId: contextPositionId },
            )
          } else if (realizedPnL < 0) {
            await this.fundService.debitTx(
              tx,
              input.tradingAccountId,
              Math.abs(realizedPnL),
              `Realized P&L debit: ${input.orderSide} ${consumedQty} ${input.symbol}. Loss: ₹${Number(Math.abs(realizedPnL)).toFixed(2)}. Order ref: ${shortRefId(orderId)}.`,
              { orderId, positionId: contextPositionId },
            )
          }
        }

        await reconcileOrderAdmissionAfterFillTx(tx, this.fundService, {
          orderId,
          tradingAccountId: input.tradingAccountId,
          blockedMargin: admissionBm,
          placementCharges: admissionPc,
          marginReleaseDescription: `Margin released (admission): order executed. Symbol: ${input.symbol}. Order ref: ${shortRefId(orderId)}.`,
        })

        const absPosQty = Math.abs(Math.trunc(position.quantity))
        if (absPosQty > 0) {
          const posAvg = parseFiniteOrderNumber(position.averagePrice) ?? executionPrice
          const posCalc = await this.marginCalculator.calculateMargin(
            runtimeSegment,
            runtimeProductType,
            absPosQty,
            posAvg,
            runtimeLotSize,
            input.orderSide,
            {
              optionType: input.optionType,
              marginRiskSide: marginRiskSideForSignedPositionQty(position.quantity),
            },
          )
          if (posCalc.requiredMargin > 0) {
            await this.fundService.blockMarginTx(
              tx,
              input.tradingAccountId,
              posCalc.requiredMargin,
              `Margin blocked (position): ${input.orderSide} ${absPosQty} ${input.symbol} @ ₹${Number(posAvg).toFixed(2)}. Order ref: ${shortRefId(orderId)}.`,
              { orderId, positionId: position.id },
            )
          }
        }

        // Mark order as executed
        log.info("✅ [ORDER-EXECUTION-SERVICE] Marking order as executed")
        // Link order to position and mark executed
        await this.orderRepo.update(orderId, { positionId: position.id }, tx)
        await this.orderRepo.markExecuted(orderId, input.quantity, executionPrice, tx)

        // Also link related transactions to position for easier querying
        // This creates bidirectional links: Transaction → Order → Position AND Transaction → Position
        try {
          await this.transactionRepo.updateMany(
            { orderId },
            { positionId: position.id },
            tx
          )
          log.debug({ value: position.id }, "✅ [ORDER-EXECUTION-SERVICE] Linked transactions to position:")
        } catch (linkError) {
          log.warn({ value: linkError }, "⚠️ [ORDER-EXECUTION-SERVICE] Failed to link transactions to position:")
          // Non-critical - transactions can still be found via orderId
        }

        await this.logger.logPosition("POSITION_UPDATED", `Position updated for ${input.symbol}`, {
          positionId: position.id,
          quantity: position.quantity,
          averagePrice: parseFiniteOrderNumber(position.averagePrice) ?? 0
        })
      })

      await this.logger.logOrder("ORDER_EXECUTED", `Order executed successfully: ${orderId}`, {
        orderId,
        executionPrice,
        symbol: input.symbol
      })

      // Create notification for order executed (non-blocking)
      try {
        const userId = input.userId || await this.getUserIdFromTradingAccount(input.tradingAccountId)
        if (userId) {
          await NotificationService.notifyOrderExecuted(userId, {
            symbol: input.symbol,
            quantity: input.quantity,
            orderSide: input.orderSide,
            averagePrice: executionPrice
          })
        }
      } catch (notifError) {
        log.warn({ value: notifError }, "⚠️ [ORDER-EXECUTION-SERVICE] Failed to create order executed notification:")
      }

      log.debug({ value: orderId }, "🎉 [ORDER-EXECUTION-SERVICE] Order execution completed:")

    } catch (error: any) {
      log.error({ err: error }, "❌ [ORDER-EXECUTION-SERVICE] Order execution failed:")
      await this.logger.error("ORDER_EXECUTION_ERROR", error.message, error, {
        orderId
      })
      throw error
    }
  }

  private parseInstrumentIdentifier(identifier?: string | null): { exchange: string | null; token: number | null } {
    if (!identifier) {
      return { exchange: null, token: null }
    }

    const trimmed = identifier.trim()
    if (!trimmed) {
      return { exchange: null, token: null }
    }

    const lastHyphenIndex = trimmed.lastIndexOf("-")
    if (lastHyphenIndex === -1) {
      return { exchange: trimmed || null, token: null }
    }

    const tokenCandidate = parseFiniteOrderNumber(trimmed.substring(lastHyphenIndex + 1))
    const exchangeCandidate = trimmed.substring(0, lastHyphenIndex) || null

    return {
      exchange: exchangeCandidate,
      token: tokenCandidate
    }
  }

  private normalizePositiveExecutionPrice(value: unknown): number | null {
    const parsedPrice = parseFiniteOrderNumber(value)
    if (parsedPrice === null || parsedPrice <= 0) {
      return null
    }
    return parsedPrice
  }

  private resolveClientQuoteAgeMs(input: PlaceOrderInput): number | null {
    const directAgeMs = parseFiniteOrderNumber(input.ltpAgeMs)
    if (directAgeMs !== null && directAgeMs >= 0) {
      return Math.max(0, Math.trunc(directAgeMs))
    }

    const quoteTimestampMs = parseFiniteOrderNumber(input.ltpTimestamp)
    if (quoteTimestampMs !== null && quoteTimestampMs > 0) {
      return Math.max(0, Date.now() - Math.trunc(quoteTimestampMs))
    }

    return null
  }

  private resolveInputToken(input: PlaceOrderInput): number | null {
    const tokenFromPayload = parsePositiveIntegerMarketNumber(input.token)
    if (tokenFromPayload !== null) {
      return tokenFromPayload
    }
    return parseTokenFromInstrumentId(input.instrumentId)
  }

  private async resolveExecutionPriceForPlacement(input: PlaceOrderInput): Promise<ExecutionPriceDecision> {
    const workerStatus = await this.resolveOrderWorkerStatus()

    // Admin emergency levers — checked BEFORE the server WS wait. Both flags live on
    // `MarketControlConfigV1.orderBehavior` and are surfaced in admin-console → Market Data
    // → Market Controls → Orders. They exist for the case where the upstream WS feed is
    // mis-routed (server can't get fresh ticks but the frontend can), so the operator can
    // unblock order flow at the cost of price authority. See bypassServerQuote / disabled
    // schema docs for the security note.
    const orderBehavior = await this.loadOrderBehaviorOrNull()

    if (input.orderType === OrderType.LIMIT && orderBehavior?.limitOrder.disabled === true) {
      log.warn({
        symbol: input.symbol,
        userId: input.userId,
      }, "🚫 [ORDER-EXECUTION-SERVICE] LIMIT order rejected — admin disabled LIMIT orders")
      throw new Error(
        "LIMIT orders are temporarily disabled by the admin. Please use a MARKET order or try again later.",
      )
    }

    if (input.orderType === OrderType.MARKET && orderBehavior?.marketOrder.bypassServerQuote === true) {
      log.warn({
        symbol: input.symbol,
        userId: input.userId,
        hasPrice: typeof input.price === "number" && input.price > 0,
        hasLtp: typeof input.ltp === "number" && input.ltp > 0,
        hasClose: typeof input.close === "number" && input.close > 0,
      }, "⚠️ [ORDER-EXECUTION-SERVICE] ADMIN_BYPASS gate active — skipping server WS wait")
      const bypassDecision = this.resolveAdminBypassPrice(input, workerStatus.workerHealth)
      if (bypassDecision) return bypassDecision
      // Bypass enabled but no usable client price was sent on the request body — refuse
      // explicitly with a clear error instead of silently falling through to the (broken)
      // server WS path. Otherwise the operator turns the bypass ON and still sees the
      // exact same stale-quote error, which is exactly the symptom we're trying to prevent.
      throw new Error(
        `ADMIN_BYPASS is ON but the order request for ${input.symbol} did not include a positive price/ltp/close. ` +
          `The frontend should send the live LTP from the watchlist row in the request body. ` +
          `Refusing to fall through to the server path — that's the path you're trying to bypass.`,
      )
    }

    try {
      const serverDecision = await this.resolveServerExecutionPrice(input, workerStatus.workerHealth)
      return {
        ...serverDecision,
        pricingPath: "SERVER",
      }
    } catch (error) {
      if (!(error instanceof ExchangeRejectedOrderError) || input.orderType !== OrderType.MARKET) {
        throw error
      }

      const fallbackDecision = await this.resolveFallbackExecutionPriceForMarket({
        input,
        workerHealth: workerStatus.workerHealth,
        rejectionError: error,
      })
      if (!fallbackDecision) {
        throw error
      }
      return fallbackDecision
    }
  }

  /**
   * Load the order-behaviour slice of the market control config. Best-effort — when the
   * loader fails (DB blip, schema drift), we return null and the placement falls through
   * to the standard server-pricing path. We never block trading on a config-load failure.
   */
  private async loadOrderBehaviorOrNull(): Promise<{
    marketOrder: { bypassServerQuote: boolean }
    limitOrder: { disabled: boolean }
  } | null> {
    try {
      const cfg = await loadMarketControlConfig()
      return {
        marketOrder: { bypassServerQuote: Boolean(cfg.orderBehavior?.marketOrder?.bypassServerQuote) },
        limitOrder: { disabled: Boolean(cfg.orderBehavior?.limitOrder?.disabled) },
      }
    } catch (error) {
      log.warn(
        { err: error },
        "Failed to read orderBehavior gates from market control config; falling through to server pricing",
      )
      return null
    }
  }

  /**
   * Admin-bypass MARKET pricing path — uses the client-supplied price directly, skipping
   * the server WS wait + the freshness check. Returns null when no usable client price is
   * present (caller falls through to the server path rather than executing at zero).
   *
   * Every call writes a Pino warn so operators can grep for ADMIN_BYPASS usage in logs;
   * the resulting order carries `pricingPath: "ADMIN_BYPASS"` for post-mortems.
   */
  private resolveAdminBypassPrice(
    input: PlaceOrderInput,
    workerHealth: string,
  ): ExecutionPriceDecision | null {
    try {
      const clientDecision = this.resolveClientFallbackPrice(input)
      log.warn({
        symbol: input.symbol,
        userId: input.userId,
        executionPrice: clientDecision.executionPrice,
        sourceDetail: clientDecision.sourceDetail,
      }, "⚠️ [ORDER-EXECUTION-SERVICE] ADMIN_BYPASS — executing MARKET at client price (server WS wait skipped)")
      return {
        ...clientDecision,
        workerHealth,
        pricingPath: "ADMIN_BYPASS",
      }
    } catch {
      return null
    }
  }

  private async resolveOrderWorkerStatus(): Promise<{ useServerPricing: boolean; workerHealth: string }> {
    try {
      const workers = await getWorkersSnapshot()
      const orderWorker = workers.find((worker) => worker.id === "order_execution")
      if (!orderWorker) {
        return { useServerPricing: false, workerHealth: "missing" }
      }
      const useServerPricing = Boolean(orderWorker.enabled && orderWorker.health === "healthy")
      return {
        useServerPricing,
        workerHealth: orderWorker.health,
      }
    } catch (error) {
      log.warn({ value: error }, "⚠️ [ORDER-EXECUTION-SERVICE] Failed to read worker snapshot:")
      return { useServerPricing: false, workerHealth: "snapshot_error" }
    }
  }

  private resolveClientFallbackPrice(
    input: PlaceOrderInput,
  ): Pick<ExecutionPriceDecision, "executionPrice" | "sourceDetail"> {
    if (input.orderType === OrderType.LIMIT) {
      const limitPrice = this.normalizePositiveExecutionPrice(input.price)
      if (limitPrice === null) {
        throw new Error(`Invalid LIMIT price provided for ${input.symbol}. Please retry.`)
      }
      return {
        executionPrice: limitPrice,
        sourceDetail: "LIMIT_ORDER",
      }
    }

    const fromPrice = this.normalizePositiveExecutionPrice(input.price)
    if (fromPrice !== null) {
      return { executionPrice: fromPrice, sourceDetail: "CLIENT_PRICE" }
    }

    const fromLtp = this.normalizePositiveExecutionPrice(input.ltp)
    if (fromLtp !== null) {
      return { executionPrice: fromLtp, sourceDetail: "CLIENT_LTP" }
    }

    const fromClose = this.normalizePositiveExecutionPrice(input.close)
    if (fromClose !== null) {
      return { executionPrice: fromClose, sourceDetail: "CLIENT_CLOSE" }
    }

    throw new Error(`Invalid price provided for ${input.symbol}. Please try again.`)
  }

  private async resolveFallbackExecutionPriceForMarket(input: {
    input: PlaceOrderInput
    workerHealth: string
    rejectionError: ExchangeRejectedOrderError
  }): Promise<ExecutionPriceDecision | null> {
    const clientQuoteAgeMs = this.resolveClientQuoteAgeMs(input.input)
    const hasFreshClientMetadata =
      clientQuoteAgeMs !== null && clientQuoteAgeMs <= MARKET_SERVER_QUOTE_MAX_AGE_MS
    if (!hasFreshClientMetadata) {
      await this.logger.warn(
        "ORDER_SERVER_QUOTE_FALLBACK_REJECTED",
        "Client fallback ignored: quote metadata is stale/missing for MARKET order",
        {
          symbol: input.input.symbol,
          rejectionDetail: input.rejectionError.rejectionDetail,
          failureCode: input.rejectionError.failureCode,
          clientQuoteAgeMs,
          allowedQuoteAgeMs: MARKET_SERVER_QUOTE_MAX_AGE_MS,
        },
      )
      return null
    }

    try {
      const clientDecision = this.resolveClientFallbackPrice(input.input)
      await this.logger.warn("ORDER_SERVER_QUOTE_FALLBACK", "Using client fallback price for MARKET order", {
        symbol: input.input.symbol,
        sourceDetail: clientDecision.sourceDetail,
        rejectionDetail: input.rejectionError.rejectionDetail,
        failureCode: input.rejectionError.failureCode,
        clientQuoteAgeMs,
      })
      return {
        ...clientDecision,
        workerHealth: input.workerHealth,
        pricingPath: "CLIENT_FALLBACK",
      }
    } catch {
      return null
    }
  }

  private async resolveServerExecutionPrice(
    input: PlaceOrderInput,
    workerHealth: string,
  ): Promise<Pick<ExecutionPriceDecision, "executionPrice" | "sourceDetail" | "workerHealth">> {
    if (input.orderType === OrderType.LIMIT) {
      const limitPrice = this.normalizePositiveExecutionPrice(input.price)
      if (limitPrice === null) {
        throw new Error(`Invalid LIMIT price provided for ${input.symbol}. Please retry.`)
      }
      return {
        executionPrice: limitPrice,
        sourceDetail: "LIMIT_ORDER",
        workerHealth,
      }
    }

    const token = this.resolveInputToken(input)
    if (token === null) {
      throw new ExchangeRejectedOrderError(
        EXCHANGE_REJECTED_STALE_QUOTE_CODE,
        EXCHANGE_REJECTED_NO_LIVE_QUOTE_REASON,
        "NO_FRESH_SERVER_QUOTE",
      )
    }

    const serverMarketData = getServerMarketDataService()
    await serverMarketData.ensureInitialized().catch((error) => {
      log.warn({ value: error }, "⚠️ [ORDER-EXECUTION-SERVICE] Server market data init failed:")
    })

    // canonicalSymbol mirrors the shape `WebSocketMarketDataProvider` uses on the frontend.
    // Without it, the backend's resolver falls through to numeric/exchange-qualified keys,
    // emits them in `instruments[]`, and the upstream gateway treats that as a different
    // subscription than the canonical `symbols[]` one already in flight from the frontend —
    // so ticks never arrive on the backend's socket and orders fail with a stale-quote
    // rejection. Threading canonicalSymbol unifies the key across both sides.
    const subscriptionKey =
      resolveSubscriptionIdentity({
        token,
        uirId: input.uirId,
        instrumentId: input.instrumentId,
        exchange: input.exchange,
        segment: input.segment,
        canonicalSymbol: input.canonicalSymbol,
      }).subscriptionKey ?? token

    const quote = await serverMarketData.waitForFreshQuote(token, {
      timeoutMs: MARKET_SERVER_QUOTE_WAIT_TIMEOUT_MS,
      maxAgeMs: MARKET_SERVER_QUOTE_MAX_AGE_MS,
      pollMs: MARKET_SERVER_QUOTE_WAIT_POLL_MS,
      subscriptionKey,
      resubscribeRetryTimeoutMs: SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
    })
    const wsPrice =
      this.normalizePositiveExecutionPrice(quote?.last_trade_price) ??
      this.normalizePositiveExecutionPrice(quote?.close)
    if (wsPrice !== null) {
      return {
        executionPrice: wsPrice,
        sourceDetail: "SERVER_WS",
        workerHealth,
      }
    }

    const health = serverMarketData.getHealth()
    const rejectionDetail: ExchangeRejectionDetail = health.isConnected
      ? "NO_FRESH_SERVER_QUOTE"
      : "SERVER_FEED_DISCONNECTED"
    log.warn({
      symbol: input.symbol,
      token,
      instrumentId: input.instrumentId,
      rejectionDetail,
      feedHealth: health,
    }, "⚠️ [ORDER-EXECUTION-SERVICE] MARKET quote not fresh after wait window")

    throw new ExchangeRejectedOrderError(
      EXCHANGE_REJECTED_STALE_QUOTE_CODE,
      EXCHANGE_REJECTED_STALE_QUOTE_REASON,
      rejectionDetail,
    )
  }

  private async findStockForServerPricing(
    input: PlaceOrderInput,
    token: number | null,
  ): Promise<{ id: string; instrumentId: string | null; ltp: number | Prisma.Decimal | null } | null> {
    const lookupClauses: Prisma.StockWhereInput[] = []

    const normalizedStockId = typeof input.stockId === "string" ? input.stockId.trim() : ""
    if (normalizedStockId) {
      lookupClauses.push({ id: normalizedStockId })
    }
    if (token !== null) {
      lookupClauses.push({ token })
    }

    const normalizedInstrumentId = typeof input.instrumentId === "string" ? input.instrumentId.trim() : ""
    if (normalizedInstrumentId) {
      lookupClauses.push({ instrumentId: normalizedInstrumentId })
    }

    const normalizedSymbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : ""
    const normalizedExchange = (input.exchange || input.segment || "").toUpperCase().trim()
    if (normalizedSymbol && normalizedExchange) {
      lookupClauses.push({
        AND: [{ symbol: normalizedSymbol }, { exchange: normalizedExchange }],
      })
    }

    if (lookupClauses.length === 0) {
      return null
    }

    const stock = await prisma.stock.findFirst({
      where: { OR: lookupClauses },
      select: {
        id: true,
        instrumentId: true,
        ltp: true,
      },
    })
    return stock
  }

  private async ensureStockForOrder(
    tx: Prisma.TransactionClient,
    input: PlaceOrderInput
  ): Promise<Stock> {
    const normalizeIdentityText = (value: unknown): string | null => {
      if (typeof value !== "string") {
        return null
      }
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : null
    }
    const normalizeIdentityNumber = (value: unknown): number | null => {
      const parsed = parseFiniteOrderNumber(value)
      return parsed === null ? null : parsed
    }
    const normalizeIdentityDateKey = (value: unknown): string | null => {
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
      }
      if (typeof value !== "string") {
        return null
      }
      const trimmed = value.trim()
      if (!trimmed) {
        return null
      }
      const parsed = parseExpiryDateCandidate(trimmed)
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10)
      }
      return trimmed.slice(0, 10)
    }

    const parsedIdentifier = this.parseInstrumentIdentifier(input.instrumentId ?? undefined)
    const tokenFromPayload = parsePositiveIntegerMarketNumber(input.token)
    const token = tokenFromPayload ?? parsedIdentifier.token ?? null
    const exchange = (input.exchange || parsedIdentifier.exchange || input.segment || "NSE").toUpperCase()
    const normalizedSymbol = input.symbol?.toUpperCase() || "UNKNOWN"
    const segment = (input.segment || exchange).toUpperCase()

    const normalizedInputInstrumentId = normalizeIdentityText(input.instrumentId)?.toUpperCase() ?? null
    const normalizedInputExchange = normalizeIdentityText(input.exchange)?.toUpperCase() ?? null
    const normalizedInputSegment = normalizeIdentityText(input.segment)?.toUpperCase() ?? null
    const normalizedInputOptionType = normalizeIdentityText(input.optionType)?.toUpperCase() ?? null
    const normalizedInputStrikePrice = normalizeIdentityNumber(input.strikePrice)
    const normalizedInputExpiry = normalizeIdentityDateKey(input.expiry)
    const derivativeIdentityHint =
      (normalizedInputSegment?.includes("FO") ?? false) ||
      (normalizedInputExchange?.includes("FO") ?? false) ||
      normalizedInputOptionType !== null ||
      normalizedInputStrikePrice !== null ||
      normalizedInputExpiry !== null

    if (input.stockId) {
      const existingStock = await tx.stock.findUnique({ where: { id: input.stockId } })
      if (existingStock) {
        const mismatchFields: string[] = []
        const existingToken = parsePositiveIntegerMarketNumber(existingStock.token)
        const existingInstrumentId = normalizeIdentityText(existingStock.instrumentId)?.toUpperCase() ?? null
        const existingExchange = normalizeIdentityText(existingStock.exchange)?.toUpperCase() ?? null
        const existingSegment = normalizeIdentityText(existingStock.segment)?.toUpperCase() ?? null
        const existingOptionType = normalizeIdentityText(existingStock.optionType)?.toUpperCase() ?? null
        const existingStrikePrice = normalizeIdentityNumber(existingStock.strikePrice)
        const existingExpiry = normalizeIdentityDateKey(existingStock.expiry)
        const existingDerivativeHint =
          (existingSegment?.includes("FO") ?? false) ||
          (existingExchange?.includes("FO") ?? false) ||
          existingOptionType !== null ||
          existingStrikePrice !== null ||
          existingExpiry !== null

        if (token !== null && existingToken !== null && token !== existingToken) {
          mismatchFields.push("token")
        }
        if (
          normalizedInputInstrumentId &&
          existingInstrumentId &&
          normalizedInputInstrumentId !== existingInstrumentId
        ) {
          mismatchFields.push("instrumentId")
        }
        if (normalizedInputExchange && existingExchange && normalizedInputExchange !== existingExchange) {
          mismatchFields.push("exchange")
        }
        if (normalizedInputSegment && existingSegment && normalizedInputSegment !== existingSegment) {
          mismatchFields.push("segment")
        }
        if (derivativeIdentityHint || existingDerivativeHint) {
          if (normalizedInputOptionType && existingOptionType && normalizedInputOptionType !== existingOptionType) {
            mismatchFields.push("optionType")
          }
          if (
            normalizedInputStrikePrice !== null &&
            existingStrikePrice !== null &&
            Math.abs(normalizedInputStrikePrice - existingStrikePrice) > 1e-9
          ) {
            mismatchFields.push("strikePrice")
          }
          if (normalizedInputExpiry && existingExpiry && normalizedInputExpiry !== existingExpiry) {
            mismatchFields.push("expiry")
          }
        }

        if (mismatchFields.length === 0) {
          return existingStock
        }

        await this.logger.warn(
          "ORDER_STOCK_ID_MISMATCH",
          "Provided stockId does not match order identity; recovering by canonical identifiers",
          {
            requestedStockId: input.stockId,
            mismatchFields,
            token,
            instrumentId: normalizedInputInstrumentId,
            symbol: input.symbol,
          },
        )
      } else {
        await this.logger.warn("ORDER_STOCK_RECOVERY", "Provided stockId missing, attempting recovery", {
          requestedStockId: input.stockId,
          symbol: input.symbol
        })
      }
    }

    let instrumentId = normalizedInputInstrumentId
    if (!instrumentId) {
      if (token != null) {
        instrumentId = `${exchange}-${token}`
      } else {
        instrumentId = `${exchange}-${normalizedSymbol}`
      }
    }

    const finalInstrumentId = instrumentId || `${exchange}-${normalizedSymbol}`

    const lookupClauses: Prisma.StockWhereInput[] = []
    if (token != null) {
      lookupClauses.push({ token })
    }
    if (finalInstrumentId) {
      lookupClauses.push({ instrumentId: finalInstrumentId })
    }

    if (lookupClauses.length > 0) {
      const recoveredByIdentifiers = await tx.stock.findFirst({
        where: {
          OR: lookupClauses
        }
      })

      if (recoveredByIdentifiers) {
        await this.logger.logSystemEvent("ORDER_STOCK_RECOVERED", "Recovered stock via identifiers", {
          recoveredStockId: recoveredByIdentifiers.id,
          token,
          instrumentId: finalInstrumentId
        })
        return recoveredByIdentifiers
      }
    }

    const allowSymbolRecovery = token == null && !normalizedInputInstrumentId && !derivativeIdentityHint
    if (allowSymbolRecovery) {
      const recoveredBySymbol = await tx.stock.findFirst({
        where: {
          AND: [
            { symbol: normalizedSymbol },
            { exchange }
          ]
        }
      })

      if (recoveredBySymbol) {
        await this.logger.logSystemEvent("ORDER_STOCK_RECOVERED", "Recovered stock via symbol + exchange", {
          recoveredStockId: recoveredBySymbol.id,
          token,
          instrumentId: finalInstrumentId
        })
        return recoveredBySymbol
      }
    }

    const ltpValue = input.ltp ?? input.price ?? input.close ?? 0
    const closeValue = input.close ?? ltpValue
    const strikePriceDecimal = input.strikePrice != null ? new Prisma.Decimal(input.strikePrice) : undefined
    const expiryDate = parseExpiryDateCandidate(input.expiry)

    const stockPayload: Prisma.StockUncheckedCreateInput = {
      instrumentId: finalInstrumentId,
      symbol: normalizedSymbol,
      exchange,
      ticker: normalizedSymbol,
      name: input.name || input.symbol,
      segment,
      token: token ?? undefined,
      uirId: input.uirId ?? undefined,
      canonicalSymbol: input.canonicalSymbol ?? undefined,
      ltp: ltpValue,
      close: closeValue,
      open: ltpValue,
      high: ltpValue,
      low: ltpValue,
      volume: 0,
      change: 0,
      changePercent: 0,
      isActive: true,
      strikePrice: strikePriceDecimal,
      optionType: normalizedInputOptionType as any,
      expiry: expiryDate,
      lot_size: input.lotSize ?? undefined
    }

    try {
      const created = await tx.stock.create({ data: stockPayload })
      await this.logger.logSystemEvent("ORDER_STOCK_CREATED", "Created synthetic stock for order", {
        stockId: created.id,
        token,
        instrumentId: finalInstrumentId,
        source: 'order-metadata'
      })
      return created
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const conflictLookup: Prisma.StockWhereInput[] = []
        if (token != null) {
          conflictLookup.push({ token })
        }
        if (finalInstrumentId) {
          conflictLookup.push({ instrumentId: finalInstrumentId })
        }

        const recovered = await tx.stock.findFirst({
          where: {
            OR: conflictLookup
          }
        })

        if (recovered) {
          await this.logger.logSystemEvent("ORDER_STOCK_RECOVERED", "Recovered stock after unique constraint", {
            recoveredStockId: recovered.id,
            token,
            instrumentId: finalInstrumentId
          })
          return recovered
        }
      }

      const recoveryError = error instanceof Error ? error : new Error(String(error))
      await this.logger.error("ORDER_STOCK_CREATE_FAILED", "Failed to create fallback stock", recoveryError, {
        token,
        instrumentId: finalInstrumentId,
        exchange,
        symbol: input.symbol
      })

      throw new Error(`Unable to prepare stock record for ${input.symbol}. Please retry.`)
    }
  }

  /**
   * Validate order parameters
   */
  private async validateOrder(input: PlaceOrderInput): Promise<void> {
    log.debug({ value: input.symbol }, "🔍 [ORDER-EXECUTION-SERVICE] Validating order:")

    // Validate quantity
    if (input.quantity <= 0) {
      throw new Error("Quantity must be greater than 0")
    }

    // Validate LIMIT order has price
    if (input.orderType === OrderType.LIMIT && !input.price) {
      throw new Error("LIMIT orders must have a price")
    }

    // Validate trading account exists
    const account = await prisma.tradingAccount.findUnique({
      where: { id: input.tradingAccountId }
    })

    if (!account) {
      throw new Error("Trading account not found")
    }

    // Trading-p7p sub-fixes 1+5/5: SUSPENDED user + maxDailyTrades enforcement.
    // Trading-upr (sub-fix 3/5, was deferred): maxDailyLoss now enforced for OPENING
    // orders only — CLOSING orders bypass the cap so users can always exit losing
    // positions. (maxLeverage clamp is applied in placeOrder via the returned RiskLimit;
    // maxPositionSize is also done in placeOrder once the execution price resolves,
    // since MARKET orders have no input.price to multiply here.)
    let loadedRiskLimit: {
      status: string
      maxLeverage: number | null
      maxPositionSize: number | null
      maxDailyTrades: number | null
      maxDailyLoss: number | null
    } | null = null
    try {
      const riskLimitRow = await prisma.riskLimit.findUnique({
        where: { userId: account.userId },
        select: {
          status: true,
          maxLeverage: true,
          maxPositionSize: true,
          maxDailyTrades: true,
          maxDailyLoss: true,
        },
      })
      if (riskLimitRow) {
        loadedRiskLimit = {
          status: riskLimitRow.status,
          maxLeverage: riskLimitRow.maxLeverage != null ? Number(riskLimitRow.maxLeverage) : null,
          maxPositionSize: riskLimitRow.maxPositionSize != null ? Number(riskLimitRow.maxPositionSize) : null,
          maxDailyTrades: riskLimitRow.maxDailyTrades ?? null,
          maxDailyLoss: riskLimitRow.maxDailyLoss != null ? Number(riskLimitRow.maxDailyLoss) : null,
        }
      }

      if (loadedRiskLimit?.status === "SUSPENDED") {
        log.warn({
          userId: account.userId,
          tradingAccountId: input.tradingAccountId,
        }, "⛔ [ORDER-EXECUTION-SERVICE] order rejected: user suspended")
        throw new UserSuspendedTradingError()
      }

      // maxDailyTrades: 0 (default) means "unlimited" — only enforce when admin
      // set a positive value. IST 00:00 boundary aligns with the platform-wide
      // IST timestamp convention.
      if (loadedRiskLimit && loadedRiskLimit.maxDailyTrades && loadedRiskLimit.maxDailyTrades > 0) {
        const startOfIstDayUtc = (() => {
          const now = new Date()
          const istShifted = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
          istShifted.setUTCHours(0, 0, 0, 0)
          return new Date(istShifted.getTime() - 5.5 * 60 * 60 * 1000)
        })()

        const todaysOrderCount = await prisma.order.count({
          where: {
            tradingAccountId: input.tradingAccountId,
            createdAt: { gte: startOfIstDayUtc },
          },
        })
        if (todaysOrderCount >= loadedRiskLimit.maxDailyTrades) {
          log.warn({
            userId: account.userId,
            tradingAccountId: input.tradingAccountId,
            todaysOrderCount,
            maxDailyTrades: loadedRiskLimit.maxDailyTrades,
          }, "⛔ [ORDER-EXECUTION-SERVICE] order rejected: daily trade cap reached")
          throw new DailyTradeCapTradingError(
            `Daily trade limit reached (${todaysOrderCount}/${loadedRiskLimit.maxDailyTrades}). ` +
              `New orders will resume after IST 00:00.`,
          )
        }
      }

      // Trading-upr: maxDailyLoss enforcement. 0 (default) means "unlimited" — only
      // enforce when admin set a positive cap. CLOSING orders bypass the cap by design
      // so users can always exit losing positions; only OPENING orders are blocked. The
      // PnL summary is cached for 5s on the hot path; bustDailyPnLCache is called on
      // position close to keep the data fresh.
      if (loadedRiskLimit?.maxDailyLoss && loadedRiskLimit.maxDailyLoss > 0) {
        const summary = await getTodayPnLSummary(account.userId)
        // totalPnL <= -maxDailyLoss means the user is at or past the cap. Use a small
        // strict inequality on negative numbers: -55_000 <= -50_000 is TRUE → trigger.
        if (summary.totalPnL <= -loadedRiskLimit.maxDailyLoss) {
          // Determine open vs close. Need user's open positions for this symbol.
          const userOpenPositions = await prisma.position.findMany({
            where: {
              tradingAccountId: input.tradingAccountId,
              closedAt: null,
              quantity: { not: 0 },
            },
            select: { symbol: true, quantity: true },
          })
          const direction = classifyOrderDirection({
            orderSide: input.orderSide,
            symbol: input.symbol,
            existingPositions: userOpenPositions,
          })
          if (direction === "OPEN") {
            log.warn(
              {
                userId: account.userId,
                tradingAccountId: input.tradingAccountId,
                totalPnL: summary.totalPnL,
                realizedPnL: summary.realizedPnL,
                unrealizedPnL: summary.unrealizedPnL,
                maxDailyLoss: loadedRiskLimit.maxDailyLoss,
                symbol: input.symbol,
                side: input.orderSide,
              },
              "⛔ [ORDER-EXECUTION-SERVICE] order rejected: maxDailyLoss reached (opening order)",
            )
            throw new DailyLossCapTradingError(
              `Daily loss limit reached (₹${Math.abs(summary.totalPnL).toFixed(2)} / ₹${loadedRiskLimit.maxDailyLoss.toFixed(2)}). ` +
                `Closing orders are still allowed; new opening orders will resume after IST 00:00.`,
            )
          }
          // direction === "CLOSE" → allow (user is exiting losing exposure).
          log.info(
            {
              userId: account.userId,
              symbol: input.symbol,
              side: input.orderSide,
              totalPnL: summary.totalPnL,
              maxDailyLoss: loadedRiskLimit.maxDailyLoss,
            },
            "DAILY_LOSS_CAP_BYPASSED — closing order at/past cap allowed by design",
          )
        }
      }
    } catch (err) {
      // Re-throw structured trading errors so the route maps them to HTTP 403.
      // Other DB errors (transient lookup failure) fail OPEN — don't halt the
      // platform for an infra blip on a single optional read. Mirrors the
      // winner-mitigation fail-open pattern below.
      if (err instanceof UserSuspendedTradingError) throw err
      if (err instanceof DailyTradeCapTradingError) throw err
      // Trading-upr: maxDailyLoss rejection must propagate — fail-open here would let a
      // user bust through their daily cap on a transient cache read.
      if (err instanceof DailyLossCapTradingError) throw err
      log.warn({
        message: err instanceof Error ? err.message : String(err),
        userId: account.userId,
      }, "⚠️ [ORDER-EXECUTION-SERVICE] RiskLimit lookup failed (fail-open)")
    }

    // Stash the loaded RiskLimit on the working input so placeOrder can apply
    // the maxLeverage clamp + maxPositionSize check post-price-resolution
    // without re-querying. NOT a public field; only used internally.
    ;(input as PlaceOrderInput & { _riskLimit?: typeof loadedRiskLimit })._riskLimit = loadedRiskLimit

    // Phase 9.5 — Winner Mitigation enforcement.
    // For clients without a ClientWinnerControl row OR with rung NONE, this is a no-op.
    // Only admin-set rungs trigger an actual check; the gate is fail-OPEN on infra errors
    // (transient DB/Redis failure must not halt v1 trading).
    await this.enforceWinnerMitigation(input, account.userId).catch((err) => {
      // Re-throw winner-mitigation rejections so the order is blocked; swallow infra errors.
      if (err instanceof Error && err.name === "WinnerMitigationReject") throw err
      log.warn({
        message: err instanceof Error ? err.message : String(err),
      }, "⚠️ [ORDER-EXECUTION-SERVICE] winner mitigation lookup failed (fail-open)")
    })

    log.info("✅ [ORDER-EXECUTION-SERVICE] Order validation completed")
  }

  /**
   * Phase 9.5 — Apply the Winner Mitigation order gate.
   * Looks up the client's ClientWinnerControl, computes intent (notional + would-reduce),
   * and rejects with a structured error when the gate denies.
   *
   * Behaviour:
   *  - No row OR rung NONE → no-op
   *  - CLOSE_ONLY → looks up the open position in this symbol; reductive orders are allowed
   *  - INSTRUMENT_BLOCK / SEGMENT_BLOCK → rejects on symbol or segment match
   *  - ORDER_REJECT → rejects when notional > maxOrderNotional
   *  - CLOSED_OUT → rejects unconditionally
   *
   * Errors of name "WinnerMitigationReject" are propagated by callers (validateOrder); other
   * errors are swallowed by the caller so a transient DB/Redis hiccup never halts trading.
   */
  private async enforceWinnerMitigation(
    input: PlaceOrderInput,
    accountUserId?: string | null,
  ): Promise<void> {
    if (!accountUserId) return
    const control = await getWinnerControl(accountUserId)
    if (control.rung === "NONE") return

    const segment = (input.segment || input.exchange || "NSE").toUpperCase()
    const referencePrice =
      typeof input.price === "number" && Number.isFinite(input.price) && input.price > 0
        ? input.price
        : 0
    const notional = Math.abs(input.quantity * referencePrice)

    let wouldReduceExisting = false
    if (control.rung === "CLOSE_ONLY") {
      const openPosition = await prisma.position.findFirst({
        where: {
          tradingAccountId: input.tradingAccountId,
          symbol: input.symbol,
          closedAt: null,
        },
        select: { quantity: true },
      })
      if (openPosition && openPosition.quantity !== 0) {
        const incomingSide = input.orderSide
        const reducesLong = openPosition.quantity > 0 && incomingSide === OrderSide.SELL
        const reducesShort = openPosition.quantity < 0 && incomingSide === OrderSide.BUY
        wouldReduceExisting =
          (reducesLong || reducesShort) &&
          input.quantity <= Math.abs(openPosition.quantity)
      }
    }

    const decision = evaluateOrderAgainstControl(
      { symbol: input.symbol, segment, notional, wouldReduceExisting },
      control,
    )
    if (!decision.allowed) {
      const err = new Error(
        decision.reason ?? `Order blocked by winner mitigation (${decision.code ?? "rule"})`,
      )
      err.name = "WinnerMitigationReject"
      throw err
    }
  }

  /**
   * Cancel a pending order
   */
  async cancelOrder(orderId: string): Promise<{ success: boolean; message: string }> {
    log.debug({ value: orderId }, "❌ [ORDER-EXECUTION-SERVICE] Cancelling order:")

    await this.logger.logOrder("ORDER_CANCEL_START", `Cancelling order: ${orderId}`, {
      orderId
    })

    try {
      await executeInTransaction(async (tx) => {
        // Get order details
        const order = await this.orderRepo.findById(orderId, tx)

        if (!order) {
          throw new Error("Order not found")
        }

        if (order.status !== 'PENDING') {
          throw new Error(`Cannot cancel ${order.status} order`)
        }

        let blockedMargin = order.blockedMargin ?? 0
        let placementCharges = order.placementCharges ?? 0

        if (blockedMargin <= 0 && placementCharges <= 0) {
          const averagePriceCandidate = parseFiniteOrderNumber(order.averagePrice)
          const orderPriceCandidate = parseFiniteOrderNumber(order.price)
          let priceForMarginCalc =
            (averagePriceCandidate !== null && averagePriceCandidate > 0
              ? averagePriceCandidate
              : null) ??
            (orderPriceCandidate !== null && orderPriceCandidate > 0
              ? orderPriceCandidate
              : null) ??
            0

          if (priceForMarginCalc === 0 && order.Stock) {
            priceForMarginCalc = parseFiniteOrderNumber(order.Stock.ltp) ?? 0
            log.warn(
              { priceForMarginCalc },
              "Legacy cancel: using stock LTP for margin",
            )
          }

          if (priceForMarginCalc <= 0) {
            log.error("❌ [ORDER-EXECUTION-SERVICE] Cannot calculate margin - no price available")
            throw new Error("Unable to calculate margin for order cancellation")
          }

          const marginCalcLegacy = await this.marginCalculator.calculateMargin(
            order.Stock?.segment || "NSE",
            order.productType,
            order.quantity,
            priceForMarginCalc,
            order.Stock?.lot_size || 1,
            order.orderSide,
            { optionType: (order.Stock as { optionType?: string | null } | null | undefined)?.optionType },
          )
          blockedMargin = marginCalcLegacy.requiredMargin
        }

        await this.orderRepo.markCancelled(orderId, tx)

        await releaseOrderAdmissionOnCancelTx(tx, this.fundService, {
          orderId,
          tradingAccountId: order.tradingAccountId,
          blockedMargin,
          placementCharges,
          marginReleaseDescription: `Margin released: order cancelled. Symbol: ${order.symbol}. Released: ₹${Number(blockedMargin).toLocaleString()}. Order ref: ${shortRefId(orderId)}.`,
          chargesRefundDescription: `Charges refunded: order cancelled before execution. Symbol: ${order.symbol}. Refunded: ₹${Number(placementCharges).toLocaleString()}. Order ref: ${shortRefId(orderId)}.`,
        })

        log.info("✅ [ORDER-EXECUTION-SERVICE] Order cancelled; admission margin/charges reconciled")
      })

      await this.logger.logOrder("ORDER_CANCELLED", `Order cancelled successfully: ${orderId}`, {
        orderId
      })

      // Create notification for order cancelled (non-blocking)
      try {
        // Re-fetch minimal order info outside tx (TS-safe + best-effort)
        const cancelled = await prisma.order.findUnique({
          where: { id: orderId },
          select: { tradingAccountId: true, symbol: true, quantity: true }
        })
        const userId = cancelled?.tradingAccountId
          ? await this.getUserIdFromTradingAccount(cancelled.tradingAccountId)
          : null
        if (userId) {
          await NotificationService.notifyOrderCancelled(userId, {
            symbol: cancelled?.symbol || "UNKNOWN",
            quantity: cancelled?.quantity || 0
          })
        }
      } catch (notifError) {
        log.warn({ value: notifError }, "⚠️ [ORDER-EXECUTION-SERVICE] Failed to create order cancelled notification:")
      }

      return {
        success: true,
        message: "Order cancelled successfully"
      }

    } catch (error: any) {
      log.error({ err: error }, "❌ [ORDER-EXECUTION-SERVICE] Order cancellation failed:")
      await this.logger.error("ORDER_CANCEL_FAILED", error.message, error, { orderId })
      throw error
    }
  }

  /**
   * Get userId from tradingAccountId
   */
  private async getUserIdFromTradingAccount(tradingAccountId: string): Promise<string | null> {
    try {
      const tradingAccount = await prisma.tradingAccount.findUnique({
        where: { id: tradingAccountId },
        select: { userId: true }
      })
      return tradingAccount?.userId || null
    } catch (error) {
      log.warn({ value: error }, "⚠️ [ORDER-EXECUTION-SERVICE] Failed to get userId from tradingAccount:")
      return null
    }
  }

  /**
   * Modify a pending order
   */
  async modifyOrder(
    orderId: string,
    updates: { price?: number; quantity?: number }
  ): Promise<{ success: boolean; message: string }> {
    log.debug({ orderId, updates }, "🔧 [ORDER-EXECUTION-SERVICE] Modifying order:")

    await this.logger.logOrder("ORDER_MODIFY_START", `Modifying order: ${orderId}`, {
      orderId,
      updates
    })

    try {
      await executeInTransaction(async (tx) => {
        const order = await this.orderRepo.findById(orderId, tx)

        if (!order) {
          throw new Error("Order not found")
        }

        if (order.status !== 'PENDING') {
          throw new Error(`Cannot modify ${order.status} order`)
        }

        if (!order.stockId || !order.Stock) {
          throw new Error("Order is missing stock reference; cannot modify margin")
        }

        const nextQuantity =
          updates.quantity !== undefined ? Math.trunc(updates.quantity) : order.quantity
        if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
          throw new Error("Quantity must be a positive integer")
        }

        const updateData: { price?: number | null; quantity?: number; blockedMargin?: number; placementCharges?: number } = {}
        if (updates.price !== undefined) updateData.price = updates.price
        if (updates.quantity !== undefined) updateData.quantity = nextQuantity

        const normalizedSegment = (order.Stock?.segment || "NSE").toUpperCase()
        const normalizedProductType = normalizeOrderProductType(order.productType, normalizedSegment)
        const lotForValidation = Math.max(
          1,
          Math.trunc(
            parseFiniteOrderNumber(order.Stock?.lot_size) ?? 1,
          ),
        )
        const segU = normalizedSegment
        if (
          segU === "NFO" ||
          segU === "FNO" ||
          segU === "NSE_FO" ||
          segU === "MCX" ||
          segU === "MCX_FO"
        ) {
          if (lotForValidation > 1 && nextQuantity % lotForValidation !== 0) {
            throw new Error(
              `Quantity must be a multiple of lot size (${lotForValidation}) for ${segU}`,
            )
          }
        }

        const orderPriceCandidate = parseFiniteOrderNumber(order.price)
        const updatePriceCandidate =
          updates.price !== undefined ? parseFiniteOrderNumber(updates.price) : null
        let execPrice =
          (updatePriceCandidate !== null && updatePriceCandidate > 0
            ? updatePriceCandidate
            : null) ??
          (orderPriceCandidate !== null && orderPriceCandidate > 0 ? orderPriceCandidate : null) ??
          (parseFiniteOrderNumber(order.Stock?.ltp) ?? 0)

        if (order.orderType === OrderType.LIMIT && (!execPrice || execPrice <= 0)) {
          throw new Error("LIMIT order modification requires a valid limit price")
        }
        if (!execPrice || execPrice <= 0) {
          throw new Error("Cannot compute margin for modified order — missing price or LTP")
        }

        const marginNext = await this.marginCalculator.calculateMargin(
          order.Stock?.segment || "NSE",
          normalizedProductType,
          nextQuantity,
          execPrice,
          lotForValidation,
          order.orderSide,
          { optionType: (order.Stock as { optionType?: string | null } | null | undefined)?.optionType },
        )

        const oldBm = order.blockedMargin ?? 0
        const oldPc = order.placementCharges ?? 0
        const newBm = marginNext.requiredMargin
        const newPc = marginNext.totalCharges
        const deltaM = newBm - oldBm
        const deltaC = newPc - oldPc

        if (deltaM > 0) {
          await this.fundService.blockMarginTx(
            tx,
            order.tradingAccountId,
            deltaM,
            `Additional margin blocked: modify order ${order.symbol} ref ${shortRefId(orderId)}.`,
            { orderId },
          )
        } else if (deltaM < 0) {
          await this.fundService.releaseMarginTx(
            tx,
            order.tradingAccountId,
            Math.abs(deltaM),
            `Margin released: modify order ${order.symbol} ref ${shortRefId(orderId)}.`,
            { orderId },
          )
        }

        if (deltaC > 0) {
          await this.fundService.debitTx(
            tx,
            order.tradingAccountId,
            deltaC,
            `Additional charges: modify order ${order.symbol} ref ${shortRefId(orderId)}.`,
            { orderId },
          )
        } else if (deltaC < 0) {
          await this.fundService.creditTx(
            tx,
            order.tradingAccountId,
            Math.abs(deltaC),
            `Charges reduced on modify: ${order.symbol} ref ${shortRefId(orderId)}.`,
            { orderId },
          )
        }

        await this.orderRepo.update(orderId, {
          ...updateData,
          blockedMargin: newBm,
          placementCharges: newPc,
        }, tx)

        log.info("✅ [ORDER-EXECUTION-SERVICE] Order modified (margin rebalanced)")
      })

      await this.logger.logOrder("ORDER_MODIFIED", `Order modified successfully: ${orderId}`, {
        orderId,
        updates
      })

      return {
        success: true,
        message: "Order modified successfully"
      }

    } catch (error: any) {
      log.error({ err: error }, "❌ [ORDER-EXECUTION-SERVICE] Order modification failed:")
      await this.logger.error("ORDER_MODIFY_FAILED", error.message, error, { orderId, updates })
      throw error
    }
  }
}

/**
 * Create order execution service instance
 */
export function createOrderExecutionService(logger?: TradingLogger): OrderExecutionService {
  log.info("🏭 [ORDER-EXECUTION-SERVICE] Creating service instance")
  return new OrderExecutionService(logger)
}

