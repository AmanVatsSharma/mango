/**
 * @file MarginCalculator.ts
 * @module risk
 * @description Margin calculator service for segment/product leverage and charge estimation.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-06
 * @updated 2026-04-08 — Option marginRiskSide; `pickActiveRiskConfigRow`; verbose logs via `MARGIN_CALC_DEBUG`.
 * @updated 2026-04-08 — `minMarginPerLot` floor for short options (CE/PE + SELL) via `risk-required-margin`.
 * @updated 2026-04-20 — Migrate console.* calls to Pino logger.
 *
 * Notes:
 * - Non-brokerage charges come from `order_charges_config_v1` SystemSettings via `getOrderChargesConfig`.
 * - When `RiskConfig.marginRate` resolves to a fraction, required margin uses turnover × fraction; else leverage.
 */

import { prisma } from "@/lib/prisma"
import { computeNonBrokerageCharges } from "@/lib/order-charges/compute"
import { getOrderChargesConfig } from "@/lib/server/get-order-charges-config"
import { parseFiniteRiskNumber } from "@/lib/services/risk/risk-number-utils"
import {
  getDefaultBrokerageAmount,
  getDefaultLeverage,
  resolveMarginFractionFromStoredRate,
} from "@/lib/services/risk/risk-config-defaults"
import {
  normalizeRiskConfigProductType,
  normalizeRiskConfigSegment,
} from "@/lib/services/risk/risk-config-normalizer"
import { loadActiveRiskConfigForInstrument } from "@/lib/services/risk/risk-config-cache"
import {
  marginRiskSideForPlacementOrder,
  type MarginRiskSide,
} from "@/lib/services/risk/risk-margin-side"
import { NegativeBalanceTradingError } from "@/lib/services/risk/trading-funds-errors"
import {
  applyShortOptionMinMarginPerLotFloor,
  computeBaseRequiredMarginFromTurnover,
} from "@/lib/services/risk/risk-required-margin"
import { baseLogger } from "@/lib/observability/logger"

const logger = baseLogger.child({ module: "MarginCalculator" })

/** Optional CE/PE and margin row side (BUY=long option profile, SELL=short). */
export type MarginInstrumentInput = {
  optionType?: string | null
  marginRiskSide?: MarginRiskSide
}

function isMarginCalcDebugEnabled(): boolean {
  try {
    return process.env.MARGIN_CALC_DEBUG === "1" || process.env.MARGIN_CALC_DEBUG === "true"
  } catch {
    return false
  }
}

function marginCalcDebug(msg: string, ctx?: object): void {
  if (isMarginCalcDebugEnabled()) {
    logger.debug(ctx ?? {}, msg)
  }
}

marginCalcDebug("📊 [MARGIN-CALCULATOR] Module loaded")

export interface MarginCalculation {
  requiredMargin: number
  leverage: number
  turnover: number
  segment: string
  productType: string
  brokerage: number
  totalCharges: number
  totalRequired: number
  /** Rolled-up placement charge components (includes brokerage and computed GST). */
  chargesBreakdown: Record<string, number>
  /**
   * Trading-vsb: per-segment caps from the resolved RiskConfig row, exposed
   * here so the order-execution path can enforce them at admission without a
   * second DB roundtrip. Both null when no active row matched.
   *   - maxOrderValue: notional ceiling per individual order (rupees)
   *   - maxPositions: max concurrent open positions per account in this segment
   */
  maxOrderValue: number | null
  maxPositions: number | null
}

