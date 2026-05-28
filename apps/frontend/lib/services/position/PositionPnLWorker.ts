/**
 * @file PositionPnLWorker.ts
 * @module position
 * @description Background worker to compute and persist server-side position PnL (unrealized/day) using batched quotes.
 * @author StockTrade
 * @created 2026-02-04
 * @updated 2026-04-06
 *
 * Changelog: Last in-process tick (`getQuote` maxAge 0) preferred over `Stock.ltp` for MTM; SL/TP/risk/EOD auto-close only on actionable fresh tick (`positionPnlQuoteMaxAgeMs`).
 * Changelog: Risk auto-close runs bounded multi-round reduction per account until utilization drops or caps hit.
 * Changelog: SSE `positions_pnl_updated` includes `currentPrice` when any server tick exists (last received), with `quoteReceivedAtMs` for age.
 *
 * Notes:
 * - Intended for EC2/Docker long-running worker OR cron-triggered execution.
 * - Uses `SystemSettings` heartbeat key `positions_pnl_worker_heartbeat` for admin visibility.
 * - Token resolution: position row before stock (`position-instrument-resolution`).
 * - Writes `market:quote:<token>` when live quotes exist for API LTP parity.
 */

import os from "os"
import { OrderPurpose, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeQuotePrices, type QuoteLike } from "@/lib/services/position/quote-normalizer"
import type { ServerCachedQuote } from "@/lib/market-data/server-cached-quote"
import { parseFinitePositionNumber } from "@/lib/services/position/position-number-utils"
import { parsePositionPnLMode, POSITION_PNL_MODE_KEY } from "@/lib/server/workers/registry"
import { getLatestActiveGlobalSettings } from "@/lib/server/workers/system-settings"
import {
  getServerMarketDataService,
  SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
} from "@/lib/market-data/server-market-data.service"
import { baseLogger } from "@/lib/observability/logger"
import { isRedisEnabled, redisSet } from "@/lib/redis/redis-client"
import { resolveMarketDisplayQuoteFreshness } from "@/lib/server/market-display-pnl-meta"
import {
  getMarketQuoteRedisMirrorStats,
  resetMarketQuoteRedisMirrorStats,
  setMarketQuoteRedisMirrorMinIntervalMs,
} from "@/lib/server/market-quote-tick-writer"
import {
  resolvePositionRowInstrumentToken,
  resolvePositionRowSubscriptionIdentity,
} from "@/lib/server/position-instrument-resolution"
import { normalizeSubscriptionKey } from "@/lib/market-data/utils/quote-lookup"
import { getRealtimeEventEmitter } from "@/lib/services/realtime/RealtimeEventEmitter"
import { publishAdminPnlBroadcast } from "@/lib/services/realtime/redis-realtime-bus"
import type { PositionsPnLUpdatedEventData } from "@/types/realtime"
import { createPositionManagementService } from "@/lib/services/position/PositionManagementService"
import { getRiskThresholds } from "@/lib/services/risk/risk-thresholds"
import { resolveThresholdsForUser } from "@/lib/services/risk/risk-thresholds-resolver"
import { getRiskEnforcementSettings, isRiskEnabled } from "@/lib/services/risk/risk-enforcement-settings"
import {
  isStopLossHit,
  isTargetHit,
  pickRiskAutoClosePositions,
  type RiskPositionSnapshot,
  type RiskThresholds,
} from "@/lib/services/position/position-risk-evaluator"
import {
  releaseWorkerRunLock,
  tryAcquireWorkerRunLock,
  type WorkerRunLock,
} from "@/lib/server/workers/worker-run-lock"
import {
  getISTDateKey,
  getSegmentIntradaySquareOffWindowDecision,
  normalizeIntradaySquareOffPreCloseBufferMinutes,
  type SegmentIntradaySquareOffWindowDecision,
} from "@/lib/server/market-timing"
import { resolvePositionProductType } from "@/lib/services/position/position-product-type-utils"
import { orderExecutionWorker } from "@/lib/services/order/OrderExecutionWorker"

export const POSITIONS_PNL_WORKER_HEARTBEAT_KEY = "positions_pnl_worker_heartbeat" as const
const INTRADAY_EOD_SQUAREOFF_MARKER_KEY_PREFIX = "positions_intraday_eod_squareoff" as const
const POSITION_PNL_MARKETDATA_WARMUP_TIMEOUT_MS = 1_000
const POSITION_PNL_MARKETDATA_WARMUP_POLL_MS = 100
const POSITION_PNL_MARKETDATA_WARMUP_MAX_TOKENS = 500

export type PositionPnLWorkerHeartbeat = {
  lastRunAtIso: string
  host: string
  pid: number
  scanned: number
  updated: number
  skipped: number
  errors: number
  elapsedMs: number
  mode?: "client" | "server"
  reason?: string
  redisEnabled?: boolean
  redisPnlCacheWrites?: number
  /** Cross-process token LTP cache (`market:quote:<token>`) writes this run (live tick mirror). */
  redisMarketQuoteWrites?: number
  /** Debounced schedules coalesced this run (see `market-quote-tick-writer`). */
  redisMarketQuoteDebounceSchedules?: number
  /** `positions:pnl` rows with no in-process last tick (worker memory empty for token). */
  redisPnlSnapshotSkippedStaleTick?: number
  pnlUpdatesEmitted?: number
  pnlEventsEmitted?: number
  stopLossAutoClosed?: number
  targetAutoClosed?: number
  riskAutoClosed?: number
  riskAlertsCreated?: number
  riskWarningThreshold?: number
  riskAutoCloseThreshold?: number
  riskThresholdSource?: string
  riskFullLiquidation?: boolean
  riskSquareOffOnWarning?: boolean
  intradayEodCandidates?: number
  intradayEodClosed?: number
  intradayEodSkipped?: number
  intradayEodMarkersWritten?: number
  intradayEodPreCloseBufferMinutes?: number
  positionsWithResolvedToken?: number
  positionsWithoutResolvedToken?: number
  positionTokensResolved?: number
  positionsWithLiveQuote?: number
  positionsWithoutLiveQuote?: number
  quoteHitRate?: number
  /** SL/TP evaluation skipped: current price fell back to entry only (no live quote/LTP). */
  slTpSkippedUnreliablePrice?: number
}

export type ProcessPositionPnLInput = {
  limit?: number
  /**
   * Skip DB update if both |Δunrealized| and |Δday| are below this value.
   * Default: 1 (₹1).
   */
  updateThreshold?: number
  dryRun?: boolean
  /**
   * Force worker run even if `position_pnl_mode !== server` (used by backstop/ops tooling).
   */
  forceRun?: boolean
  /**
   * Maximum number of SL/Target auto-closes to execute per tick (guardrail).
   */
  sltpMaxAutoClosesPerTick?: number
  /**
   * Maximum number of risk-driven auto-closes per account per tick (guardrail).
   */
  riskMaxAutoClosesPerAccount?: number
  /**
   * Cooldown for creating RiskAlert rows per account (ms).
   */
  riskAlertCooldownMs?: number
  /**
   * Max close → refresh funds → re-evaluate iterations per account per tick (default from env `RISK_MAX_REDUCTION_ROUNDS_PER_TICK`, else 20).
   */
  riskMaxReductionRoundsPerTick?: number
  /**
   * Force intraday EOD square-off stage even outside the pre-close window
   * and bypass per-day marker short-circuit checks.
   */
  intradayEodForceRun?: boolean
  /**
   * Override intraday EOD pre-close buffer minutes (IST).
   */
  intradayEodPreCloseBufferMinutes?: number
  /**
   * Maximum number of intraday EOD auto-closes to execute per tick.
   */
  intradayEodMaxAutoClosesPerTick?: number
}

