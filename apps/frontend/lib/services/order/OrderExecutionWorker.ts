/**
 * @file OrderExecutionWorker.ts
 * @module order-execution
 * @description Background worker that executes PENDING orders asynchronously (portable across EC2 and serverless).
 * @author StockTrade
 * @created 2026-02-03
 * @updated 2026-03-31
 * @updated 2026-04-08 — Option margin side on offset/position block; compensation Stock select includes optionType.
 *
 * Notes:
 * - Because `OrderStatus` only supports PENDING/EXECUTED/CANCELLED, we rely on a single active worker
 *   (or external queue partitioning) to avoid double-processing.
 * - All writes happen inside a single Prisma transaction to preserve consistency.
 * - LIMIT orders use the same fresh-quote wait as MARKET; fills only when last trade is marketable vs limit.
 */

import { executeInTransaction } from "@/lib/services/utils/prisma-transaction"
import os from "os"
import { createTradingLogger } from "@/lib/services/logging/TradingLogger"
import { NotificationService } from "@/lib/services/notifications/NotificationService"
import { OrderRepository } from "@/lib/repositories/OrderRepository"
import { PositionRepository } from "@/lib/repositories/PositionRepository"
import { TransactionRepository } from "@/lib/repositories/TransactionRepository"
import { FundManagementService } from "@/lib/services/funds/FundManagementService"
import { MarginCalculator } from "@/lib/services/risk/MarginCalculator"
import {
  marginRiskSideForOffsetRelease,
  marginRiskSideForSignedPositionQty,
} from "@/lib/services/risk/risk-margin-side"
import { OrderPurpose, OrderSide, OrderStatus, OrderType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ORDER_WORKER_ENABLED_KEY, updateWorkerHeartbeat, WORKER_IDS } from "@/lib/server/workers/registry"
import { getLatestActiveGlobalSettings, parseBooleanSetting } from "@/lib/server/workers/system-settings"
import {
  getServerMarketDataService,
  SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
} from "@/lib/market-data/server-market-data.service"
import { baseLogger } from "@/lib/observability/logger"
import { isRedisEnabled } from "@/lib/redis/redis-client"
import { parseFiniteOrderNumber } from "@/lib/services/order/order-number-utils"
import { resolveInstrumentTokenBestEffort } from "@/lib/server/instrument-token-utils"
import { normalizeSubscriptionKey, resolveSubscriptionIdentity } from "@/lib/market-data/utils/quote-lookup"
import {
  reconcileOrderAdmissionAfterFillTx,
  releaseOrderAdmissionOnCancelTx,
} from "@/lib/services/order/order-admission-margin"
import { createPositionManagementService } from "@/lib/services/position/PositionManagementService"
import { getMarketDisplayPositionPricingPolicies } from "@/lib/server/market-display-exit-policy"
import { resolveSquareOffExitPrice } from "@/lib/server/position-square-off-exit-price"
import {
  fillPriceFromSnapshot,
  quoteFromLtp,
} from "@/lib/market-control/market-control-resolver"
import {
  applyAntiScalp,
  favorableMovePct,
  type AntiScalpVerdict,
} from "@/lib/market-control/anti-scalp-service"
import {
  recordFill,
  recordCloseRoundTrip,
  evaluateAndMaybeFlag,
} from "@/lib/market-control/scalper-flagger"
import type { AntiScalpingV1 } from "@/lib/market-control/market-control-config.schema"
import { loadMarketControlConfig } from "@/lib/market-control/market-control-loader"
// Phase 9.5 / 10.5 — Post-fill hooks for Winner Mitigation auto-promotion + Bonus burndown.
// Both run AFTER the execution transaction commits; both are best-effort (errors are logged
// and swallowed — a failure here must never roll back a settled trade).
import { evaluateClientForPromotion } from "@/lib/winners/rule-engine"
import { advanceTurnoverForUser } from "@/lib/bonus/burndown"
import { accrueForTrade } from "@/lib/affiliate/commission-accrual"

const ORDER_EXECUTION_ADVISORY_LOCK_NS = 910_001
const ORDER_WORKER_ENABLED_CACHE_TTL_MS = 5_000

/** Short order ID for statement descriptions (last 8 chars). */
function shortRefId(id: string): string {
  if (!id || typeof id !== "string") return "unknown"
  return id.length > 8 ? id.slice(-8) : id
}

function resolveOrderWorkerTimingConfig(input: { envKey: string; fallback: number; min: number }): number {
  const parsed = parseFiniteOrderNumber(process.env[input.envKey])
  if (parsed === null) {
    return input.fallback
  }
  return Math.max(input.min, Math.trunc(parsed))
}

const MARKET_SERVER_QUOTE_MAX_AGE_MS = resolveOrderWorkerTimingConfig({
  envKey: "MARKET_SERVER_QUOTE_MAX_AGE_MS",
  fallback: 60_000,
  min: 1_000,
})
const MARKET_SERVER_QUOTE_WAIT_TIMEOUT_MS = resolveOrderWorkerTimingConfig({
  envKey: "MARKET_SERVER_QUOTE_WAIT_TIMEOUT_MS",
  fallback: 1_500,
  min: 0,
})
const MARKET_SERVER_QUOTE_WAIT_POLL_MS = resolveOrderWorkerTimingConfig({
  envKey: "MARKET_SERVER_QUOTE_WAIT_POLL_MS",
  fallback: 100,
  min: 25,
})
const MARKET_SERVER_QUOTE_RETRY_WINDOW_MS = resolveOrderWorkerTimingConfig({
  envKey: "MARKET_SERVER_QUOTE_RETRY_WINDOW_MS",
  fallback: 45_000,
  min: 5_000,
})
const EXCHANGE_REJECTED_STALE_QUOTE_CODE = "EXCHANGE_REJECTED_STALE_QUOTE"
const EXCHANGE_REJECTED_STALE_QUOTE_REASON = `Exchange rejected: stale quote (>${Math.max(
  1,
  Math.round(MARKET_SERVER_QUOTE_MAX_AGE_MS / 1000),
)}s). Please retry.`
const ORDER_EXECUTION_INVALID_PRICE_CODE = "ORDER_EXECUTION_INVALID_PRICE"
const ORDER_EXECUTION_INVALID_PRICE_REASON = "Order execution cancelled: no valid execution price."
const ORDER_EXECUTION_MISSING_STOCK_CODE = "ORDER_EXECUTION_MISSING_STOCK"
const ORDER_EXECUTION_MISSING_STOCK_REASON = "Order execution cancelled: missing stock reference."
const ORDER_EXECUTION_INVALID_LIMIT_CODE = "ORDER_EXECUTION_INVALID_LIMIT"
const ORDER_EXECUTION_INVALID_LIMIT_REASON = "Order execution cancelled: invalid LIMIT price."

let cachedOrderWorkerEnabled: { value: boolean; expiresAtMs: number } | null = null
const workerLog = baseLogger.child({ worker: "order-execution-worker", host: os.hostname(), pid: process.pid })

function toExecutionPriceNumber(v: unknown): number | null {
  const parsedValue = parseFiniteOrderNumber(v)
  if (parsedValue === null || parsedValue <= 0) {
    return null
  }
  return parsedValue
}

function toExecutionTokenNumber(v: unknown): number | null {
  const parsedValue = parseFiniteOrderNumber(v)
  if (parsedValue === null || parsedValue <= 0 || !Number.isFinite(parsedValue)) {
    return null
  }
  return Math.trunc(parsedValue)
}