export class MarginCalculator {
  /**
   * Calculate required margin for an order
   * @param orderSide BUY or SELL — affects configurable charge rules (e.g. STT filters).
   */
  async calculateMargin(
    segment: string,
    productType: string,
    quantity: number,
    price: number,
    lotSize: number = 1,
    orderSide: string = "BUY",
    instrument?: MarginInstrumentInput | null,
    /**
     * Admin-configured per-user/per-segment margin multiplier from
     * resolveMarketControls(). Pre-fix this value was computed and stored on
     * Order.executionContext but never applied to actual required margin. Now:
     * applied AFTER the short-option floor so high-risk users get effectively
     * tighter margin (e.g. 2x → double the requirement) and relief tiers get
     * looser (e.g. 0.5x → halved). Defaults to 1 (no change) so the dozen
     * other call sites of this method retain their pre-fix behavior.
     */
    marginMultiplier?: number,
    /**
     * Per-user RiskLimit.maxLeverage cap (Trading-woj). When set and > 1,
     * clamps the segment leverage so a user can never get MORE leverage than
     * admin allowed for them. Undefined / ≤ 1 = no clamp (treat default
     * RiskLimit row as "no opinion" — most users have the default 1 because
     * the convenience averaging field hasn't been set yet, and silently
     * forcing 1x for everyone would be a regression).
     */
    userMaxLeverage?: number,
  ): Promise<MarginCalculation> {
    const normalizedSegmentKey = normalizeRiskConfigSegment(segment)
    const normalizedProductTypeKey = normalizeRiskConfigProductType(productType)
    const normalizedQuantity = Math.max(0, Math.trunc(parseFiniteRiskNumber(quantity) ?? 0))
    const normalizedPrice = Math.max(0, parseFiniteRiskNumber(price) ?? 0)
    const normalizedLotSize = Math.max(1, Math.trunc(parseFiniteRiskNumber(lotSize) ?? 1))
    const normalizedOrderSide = String(orderSide || "BUY").toUpperCase()

    const resolvedMarginRiskSide =
      instrument?.marginRiskSide ?? marginRiskSideForPlacementOrder(normalizedOrderSide)

    marginCalcDebug("💹 [MARGIN-CALCULATOR] Calculating margin:", {
      segment: normalizedSegmentKey,
      productType: normalizedProductTypeKey,
      quantity: normalizedQuantity,
      price: normalizedPrice,
      lotSize: normalizedLotSize,
      orderSide: normalizedOrderSide,
      marginRiskSide: resolvedMarginRiskSide,
    })

    const turnover = normalizedQuantity * normalizedPrice
    marginCalcDebug("Turnover calculated", { turnover })

    const riskConfig = await this.getRiskConfig(
      normalizedSegmentKey,
      normalizedProductTypeKey,
      instrument?.optionType,
      resolvedMarginRiskSide,
    )
    marginCalcDebug("Risk config fetched", { configId: (riskConfig as any)?.id })

    const defaultLeverage = getDefaultLeverage(normalizedSegmentKey, normalizedProductTypeKey)
    const leverageCandidate = parseFiniteRiskNumber(riskConfig?.leverage)
    const segmentLeverage =
      leverageCandidate !== null && leverageCandidate > 0
        ? Math.max(1, leverageCandidate)
        : defaultLeverage
    // Per-user max-leverage clamp (Trading-woj). A real user cap (> 1) wins;
    // values ≤ 1 or undefined mean "no opinion" and we use the segment value.
    const leverage =
      typeof userMaxLeverage === "number" && Number.isFinite(userMaxLeverage) && userMaxLeverage > 1
        ? Math.min(segmentLeverage, userMaxLeverage)
        : segmentLeverage
    const marginFraction = resolveMarginFractionFromStoredRate(parseFiniteRiskNumber(riskConfig?.marginRate))
    const baseRequiredMargin = computeBaseRequiredMarginFromTurnover(turnover, leverage, marginFraction)
    const minMarginPerLotParsed = parseFiniteRiskNumber(
      (riskConfig as { minMarginPerLot?: unknown } | null)?.minMarginPerLot,
    )
    const requiredMarginPreMultiplier = applyShortOptionMinMarginPerLotFloor({
      baseRequiredMargin: baseRequiredMargin,
      optionType: instrument?.optionType,
      marginRiskSide: resolvedMarginRiskSide,
      quantity: normalizedQuantity,
      lotSize: normalizedLotSize,
      minMarginPerLot: minMarginPerLotParsed,
    })

    // Apply admin marginMultiplier last so floors/leverage compute against the canonical
    // policy first, then admin nudges the final number up or down. Clamp to a sane range
    // so a fat-finger admin entry can't open the door to unbounded margin demands or zero
    // margin. Range matches the validator on the admin-side schema (0.5 – 5x).
    const clampedMarginMultiplier =
      typeof marginMultiplier === "number" && Number.isFinite(marginMultiplier) && marginMultiplier > 0
        ? Math.min(5, Math.max(0.5, marginMultiplier))
        : 1
    const requiredMargin =
      clampedMarginMultiplier === 1
        ? requiredMarginPreMultiplier
        : Math.floor(requiredMarginPreMultiplier * clampedMarginMultiplier)

    marginCalcDebug("📈 [MARGIN-CALCULATOR] Margin calculation:", {
      leverage,
      baseRequiredMargin,
      requiredMarginPreMultiplier,
      requiredMargin,
      marginFraction,
      minMarginPerLot: minMarginPerLotParsed,
      marginMultiplier: clampedMarginMultiplier,
    })

    const brokerage = this.computeBrokerageAmount(
      normalizedSegmentKey,
      normalizedProductTypeKey,
      turnover,
      normalizedQuantity,
      normalizedLotSize,
      riskConfig,
    )

    const orderChargesConfig = await getOrderChargesConfig()
    const nonBrokerage = computeNonBrokerageCharges(
      {
        segment: normalizedSegmentKey,
        productType: normalizedProductTypeKey,
        orderSide: normalizedOrderSide,
        turnover,
        brokerage,
      },
      orderChargesConfig,
    )

    const totalCharges = Math.floor(Math.max(0, brokerage + nonBrokerage.total))
    const totalRequired = requiredMargin + totalCharges

    const chargesBreakdown: Record<string, number> = { brokerage, ...nonBrokerage.byCode }

    // Trading-vsb: surface per-segment caps from the resolved RiskConfig row
    // so the order-execution path can enforce them at admission. Both fields
    // already loaded above in `riskConfig`; just expose without re-querying.
    const rcRow = riskConfig as { maxOrderValue?: unknown; maxPositions?: unknown } | null
    const maxOrderValueNum = parseFiniteRiskNumber(rcRow?.maxOrderValue)
    const maxPositionsRaw =
      rcRow?.maxPositions !== undefined && rcRow?.maxPositions !== null
        ? Number(rcRow.maxPositions)
        : null
    const maxPositionsNum =
      maxPositionsRaw !== null && Number.isFinite(maxPositionsRaw) && maxPositionsRaw >= 0
        ? Math.trunc(maxPositionsRaw)
        : null

    const result: MarginCalculation = {
      requiredMargin,
      leverage,
      turnover,
      segment: normalizedSegmentKey,
      productType: normalizedProductTypeKey,
      brokerage,
      totalCharges,
      totalRequired,
      chargesBreakdown,
      maxOrderValue: maxOrderValueNum !== null && maxOrderValueNum > 0 ? maxOrderValueNum : null,
      maxPositions: maxPositionsNum !== null && maxPositionsNum > 0 ? maxPositionsNum : null,
    }

    marginCalcDebug("✅ [MARGIN-CALCULATOR] Final margin calculation:", result)
    return result
  }