export type ProcessPositionPnLResult = {
  success: boolean
  scanned: number
  updated: number
  skipped: number
  errors: number
  elapsedMs: number
  heartbeat: PositionPnLWorkerHeartbeat
}

function normalizePositionPnLRunLimit(value: unknown): number {
  const parsedValue = parseFinitePositionNumber(value)
  if (parsedValue === null) {
    return 500
  }
  return Math.max(1, Math.min(2000, Math.trunc(parsedValue)))
}

function normalizePositionPnLUpdateThreshold(value: unknown): number {
  const parsedValue = parseFinitePositionNumber(value)
  if (parsedValue === null) {
    return 1
  }
  return Math.max(0, parsedValue)
}

function normalizePositionPnLDryRun(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value === 1
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase()
    return (
      normalizedValue === "true" ||
      normalizedValue === "1" ||
      normalizedValue === "yes" ||
      normalizedValue === "on" ||
      normalizedValue === "y" ||
      normalizedValue === "t" ||
      normalizedValue === "enabled"
    )
  }
  return false
}

function asDecimal(v: number): Prisma.Decimal {
  // Store at 2 dp to match Decimal(18,2)
  return new Prisma.Decimal(v.toFixed(2))
}

function toNumber(v: unknown): number {
  const parsedValue = parseFinitePositionNumber(v)
  return parsedValue === null ? 0 : parsedValue
}

function abs(n: number): number {
  return Math.abs(n)
}

function envNumber(key: string, fallback: number): number {
  const parsedValue = parseFinitePositionNumber(process.env[key])
  return parsedValue === null ? fallback : parsedValue
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsedValue = parseFinitePositionNumber(value)
  if (parsedValue === null) {
    return fallback
  }
  return Math.max(min, Math.min(max, Math.trunc(parsedValue)))
}

async function refreshAccountRiskSnapFunds(
  tradingAccountId: string,
  snap: { totalFunds: number },
): Promise<void> {
  const row = await prisma.tradingAccount.findUnique({
    where: { id: tradingAccountId },
    select: { balance: true, availableMargin: true },
  })
  if (!row) {
    return
  }
  snap.totalFunds = toNumber(row.balance) + toNumber(row.availableMargin)
}

function quoteLikeFromServerCached(q: ServerCachedQuote): QuoteLike {
  return {
    last_trade_price: q.last_trade_price,
    prev_close_price: q.prev_close_price,
    close: q.close,
  }
}

function buildIntradayEodSquareOffMarkerKey(
  // CURRENCY accepted alongside NSE/MCX so CDS/BCD intraday positions get their own
  // marker row instead of sharing the NSE bucket — they close at 17:00 IST, not 15:30,
  // and conflating them would either close them too early or skip them entirely.
  segment: "NSE" | "MCX" | "CURRENCY",
  dateKeyIst: string,
): string {
  const normalizedSegment = segment.toLowerCase()
  const normalizedDateKey = dateKeyIst.trim().slice(0, 10)
  return `${INTRADAY_EOD_SQUAREOFF_MARKER_KEY_PREFIX}_${normalizedSegment}_${normalizedDateKey}`
}