function resolveOrderToken(input: { stockToken?: unknown; instrumentId?: string | null | undefined }): number | null {
  const fromStockToken = toExecutionTokenNumber(input.stockToken)
  if (fromStockToken !== null) {
    return fromStockToken
  }
  return resolveInstrumentTokenBestEffort(input.instrumentId)
}

function resolveExecutionPriceFallback(input: {
  averagePrice?: unknown
  price?: unknown
  stockLtp?: unknown
  wsLtp?: unknown
}): number {
  return (
    toExecutionPriceNumber(input.averagePrice) ??
    toExecutionPriceNumber(input.price) ??
    toExecutionPriceNumber(input.wsLtp) ??
    toExecutionPriceNumber(input.stockLtp) ??
    0
  )
}

type WorkerOrderAdmissionRow = {
  id: string
  tradingAccountId: string
  symbol: string
  quantity: number
  productType: string | null
  orderSide: OrderSide
  price: Prisma.Decimal | null
  averagePrice: Prisma.Decimal | null
  blockedMargin: number | null
  placementCharges: number | null
  Stock: {
    segment?: string | null
    lot_size?: unknown
    ltp?: unknown
    optionType?: string | null
  } | null
}

async function releaseAdmissionAfterWorkerCancelTx(
  tx: Prisma.TransactionClient,
  fundService: FundManagementService,
  marginCalculator: MarginCalculator,
  order: WorkerOrderAdmissionRow,
  reasonLabel: string,
  executionPriceHint: number,
): Promise<void> {
  let blockedMargin = order.blockedMargin ?? 0
  let placementCharges = order.placementCharges ?? 0

  if (blockedMargin <= 0 && placementCharges <= 0) {
    let px = executionPriceHint > 0 ? executionPriceHint : 0
    if (px <= 0) {
      px = resolveExecutionPriceFallback({
        averagePrice: order.averagePrice,
        price: order.price,
        wsLtp: null,
        stockLtp: order.Stock?.ltp,
      })
    }
    if (px > 0) {
      const segment = (order.Stock?.segment || "NSE").toUpperCase()
      const productType = (order.productType || "MIS").toUpperCase()
      const lotSize = Math.max(1, Math.trunc(parseFiniteOrderNumber(order.Stock?.lot_size) ?? 1))
      const calc = await marginCalculator.calculateMargin(
        segment,
        productType,
        order.quantity,
        px,
        lotSize,
        order.orderSide,
        { optionType: (order.Stock as { optionType?: string | null } | null | undefined)?.optionType },
      )
      blockedMargin = calc.requiredMargin
    }
  }

  await releaseOrderAdmissionOnCancelTx(tx, fundService, {
    orderId: order.id,
    tradingAccountId: order.tradingAccountId,
    blockedMargin,
    placementCharges,
    marginReleaseDescription: `Margin released: ${reasonLabel}. Symbol: ${order.symbol}. Released: ₹${Number(blockedMargin).toLocaleString()}. Order ref: ${shortRefId(order.id)}.`,
    chargesRefundDescription: `Charges refunded: ${reasonLabel}. Symbol: ${order.symbol}. Refunded: ₹${Number(placementCharges).toLocaleString()}. Order ref: ${shortRefId(order.id)}.`,
  })
}

async function isOrderWorkerEnabled(): Promise<boolean> {
  const now = Date.now()
  if (cachedOrderWorkerEnabled && cachedOrderWorkerEnabled.expiresAtMs > now) {
    return cachedOrderWorkerEnabled.value
  }

  try {
    const rows = await getLatestActiveGlobalSettings([ORDER_WORKER_ENABLED_KEY])
    const raw = rows.get(ORDER_WORKER_ENABLED_KEY)?.value ?? null
    const parsed = parseBooleanSetting(raw)
    const resolved = parsed ?? true // default enabled
    cachedOrderWorkerEnabled = { value: resolved, expiresAtMs: now + ORDER_WORKER_ENABLED_CACHE_TTL_MS }
    return resolved
  } catch (e) {
    workerLog.warn({
      message: (e as any)?.message || String(e),
    }, "failed to resolve enabled flag; defaulting to enabled")
    cachedOrderWorkerEnabled = { value: true, expiresAtMs: now + ORDER_WORKER_ENABLED_CACHE_TTL_MS }
    return true
  }
}

export interface ProcessPendingOrdersInput {
  limit?: number
  maxAgeMs?: number
  /** When set, only orders with this purpose are processed (e.g. CLOSE queue backstop). */
  orderPurpose?: OrderPurpose
}

export interface ProcessPendingOrdersResult {
  scanned: number
  executed: number
  cancelled: number
  errors: Array<{ orderId: string; message: string }>
}

function normalizeOrderRunLimit(value: unknown): number {
  const parsedValue = parseFiniteOrderNumber(value)
  if (parsedValue === null) {
    return 25
  }
  return Math.min(200, Math.max(1, Math.trunc(parsedValue)))
}

function normalizeOrderRunMaxAgeMs(value: unknown): number {
  const parsedValue = parseFiniteOrderNumber(value)
  if (parsedValue === null) {
    return 0
  }
  return Math.max(0, Math.trunc(parsedValue))
}

function normalizeOrderId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalizedOrderId = value.trim()
  if (!normalizedOrderId || normalizedOrderId.length > 128) {
    return null
  }
  return normalizedOrderId
}

export class OrderExecutionWorker {
  private orderRepo = new OrderRepository()
  private positionRepo = new PositionRepository()
  private transactionRepo = new TransactionRepository()

  /**
   * Read the admin-controlled emergency levers from MarketControlConfigV1. Best-effort:
   * a config-load failure returns null and the worker falls through to the standard
   * stale-quote path. Mirrors `OrderExecutionService.loadOrderBehaviorOrNull` so the
   * placement gate and the worker gate read the SAME flag.
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
      workerLog.warn(
        { message: (error as { message?: string })?.message || String(error) },
        "Failed to read orderBehavior gates from market control config; using server pricing",
      )
      return null
    }
  }

  /**
   * Compute a deterministic 64-bit advisory lock key for an order.
   *
   * We intentionally use the single-argument overload `pg_try_advisory_xact_lock(bigint)`
   * to avoid Postgres overload mismatch issues that can happen with `(bigint, integer)`.
   *
   * Layout:
   * - High 32 bits: ORDER_EXECUTION_ADVISORY_LOCK_NS
   * - Low  32 bits: hashtext(orderId::text) (masked to unsigned 32-bit)
   */
  private buildOrderExecutionAdvisoryLockSql(orderId: string): Prisma.Sql {
    return Prisma.sql`
      SELECT pg_try_advisory_xact_lock(
        ((${ORDER_EXECUTION_ADVISORY_LOCK_NS}::bigint << 32) | (hashtext(${orderId}::text)::bigint & 4294967295))
      ) AS locked
    `
  }

