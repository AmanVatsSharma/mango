/**
 * @file RiskMonitoringService.ts
 * @module risk
 * @description Server-side risk monitoring: loss-utilization vs configured thresholds, alerts, and auto-close.
 * Uses the same loss-only utilization formula as PositionPnLWorker / position-risk-evaluator.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-06 — DB `Stock.ltp` fallback gated by `updatedAt` and `STOCK_LTP_FALLBACK_MAX_AGE_MS` (default 300s).
 * @updated 2026-04-06 — default thresholds 75%/80%.
 * @updated 2026-04-01
 *
 * Notes:
 * - Pass thresholds from getRiskThresholds() at call sites so admin-configured values apply.
 * - marginUtilizationPercent is loss utilization: max(0, -totalUnrealizedPnL) / totalFunds.
 */

import { prisma } from "@/lib/prisma"
import { PositionManagementService } from "@/lib/services/position/PositionManagementService"
import { TradingLogger } from "@/lib/services/logging/TradingLogger"
import { PositionRepository } from "@/lib/repositories/PositionRepository"
import { parseFiniteRiskNumber, normalizeRiskThresholdPair } from "@/lib/services/risk/risk-number-utils"
import { computeMarginUtilizationPercent } from "@/lib/services/position/position-risk-evaluator"
import { getRiskEnforcementSettings } from "@/lib/services/risk/risk-enforcement-settings"
import { resolveThresholdsForUser } from "@/lib/services/risk/risk-thresholds-resolver"
// Trading-m82 + Trading-bvz: switch from HTTP self-call to /api/quotes to the
// in-process serverMarketData singleton so this service and PositionPnLWorker
// see the same prices (was the source of divergent close decisions).
import { getServerMarketDataService } from "@/lib/market-data/server-market-data.service"
import { parseTokenFromInstrumentId } from "@/lib/market-data/utils/quote-lookup"
// Trading-lne: hot-loop logs go to in-process Pino. The DB-backed TradingLogger is reserved
// for terminal audit events (auto-close breach/failure, warning-band breach, alert creation).
// Per-account observability and per-tick start/complete summaries pay zero DB roundtrips now.
import { baseLogger } from "@/lib/observability/logger"

const pinoLog = baseLogger.child({ module: "RiskMonitoringService" })

export interface RiskMonitoringResult {
  checkedAccounts: number
  positionsChecked: number
  positionsClosed: number
  alertsCreated: number
  errors: number
  details: Array<{
    tradingAccountId: string
    userId: string
    userName: string
    totalUnrealizedPnL: number
    availableMargin: number
    marginUtilizationPercent: number
    positionsClosed: number
    alertCreated: boolean
  }>
}

export interface RiskThresholds {
  warningThreshold: number
  autoCloseThreshold: number
}

export class RiskMonitoringService {
  private positionService: PositionManagementService
  private positionRepo: PositionRepository
  private logger: TradingLogger
  private defaultThresholds: RiskThresholds = {
    warningThreshold: 0.75,
    autoCloseThreshold: 0.8,
  }

  constructor(logger?: TradingLogger) {
    this.logger = logger || new TradingLogger()
    this.positionService = new PositionManagementService(this.logger)
    this.positionRepo = new PositionRepository()
  }