  /**
   * Get risk configuration. Trading-1z9/Trading-ee3 (2026-05-08): delegates to the shared
   * cached loader so the hot order-admission path no longer pays a DB round-trip on every
   * order, and the query implementation is shared with resolveActiveRiskConfigForInstrument
   * and the user-facing /api/risk/config route. Cache is busted via Redis pub/sub on admin
   * writes (see risk-config-cache.ts) so changes propagate within milliseconds, not minutes.
   */
  private async getRiskConfig(
    segment: string,
    productType: string,
    optionType?: string | null,
    marginRiskSide?: MarginRiskSide,
  ) {
    marginCalcDebug("🔍 [MARGIN-CALCULATOR] Fetching risk config:", {
      segment,
      productType,
      optionType,
      marginRiskSide,
    })

    const config = await loadActiveRiskConfigForInstrument({
      prisma,
      segment,
      productType,
      optionType: optionType ?? null,
      marginRiskSide: marginRiskSide ?? null,
    })

    if (config) {
      marginCalcDebug("✅ [MARGIN-CALCULATOR] Risk config found:", {
        configId: config.id,
        resolvedSegment: config.segment,
        resolvedProductType: config.productType,
      })
    } else {
      marginCalcDebug("⚠️ [MARGIN-CALCULATOR] No risk config found, using defaults", {
        segment,
        productType,
        optionType,
        marginRiskSide,
      })
    }

    return config
  }