  /**
   * Process the oldest PENDING orders.
   * Designed for: EC2 loop worker OR Lambda/EventBridge scheduled trigger.
   */
  async processPendingOrders(input: ProcessPendingOrdersInput = {}): Promise<ProcessPendingOrdersResult> {
    const startedAt = Date.now()
    const normalizedInput =
      input && typeof input === "object" ? (input as ProcessPendingOrdersInput) : ({} as ProcessPendingOrdersInput)
    const limit = normalizeOrderRunLimit(normalizedInput.limit)
    const maxAgeMs = normalizeOrderRunMaxAgeMs(normalizedInput.maxAgeMs)

    workerLog.info({ limit, maxAgeMs }, "processing pending orders")

    const enabled = await isOrderWorkerEnabled()
    if (!enabled) {
      workerLog.info({ limit, maxAgeMs }, "disabled via SystemSettings; skipping batch")
      return { scanned: 0, executed: 0, cancelled: 0, errors: [] }
    }

    const serverMarketData = getServerMarketDataService()
    await serverMarketData.ensureInitialized().catch((e) => {
      workerLog.warn({
        message: (e as any)?.message || String(e),
      }, "server marketdata init failed; will fallback to Stock.ltp")
    })

    const cutoff = maxAgeMs > 0 ? new Date(Date.now() - maxAgeMs) : null

    const purposeFilter =
      normalizedInput.orderPurpose !== undefined ? { orderPurpose: normalizedInput.orderPurpose } : {}

    const pending = await prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        ...purposeFilter,
        ...(cutoff ? { createdAt: { lte: cutoff } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: {
        Stock: { select: { id: true, ltp: true, segment: true, lot_size: true, instrumentId: true, token: true, uirId: true, exchange: true } },
        tradingAccount: { select: { id: true, userId: true } }
      }
    })

    try {
      const keys = new Map<string, string | number>()
      for (const order of pending) {
        const token = resolveOrderToken({ stockToken: order.Stock?.token, instrumentId: order.Stock?.instrumentId })
        if (token === null) continue
        const subscriptionKey =
          resolveSubscriptionIdentity({
            token,
            uirId: (order.Stock as any)?.uirId,
            instrumentId: order.Stock?.instrumentId,
            exchange: (order.Stock as any)?.exchange,
            segment: (order.Stock as any)?.segment,
          }).subscriptionKey ?? token
        const normalizedKey = normalizeSubscriptionKey(subscriptionKey)
        if (!keys.has(normalizedKey)) {
          keys.set(normalizedKey, typeof subscriptionKey === "string" ? normalizedKey : subscriptionKey)
        }
      }
      const keysToSubscribe = Array.from(keys.values())
      if (keysToSubscribe.length > 0) serverMarketData.ensureSubscribed(keysToSubscribe)
    } catch (e) {
      workerLog.warn({
        message: (e as any)?.message || String(e),
      }, "ensureSubscribed failed; continuing")
    }

    const result: ProcessPendingOrdersResult = { scanned: pending.length, executed: 0, cancelled: 0, errors: [] }
    let deferredDueToStaleQuote = 0

    for (const order of pending) {
      try {
        const r = await this.processOrderById(order.id)
        if (r === "executed") result.executed++
        if (r === "cancelled") result.cancelled++
        if (r === "deferred") deferredDueToStaleQuote++
      } catch (e: any) {
        const message = e?.message || String(e)
        workerLog.error({ orderId: order.id, message }, "failed processing order")
        result.errors.push({ orderId: order.id, message })
      }
    }

    workerLog.info(result, "batch completed")

    // Heartbeat (for Admin Console visibility)
    try {
      const feedHealth = serverMarketData.getHealth()
      const heartbeat = {
        lastRunAtIso: new Date().toISOString(),
        host: os.hostname(),
        pid: process.pid,
        redisEnabled: isRedisEnabled(),
        limit,
        maxAgeMs,
        scanned: result.scanned,
        executed: result.executed,
        cancelled: result.cancelled,
        deferredDueToStaleQuote,
        errorCount: result.errors.length,
        elapsedMs: Date.now() - startedAt,
        feedConnected: feedHealth.isConnected,
        feedLastMessageAgeMs: feedHealth.lastMessageAgeMs,
        feedLastConnectErrorAgeMs: feedHealth.lastConnectErrorAgeMs,
        feedLastConnectErrorMessage: feedHealth.lastConnectErrorMessage,
        feedLastSocketErrorCode: feedHealth.lastSocketErrorCode,
        feedLastSocketErrorAgeMs: feedHealth.lastSocketErrorAgeMs,
        feedSubscriptionErrorCount: feedHealth.subscriptionErrorCount,
        feedCachedQuotes: feedHealth.cachedQuotes,
        feedWantedSubscriptions: feedHealth.wantedSubscriptions,
        feedSubscribedSubscriptions: feedHealth.subscribedSubscriptions,
        feedUsingDemoApiKey: feedHealth.usingDemoApiKey,
      }
      await updateWorkerHeartbeat(WORKER_IDS.ORDER_EXECUTION, JSON.stringify(heartbeat))
    } catch (err) {
      workerLog.warn({ message: (err as any)?.message || String(err) }, "failed to update heartbeat")
    }

    return result
  }