  /**
   * Monitor all active trading accounts for risk
   * This is the main entry point for risk monitoring
   */
  async monitorAllAccounts(thresholds?: RiskThresholds): Promise<RiskMonitoringResult> {
    const config = normalizeRiskThresholdPair(thresholds, this.defaultThresholds)
    // Trading-lne: in-process log only — fires once per cron tick, not worth a DB row.
    pinoLog.info(
      {
        warningThreshold: config.warningThreshold,
        autoCloseThreshold: config.autoCloseThreshold,
      },
      "RISK_MONITORING_START — Starting risk monitoring for all accounts",
    )

    const result: RiskMonitoringResult = {
      checkedAccounts: 0,
      positionsChecked: 0,
      positionsClosed: 0,
      alertsCreated: 0,
      errors: 0,
      details: [],
    }

    try {
      const tradingAccounts = await prisma.tradingAccount.findMany({
        where: {
          positions: {
            some: {
              quantity: { not: 0 },
            },
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              clientId: true,
            },
          },
          positions: {
            where: {
              quantity: { not: 0 },
            },
            include: {
              Stock: {
                select: {
                  instrumentId: true,
                  ltp: true,
                },
              },
            },
          },
        },
      })

      // Trading-lne: per-tick summary, in-process log.
      pinoLog.info(
        { count: tradingAccounts.length },
        `RISK_MONITORING_ACCOUNTS — Found ${tradingAccounts.length} accounts with open positions`,
      )

      for (const account of tradingAccounts) {
        try {
          result.checkedAccounts++
          const accountResult = await this.monitorAccount(account.id, account.user.id, config)

          result.positionsChecked += accountResult.positionsChecked
          result.positionsClosed += accountResult.positionsClosed
          if (accountResult.alertCreated) result.alertsCreated++

          result.details.push({
            tradingAccountId: account.id,
            userId: account.user.id,
            userName: account.user.name || account.user.email || "Unknown",
            totalUnrealizedPnL: accountResult.totalUnrealizedPnL,
            availableMargin: accountResult.availableMargin,
            marginUtilizationPercent: accountResult.marginUtilizationPercent,
            positionsClosed: accountResult.positionsClosed,
            alertCreated: accountResult.alertCreated,
          })
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          // Trading-lne: per-account error → in-process log. The terminal audit
          // (was-an-account-actually-affected) lives on RiskAlert / closed Position rows.
          pinoLog.error(
            {
              err: error,
              tradingAccountId: account.id,
              userId: account.user.id,
            },
            `RISK_MONITORING_ACCOUNT_ERROR — ${message}`,
          )
          result.errors++
        }
      }

      // Trading-lne: per-tick completion summary, in-process log.
      pinoLog.info(
        {
          checkedAccounts: result.checkedAccounts,
          positionsClosed: result.positionsClosed,
          alertsCreated: result.alertsCreated,
          errors: result.errors,
        },
        "RISK_MONITORING_COMPLETE — Risk monitoring completed",
      )

      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      // Trading-lne: fatal once-per-tick error — in-process log + rethrow. The cron route
      // already writes a heartbeat row so the run is observable in the worker dashboard.
      pinoLog.error({ err: error }, `RISK_MONITORING_FATAL_ERROR — ${message}`)
      throw error
    }
  }

  /**
   * Monitor a specific trading account
   * Public for event-driven monitoring and targeted admin diagnostics.
   */
  async monitorAccount(
    tradingAccountId: string,
    userId: string,
    thresholds: RiskThresholds,
  ): Promise<{
    positionsChecked: number
    positionsClosed: number
    totalUnrealizedPnL: number
    availableMargin: number
    marginUtilizationPercent: number
    alertCreated: boolean
  }> {
    // Trading-4w4: pre-fix this method used the global thresholds directly
    // and the per-user RiskLimit overrides (autoCloseLevelPct,
    // riskLevelHighPct) were silently ignored. Now we resolve per-user first
    // and only fall back to the passed/global thresholds when no per-user
    // override exists OR the resolver itself fails (transient DB error).
    const globalThresholds = normalizeRiskThresholdPair(thresholds, this.defaultThresholds)
    let normalizedThresholds: RiskThresholds = globalThresholds
    let perUserSource: "per-user" | "global" | "mixed" | "global-fallback" = "global"
    try {
      const perUser = await resolveThresholdsForUser(userId)
      perUserSource = perUser.source
      // resolver returns percentages 0-100; we work in fractions 0-1.
      normalizedThresholds = normalizeRiskThresholdPair(
        {
          warningThreshold: perUser.riskLevelHighPct / 100,
          autoCloseThreshold: perUser.autoCloseLevelPct / 100,
        },
        globalThresholds,
      )
    } catch (resolverErr: unknown) {
      perUserSource = "global-fallback"
      // Trading-lne: per-account observability log; in-process. The user can still trade —
      // we just fell back to globals — so this isn't a terminal event worth a DB row.
      pinoLog.warn(
        {
          userId,
          err: resolverErr,
        },
        `RISK_THRESHOLD_RESOLVER_FALL_BACK — Per-user threshold resolver failed for ${userId}; using global`,
      )
    }
    const enforcement = await getRiskEnforcementSettings({ maxAgeMs: 0 })
    // Trading-lne: per-account scan start, in-process log.
    pinoLog.debug({ tradingAccountId }, `RISK_MONITORING_ACCOUNT — Monitoring account ${tradingAccountId}`)

    const account = await prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      select: {
        availableMargin: true,
        usedMargin: true,
        balance: true,
      },
    })

    if (!account) {
      throw new Error(`Trading account not found: ${tradingAccountId}`)
    }

    const pnlData = await this.positionService.calculateUnrealizedPnL(tradingAccountId)
    const totalUnrealizedPnL = parseFiniteRiskNumber(pnlData.totalUnrealizedPnL) ?? 0
    const availableMargin = parseFiniteRiskNumber(account.availableMargin) ?? 0
    const accountBalance = parseFiniteRiskNumber(account.balance) ?? 0

    const totalAvailableFunds = availableMargin + accountBalance
    const marginUtilizationPercent = computeMarginUtilizationPercent(totalUnrealizedPnL, totalAvailableFunds)

    // Trading-lne: per-account metrics log — pure observability, in-process. Pre-fix this
    // wrote one DB row per account per cron tick (~10K writes/min on 10K accounts). On the
    // risk path. Switched to debug-level Pino so it's queryable in stdout-driven dashboards
    // (Grafana/Loki) without slowing down the path it's instrumenting.
    pinoLog.debug(
      {
        tradingAccountId,
        totalUnrealizedPnL,
        availableMargin,
        balance: accountBalance,
        totalAvailableFunds,
        marginUtilizationPercent,
        thresholdsSource: perUserSource,
        warningThreshold: normalizedThresholds.warningThreshold,
        autoCloseThreshold: normalizedThresholds.autoCloseThreshold,
      },
      `RISK_MONITORING_METRICS — Account ${tradingAccountId} risk metrics`,
    )

    let positionsClosed = 0
    let alertCreated = false

    const inAutoCloseBand = marginUtilizationPercent >= normalizedThresholds.autoCloseThreshold
    const inWarningBand = marginUtilizationPercent >= normalizedThresholds.warningThreshold
    const mustSquareOff =
      inAutoCloseBand || (enforcement.squareOffOnWarningBand && inWarningBand)

    if (mustSquareOff) {
      const triggeredByAuto = inAutoCloseBand
      const exitUtilThreshold = triggeredByAuto
        ? normalizedThresholds.autoCloseThreshold
        : normalizedThresholds.warningThreshold
      const fullLiquidationWave = enforcement.fullLiquidationOnAutoClose && triggeredByAuto

      await this.logger.warn(
        triggeredByAuto ? "RISK_AUTO_CLOSE_BREACH" : "RISK_POLICY_SQUAREOFF",
        triggeredByAuto
          ? `AUTO-CLOSE THRESHOLD BREACHED for account ${tradingAccountId}`
          : `WARNING-BAND SQUARE-OFF for account ${tradingAccountId}`,
        {
          tradingAccountId,
          totalUnrealizedPnL,
          totalAvailableFunds,
          marginUtilizationPercent,
          fullLiquidationWave,
        },
      )

      const positions = await this.positionRepo.findActive(tradingAccountId)

      const positionsWithLoss = await Promise.all(
        positions.map(async (pos) => {
          try {
            const currentPrice = await this.getCurrentPrice(pos.Stock?.instrumentId || "")
            const avgPrice = parseFiniteRiskNumber(pos.averagePrice) ?? 0
            const unrealizedPnL = (currentPrice - avgPrice) * pos.quantity
            return { position: pos, unrealizedPnL, currentPrice }
          } catch {
            return { position: pos, unrealizedPnL: 0, currentPrice: 0 }
          }
        }),
      )

      positionsWithLoss.sort((a, b) => a.unrealizedPnL - b.unrealizedPnL)

      for (const { position, unrealizedPnL, currentPrice } of positionsWithLoss) {
        if (unrealizedPnL >= 0) break

        try {
          // Trading-xpo: forward the same currentPrice we used for threshold
          // evaluation. Pre-fix this was undefined and PositionManagementService
          // resolved its own price independently — could yield a stale fallback
          // diverging from the price that triggered the close. Only forward
          // when the price is actually usable (positive finite); otherwise let
          // the service resolve, same as before.
          const forwardExitPrice =
            Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : undefined

          await this.positionService.closePosition(
            position.id,
            tradingAccountId,
            forwardExitPrice,
            undefined,
            {
              reason: "AUTO_LIQUIDATED",
              note: `Auto-liquidation: margin ${marginUtilizationPercent.toFixed(2)}%, unrealized ₹${totalUnrealizedPnL.toFixed(2)}`,
            },
          )

          positionsClosed += 1

          const updatedPnl = await this.positionService.calculateUnrealizedPnL(tradingAccountId)
          const updatedAccount = await prisma.tradingAccount.findUnique({
            where: { id: tradingAccountId },
            select: { availableMargin: true, balance: true },
          })

          if (updatedAccount && !fullLiquidationWave) {
            const updatedAvailableMargin = parseFiniteRiskNumber(updatedAccount.availableMargin) ?? 0
            const updatedBalance = parseFiniteRiskNumber(updatedAccount.balance) ?? 0
            const updatedTotalFunds = updatedAvailableMargin + updatedBalance
            const updatedTotalUnrealizedPnL = parseFiniteRiskNumber(updatedPnl.totalUnrealizedPnL) ?? 0
            const updatedUtilization = computeMarginUtilizationPercent(
              updatedTotalUnrealizedPnL,
              updatedTotalFunds,
            )

            if (updatedUtilization < exitUtilThreshold) {
              break
            }
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          await this.logger.error("RISK_AUTO_CLOSE_FAILED", message, error as Error, {
            positionId: position.id,
            tradingAccountId,
          })
        }
      }

      await this.createRiskAlert(
        userId,
        triggeredByAuto ? "MARGIN_CALL" : "LARGE_LOSS",
        triggeredByAuto ? "CRITICAL" : "HIGH",
        triggeredByAuto
          ? `Auto-closed ${positionsClosed} position(s) — loss utilization exceeded ${(normalizedThresholds.autoCloseThreshold * 100).toFixed(0)}%. Policy full-liq wave: ${fullLiquidationWave ? "yes" : "no"}.`
          : `Policy square-off (warning band): closed ${positionsClosed} losing position(s). Utilization was ${(marginUtilizationPercent * 100).toFixed(2)}%.`,
      )
      alertCreated = true
    } else if (inWarningBand) {
      await this.logger.warn(
        "RISK_WARNING_BREACH",
        `WARNING THRESHOLD BREACHED for account ${tradingAccountId}`,
        { tradingAccountId, marginUtilizationPercent },
      )

      await this.createRiskAlert(
        userId,
        "LARGE_LOSS",
        "HIGH",
        `Unrealized loss utilization ${(marginUtilizationPercent * 100).toFixed(2)}% exceeds warning ${(normalizedThresholds.warningThreshold * 100).toFixed(0)}% of funds (₹${totalAvailableFunds.toFixed(2)}). Net unrealized PnL: ₹${totalUnrealizedPnL.toFixed(2)}.`,
      )
      alertCreated = true
    }

    return {
      positionsChecked: Array.isArray(pnlData.positions) ? pnlData.positions.length : 0,
      positionsClosed,
      totalUnrealizedPnL,
      availableMargin,
      marginUtilizationPercent,
      alertCreated,
    }
  }

  private async getCurrentPrice(instrumentId: string): Promise<number> {
    try {
      // Trading-m82 + Trading-bvz: same path PositionPnLWorker uses. Pre-fix
      // this method fetched via fetch(`${baseUrl}/api/quotes`) — an HTTP
      // self-call that (a) consumed the connection pool, (b) added RTT
      // latency, (c) failed during cold starts, and (d) read from a
      // potentially-different cache than the in-process singleton, so this
      // service and the worker could disagree on current price for the same
      // instrument and trigger inconsistent close decisions.
      const token = parseTokenFromInstrumentId(instrumentId)
      if (token != null) {
        const cached = getServerMarketDataService().getQuote(token)
        const cachedLtp = parseFiniteRiskNumber(cached?.last_trade_price)
        if (cachedLtp !== null && cachedLtp > 0) {
          return cachedLtp
        }
      }

      // Fallback chain (preserved from pre-fix): Stock.ltp from DB if fresh
      // enough. STOCK_LTP_FALLBACK_MAX_AGE_MS bounds how stale the DB-side
      // mirror can be before we refuse to use it (default 5 minutes,
      // clamped to the 5s..1h sane range).
      const stockLtpMaxAgeMs = (() => {
        const raw = parseFiniteRiskNumber(process.env.STOCK_LTP_FALLBACK_MAX_AGE_MS)
        if (raw === null || !Number.isFinite(raw)) return 300_000
        return Math.max(5_000, Math.min(3_600_000, Math.trunc(raw)))
      })()

      const stock = await prisma.stock.findFirst({
        where: { instrumentId },
        select: { ltp: true, updatedAt: true },
      })

      const stockAgeMs = stock?.updatedAt
        ? Math.max(0, Date.now() - stock.updatedAt.getTime())
        : Number.POSITIVE_INFINITY
      const fallbackLtp = parseFiniteRiskNumber(stock?.ltp)
      if (fallbackLtp !== null && fallbackLtp > 0 && stockAgeMs <= stockLtpMaxAgeMs) {
        return fallbackLtp
      }

      throw new Error("Unable to determine current price")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      // Trading-lne: per-position price-failure log — observability, not an audit event
      // (the actual close-failure that matters is logged via TradingLogger one frame up).
      pinoLog.warn(
        { err: error, instrumentId },
        `RISK_MONITORING_PRICE_FAILED — ${message}`,
      )
      throw error
    }
  }

  private async createRiskAlert(userId: string, type: string, severity: string, message: string): Promise<void> {
    try {
      await prisma.riskAlert.create({
        data: {
          userId,
          type,
          severity,
          message,
          resolved: false,
        },
      })

      await this.logger.info("RISK_ALERT_CREATED", "Risk alert created", { userId, type, severity })
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : String(error)
      await this.logger.error("RISK_ALERT_CREATE_FAILED", errMessage, error as Error, { userId, type })
    }
  }
}

/**
 * Create risk monitoring service instance
 */
export function createRiskMonitoringService(logger?: TradingLogger): RiskMonitoringService {
  return new RiskMonitoringService(logger)
}