  /**
   * Brokerage only (from `RiskConfig` or segment defaults).
   */
  private computeBrokerageAmount(
    segment: string,
    productType: string,
    turnover: number,
    quantity: number,
    lotSize: number = 1,
    riskConfig: unknown = null,
  ): number {
    marginCalcDebug("💸 [MARGIN-CALCULATOR] Computing brokerage:", {
      segment,
      productType,
      turnover,
      quantity,
      lotSize,
    })

    let brokerage = 0

    const rc = riskConfig as {
      brokerageFlat?: unknown
      brokerageRate?: unknown
      brokerageCap?: unknown
    } | null

    const brokerageFlat = parseFiniteRiskNumber(rc?.brokerageFlat)
    const brokerageRate = parseFiniteRiskNumber(rc?.brokerageRate)
    const brokerageCap = parseFiniteRiskNumber(rc?.brokerageCap)

    if (brokerageFlat !== null && brokerageFlat >= 0) {
      brokerage = brokerageFlat
      marginCalcDebug("Using flat brokerage", { brokerage })
    } else if (brokerageRate !== null && brokerageRate >= 0) {
      const rate = brokerageRate
      brokerage = turnover * rate

      if (brokerageCap !== null && brokerageCap >= 0) {
        const cap = brokerageCap
        brokerage = Math.min(brokerage, cap)
        marginCalcDebug("💰 [MARGIN-CALCULATOR] Rate-based brokerage with cap:", { brokerage, rate, cap })
      } else {
        marginCalcDebug("💰 [MARGIN-CALCULATOR] Rate-based brokerage:", { brokerage, rate })
      }
    } else {
      brokerage = getDefaultBrokerageAmount(segment, productType, turnover, quantity, lotSize)
      marginCalcDebug("Default brokerage", { brokerage })
    }

    return brokerage
  }

  /**
   * Validate if account has sufficient margin
   */
  async validateMargin(
    tradingAccountId: string,
    requiredMargin: number,
    totalCharges: number,
  ): Promise<{
    isValid: boolean
    availableMargin: number
    requiredAmount: number
    shortfall: number
  }> {
    marginCalcDebug("🔍 [MARGIN-CALCULATOR] Validating margin:", {
      tradingAccountId,
      requiredMargin,
      totalCharges,
    })

    const account = await prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      select: { availableMargin: true, balance: true },
    })

    if (!account) {
      logger.error({ tradingAccountId }, "Trading account not found")
      throw new Error("Trading account not found")
    }

    const cashBalance = parseFiniteRiskNumber(account.balance) ?? 0
    if (cashBalance < 0) {
      logger.error({ tradingAccountId, balance: cashBalance }, "Negative cash balance blocks order placement")
      throw new NegativeBalanceTradingError()
    }

    const availableMargin = parseFiniteRiskNumber(account.availableMargin) ?? 0
    const normalizedRequiredMargin = parseFiniteRiskNumber(requiredMargin) ?? 0
    const normalizedTotalCharges = parseFiniteRiskNumber(totalCharges) ?? 0
    const requiredAmount = normalizedRequiredMargin + normalizedTotalCharges
    const shortfall = Math.max(0, requiredAmount - availableMargin)
    const isValid = availableMargin >= requiredAmount

    marginCalcDebug("✅ [MARGIN-CALCULATOR] Margin validation result:", {
      isValid,
      availableMargin,
      requiredAmount,
      shortfall,
    })

    return {
      isValid,
      availableMargin,
      requiredAmount,
      shortfall,
    }
  }
}

/**
 * Create a margin calculator instance
 */
export function createMarginCalculator(): MarginCalculator {
  marginCalcDebug("🏭 [MARGIN-CALCULATOR] Creating new margin calculator instance")
  return new MarginCalculator()
}

marginCalcDebug("✅ [MARGIN-CALCULATOR] Module initialized")