  /**
   * Execute a single PENDING order.
   * Returns a stable string outcome so callers can aggregate metrics.
   */
  async processOrderById(orderId: string): Promise<"skipped" | "deferred" | "executed" | "cancelled"> {
    const normalizedOrderId = normalizeOrderId(orderId)
    if (!normalizedOrderId) {
      workerLog.warn({ orderId }, "invalid order id; skipping")
      return "skipped"
    }

    const enabled = await isOrderWorkerEnabled()
    if (!enabled) {
      workerLog.info({ orderId: normalizedOrderId }, "disabled via SystemSettings; skipping order")
      return "skipped"
    }

    const serverMarketData = getServerMarketDataService()
    await serverMarketData.ensureInitialized().catch(() => {})

    workerLog.info({ orderId: normalizedOrderId }, "processing order")

    type TxResult =
      | { outcome: "skipped" }
      | { outcome: "deferred" }
      | { outcome: "cancelled" }
      | {
          outcome: "executed"
          executionPrice: number
          userId?: string
          symbol: string
          quantity: number
          orderSide: OrderSide
          isClose?: boolean
          favorablePct?: number
        }

    // Execute core DB updates in one transaction, guarded by an advisory xact lock to prevent double-processing
    try {
      const txResult = await executeInTransaction<TxResult>(async (tx) => {
        // Advisory lock (per-order) to keep execution idempotent across cron + serverless + EC2 workers.
        const lockRows = await tx.$queryRaw<{ locked: boolean }[]>(
          this.buildOrderExecutionAdvisoryLockSql(normalizedOrderId)
        )
        const locked = lockRows?.[0]?.locked === true
        if (!locked) {
          workerLog.info({ orderId: normalizedOrderId }, "advisory lock not acquired; skipping")
          return { outcome: "skipped" }
        }

        const order = await tx.order.findUnique({
          where: { id: normalizedOrderId },
          include: {
            Stock: {
              select: {
                id: true,
                ltp: true,
                segment: true,
                exchange: true,
                lot_size: true,
                instrumentId: true,
                strikePrice: true,
                optionType: true,
                expiry: true,
                token: true,
                uirId: true,
                canonicalSymbol: true,
              },
            },
            tradingAccount: { select: { id: true, userId: true } }
          }
        })

        if (!order) {
          workerLog.warn({ orderId: normalizedOrderId }, "order not found; skipping")
          return { outcome: "skipped" }
        }

        if (order.status !== OrderStatus.PENDING) {
          workerLog.info({ orderId: normalizedOrderId, status: order.status }, "order not pending; skipping")
          return { outcome: "skipped" }
        }

        // Fresh WS quote for both MARKET and LIMIT (LIMIT needs LTP for marketability).
        // canonicalSymbol mirrors the frontend's WebSocketMarketDataProvider so backend and
        // frontend produce the SAME upstream subscription key for the same instrument; without
        // it, the backend falls through to numeric/exchange-qualified keys (`instruments[]`)
        // while the frontend uses canonical (`symbols[]`), and the upstream gateway treats
        // them as separate subscriptions — leaving the backend without ticks and surfacing as
        // the misleading "stale quote at execution time" exchange rejection.
        const token = resolveOrderToken({ stockToken: order.Stock?.token, instrumentId: order.Stock?.instrumentId })
        const subscriptionKey =
          token !== null
            ? resolveSubscriptionIdentity({
                token,
                uirId: (order.Stock as any)?.uirId,
                instrumentId: order.Stock?.instrumentId,
                exchange: (order.Stock as any)?.exchange,
                segment: (order.Stock as any)?.segment,
                canonicalSymbol: (order.Stock as any)?.canonicalSymbol,
              }).subscriptionKey ?? token
            : null
        if (token !== null && subscriptionKey !== null) {
          try {
            serverMarketData.ensureSubscribed([subscriptionKey])
          } catch {
            // best-effort only
          }
        }
        const isMarketOrder = order.orderType === OrderType.MARKET

        // Admin emergency lever — when ON, the worker SKIPS the WS wait for MARKET orders
        // and uses the price stored on the order at placement time (which itself was the
        // ADMIN_BYPASS client price). Without this gate, an order that was placed via the
        // bypass would still hit the worker's stale-quote rejection if it gets queued
        // (off-hours placement, deferred fill, retry). Read the same flag the placement
        // path uses so the two halves stay in sync.
        const orderBehavior = await this.loadOrderBehaviorOrNull()
        const adminBypassActive =
          isMarketOrder && orderBehavior?.marketOrder.bypassServerQuote === true

        if (adminBypassActive) {
          workerLog.warn(
            {
              orderId: normalizedOrderId,
              symbol: order.symbol,
              orderPrice: order.price,
              token,
            },
            "ADMIN_BYPASS active — worker skipping WS quote wait, using order placement price",
          )
        }

        const wsQuote =
          token && !adminBypassActive
            ? await serverMarketData.waitForFreshQuote(token, {
                timeoutMs: MARKET_SERVER_QUOTE_WAIT_TIMEOUT_MS,
                maxAgeMs: MARKET_SERVER_QUOTE_MAX_AGE_MS,
                pollMs: MARKET_SERVER_QUOTE_WAIT_POLL_MS,
                subscriptionKey: subscriptionKey ?? token,
                resubscribeRetryTimeoutMs: SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
              })
            : null
        const adminBypassPrice = adminBypassActive ? toExecutionPriceNumber(order.price) : null
        const wsExecutionPrice =
          adminBypassPrice ??
          toExecutionPriceNumber(wsQuote?.last_trade_price) ??
          toExecutionPriceNumber(wsQuote?.close)
        if (wsExecutionPrice === null) {
          const orderCreatedAtMs = order.createdAt instanceof Date ? order.createdAt.getTime() : Date.parse(String(order.createdAt || ""))
          const orderAgeMs = Number.isFinite(orderCreatedAtMs) ? Math.max(0, Date.now() - orderCreatedAtMs) : null
          if (orderAgeMs !== null && orderAgeMs < MARKET_SERVER_QUOTE_RETRY_WINDOW_MS) {
            workerLog.info(
              {
                orderId: normalizedOrderId,
                token,
                symbol: order.symbol,
                orderAgeMs,
                retryWindowMs: MARKET_SERVER_QUOTE_RETRY_WINDOW_MS,
                isMarketOrder,
              },
              "order quote stale/missing; deferring within retry window",
            )
            return { outcome: "deferred" }
          }
          const feedHealth = serverMarketData.getHealth()
          workerLog.warn(
            {
              orderId: normalizedOrderId,
              token,
              symbol: order.symbol,
              orderAgeMs,
              retryWindowMs: MARKET_SERVER_QUOTE_RETRY_WINDOW_MS,
              feedHealth,
              isMarketOrder,
            },
            "order quote stale/missing; cancelling as exchange rejected",
          )
          await this.orderRepo.markCancelledWithReason(
            normalizedOrderId,
            EXCHANGE_REJECTED_STALE_QUOTE_CODE,
            EXCHANGE_REJECTED_STALE_QUOTE_REASON,
            tx,
          )
          {
            const logger = createTradingLogger({
              tradingAccountId: order.tradingAccountId,
              userId: order.tradingAccount?.userId,
              symbol: order.symbol,
            })
            const fundService = new FundManagementService(logger)
            const marginCalculator = new MarginCalculator()
            await releaseAdmissionAfterWorkerCancelTx(
              tx,
              fundService,
              marginCalculator,
              order as WorkerOrderAdmissionRow,
              EXCHANGE_REJECTED_STALE_QUOTE_REASON,
              wsExecutionPrice ?? 0,
            )
          }
          return { outcome: "cancelled" }
        }

        // Pull the market-control snapshot captured at placement time. This is the spread/slippage
        // decided by OrderExecutionService.resolveMarketControls and is the source of truth for
        // how this order should be priced at fill — the fresh WS quote is only used as the raw
        // last trade price against which we re-apply that spread.
        const executionContextRaw = (order as any).executionContext as Record<string, any> | null
        const ctxSpreadPct =
          typeof executionContextRaw?.spreadPct === "number" && executionContextRaw.spreadPct > 0
            ? executionContextRaw.spreadPct
            : 0
        const ctxTiltBiasPct =
          typeof executionContextRaw?.tiltBiasPct === "number" ? executionContextRaw.tiltBiasPct : 0
        const limitOrderPolicy = executionContextRaw?.limitOrder ?? null
        const askBidLimitMode =
          (limitOrderPolicy?.marketability as "ask_bid" | "touch" | "cross" | undefined) ?? "ask_bid"
        const limitFillAtPolicy =
          (limitOrderPolicy?.fillAt as "limit" | "side_quote" | "better" | undefined) ?? "better"

        let executionPrice: number
        if (isMarketOrder) {
          // CORE FIX: MARKET fills at ask (BUY) / bid (SELL) — not the raw LTP. The spread was
          // locked at placement and is re-applied here against the fresh last trade.
          executionPrice = ctxSpreadPct > 0
            ? fillPriceFromSnapshot(wsExecutionPrice, order.orderSide === OrderSide.BUY ? "BUY" : "SELL", {
                spreadPct: ctxSpreadPct,
                tiltBiasPct: ctxTiltBiasPct,
              })
            : wsExecutionPrice
        } else {
          const limitPrice = parseFiniteOrderNumber(order.price)
          if (limitPrice === null || limitPrice <= 0) {
            workerLog.error({ orderId: normalizedOrderId, limitPrice }, "invalid LIMIT price; cancelling")
            await this.orderRepo.markCancelledWithReason(
              normalizedOrderId,
              ORDER_EXECUTION_INVALID_LIMIT_CODE,
              ORDER_EXECUTION_INVALID_LIMIT_REASON,
              tx,
            )
            {
              const logger = createTradingLogger({
                tradingAccountId: order.tradingAccountId,
                userId: order.tradingAccount?.userId,
                symbol: order.symbol,
              })
              const fundService = new FundManagementService(logger)
              const marginCalculator = new MarginCalculator()
              await releaseAdmissionAfterWorkerCancelTx(
                tx,
                fundService,
                marginCalculator,
                order as WorkerOrderAdmissionRow,
                ORDER_EXECUTION_INVALID_LIMIT_REASON,
                0,
              )
            }
            return { outcome: "cancelled" }
          }
          const last = wsExecutionPrice
          const isBuy = order.orderSide === OrderSide.BUY
          // CORE FIX: LIMIT marketability uses ask/bid (not raw last) when ctxSpreadPct > 0.
          // BUY fills only when the ask is ≤ limit; SELL only when the bid is ≥ limit.
          const { ask, bid } = ctxSpreadPct > 0
            ? quoteFromLtp(last, ctxSpreadPct)
            : { ask: last, bid: last }
          const marketable =
            askBidLimitMode === "ask_bid"
              ? isBuy
                ? ask <= limitPrice
                : bid >= limitPrice
              : isBuy
                ? last <= limitPrice
                : last >= limitPrice
          if (!marketable) {
            workerLog.info(
              {
                orderId: normalizedOrderId,
                symbol: order.symbol,
                limitPrice,
                lastTrade: last,
                orderSide: order.orderSide,
              },
              "limit order not marketable on last trade; deferring",
            )
            return { outcome: "deferred" }
          }
          // Fill price depends on the limitOrder.fillAt policy captured in executionContext.
          //  - "limit"      → always the user's limit price (worst-case for the house)
          //  - "side_quote" → the spread-adjusted side quote (ask for BUY, bid for SELL)
          //  - "better"     → whichever is better for the customer (default)
          const sideQuote = isBuy ? ask : bid
          if (limitFillAtPolicy === "limit") {
            executionPrice = limitPrice
          } else if (limitFillAtPolicy === "side_quote") {
            executionPrice = sideQuote
          } else {
            executionPrice = isBuy ? Math.min(limitPrice, sideQuote) : Math.max(limitPrice, sideQuote)
          }
        }

        if (!executionPrice || executionPrice <= 0) {
          workerLog.error({ orderId: normalizedOrderId, executionPrice }, "invalid execution price; cancelling")
          await this.orderRepo.markCancelledWithReason(
            normalizedOrderId,
            ORDER_EXECUTION_INVALID_PRICE_CODE,
            ORDER_EXECUTION_INVALID_PRICE_REASON,
            tx,
          )
          {
            const logger = createTradingLogger({
              tradingAccountId: order.tradingAccountId,
              userId: order.tradingAccount?.userId,
              symbol: order.symbol,
            })
            const fundService = new FundManagementService(logger)
            const marginCalculator = new MarginCalculator()
            await releaseAdmissionAfterWorkerCancelTx(
              tx,
              fundService,
              marginCalculator,
              order as WorkerOrderAdmissionRow,
              ORDER_EXECUTION_INVALID_PRICE_REASON,
              0,
            )
          }
          return { outcome: "cancelled" }
        }

        if (!order.stockId || !order.Stock?.id) {
          workerLog.error({ orderId: normalizedOrderId, stockId: order.stockId }, "missing stock reference; cancelling")
          await this.orderRepo.markCancelledWithReason(
            normalizedOrderId,
            ORDER_EXECUTION_MISSING_STOCK_CODE,
            ORDER_EXECUTION_MISSING_STOCK_REASON,
            tx,
          )
          {
            const logger = createTradingLogger({
              tradingAccountId: order.tradingAccountId,
              userId: order.tradingAccount?.userId,
              symbol: order.symbol,
            })
            const fundService = new FundManagementService(logger)
            const marginCalculator = new MarginCalculator()
            await releaseAdmissionAfterWorkerCancelTx(
              tx,
              fundService,
              marginCalculator,
              order as WorkerOrderAdmissionRow,
              ORDER_EXECUTION_MISSING_STOCK_REASON,
              0,
            )
          }
          return { outcome: "cancelled" }
        }

        if (order.orderPurpose === OrderPurpose.CLOSE) {
          if (order.orderType !== OrderType.MARKET) {
            const reason = "Queued position close supports MARKET orders only."
            await this.orderRepo.markCancelledWithReason(
              normalizedOrderId,
              "CLOSE_ORDER_UNSUPPORTED_TYPE",
              reason,
              tx,
            )
            {
              const logger = createTradingLogger({
                tradingAccountId: order.tradingAccountId,
                userId: order.tradingAccount?.userId,
                symbol: order.symbol,
              })
              const fundService = new FundManagementService(logger)
              const marginCalculator = new MarginCalculator()
              await releaseAdmissionAfterWorkerCancelTx(
                tx,
                fundService,
                marginCalculator,
                order as WorkerOrderAdmissionRow,
                reason,
                executionPrice,
              )
            }
            return { outcome: "cancelled" }
          }

          if (!order.positionId) {
            const reason = "Queued close order missing position link."
            await this.orderRepo.markCancelledWithReason(
              normalizedOrderId,
              "CLOSE_ORDER_INVARIANT",
              reason,
              tx,
            )
            {
              const logger = createTradingLogger({
                tradingAccountId: order.tradingAccountId,
                userId: order.tradingAccount?.userId,
                symbol: order.symbol,
              })
              await releaseAdmissionAfterWorkerCancelTx(
                tx,
                new FundManagementService(logger),
                new MarginCalculator(),
                order as WorkerOrderAdmissionRow,
                reason,
                executionPrice,
              )
            }
            return { outcome: "cancelled" }
          }

          if (token === null) {
            const reason = "Cannot resolve instrument token for queued close exit policy."
            await this.orderRepo.markCancelledWithReason(normalizedOrderId, "CLOSE_ORDER_NO_TOKEN", reason, tx)
            {
              const logger = createTradingLogger({
                tradingAccountId: order.tradingAccountId,
                userId: order.tradingAccount?.userId,
                symbol: order.symbol,
              })
              await releaseAdmissionAfterWorkerCancelTx(
                tx,
                new FundManagementService(logger),
                new MarginCalculator(),
                order as WorkerOrderAdmissionRow,
                reason,
                executionPrice,
              )
            }
            return { outcome: "cancelled" }
          }

          const pricingPolicies = await getMarketDisplayPositionPricingPolicies()
          const closeNowMs = Date.now()
          const exitResolved = await resolveSquareOffExitPrice({
            nowMs: closeNowMs,
            exitPriceCandidate: executionPrice,
            ltpAgeMsCandidate: undefined,
            ltpTimestampCandidate: undefined,
            authority: pricingPolicies.positionSquareOffPriceAuthority,
            closeExitPolicy: pricingPolicies.positionCloseExitPricePolicy,
            maxDeviationBps: pricingPolicies.positionSquareOffClientMaxDeviationBps,
            positionId: order.positionId,
            stockToken: token,
            subscriptionKey: subscriptionKey ?? token,
            markLiveQuoteMaxAgeMs: MARKET_SERVER_QUOTE_MAX_AGE_MS,
            pnlServerMaxAgeMs: pricingPolicies.pnlServerMaxAgeMs,
            positionPnlQuoteMaxAgeMs: pricingPolicies.positionPnlQuoteMaxAgeMs,
            redisMarketQuoteMaxAgeMs: pricingPolicies.redisMarketQuoteMaxAgeMs,
            quoteTimeoutMs: MARKET_SERVER_QUOTE_WAIT_TIMEOUT_MS,
            allowLastSubscriptionTickFallback: false,
            useClientPriceWhenWithinBand: pricingPolicies.positionCloseUseClientPriceWhenWithinBand,
            clientIntendedExitPrice: executionPrice,
            referenceDivergenceMaxBps: pricingPolicies.positionCloseReferenceDivergenceMaxBps,
          })

          if (!exitResolved.ok) {
            const orderCreatedAtMs =
              order.createdAt instanceof Date ? order.createdAt.getTime() : Date.parse(String(order.createdAt || ""))
            const orderAgeMs = Number.isFinite(orderCreatedAtMs) ? Math.max(0, Date.now() - orderCreatedAtMs) : null
            const deferrablePolicyFailure =
              (exitResolved.status >= 500 ||
                exitResolved.code === "MARKET_DATA_DEGRADED" ||
                exitResolved.code === "EXIT_PRICE_UNAVAILABLE") &&
              orderAgeMs !== null &&
              orderAgeMs < MARKET_SERVER_QUOTE_RETRY_WINDOW_MS
            if (deferrablePolicyFailure) {
              workerLog.info(
                {
                  orderId: normalizedOrderId,
                  code: exitResolved.code,
                  symbol: order.symbol,
                  orderAgeMs,
                },
                "queued close exit policy deferred (transient market data)",
              )
              return { outcome: "deferred" }
            }
            await this.orderRepo.markCancelledWithReason(
              normalizedOrderId,
              exitResolved.code ?? "EXIT_PRICE_POLICY_REJECT",
              exitResolved.error,
              tx,
            )
            {
              const logger = createTradingLogger({
                tradingAccountId: order.tradingAccountId,
                userId: order.tradingAccount?.userId,
                symbol: order.symbol,
              })
              await releaseAdmissionAfterWorkerCancelTx(
                tx,
                new FundManagementService(logger),
                new MarginCalculator(),
                order as WorkerOrderAdmissionRow,
                exitResolved.error,
                executionPrice,
              )
            }
            return { outcome: "cancelled" }
          }

          let closeFillPrice = exitResolved.price

          // ── Anti-scalp check ─────────────────────────────────────────────────────
          // Load the position being closed so we can compute holding time + favourable move %,
          // then feed it through applyAntiScalp. If the verdict rejects, cancel the close; otherwise
          // use the adjusted close price (widened spread / capped profit).
          const antiScalpRules: AntiScalpingV1 | null =
            (executionContextRaw?.antiScalping as AntiScalpingV1 | undefined) ?? null
          let antiScalpVerdict: AntiScalpVerdict | null = null
          let closeFavorablePct = 0
          if (antiScalpRules && antiScalpRules.enabled && order.positionId) {
            const position = await tx.position.findUnique({
              where: { id: order.positionId },
              select: { averagePrice: true, createdAt: true, quantity: true },
            })
            if (position) {
              const entryPrice = Number(position.averagePrice)
              const createdAtMs =
                position.createdAt instanceof Date ? position.createdAt.getTime() : Date.parse(String(position.createdAt))
              const holdingSeconds = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000))
              closeFavorablePct = favorableMovePct(
                entryPrice,
                wsExecutionPrice,
                order.orderSide === OrderSide.BUY ? "BUY" : "SELL",
              )
              antiScalpVerdict = applyAntiScalp({
                rules: antiScalpRules,
                closeSide: order.orderSide === OrderSide.BUY ? "BUY" : "SELL",
                entryPrice,
                lastPrice: wsExecutionPrice,
                spreadPct: ctxSpreadPct,
                tiltBiasPct: ctxTiltBiasPct,
                holdingSeconds,
                positionValueRupees: entryPrice * Math.abs(Number(position.quantity ?? 0)),
                relaxed: false,
              })
              if (!antiScalpVerdict.allowed) {
                const reason = antiScalpVerdict.reason ?? "Anti-scalp rule violation"
                await this.orderRepo.markCancelledWithReason(
                  normalizedOrderId,
                  "ANTI_SCALP_REJECT",
                  reason,
                  tx,
                )
                {
                  const logger = createTradingLogger({
                    tradingAccountId: order.tradingAccountId,
                    userId: order.tradingAccount?.userId,
                    symbol: order.symbol,
                  })
                  await releaseAdmissionAfterWorkerCancelTx(
                    tx,
                    new FundManagementService(logger),
                    new MarginCalculator(),
                    order as WorkerOrderAdmissionRow,
                    reason,
                    executionPrice,
                  )
                }
                workerLog.warn(
                  {
                    orderId: normalizedOrderId,
                    symbol: order.symbol,
                    holdingSeconds,
                    favorablePct: closeFavorablePct,
                    penalties: antiScalpVerdict.penalties,
                  },
                  "anti-scalp rejected close",
                )
                return { outcome: "cancelled" }
              }
              // Allowed — but may have been price-penalised.
              if (antiScalpVerdict.penalties.length > 0) {
                closeFillPrice = antiScalpVerdict.adjustedClosePrice
                workerLog.info(
                  {
                    orderId: normalizedOrderId,
                    symbol: order.symbol,
                    penalties: antiScalpVerdict.penalties,
                    originalClose: exitResolved.price,
                    penalisedClose: closeFillPrice,
                  },
                  "anti-scalp penalty applied",
                )
              }
            }
          }

          const pmLogger = createTradingLogger({
            tradingAccountId: order.tradingAccountId,
            userId: order.tradingAccount?.userId,
            symbol: order.symbol,
          })
          const positionService = createPositionManagementService(pmLogger)
          const fill = await positionService.applyQueuedCloseOrderFillTx(tx, {
            pendingOrderId: normalizedOrderId,
            executionPrice: closeFillPrice,
            order: {
              id: order.id,
              tradingAccountId: order.tradingAccountId,
              symbol: order.symbol,
              quantity: order.quantity,
              orderSide: order.orderSide,
              orderType: order.orderType,
              productType: order.productType ?? "MIS",
              status: order.status,
              orderPurpose: order.orderPurpose,
              positionId: order.positionId,
              stockId: order.stockId,
              tradingAccount: order.tradingAccount,
            },
          })

          if (fill.kind === "cancelled") {
            await this.orderRepo.markCancelledWithReason(
              normalizedOrderId,
              fill.code,
              fill.reason,
              tx,
            )
            const fundService = new FundManagementService(pmLogger)
            const marginCalculator = new MarginCalculator()
            await releaseAdmissionAfterWorkerCancelTx(
              tx,
              fundService,
              marginCalculator,
              order as WorkerOrderAdmissionRow,
              fill.reason,
              closeFillPrice,
            )
            return { outcome: "cancelled" }
          }

          if (fill.kind === "skipped") {
            if (fill.reason === "already_closed") {
              await this.orderRepo.markCancelledWithReason(
                normalizedOrderId,
                "POSITION_ALREADY_CLOSED",
                "Position was already flat before queued close executed.",
                tx,
              )
              await releaseAdmissionAfterWorkerCancelTx(
                tx,
                new FundManagementService(pmLogger),
                new MarginCalculator(),
                order as WorkerOrderAdmissionRow,
                "Admission release — position already flat (no market fill for this order)",
                closeFillPrice,
              )
              return { outcome: "cancelled" }
            }
            return { outcome: "skipped" }
          }

          return {
            outcome: "executed",
            executionPrice: closeFillPrice,
            userId: fill.userId,
            symbol: fill.symbol,
            quantity: fill.quantity,
            orderSide: fill.orderSide,
            isClose: true,
            favorablePct: closeFavorablePct,
          }
        }

        const signedQuantity = order.orderSide === OrderSide.BUY ? order.quantity : -order.quantity

        const upsertResult = await this.positionRepo.upsertWithBreakdown(
          order.tradingAccountId,
          order.Stock!.id,
          order.symbol,
          signedQuantity,
          executionPrice,
          {
            productType: order.productType ?? "MIS",
            instrumentId: order.Stock?.instrumentId ?? null,
            segment: order.Stock?.segment ?? null,
            exchange: order.Stock?.exchange ?? null,
            strikePrice: parseFiniteOrderNumber(order.Stock?.strikePrice),
            optionType: order.Stock?.optionType ?? null,
            expiry: order.Stock?.expiry ?? null,
            token: parseFiniteOrderNumber(order.Stock?.token),
            uirId: (order.Stock as any)?.uirId ?? null,
            canonicalSymbol: (order.Stock as any)?.canonicalSymbol ?? null,
          },
          tx
        )
        const position = upsertResult.primaryPosition

        // When the incoming order offsets existing lots, settle realized PnL + release margin.
        const logger = createTradingLogger({
          tradingAccountId: order.tradingAccountId,
          userId: order.tradingAccount?.userId,
          symbol: order.symbol,
        })
        const fundService = new FundManagementService(logger)
        const marginCalculator = new MarginCalculator()
        const normalizedProductType = (order.productType ?? "MIS").toUpperCase()

        for (const offset of upsertResult.offsets || []) {
          const consumedQty = Math.max(0, Math.trunc(offset.consumedAbsQuantity))
          if (consumedQty <= 0) continue

          const contextPositionId = offset.closedRecordPositionId || offset.positionId
          const segment = offset.segment || (order.Stock?.segment ?? "NSE")
          const lotSizeCandidate = parseFiniteOrderNumber(order.Stock?.lot_size)
          const lotSize = offset.lotSize && offset.lotSize > 0 ? offset.lotSize : (lotSizeCandidate && lotSizeCandidate > 0 ? Math.trunc(lotSizeCandidate) : 1)

          const marginCalc = await marginCalculator.calculateMargin(
            segment,
            normalizedProductType,
            consumedQty,
            offset.averagePrice,
            lotSize,
            order.orderSide,
            {
              optionType: (order.Stock as { optionType?: string | null } | null | undefined)?.optionType,
              marginRiskSide: marginRiskSideForOffsetRelease(order.orderSide),
            },
          )
          const marginToRelease = Math.max(0, Math.trunc(marginCalc.requiredMargin))
          if (marginToRelease > 0) {
            await fundService.releaseMarginTx(
              tx,
              order.tradingAccountId,
              marginToRelease,
              `Margin released on offset close: ${order.orderSide} ${consumedQty} ${order.symbol}. Released: ₹${Number(marginToRelease).toLocaleString()}. Order ref: ${shortRefId(normalizedOrderId)}.`,
              { orderId: normalizedOrderId, positionId: contextPositionId },
            )
          }

          const realizedPnL = Number.isFinite(offset.realizedPnL) ? offset.realizedPnL : 0
          if (realizedPnL > 0) {
            await fundService.creditTx(
              tx,
              order.tradingAccountId,
              realizedPnL,
              `Realized P&L credit: ${order.orderSide} ${consumedQty} ${order.symbol}. Profit: ₹${Number(realizedPnL).toFixed(2)}. Order ref: ${shortRefId(normalizedOrderId)}.`,
              { orderId: normalizedOrderId, positionId: contextPositionId },
            )
          } else if (realizedPnL < 0) {
            await fundService.debitTx(
              tx,
              order.tradingAccountId,
              Math.abs(realizedPnL),
              `Realized P&L debit: ${order.orderSide} ${consumedQty} ${order.symbol}. Loss: ₹${Number(Math.abs(realizedPnL)).toFixed(2)}. Order ref: ${shortRefId(normalizedOrderId)}.`,
              { orderId: normalizedOrderId, positionId: contextPositionId },
            )
          }
        }

        const admissionBm = order.blockedMargin ?? 0
        const admissionPc = order.placementCharges ?? 0
        await reconcileOrderAdmissionAfterFillTx(tx, fundService, {
          orderId: normalizedOrderId,
          tradingAccountId: order.tradingAccountId,
          blockedMargin: admissionBm,
          placementCharges: admissionPc,
          marginReleaseDescription: `Margin released (admission): order executed. Symbol: ${order.symbol}. Order ref: ${shortRefId(normalizedOrderId)}.`,
        })

        const absPosQty = Math.abs(Math.trunc(position.quantity))
        if (absPosQty > 0) {
          const segment = (order.Stock?.segment || "NSE").toUpperCase()
          const lotSizeForPos = Math.max(1, Math.trunc(parseFiniteOrderNumber(order.Stock?.lot_size) ?? 1))
          const posAvg = parseFiniteOrderNumber(position.averagePrice) ?? executionPrice
          const posCalc = await marginCalculator.calculateMargin(
            segment,
            normalizedProductType,
            absPosQty,
            posAvg,
            lotSizeForPos,
            order.orderSide,
            {
              optionType: (order.Stock as { optionType?: string | null } | null | undefined)?.optionType,
              marginRiskSide: marginRiskSideForSignedPositionQty(position.quantity),
            },
          )
          if (posCalc.requiredMargin > 0) {
            await fundService.blockMarginTx(
              tx,
              order.tradingAccountId,
              posCalc.requiredMargin,
              `Margin blocked (position): ${order.orderSide} ${absPosQty} ${order.symbol} @ ₹${Number(posAvg).toFixed(2)}. Order ref: ${shortRefId(normalizedOrderId)}.`,
              { orderId: normalizedOrderId, positionId: position.id },
            )
          }
        }

        // Link order -> position + mark executed
        await this.orderRepo.update(normalizedOrderId, { positionId: position.id }, tx)
        await this.orderRepo.markExecuted(normalizedOrderId, order.quantity, executionPrice, tx)

        // Link related fund transactions to position for easier querying
        await this.transactionRepo.updateMany({ orderId: normalizedOrderId }, { positionId: position.id }, tx)

        return {
          outcome: "executed",
          executionPrice,
          userId: order.tradingAccount?.userId,
          symbol: order.symbol,
          quantity: order.quantity,
          orderSide: order.orderSide
        }
      })