async function setGlobalSystemSetting(input: {
  key: string
  value: string
  category?: string
  description?: string
}): Promise<void> {
  const { key, value, category, description } = input
  await prisma.$transaction(async (tx) => {
    const existing = await tx.systemSettings.findFirst({
      where: { key, ownerId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })

    if (existing) {
      await tx.systemSettings.update({
        where: { id: existing.id },
        data: {
          value,
          category: category || "GENERAL",
          description,
          isActive: true,
          updatedAt: new Date(),
        },
      })

      await tx.systemSettings.updateMany({
        where: { key, ownerId: null, id: { not: existing.id } },
        data: { isActive: false, updatedAt: new Date() },
      })

      return
    }

    await tx.systemSettings.create({
      data: {
        key,
        value,
        category: category || "GENERAL",
        description,
        isActive: true,
      },
    })
  })
}

export class PositionPnLWorker {
  private isRunning = false

  // Per-user PnL emit throttle. The worker can tick faster than 1/sec; emitting at full rate floods
  // the SSE stream and forces the client to re-render hundreds of times per second. We coalesce by
  // skipping per-user emits that arrive within PNL_EMIT_MIN_INTERVAL_MS of the prior emit; the next
  // tick that lands beyond the window publishes the latest snapshot.
  private lastPnlEmitMsByUser: Map<string, number> = new Map()
  private static readonly PNL_EMIT_MIN_INTERVAL_MS = 1000

  async processPositionPnL(input: ProcessPositionPnLInput = {}): Promise<ProcessPositionPnLResult> {
    const startedAt = Date.now()
    const normalizedInput =
      input && typeof input === "object" ? (input as ProcessPositionPnLInput) : ({} as ProcessPositionPnLInput)
    const limit = normalizePositionPnLRunLimit(normalizedInput.limit)
    const updateThreshold = normalizePositionPnLUpdateThreshold(normalizedInput.updateThreshold)
    const dryRun = normalizePositionPnLDryRun(normalizedInput.dryRun)
    const forceRun = normalizedInput.forceRun === true
    const intradayEodForceRun = normalizePositionPnLDryRun(normalizedInput.intradayEodForceRun)
    const intradayEodPreCloseBufferMinutes = normalizeIntradaySquareOffPreCloseBufferMinutes(
      normalizedInput.intradayEodPreCloseBufferMinutes,
    )
    const intradayEodMaxAutoClosesPerTick = clampInt(normalizedInput.intradayEodMaxAutoClosesPerTick, 1000, 0, 5000)

    let scanned = 0
    let updated = 0
    let skipped = 0
    let errors = 0
    let positionsWithResolvedToken = 0
    let positionsWithoutResolvedToken = 0
    let positionsWithLiveQuote = 0
    let positionsWithoutLiveQuote = 0

    const log = baseLogger.child({ worker: "position-pnl-worker", host: os.hostname(), pid: process.pid })
    log.info(
      {
        limit,
        updateThreshold,
        dryRun,
        intradayEodForceRun,
        intradayEodPreCloseBufferMinutes,
      },
      "start",
    )

    if (this.isRunning) {
      const elapsedMs = Date.now() - startedAt
      const heartbeat: PositionPnLWorkerHeartbeat = {
        lastRunAtIso: new Date().toISOString(),
        host: os.hostname(),
        pid: process.pid,
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        elapsedMs,
        reason: "already_running",
      }
      await setGlobalSystemSetting({
        key: POSITIONS_PNL_WORKER_HEARTBEAT_KEY,
        value: JSON.stringify(heartbeat),
        category: "TRADING",
        description: "Heartbeat for server-side position PnL worker (EC2/Docker/cron).",
      }).catch(() => {})
      log.info("skipped: already running in this process")
      return {
        success: true,
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        elapsedMs,
        heartbeat,
      }
    }

    this.isRunning = true
    let runLock: WorkerRunLock | null = null

    try {
      const lockTtlMs = envNumber("POSITION_PNL_WORKER_LOCK_TTL_MS", 120_000)
      runLock = await tryAcquireWorkerRunLock({
        workerId: "position_pnl",
        ttlMs: lockTtlMs,
      })

      if (!runLock.acquired) {
        const elapsedMs = Date.now() - startedAt
        const heartbeat: PositionPnLWorkerHeartbeat = {
          lastRunAtIso: new Date().toISOString(),
          host: os.hostname(),
          pid: process.pid,
          scanned: 0,
          updated: 0,
          skipped: 0,
          errors: 0,
          elapsedMs,
          reason: "locked",
        }
        await setGlobalSystemSetting({
          key: POSITIONS_PNL_WORKER_HEARTBEAT_KEY,
          value: JSON.stringify(heartbeat),
          category: "TRADING",
          description: "Heartbeat for server-side position PnL worker (EC2/Docker/cron).",
        }).catch(() => {})
        log.info({ lockTtlMs }, "skipped: global lock active")
        return { success: true, scanned: 0, updated: 0, skipped: 0, errors: 0, elapsedMs, heartbeat }
      }

      // Master risk toggle: gate both SL/TP and account-risk enforcement sections.
      // Admin can disable all auto-close behaviour via riskAutoCloseEnabled / circuitBreakerPausedUntil.
      const riskSettings = await getRiskEnforcementSettings({ maxAgeMs: 0 })
      const riskEnabled = isRiskEnabled(riskSettings)

      // Soft-toggle support: only run when server PnL mode is enabled.
      if (!forceRun) {
        try {
          const rows = await getLatestActiveGlobalSettings([POSITION_PNL_MODE_KEY])
          const raw = rows.get(POSITION_PNL_MODE_KEY)?.value ?? null
          const mode = parsePositionPnLMode(raw)
          if (mode !== "server") {
            const elapsedMs = Date.now() - startedAt
            const heartbeat: PositionPnLWorkerHeartbeat = {
              lastRunAtIso: new Date().toISOString(),
              host: os.hostname(),
              pid: process.pid,
              scanned: 0,
              updated: 0,
              skipped: 0,
              errors: 0,
              elapsedMs,
              mode,
              reason: "disabled_mode_client",
            }
            await setGlobalSystemSetting({
              key: POSITIONS_PNL_WORKER_HEARTBEAT_KEY,
              value: JSON.stringify(heartbeat),
              category: "TRADING",
              description: "Heartbeat for server-side position PnL worker (EC2/Docker/cron).",
            }).catch(() => {})

            log.info({ mode }, "skipped: mode=client")
            return { success: true, scanned: 0, updated: 0, skipped: 0, errors: 0, elapsedMs, heartbeat }
          }
        } catch (e) {
          log.warn(
            {
              message: (e as any)?.message || String(e),
            },
            "failed to read position_pnl_mode; defaulting to run",
          )
        }
      }

      const positions = await prisma.position.findMany({
        where: { quantity: { not: 0 } },
        include: {
          tradingAccount: { select: { userId: true, balance: true, availableMargin: true } },
          Stock: {
            select: {
              instrumentId: true,
              exchange: true,
              ltp: true,
              segment: true,
              token: true,
              uirId: true,
              canonicalSymbol: true,
            },
          },
          orders: {
            select: {
              id: true,
              productType: true,
              orderSide: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      })

      scanned = positions.length

      // Use the SAME marketdata feed as /dashboard (server-side cache).
      // Best-effort: subscribe the current position tokens before reading cache.
      const serverMarketData = getServerMarketDataService()
      await serverMarketData.ensureInitialized().catch((e) => {
        errors += 1
        log.error({
          message: (e as any)?.message || String(e),
        }, "server marketdata init failed; falling back to Stock.ltp")
      })

      const tokenByPositionId = new Map<string, number | null>()
      const subscriptionKeyByToken = new Map<number, string | number>()
      for (const position of positions) {
        // Carry uirId + canonicalSymbol so the resolver can match the SAME upstream subscription
        // key the frontend emits (canonical "NSE:RELIANCE" → symbols[]) instead of falling
        // through to a numeric/exchange-qualified shape (instruments[]) that the gateway treats
        // as a different subscription. Without this, the position pnl worker's warmup tries
        // to wait on ticks for a key the gateway never sees.
        const positionSlice = {
          token: (position as { token?: unknown }).token,
          uirId: (position as { uirId?: unknown }).uirId,
          instrumentId: (position as { instrumentId?: string | null }).instrumentId,
          segment: (position as { segment?: string | null }).segment,
          exchange: (position as { exchange?: string | null }).exchange,
          canonicalSymbol: (position as { canonicalSymbol?: string | null }).canonicalSymbol,
        }
        const stockSlice = position.Stock
          ? {
              token: position.Stock.token,
              uirId: (position.Stock as { uirId?: unknown }).uirId,
              instrumentId: position.Stock.instrumentId,
              segment: position.Stock.segment,
              exchange: position.Stock.exchange,
              canonicalSymbol: (position.Stock as { canonicalSymbol?: string | null }).canonicalSymbol,
            }
          : null
        const token = resolvePositionRowInstrumentToken(positionSlice, stockSlice)
        tokenByPositionId.set(position.id, token)
        if (typeof token === "number" && Number.isFinite(token) && token > 0) {
          positionsWithResolvedToken += 1
          const identity = resolvePositionRowSubscriptionIdentity(positionSlice, stockSlice)
          const resolvedSubscriptionKey = identity.subscriptionKey ?? token
          const normalizedKey = normalizeSubscriptionKey(resolvedSubscriptionKey)
          const existingKey = subscriptionKeyByToken.get(token)
          if (existingKey == null || typeof existingKey === "number") {
            subscriptionKeyByToken.set(
              token,
              typeof resolvedSubscriptionKey === "string" ? normalizedKey : resolvedSubscriptionKey,
            )
          }
        } else {
          positionsWithoutResolvedToken += 1
        }
      }

      const positionTokens = Array.from(
        new Set(
          Array.from(tokenByPositionId.values()).filter(
            (token): token is number => typeof token === "number" && Number.isFinite(token) && token > 0,
          ),
        ),
      )

      if (positionTokens.length > 0) {
        try {
          const keysToSubscribe = new Map<string, string | number>()
          for (const key of Array.from(subscriptionKeyByToken.values())) {
            const normalizedKey = normalizeSubscriptionKey(key)
            if (!keysToSubscribe.has(normalizedKey)) {
              keysToSubscribe.set(normalizedKey, typeof key === "string" ? normalizedKey : key)
            }
          }
          serverMarketData.ensureSubscribed(Array.from(keysToSubscribe.values()))
          const warmupTokens = positionTokens.slice(0, POSITION_PNL_MARKETDATA_WARMUP_MAX_TOKENS)
          await Promise.allSettled(
            warmupTokens.map((token) =>
              serverMarketData.waitForFreshQuote(token, {
                timeoutMs: POSITION_PNL_MARKETDATA_WARMUP_TIMEOUT_MS,
                pollMs: POSITION_PNL_MARKETDATA_WARMUP_POLL_MS,
                subscriptionKey: subscriptionKeyByToken.get(token) ?? token,
                resubscribeRetryTimeoutMs: SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
              }),
            ),
          )
        } catch (e) {
          errors += 1
          log.error({
            message: (e as any)?.message || String(e),
          }, "ensureSubscribed failed; falling back to Stock.ltp")
        }
      }

      const emitter = getRealtimeEventEmitter()
      const updatesByUser = new Map<string, PositionsPnLUpdatedEventData["updates"]>()
      const redisTtlSeconds = Math.max(5, Math.floor(envNumber("REDIS_POSITIONS_PNL_TTL_SECONDS", 120)))
      let redisPnlCacheWrites = 0

      const configuredRisk = await getRiskThresholds().catch(() => ({
        warningThreshold: 0.75,
        autoCloseThreshold: 0.8,
        source: "default" as const,
      }))
      const riskThresholds: RiskThresholds = {
        warningThreshold: configuredRisk.warningThreshold,
        autoCloseThreshold: configuredRisk.autoCloseThreshold,
      }
      const riskEnforcement = await getRiskEnforcementSettings().catch(() => ({
        fullLiquidationOnAutoClose: false,
        squareOffOnWarningBand: false,
        source: "default" as const,
      }))

      const quoteFresh = await resolveMarketDisplayQuoteFreshness()
      setMarketQuoteRedisMirrorMinIntervalMs(quoteFresh.marketQuoteRedisWriteMinIntervalMs)
      resetMarketQuoteRedisMirrorStats()
      let redisPnlSnapshotSkippedStaleTick = 0

      const accountPositions = new Map<
        string,
        { userId: string; totalFunds: number; positions: RiskPositionSnapshot[] }
      >()
      const currentPriceByPositionId = new Map<string, number>()
      const actionableAutoCloseByPositionId = new Map<string, boolean>()
      let slTpSkippedUnreliablePrice = 0

      const slTpCloseCandidates: Array<{
        positionId: string
        tradingAccountId: string
        userId: string
        symbol: string
        exitPrice: number
        reason: "stop_loss" | "target"
      }> = []

      // Per-account collector for SL/TP that WOULD have fired but the price
      // feed was degraded (no fresh quote within policy). Pre-fix the worker
      // silently skipped these and only logged a counter to the heartbeat —
      // a stop-loss missed during a feed outage is an enterprise-critical
      // failure mode (Trading-6zm). After the loop we raise a throttled
      // RiskAlert per affected account so operators / users see the gap.
      const slTpFeedOutageByAccount = new Map<
        string,
        { userId: string; positions: Array<{ positionId: string; symbol: string; reason: "stop_loss" | "target" }> }
      >()

      // Update sequentially; small batches to reduce DB pressure.
      for (const p of positions) {
        try {
          const userId = (p as any)?.tradingAccount?.userId as string | undefined
          const tradingAccountId = String((p as any)?.tradingAccountId || "")
          const quantity = parseFinitePositionNumber(p.quantity) ?? 0
          const avg = parseFinitePositionNumber(p.averagePrice) ?? 0

          const token = tokenByPositionId.get(p.id) ?? null
          const freshQuote = token ? serverMarketData.getQuote(token) : null
          const lastTickQuote = token ? serverMarketData.getQuote(token, { maxAgeMs: 0 }) : null
          if (freshQuote) {
            positionsWithLiveQuote += 1
          } else {
            positionsWithoutLiveQuote += 1
          }

          const norm = normalizeQuotePrices({
            quote: freshQuote
              ? quoteLikeFromServerCached(freshQuote)
              : lastTickQuote
                ? quoteLikeFromServerCached(lastTickQuote)
                : null,
            stockLtp: p.Stock?.ltp ?? null,
            averagePrice: avg,
          })

          const currentPrice = norm.currentPrice
          const prevClose = norm.prevClose

          const unrealizedPnL = (currentPrice - avg) * quantity
          const dayPnL = (currentPrice - prevClose) * quantity

          currentPriceByPositionId.set(p.id, currentPrice)

          const nowAction = Date.now()
          const actionableAutoClose =
            Boolean(freshQuote) &&
            typeof freshQuote?.receivedAt === "number" &&
            nowAction - freshQuote.receivedAt <= quoteFresh.positionPnlQuoteMaxAgeMs
          actionableAutoCloseByPositionId.set(p.id, actionableAutoClose)

          // Keep a per-account snapshot for risk evaluation.
          if (userId && tradingAccountId) {
            const balance = toNumber((p as any)?.tradingAccount?.balance)
            const availableMargin = toNumber((p as any)?.tradingAccount?.availableMargin)
            const totalFunds = balance + availableMargin
            const entry = accountPositions.get(tradingAccountId) || { userId, totalFunds, positions: [] }
            entry.userId = userId
            entry.totalFunds = totalFunds
            entry.positions.push({
              positionId: p.id,
              symbol: String((p as any)?.symbol || ""),
              quantity,
              unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
            })
            accountPositions.set(tradingAccountId, entry)
          }

          // StopLoss/Target enforcement (server-side) — only on actionable fresh ticks (not stale DB LTP / entry fallbacks).
          // Respects the master risk toggle (admin-controlled via riskAutoCloseEnabled / circuitBreakerPausedUntil).
          if (!dryRun && riskEnabled && userId && tradingAccountId) {
            const stopLoss = (p as any)?.stopLoss != null ? toNumber((p as any)?.stopLoss) : null
            const target = (p as any)?.target != null ? toNumber((p as any)?.target) : null
            const symbol = String((p as any)?.symbol || "")

            const slHit = isStopLossHit(quantity, currentPrice, stopLoss)
            const tpHit = isTargetHit(quantity, currentPrice, target)
            if (actionableAutoClose) {
              if (slHit) {
                slTpCloseCandidates.push({
                  positionId: p.id,
                  tradingAccountId,
                  userId,
                  symbol,
                  exitPrice: currentPrice,
                  reason: "stop_loss",
                })
              } else if (tpHit) {
                slTpCloseCandidates.push({
                  positionId: p.id,
                  tradingAccountId,
                  userId,
                  symbol,
                  exitPrice: currentPrice,
                  reason: "target",
                })
              }
            } else if (slHit || tpHit) {
              slTpSkippedUnreliablePrice += 1
              // Collect the would-have-fired skip so we raise a single
              // throttled alert per account at end-of-tick (not one per
              // position, which would spam during a multi-position outage).
              const bucket =
                slTpFeedOutageByAccount.get(tradingAccountId) ?? { userId, positions: [] }
              bucket.positions.push({
                positionId: p.id,
                symbol,
                reason: slHit ? "stop_loss" : "target",
              })
              slTpFeedOutageByAccount.set(tradingAccountId, bucket)
            }
          }

          // Always write latest computed PnL into Redis (even if DB update is skipped),
          // so the dashboard can stay smooth without re-fetching on every tick.
          if (!dryRun) {
            const key = `positions:pnl:${p.id}`
            const nowSnap = Date.now()
            const hasServerTick = Boolean(lastTickQuote)
            if (!hasServerTick) {
              redisPnlSnapshotSkippedStaleTick += 1
            }
            const payloadObj: Record<string, unknown> = {
              positionId: p.id,
              unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
              dayPnL: Number(dayPnL.toFixed(2)),
              updatedAtMs: nowSnap,
            }
            if (hasServerTick && lastTickQuote) {
              payloadObj.currentPrice = Number(currentPrice.toFixed(4))
              payloadObj.quoteReceivedAtMs = lastTickQuote.receivedAt
            }
            const payload = JSON.stringify(payloadObj)
            await redisSet(key, payload, redisTtlSeconds)
            redisPnlCacheWrites += 1
          }

          if (userId) {
            const nowEv = Date.now()
            const includeSseMark = Boolean(lastTickQuote)
            const list = updatesByUser.get(userId) || []
            const ev: (typeof list)[number] = {
              positionId: p.id,
              unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
              dayPnL: Number(dayPnL.toFixed(2)),
              updatedAtMs: nowEv,
            }
            if (includeSseMark && lastTickQuote) {
              ev.currentPrice = Number(currentPrice.toFixed(4))
              ;(ev as Record<string, unknown>).quoteReceivedAtMs = lastTickQuote.receivedAt
            }
            // prevClose lets net-view clients recompute net.dayPnL = (currentPrice - prevClose) * netQuantity
            // without needing a refetch. All lots of the same instrument share prevClose.
            if (Number.isFinite(prevClose) && prevClose > 0) {
              ev.prevClose = Number(prevClose.toFixed(4))
            }
            list.push(ev)
            updatesByUser.set(userId, list)
          }

          const oldUnrealized = toNumber(p.unrealizedPnL)
          const oldDay = toNumber(p.dayPnL)

          const du = abs(unrealizedPnL - oldUnrealized)
          const dd = abs(dayPnL - oldDay)

          if (du < updateThreshold && dd < updateThreshold) {
            skipped += 1
            continue
          }

          if (!dryRun) {
            await prisma.position.update({
              where: { id: p.id },
              data: {
                unrealizedPnL: asDecimal(unrealizedPnL),
                dayPnL: asDecimal(dayPnL),
              },
            })
          }

          updated += 1
        } catch (e) {
          errors += 1
          log.error({ positionId: p.id, message: (e as any)?.message || String(e) }, "failed to process position")
        }
      }

      // Auto square-off after computing the tick snapshot.
      // Bound work per tick to avoid runaway close loops in a single run.
      let stopLossAutoClosed = 0
      let targetAutoClosed = 0
      let riskAutoClosed = 0
      let riskAlertsCreated = 0
      let intradayEodCandidates = 0
      let intradayEodClosed = 0
      let intradayEodSkipped = 0
      let intradayEodMarkersWritten = 0

      const MAX_SLTP_CLOSES_PER_TICK = clampInt(input.sltpMaxAutoClosesPerTick, 200, 0, 1000)
      const MAX_RISK_CLOSES_PER_ACCOUNT_PER_TICK = clampInt(input.riskMaxAutoClosesPerAccount, 3, 0, 25)
      const MAX_RISK_REDUCTION_ROUNDS_PER_TICK = clampInt(
        input.riskMaxReductionRoundsPerTick,
        envNumber("RISK_MAX_REDUCTION_ROUNDS_PER_TICK", 20),
        1,
        50,
      )
      const RISK_ALERT_COOLDOWN_MS = clampInt(input.riskAlertCooldownMs, 10 * 60 * 1000, 0, 60 * 60 * 1000)
      const closedPositionIdsThisTick = new Set<string>()
      const lastRiskAlertAtByAccount = (globalThis as any).__riskAlertThrottleByAccount as
        | Map<string, number>
        | undefined
      const riskAlertThrottle: Map<string, number> =
        lastRiskAlertAtByAccount || new Map<string, number>()
      ;(globalThis as any).__riskAlertThrottleByAccount = riskAlertThrottle

      if (!dryRun && slTpCloseCandidates.length > 0) {
        const positionService = createPositionManagementService()
        const seen = new Set<string>()

        for (const c of slTpCloseCandidates.slice(0, MAX_SLTP_CLOSES_PER_TICK)) {
          if (seen.has(c.positionId)) continue
          seen.add(c.positionId)
          closedPositionIdsThisTick.add(c.positionId)

          try {
            const res = await positionService.closePosition(
              c.positionId,
              c.tradingAccountId,
              c.exitPrice,
              undefined,
              {
                reason: "AUTO_LIQUIDATED",
                note: `Auto square-off (${c.reason}) @ ₹${c.exitPrice}`,
              },
            )
            const didClose = Boolean((res as any)?.exitOrderId)
            if (didClose) {
              if (c.reason === "stop_loss") stopLossAutoClosed += 1
              if (c.reason === "target") targetAutoClosed += 1
            }
            log.info(
              {
                positionId: c.positionId,
                symbol: c.symbol,
                reason: c.reason,
                exitPrice: c.exitPrice,
                didClose,
              },
              "auto square-off (sl/tp)",
            )
          } catch (e) {
            errors += 1
            log.warn(
              { positionId: c.positionId, symbol: c.symbol, reason: c.reason, message: (e as any)?.message || String(e) },
              "auto square-off (sl/tp) failed",
            )
          }
        }
      }

      // Trading-6zm: SL/TP fired but feed was degraded — raise a throttled
      // alert so operators see the exposure rather than discovering it later.
      // Reuses the same per-account throttle Map as risk alerts so the user
      // doesn't get a flood of notifications during a sustained outage.
      if (!dryRun && slTpFeedOutageByAccount.size > 0) {
        for (const [tradingAccountId, bucket] of Array.from(slTpFeedOutageByAccount.entries())) {
          const throttleKey = `feed-outage:${tradingAccountId}`
          const lastAt = riskAlertThrottle.get(throttleKey) || 0
          const now = Date.now()
          if (now - lastAt < RISK_ALERT_COOLDOWN_MS) continue

          const symbols = Array.from(new Set(bucket.positions.map((p) => p.symbol))).slice(0, 5).join(", ")
          const moreSuffix = bucket.positions.length > 5 ? ` +${bucket.positions.length - 5} more` : ""
          const message =
            `Stop-loss/target was hit for ${bucket.positions.length} position(s) ` +
            `but auto square-off was skipped because the price feed is stale. ` +
            `Affected: ${symbols}${moreSuffix}. Check positions manually.`

          try {
            await prisma.riskAlert.create({
              data: {
                userId: bucket.userId,
                type: "FEED_OUTAGE_SLTP_SKIP",
                severity: "HIGH",
                message,
              },
            })
            riskAlertsCreated += 1
            riskAlertThrottle.set(throttleKey, now)
            log.warn(
              {
                tradingAccountId,
                userId: bucket.userId,
                affectedPositions: bucket.positions.length,
                symbols,
              },
              "sl/tp skipped due to stale feed — alert raised",
            )
          } catch (e) {
            errors += 1
            log.warn(
              { tradingAccountId, message: (e as any)?.message || String(e) },
              "failed to raise feed-outage SL/TP skip alert",
            )
          }
        }
      }

      // Intraday EOD square-off (segment-aware pre-close window). The CURRENCY bucket was
      // added alongside NSE/MCX in 2026-05 so CDS/BCD intraday positions get their own
      // 17:00-IST close-window decision and marker row — without it they'd inherit the NSE
      // 15:30 close and either auto-square 90 minutes too early or be silently skipped.
      type IntradayEodSegmentBucket = "NSE" | "MCX" | "CURRENCY"
      const intradayEodDateKeyIst = getISTDateKey()
      const intradayEodMarkerKeyBySegment: Record<IntradayEodSegmentBucket, string> = {
        NSE: buildIntradayEodSquareOffMarkerKey("NSE", intradayEodDateKeyIst),
        MCX: buildIntradayEodSquareOffMarkerKey("MCX", intradayEodDateKeyIst),
        CURRENCY: buildIntradayEodSquareOffMarkerKey("CURRENCY", intradayEodDateKeyIst),
      }
      let intradayEodMarkerRows = new Map<string, { key: string; value: string; updatedAt: Date }>()
      if (!dryRun) {
        try {
          intradayEodMarkerRows = await getLatestActiveGlobalSettings(Object.values(intradayEodMarkerKeyBySegment))
        } catch (e) {
          errors += 1
          log.warn(
            { message: (e as any)?.message || String(e) },
            "failed to read intraday EOD marker settings; continuing without marker cache",
          )
        }
      }
      const intradayEodDecisionBySegment = new Map<IntradayEodSegmentBucket, SegmentIntradaySquareOffWindowDecision>()
      const intradayEodRollupBySegment = new Map<
        IntradayEodSegmentBucket,
        { markerKey: string; attempted: number; closed: number; skipped: number }
      >()
      const intradayEodSegmentMaxCapReached = new Set<IntradayEodSegmentBucket>()

      // Match the bucket selector to the same family logic used in market-timing.ts so
      // the worker's cache key and the timing helper agree on which positions belong
      // together. Currency derivatives (CDS / BCD) get their own bucket; commodity NCO
      // shares MCX's long-hours bucket; everything else (NSE/BSE/IDX) uses NSE.
      const resolveIntradayEodBucket = (segmentToken: string): IntradayEodSegmentBucket => {
        if (segmentToken.startsWith("MCX") || segmentToken.startsWith("NCO")) return "MCX"
        if (segmentToken.startsWith("CDS") || segmentToken.startsWith("BCD")) return "CURRENCY"
        return "NSE"
      }

      const getIntradayEodDecisionForSegment = async (
        segmentHint: string | null | undefined,
      ): Promise<SegmentIntradaySquareOffWindowDecision> => {
        const normalizedSegmentToken = typeof segmentHint === "string" ? segmentHint.trim().toUpperCase() : "NSE"
        const expectedSegment: IntradayEodSegmentBucket = resolveIntradayEodBucket(normalizedSegmentToken)
        const cachedDecision = intradayEodDecisionBySegment.get(expectedSegment)
        if (cachedDecision) {
          return cachedDecision
        }
        const resolvedDecision = await getSegmentIntradaySquareOffWindowDecision({
          segment: segmentHint,
          preCloseBufferMinutes: intradayEodPreCloseBufferMinutes,
        })
        intradayEodDecisionBySegment.set(resolvedDecision.segment, resolvedDecision)
        return resolvedDecision
      }

      if (positions.length > 0) {
        const positionService = createPositionManagementService()
        let intradayEodCloseAttempts = 0

        for (const p of positions) {
          const productTypeResolution = resolvePositionProductType({
            quantity: p.quantity,
            orders: (p as any)?.orders,
            defaultProductType: "MIS",
          })
          if (!productTypeResolution.isIntraday) {
            continue
          }

          const tradingAccountId = String((p as any)?.tradingAccountId || "")
          const userId = (p as any)?.tradingAccount?.userId as string | undefined
          const symbol = String((p as any)?.symbol || "")
          const segmentHint = (p as any)?.Stock?.segment as string | null | undefined
          const decision = await getIntradayEodDecisionForSegment(segmentHint)
          const markerKey = intradayEodMarkerKeyBySegment[decision.segment]
          const markerAlreadySet = !intradayEodForceRun && intradayEodMarkerRows.has(markerKey)
          const shouldEnforceWindow = intradayEodForceRun || decision.shouldSquareOffNow

          const rollup = intradayEodRollupBySegment.get(decision.segment) || {
            markerKey,
            attempted: 0,
            closed: 0,
            skipped: 0,
          }
          intradayEodRollupBySegment.set(decision.segment, rollup)

          if (!shouldEnforceWindow) {
            intradayEodSkipped += 1
            rollup.skipped += 1
            continue
          }
          if (markerAlreadySet) {
            intradayEodSkipped += 1
            rollup.skipped += 1
            continue
          }

          intradayEodCandidates += 1
          rollup.attempted += 1

          if (!dryRun && intradayEodMaxAutoClosesPerTick > 0 && intradayEodCloseAttempts >= intradayEodMaxAutoClosesPerTick) {
            intradayEodSegmentMaxCapReached.add(decision.segment)
            intradayEodSkipped += 1
            rollup.skipped += 1
            continue
          }

          if (closedPositionIdsThisTick.has(p.id)) {
            intradayEodSkipped += 1
            rollup.skipped += 1
            continue
          }

          if (!actionableAutoCloseByPositionId.get(p.id)) {
            intradayEodSkipped += 1
            rollup.skipped += 1
            continue
          }

          const exitPrice = currentPriceByPositionId.get(p.id)
          if (exitPrice == null || !Number.isFinite(exitPrice) || exitPrice <= 0 || !tradingAccountId || !userId) {
            intradayEodSkipped += 1
            rollup.skipped += 1
            continue
          }

          if (dryRun) {
            intradayEodSkipped += 1
            rollup.skipped += 1
            continue
          }

          intradayEodCloseAttempts += 1
          try {
            const res = await positionService.closePosition(p.id, tradingAccountId, exitPrice)
            const didClose = Boolean((res as any)?.exitOrderId)
            if (didClose) {
              intradayEodClosed += 1
              rollup.closed += 1
              closedPositionIdsThisTick.add(p.id)
            } else {
              intradayEodSkipped += 1
              rollup.skipped += 1
            }
            log.info(
              {
                positionId: p.id,
                tradingAccountId,
                userId,
                symbol,
                segment: decision.segment,
                productType: productTypeResolution.productType,
                productTypeSource: productTypeResolution.source,
                exitPrice,
                didClose,
                forceRun: intradayEodForceRun,
                markerKey,
              },
              "auto square-off (intraday eod)",
            )
          } catch (e) {
            errors += 1
            intradayEodSkipped += 1
            rollup.skipped += 1
            log.warn(
              {
                positionId: p.id,
                tradingAccountId,
                userId,
                symbol,
                segment: decision.segment,
                productType: productTypeResolution.productType,
                productTypeSource: productTypeResolution.source,
                message: (e as any)?.message || String(e),
              },
              "auto square-off (intraday eod) failed",
            )
          }
        }
      }

      if (!dryRun && intradayEodRollupBySegment.size > 0) {
        for (const [segment, rollup] of Array.from(intradayEodRollupBySegment.entries())) {
          const decision = intradayEodDecisionBySegment.get(segment)
          if (!decision) {
            continue
          }
          if (intradayEodSegmentMaxCapReached.has(segment)) {
            continue
          }

          const markerAlreadySet = intradayEodMarkerRows.has(rollup.markerKey)
          if (markerAlreadySet && !intradayEodForceRun) {
            continue
          }
          if (!decision.shouldSquareOffNow && !intradayEodForceRun) {
            continue
          }

          const markerPayload = {
            dateKeyIst: intradayEodDateKeyIst,
            segment,
            forceRun: intradayEodForceRun,
            attempted: rollup.attempted,
            closed: rollup.closed,
            skipped: rollup.skipped,
            preCloseBufferMinutes: decision.preCloseBufferMinutes,
            windowStartMinutesIst: decision.windowStartMinutesIst,
            closeMinutesIst: decision.closeMinutesIst,
            nowMinutesIst: decision.nowMinutesIst,
            reason: decision.reason,
            markedAtIso: new Date().toISOString(),
            host: os.hostname(),
            pid: process.pid,
          }

          try {
            await setGlobalSystemSetting({
              key: rollup.markerKey,
              value: JSON.stringify(markerPayload),
              category: "TRADING",
              description: "Intraday EOD square-off per-day/per-segment idempotency marker.",
            })
            intradayEodMarkersWritten += 1
            intradayEodMarkerRows.set(rollup.markerKey, {
              key: rollup.markerKey,
              value: JSON.stringify(markerPayload),
              updatedAt: new Date(),
            })
          } catch (e) {
            errors += 1
            log.warn(
              {
                segment,
                markerKey: rollup.markerKey,
                message: (e as any)?.message || String(e),
              },
              "failed to write intraday eod marker",
            )
          }
        }
      }

      // Account-level risk monitoring (loss utilization thresholds).
      // Respects the master risk toggle — no account-level auto-close when risk is disabled.
      if (!dryRun && accountPositions.size > 0 && riskEnabled) {
        const positionService = createPositionManagementService()

        // Trading-4w4: pre-fix this loop applied global thresholds to every
        // account, ignoring per-user RiskLimit overrides
        // (autoCloseLevelPct, riskLevelHighPct). Now we batch-resolve per-user
        // thresholds for all userIds in this tick (one DB read per user, not
        // per position) and use them as the primary threshold source. Global
        // thresholds remain the fallback when no override exists OR the
        // resolver fails for that user.
        const uniqueUserIds = new Set<string>()
        for (const [, snap] of Array.from(accountPositions.entries())) {
          if (snap.userId) uniqueUserIds.add(snap.userId)
        }
        const perUserThresholds = new Map<string, RiskThresholds>()
        await Promise.all(
          Array.from(uniqueUserIds).map(async (uid) => {
            try {
              const u = await resolveThresholdsForUser(uid)
              perUserThresholds.set(uid, {
                warningThreshold: u.riskLevelHighPct / 100,
                autoCloseThreshold: u.autoCloseLevelPct / 100,
              })
            } catch (e) {
              // Resolver failure → leave map entry absent → caller falls back
              // to the global riskThresholds. We do NOT block the whole tick
              // on a single user's DB hiccup.
              log.warn(
                { userId: uid, message: (e as any)?.message || String(e) },
                "per-user threshold resolve failed; falling back to global",
              )
            }
          }),
        )

        for (const [tradingAccountId, snap] of Array.from(accountPositions.entries())) {
          const effectiveMaxClose =
            riskEnforcement.fullLiquidationOnAutoClose || MAX_RISK_CLOSES_PER_ACCOUNT_PER_TICK === 0
              ? undefined
              : MAX_RISK_CLOSES_PER_ACCOUNT_PER_TICK

          // Per-user thresholds win when present; otherwise global. The
          // resolver itself merges per-user RiskLimit columns with global
          // values, so this map will hold the user's effective view.
          const accountThresholds: RiskThresholds =
            perUserThresholds.get(snap.userId) ?? riskThresholds

          let selection = pickRiskAutoClosePositions({
            positions: snap.positions,
            totalFunds: snap.totalFunds,
            thresholds: accountThresholds,
            maxToClose: effectiveMaxClose,
          })

          const mustSquareOff =
            selection.shouldAutoClose ||
            (riskEnforcement.squareOffOnWarningBand && selection.shouldWarn)

          const severity = selection.shouldAutoClose ? "CRITICAL" : selection.shouldWarn ? "HIGH" : null
          if (severity) {
            const lastAt = riskAlertThrottle.get(tradingAccountId) || 0
            const now = Date.now()
            if (now - lastAt >= RISK_ALERT_COOLDOWN_MS) {
              try {
                const policyWarn = riskEnforcement.squareOffOnWarningBand && selection.shouldWarn && !selection.shouldAutoClose
                await prisma.riskAlert.create({
                  data: {
                    userId: snap.userId,
                    type: selection.shouldAutoClose ? "MARGIN_CALL" : "LARGE_LOSS",
                    severity,
                    message: selection.shouldAutoClose
                      ? `Risk auto-close active. Loss utilization ${(selection.marginUtilizationPercent * 100).toFixed(
                          2,
                        )}% (threshold ${(accountThresholds.autoCloseThreshold * 100).toFixed(0)}%).`
                      : policyWarn
                        ? `Risk warning-band square-off (policy). Loss utilization ${(selection.marginUtilizationPercent * 100).toFixed(2)}% (warning ${(accountThresholds.warningThreshold * 100).toFixed(0)}%).`
                        : `Risk warning. Loss utilization ${(selection.marginUtilizationPercent * 100).toFixed(2)}% (threshold ${(
                          accountThresholds.warningThreshold * 100
                        ).toFixed(0)}%).`,
                  },
                })
                riskAlertsCreated += 1
                riskAlertThrottle.set(tradingAccountId, now)
              } catch (e) {
                errors += 1
                log.warn(
                  { tradingAccountId, userId: snap.userId, message: (e as any)?.message || String(e) },
                  "failed to create risk alert",
                )
              }
            }
          }

          if (!mustSquareOff) continue

          let rounds = 0
          while (
            (selection.shouldAutoClose ||
              (riskEnforcement.squareOffOnWarningBand && selection.shouldWarn)) &&
            rounds < MAX_RISK_REDUCTION_ROUNDS_PER_TICK
          ) {
            rounds += 1
            let closedAny = false
            for (const candidate of selection.positionsToClose) {
              if (closedPositionIdsThisTick.has(candidate.positionId)) continue
              const exitPrice = currentPriceByPositionId.get(candidate.positionId)
              if (exitPrice == null || !Number.isFinite(exitPrice) || exitPrice <= 0) {
                log.warn({ positionId: candidate.positionId }, "missing exitPrice for risk auto-close; skipping")
                continue
              }
              if (!actionableAutoCloseByPositionId.get(candidate.positionId)) {
                log.warn(
                  { positionId: candidate.positionId },
                  "risk auto-close skipped: mark not actionable (no fresh tick within policy)",
                )
                continue
              }

              try {
                const res = await positionService.closePosition(candidate.positionId, tradingAccountId, exitPrice)
                const didClose = Boolean((res as any)?.exitOrderId)
                if (didClose) {
                  riskAutoClosed += 1
                  closedAny = true
                  snap.positions = snap.positions.filter((p) => p.positionId !== candidate.positionId)
                  closedPositionIdsThisTick.add(candidate.positionId)
                }
                log.info(
                  {
                    tradingAccountId,
                    positionId: candidate.positionId,
                    symbol: candidate.symbol,
                    exitPrice,
                    marginUtilizationPercent: selection.marginUtilizationPercent,
                    didClose,
                    riskRound: rounds,
                  },
                  "auto square-off (risk)",
                )
              } catch (e) {
                errors += 1
                log.warn(
                  {
                    tradingAccountId,
                    positionId: candidate.positionId,
                    symbol: candidate.symbol,
                    message: (e as any)?.message || String(e),
                  },
                  "auto square-off (risk) failed",
                )
              }
            }

            if (!closedAny) break
            await refreshAccountRiskSnapFunds(tradingAccountId, snap)
            selection = pickRiskAutoClosePositions({
              positions: snap.positions,
              totalFunds: snap.totalFunds,
              thresholds: accountThresholds,
              maxToClose: effectiveMaxClose,
            })
          }
        }
      }

      // Backstop: drain queued CLOSE orders so a delayed order worker does not strand exits.
      try {
        const closeDrainLimit = envNumber("POSITION_PNL_CLOSE_QUEUE_DRAIN_LIMIT", 5)
        const closeDrain = await orderExecutionWorker.processPendingOrders({
          limit: closeDrainLimit,
          maxAgeMs: 0,
          orderPurpose: OrderPurpose.CLOSE,
        })
        if (closeDrain.scanned > 0) {
          log.info({ closeDrain }, "queued close orders drained (PnL worker backstop)")
        }
      } catch (e) {
        log.warn({ message: (e as any)?.message || String(e) }, "queued close drain backstop failed")
      }

      // Emit batched PnL updates via realtime bus (Redis-backed) so UI can patch without refetch.
      // Keep payload bounded to avoid huge SSE frames.
      // Per-user throttle: at most one emit per PNL_EMIT_MIN_INTERVAL_MS — drops intermediate snapshots
      // when the worker ticks faster than the throttle window.
      const MAX_UPDATES_PER_EVENT = 250
      let pnlUpdatesEmitted = 0
      let pnlEventsEmitted = 0
      let pnlUsersThrottled = 0
      const nowMs = Date.now()
      for (const [userId, updates] of Array.from(updatesByUser.entries())) {
        if (!updates.length) continue

        const lastEmitMs = this.lastPnlEmitMsByUser.get(userId) ?? 0
        if (nowMs - lastEmitMs < PositionPnLWorker.PNL_EMIT_MIN_INTERVAL_MS) {
          pnlUsersThrottled += 1
          continue
        }
        this.lastPnlEmitMsByUser.set(userId, nowMs)

        // Bound the throttle map size — drop entries we haven't seen recently.
        if (this.lastPnlEmitMsByUser.size > 5000) {
          const expiry = nowMs - 60_000
          this.lastPnlEmitMsByUser.forEach((seenAt, key) => {
            if (seenAt < expiry) this.lastPnlEmitMsByUser.delete(key)
          })
        }

        pnlUpdatesEmitted += updates.length
        for (let i = 0; i < updates.length; i += MAX_UPDATES_PER_EVENT) {
          const chunk = updates.slice(i, i + MAX_UPDATES_PER_EVENT)
          emitter.emit(userId, "positions_pnl_updated", { updates: chunk } as PositionsPnLUpdatedEventData)
          pnlEventsEmitted += 1
        }
      }
      if (pnlUsersThrottled > 0) {
        log.debug({ pnlUsersThrottled, pnlEventsEmitted }, "pnl emit throttle applied")
      }

      // Fan out the FULL batch of all position updates to all admin SSE streams.
      // Admin consoles (Positions Panel, Command Centre) need live PNL for EVERY position,
      // not just positions owned by a single user. We broadcast the combined batch
      // on ADMIN_PNL_BROADCAST_CHANNEL so all admin SSE subscribers receive it.
      if (updatesByUser.size > 0) {
        const adminUpdates: PositionsPnLUpdatedEventData["updates"] = []
        for (const updates of Array.from(updatesByUser.values())) {
          for (const u of updates) {
            if (adminUpdates.length < MAX_UPDATES_PER_EVENT) {
              adminUpdates.push(u)
            }
          }
        }
        if (adminUpdates.length > 0) {
          const adminPayload: PositionsPnLUpdatedEventData = { updates: adminUpdates }
          // Same-process delivery via RealtimeEventEmitter fanout to adminConnections.
          emitter.fanoutAdminPnlBatch(adminPayload)
          // Cross-process delivery so other app replicas also fan out to their admin streams.
          publishAdminPnlBroadcast({
            event: "positions_pnl_updated",
            data: adminPayload,
            timestamp: new Date().toISOString(),
          })
        }
      }

      const elapsedMs = Date.now() - startedAt
      const quoteHitRate =
        scanned > 0 ? Number((positionsWithLiveQuote / scanned).toFixed(4)) : 0
      const mirrorStats = getMarketQuoteRedisMirrorStats()
      const heartbeat: PositionPnLWorkerHeartbeat = {
        lastRunAtIso: new Date().toISOString(),
        host: os.hostname(),
        pid: process.pid,
        scanned,
        updated,
        skipped,
        errors,
        elapsedMs,
        redisEnabled: isRedisEnabled(),
        redisPnlCacheWrites: dryRun ? 0 : redisPnlCacheWrites,
        redisMarketQuoteWrites: dryRun ? 0 : mirrorStats.tickRedisWrites,
        redisMarketQuoteDebounceSchedules: dryRun ? 0 : mirrorStats.tickRedisDebounceSchedules,
        redisPnlSnapshotSkippedStaleTick: dryRun ? 0 : redisPnlSnapshotSkippedStaleTick,
        pnlUpdatesEmitted,
        pnlEventsEmitted,
        stopLossAutoClosed,
        targetAutoClosed,
        riskAutoClosed,
        riskAlertsCreated,
        riskWarningThreshold: configuredRisk.warningThreshold,
        riskAutoCloseThreshold: configuredRisk.autoCloseThreshold,
        riskThresholdSource: configuredRisk.source,
        riskFullLiquidation: riskEnforcement.fullLiquidationOnAutoClose,
        riskSquareOffOnWarning: riskEnforcement.squareOffOnWarningBand,
        intradayEodCandidates,
        intradayEodClosed,
        intradayEodSkipped,
        intradayEodMarkersWritten,
        intradayEodPreCloseBufferMinutes,
        positionsWithResolvedToken,
        positionsWithoutResolvedToken,
        positionTokensResolved: positionTokens.length,
        positionsWithLiveQuote,
        positionsWithoutLiveQuote,
        quoteHitRate,
        slTpSkippedUnreliablePrice,
      }

      try {
        await setGlobalSystemSetting({
          key: POSITIONS_PNL_WORKER_HEARTBEAT_KEY,
          value: JSON.stringify(heartbeat),
          category: "TRADING",
          description: "Heartbeat for server-side position PnL worker (EC2/Docker/cron).",
        })
      } catch (e) {
        log.error({ message: (e as any)?.message || String(e) }, "failed to write heartbeat setting")
        // Do not fail the worker result on heartbeat write.
      }

      log.info(heartbeat, "done")

      return {
        success: true,
        scanned,
        updated,
        skipped,
        errors,
        elapsedMs,
        heartbeat,
      }
    } catch (e) {
      const elapsedMs = Date.now() - startedAt
      const heartbeat: PositionPnLWorkerHeartbeat = {
        lastRunAtIso: new Date().toISOString(),
        host: os.hostname(),
        pid: process.pid,
        scanned,
        updated,
        skipped,
        errors: errors + 1,
        elapsedMs,
      }
      log.error({ message: (e as any)?.message || String(e) }, "fatal error")
      return {
        success: false,
        scanned,
        updated,
        skipped,
        errors: errors + 1,
        elapsedMs,
        heartbeat,
      }
    } finally {
      if (runLock?.acquired) {
        await releaseWorkerRunLock(runLock).catch((e) => {
          log.warn({ message: (e as any)?.message || String(e) }, "failed to release global worker lock")
        })
      }
      this.isRunning = false
    }
  }
}

export const positionPnLWorker = new PositionPnLWorker()