      if (txResult.outcome === "skipped") return "skipped"
      if (txResult.outcome === "deferred") return "deferred"
      if (txResult.outcome === "cancelled") return "cancelled"

      // Notifications can be safely attempted after commit
      try {
        if (txResult.userId) {
          await NotificationService.notifyOrderExecuted(txResult.userId, {
            symbol: txResult.symbol,
            quantity: txResult.quantity,
            orderSide: txResult.orderSide,
            averagePrice: txResult.executionPrice
          })
        }
      } catch (notifError) {
        workerLog.warn({
          orderId: normalizedOrderId,
          message: notifError instanceof Error ? notifError.message : String(notifError)
        }, "failed to create order executed notification")
      }

      // Anti-scalping rolling counters + auto-flagger (best-effort, outside tx).
      if (txResult.userId) {
        await recordFill(txResult.userId).catch(() => {})
        if (txResult.isClose) {
          try {
            const cfg = await loadMarketControlConfig()
            if (cfg?.antiScalping?.enabled) {
              if (typeof txResult.favorablePct === "number") {
                await recordCloseRoundTrip(
                  txResult.userId,
                  txResult.favorablePct,
                  cfg.antiScalping,
                ).catch(() => {})
              }
              const flagged = await evaluateAndMaybeFlag(
                txResult.userId,
                cfg.antiScalping,
              ).catch(() => null)
              if (flagged) {
                workerLog.warn(
                  { orderId: normalizedOrderId, userId: txResult.userId, group: flagged },
                  "scalper auto-flagged; user demoted",
                )
              }
            }
          } catch (flagErr) {
            workerLog.warn(
              {
                orderId: normalizedOrderId,
                message: flagErr instanceof Error ? flagErr.message : String(flagErr),
              },
              "scalper flagger failed",
            )
          }
        }
      }

      // Phase 9.5 / 10.5 / 11 — post-fill hooks for B-book engines.
      // Bonus burndown fires on EVERY fill (gross turnover counts, industry standard).
      // Winner auto-promotion fires only on closing trades (P&L only exists then).
      // Affiliate commission accrual cascades through the parent IB chain.
      if (txResult.userId) {
        await this.runPostFillBookkeeping({
          orderId: normalizedOrderId,
          userId: txResult.userId,
          quantity: Math.abs(txResult.quantity),
          notional: Math.abs(txResult.quantity * txResult.executionPrice),
          isClose: Boolean(txResult.isClose),
        }).catch((err) => {
          workerLog.warn(
            {
              orderId: normalizedOrderId,
              message: err instanceof Error ? err.message : String(err),
            },
            "post-fill bookkeeping (winner / burndown / affiliate accrual) failed",
          )
        })
      }

      workerLog.info({ orderId: normalizedOrderId, executionPrice: txResult.executionPrice }, "order executed")
      return "executed"
    } catch (error: any) {
      workerLog.error({
        orderId: normalizedOrderId,
        message: error?.message
      }, "execution transaction failed; cancelling + releasing margin best-effort")

      // Best-effort compensation (cancel + release margin), guarded by advisory lock.
      let cancelled = false
      try {
        const comp = await executeInTransaction(async (tx) => {
          const lockRows = await tx.$queryRaw<{ locked: boolean }[]>(
            this.buildOrderExecutionAdvisoryLockSql(normalizedOrderId)
          )
          const locked = lockRows?.[0]?.locked === true
          if (!locked) return { cancelled: false }

          const order = await tx.order.findUnique({
            where: { id: normalizedOrderId },
            include: {
              Stock: {
                select: {
                  id: true,
                  ltp: true,
                  segment: true,
                  lot_size: true,
                  instrumentId: true,
                  token: true,
                  optionType: true,
                  exchange: true,
                  strikePrice: true,
                  expiry: true,
                },
              },
              tradingAccount: { select: { id: true, userId: true } }
            }
          })

          if (!order || order.status !== OrderStatus.PENDING) return { cancelled: false }

          await this.orderRepo.update(normalizedOrderId, { status: OrderStatus.CANCELLED }, tx)

          const token = resolveOrderToken({ stockToken: order.Stock?.token, instrumentId: order.Stock?.instrumentId })
          const wsLastTick = token ? serverMarketData.getQuote(token, { maxAgeMs: 0 }) : null
          const executionPrice = resolveExecutionPriceFallback({
            averagePrice: order.averagePrice,
            price: order.price,
            wsLtp: wsLastTick?.last_trade_price,
            stockLtp: order.Stock?.ltp,
          })

          const logger = createTradingLogger({
            tradingAccountId: order.tradingAccountId,
            userId: order.tradingAccount?.userId,
            symbol: order.symbol,
          })
          const fundService = new FundManagementService(logger)
          const marginCalculator = new MarginCalculator()
          await releaseAdmissionAfterWorkerCancelTx(
            tx,
            fundService,
            marginCalculator,
            order as WorkerOrderAdmissionRow,
            "order execution failed (compensation)",
            executionPrice,
          )

          return { cancelled: true }
        })
        cancelled = Boolean((comp as any)?.cancelled)
      } catch (compError) {
        workerLog.warn({ orderId: normalizedOrderId, message: (compError as any)?.message || String(compError) }, "compensation failed")
      }

      return cancelled ? "cancelled" : "skipped"
    }
  }

  /**
   * Phase 9.5 / 10.5 — Post-fill bookkeeping for B-book engines.
   *
   * Runs OUTSIDE the order execution transaction. Both calls are best-effort and isolated:
   * if either throws, the other still attempts. The caller (post-commit hook) wraps this
   * with a logging .catch() so a failure here NEVER affects the settled trade.
   *
   * Idempotency: the latest Realised P&L Transaction id (linked to this order) is used as
   * the dedupe key so retries / duplicate processing don't double-promote or double-burn.
   */
  private async runPostFillBookkeeping(args: {
    orderId: string
    userId: string
    quantity: number
    notional: number
    isClose: boolean
  }): Promise<void> {
    const { orderId, userId, quantity, notional, isClose } = args

    // Realised P&L Transaction is the idempotency key for the winner engine and the LOSS-scope
    // signal for affiliate accrual. Only present on closing trades.
    const latestRealizedTx = isClose
      ? await prisma.transaction.findFirst({
          where: { orderId, description: { startsWith: "Realized P&L" } },
          orderBy: { createdAt: "desc" },
          select: { id: true, amount: true },
        })
      : null

    const sourceTxnId = latestRealizedTx?.id ?? orderId
    // Convention: Transaction.amount is positive when client gains (broker loses), negative
    // when client loses. Affiliate LOSS-scope accrual reads this directly.
    const realizedPnl = latestRealizedTx?.amount != null
      ? Number(latestRealizedTx.amount.toString())
      : null

    const winnerPromise =
      isClose && latestRealizedTx?.id
        ? evaluateClientForPromotion(userId, {
            applyPromotion: true,
            triggeredByTransactionId: latestRealizedTx.id,
          }).catch((err) => {
            workerLog.warn(
              { orderId, userId, message: err instanceof Error ? err.message : String(err) },
              "winner auto-promotion failed",
            )
            return null
          })
        : Promise.resolve(null)

    // Burndown advances turnover on EVERY fill (gross volume convention).
    // Idempotency key falls back to orderId when no Realised P&L Transaction exists.
    const burndownPromise = advanceTurnoverForUser({
      userId,
      notional,
      transactionId: sourceTxnId,
    }).catch((err) => {
      workerLog.warn(
        { orderId, userId, message: err instanceof Error ? err.message : String(err) },
        "bonus burndown failed",
      )
      return null
    })

    // Phase 11 — Affiliate commission accrual. Cascades through parent affiliates.
    // Idempotent on (affiliateId, sourceTransactionId, kind) at the DB level.
    // SPREAD-scope is a no-op until per-fill spread revenue lands in TxResult (Phase 11.5);
    // until then SPREAD rules accrue zero. LOSS / LOT / FIXED scopes work today.
    const affiliatePromise = accrueForTrade({
      userId,
      sourceTransactionId: sourceTxnId,
      notional,
      realizedPnl,
      lots: quantity, // 1 share = 1 unit; admin tunes via per-affiliate rate
      spreadRevenue: null,
      isClose,
    }).catch((err) => {
      workerLog.warn(
        { orderId, userId, message: err instanceof Error ? err.message : String(err) },
        "affiliate commission accrual failed",
      )
      return null
    })

    // Phase 13b — Surveillance: HEAVY_HITTER event-rule. Fire-and-forget; failure must
    // never block downstream. Surveillance writes ONLY to HouseSurveillanceAlert.
    const surveillancePromise = (async () => {
      try {
        const { dispatchTransactionEvent } = await import(
          "@/lib/surveillance/event-dispatcher"
        )
        await dispatchTransactionEvent({ userId, eventAt: new Date() })
      } catch (err) {
        workerLog.warn(
          { orderId, userId, message: err instanceof Error ? err.message : String(err) },
          "surveillance HEAVY_HITTER dispatch failed",
        )
      }
    })()

    await Promise.all([winnerPromise, burndownPromise, affiliatePromise, surveillancePromise])
  }
}

/**
 * Convenience singleton for simple cron triggers.
 */
export const orderExecutionWorker = new OrderExecutionWorker()
