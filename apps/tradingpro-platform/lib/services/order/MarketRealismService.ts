/**
 * File:        lib/services/order/MarketRealismService.ts
 * Module:      Order Execution · market-realism step (spread + slippage + tilt)
 * Purpose:     Computes a realistic execution price by applying bid-ask spread, slippage,
 *              and admin tilt bias to a base market price. Used by OrderExecutionService
 *              and the order-form preview so the user sees the same fill price the engine
 *              will produce.
 *
 * Exports:
 *   - MarketRealismResult            — execution result shape
 *   - MarketRealismService           — main class (applyMarketRealism, estimateExecutionQuality, simulateExecutionRange)
 *   - createMarketRealismService()   — factory
 *
 * Depends on:
 *   - @/lib/config/market-realism-config — slippage / spread / size multiplier config
 *   - @/lib/observability/logger — Pino child logger (Trading-gl1)
 *
 * Side-effects: structured Pino logs at info/debug/warn levels.
 *
 * Key invariants:
 *   - BUY orders execute at ASK (price * (1 + halfSpread))
 *   - SELL orders execute at BID (price * (1 - halfSpread))
 *   - Slippage worsens fills: BUY × (1 + slip%), SELL ÷ (1 + slip%)
 *   - Tilt bias mirrors fillPriceFromSnapshot exactly so preview matches fill
 *   - slippageOverride > 0 short-circuits the random band; size multiplier still applies
 *
 * Read order:
 *   1. applyMarketRealism — main entrypoint
 *   2. applyBidAskSpread / calculateSlippage / applySlippage — pipeline steps
 *   3. estimateExecutionQuality / simulateExecutionRange — preview-side helpers
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08 (Trading-gl1 — console.log → Pino sweep)
 */

import { OrderSide } from "@prisma/client"
import {
  getSlippageConfig,
  getBidAskSpread,
  getOrderSizeMultiplier,
  getMarketRealismConfig,
} from "@/lib/config/market-realism-config"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "MarketRealismService" })

export interface MarketRealismResult {
  basePrice: number           // Original price before adjustments
  executionPrice: number      // Final execution price
  spreadPercent: number       // Applied bid-ask spread %
  slippagePercent: number     // Applied slippage %
  totalImpactPercent: number  // Total price impact %
  priceAdjustment: number     // Absolute price difference
  orderSizeCategory: 'small' | 'medium' | 'large'
  warnings: string[]
}

export class MarketRealismService {
  constructor() {
    // Per-instance creation log dropped — adds no signal in production.
  }

  /**
   * Apply realistic market conditions to execution price
   * 
   * This is the main entry point that applies both bid-ask spread and slippage
   * 
   * @param basePrice - The base market price
   * @param orderSide - BUY or SELL
   * @param segment - Market segment (NSE_EQ, NSE_FO, etc.)
   * @param quantity - Order quantity
   * @param lotSize - Lot size for the instrument
   * @returns MarketRealismResult with execution price and details
   */
  async applyMarketRealism(
    basePrice: number,
    orderSide: OrderSide,
    segment: string,
    quantity: number,
    lotSize: number = 1,
    /** Pre-computed spread % from the order sheet (ensures UI and execution use the same spread). */
    spreadOverride?: number,
    /**
     * Pre-computed slippage % from the admin market-controls config (resolveMarketControls()).
     * Pre-fix this parameter did not exist and the hardcoded `getSlippageConfig(segment)` always
     * ran, silently discarding admin slippage settings. Now: when a positive number, this value
     * REPLACES the random slippage band entirely (admin chose a single deterministic value);
     * undefined / NaN / <= 0 falls back to the hardcoded random band for backwards compatibility.
     */
    slippageOverride?: number,
    /**
     * Trading-37t: tiltBiasPct from EffectiveControls. Mirrors the worker's
     * fillPriceFromSnapshot tilt step so the placement preview includes the
     * same one-way bias the user will actually pay at fill (BUY × (1 + tilt%),
     * SELL × (1 - tilt%)). Pre-fix tilt was applied at fill only — the
     * displayed executionPrice diverged from the actual fill price by up to
     * tiltBiasPct with no user-facing disclosure.
     */
    tiltBiasOverride?: number,
  ): Promise<MarketRealismResult> {
    log.debug(
      { basePrice, orderSide, segment, quantity, lotSize },
      "MARKET_REALISM_APPLY_START",
    )

    const warnings: string[] = []

    if (basePrice <= 0) {
      throw new Error("Base price must be greater than 0")
    }

    const orderValue = basePrice * quantity
    const slippageConfig = getSlippageConfig(segment)
    const spreadPercent = (typeof spreadOverride === "number" && spreadOverride > 0)
      ? spreadOverride
      : getBidAskSpread(segment)
    const sizeMultiplier = getOrderSizeMultiplier(orderValue)
    // Admin slippage override: a positive number short-circuits the random band; size
    // multiplier still applies so large orders take more pain than small orders.
    const hasSlippageOverride =
      typeof slippageOverride === "number" && Number.isFinite(slippageOverride) && slippageOverride > 0

    log.debug(
      { orderValue, slippageConfig, spreadPercent, sizeMultiplier, hasSlippageOverride },
      "MARKET_REALISM_CONFIG",
    )

    const config = getMarketRealismConfig()
    let orderSizeCategory: 'small' | 'medium' | 'large' = 'small'

    if (orderValue >= config.orderSizeThresholds.large) {
      orderSizeCategory = 'large'
      warnings.push(`Large order detected (₹${orderValue.toLocaleString()}). Higher slippage applied.`)
    } else if (orderValue >= config.orderSizeThresholds.medium) {
      orderSizeCategory = 'medium'
      warnings.push(`Medium order detected (₹${orderValue.toLocaleString()}). Moderate slippage applied.`)
    }

    // Step 1: Apply bid-ask spread
    let executionPrice = this.applyBidAskSpread(basePrice, orderSide, spreadPercent)

    // Step 2: Apply slippage
    const slippagePercent = hasSlippageOverride
      ? (slippageOverride as number) * sizeMultiplier
      : this.calculateSlippage(slippageConfig, sizeMultiplier, segment)

    executionPrice = this.applySlippage(
      executionPrice,
      orderSide,
      slippagePercent,
    )

    // Step 3 (Trading-37t): Apply tilt bias. Same formula as fillPriceFromSnapshot in
    // market-control-resolver.ts so placement preview matches fill on the tilt component.
    const tiltBiasPct =
      typeof tiltBiasOverride === "number" && Number.isFinite(tiltBiasOverride) && tiltBiasOverride > 0
        ? tiltBiasOverride
        : 0
    if (tiltBiasPct > 0) {
      const tiltMul = orderSide === OrderSide.BUY ? 1 + tiltBiasPct / 100 : 1 - tiltBiasPct / 100
      executionPrice = executionPrice * tiltMul
      log.debug(
        { executionPrice, tiltBiasPct, side: orderSide },
        "MARKET_REALISM_TILT_APPLIED",
      )
    }

    const priceAdjustment = executionPrice - basePrice
    const totalImpactPercent = (priceAdjustment / basePrice) * 100

    // Add impact warning if significant
    if (Math.abs(totalImpactPercent) > 0.5) {
      warnings.push(
        `Significant price impact: ${totalImpactPercent.toFixed(2)}% ${
          totalImpactPercent > 0 ? 'higher' : 'lower'
        } than market price`
      )
    }

    const result: MarketRealismResult = {
      basePrice,
      executionPrice: Number(executionPrice.toFixed(2)),
      spreadPercent,
      slippagePercent,
      totalImpactPercent: Number(totalImpactPercent.toFixed(3)),
      priceAdjustment: Number(priceAdjustment.toFixed(2)),
      orderSizeCategory,
      warnings,
    }

    log.info(
      {
        basePrice,
        executionPrice: result.executionPrice,
        spreadPercent,
        slippagePercent,
        totalImpactPercent: result.totalImpactPercent,
        orderSide,
        segment,
        orderSizeCategory,
      },
      "MARKET_REALISM_APPLIED",
    )

    return result
  }

  /**
   * Apply bid-ask spread
   * 
   * BUY orders execute at ASK (higher price)
   * SELL orders execute at BID (lower price)
   * 
   * @private
   */
  private applyBidAskSpread(
    price: number,
    orderSide: OrderSide,
    spreadPercent: number,
  ): number {
    // Half the spread goes to each side
    const halfSpread = spreadPercent / 2 / 100
    if (orderSide === OrderSide.BUY) {
      const askPrice = price * (1 + halfSpread)
      log.debug({ side: "BUY", bidPrice: price, askPrice, spreadPercent }, "BID_ASK_SPREAD_APPLIED")
      return askPrice
    }
    const bidPrice = price * (1 - halfSpread)
    log.debug({ side: "SELL", bidPrice, askPrice: price, spreadPercent }, "BID_ASK_SPREAD_APPLIED")
    return bidPrice
  }

  /**
   * Calculate slippage percentage
   * 
   * Uses configuration and adds randomness for realism
   * 
   * @private
   */
  private calculateSlippage(
    slippageConfig: { min: number; max: number },
    sizeMultiplier: number,
    segment: string,
  ): number {
    const baseSlippage =
      slippageConfig.min + Math.random() * (slippageConfig.max - slippageConfig.min)
    const finalSlippage = baseSlippage * sizeMultiplier
    log.debug(
      { segment, slippageConfig, sizeMultiplier, baseSlippage, finalSlippage },
      "SLIPPAGE_CALCULATED",
    )
    return finalSlippage
  }

  /**
   * Apply slippage to price
   * 
   * BUY orders: slippage increases price (unfavorable)
   * SELL orders: slippage decreases price (unfavorable)
   * 
   * @private
   */
  private applySlippage(
    price: number,
    orderSide: OrderSide,
    slippagePercent: number,
  ): number {
    const slippageMultiplier = 1 + (slippagePercent / 100)
    if (orderSide === OrderSide.BUY) {
      const newPrice = price * slippageMultiplier
      log.debug({ side: "BUY", originalPrice: price, newPrice, slippagePercent }, "SLIPPAGE_APPLIED")
      return newPrice
    }
    const newPrice = price / slippageMultiplier
    log.debug({ side: "SELL", originalPrice: price, newPrice, slippagePercent }, "SLIPPAGE_APPLIED")
    return newPrice
  }

  /**
   * Estimate execution quality based on market conditions
   * 
   * Provides transparency about expected execution
   */
  async estimateExecutionQuality(
    basePrice: number,
    orderSide: OrderSide,
    segment: string,
    orderValue: number
  ): Promise<{
    quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
    expectedSlippage: { min: number; max: number }
    expectedSpread: number
    recommendation: string
  }> {
    log.debug({ basePrice, orderSide, segment, orderValue }, "EXECUTION_QUALITY_ESTIMATE_START")

    const slippageConfig = getSlippageConfig(segment)
    const spreadPercent = getBidAskSpread(segment)
    const sizeMultiplier = getOrderSizeMultiplier(orderValue)

    // Calculate expected slippage range with size multiplier
    const expectedSlippage = {
      min: slippageConfig.min * sizeMultiplier,
      max: slippageConfig.max * sizeMultiplier
    }

    // Determine quality based on total expected impact
    const maxImpact = expectedSlippage.max + spreadPercent
    
    let quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
    let recommendation: string

    if (maxImpact < 0.2) {
      quality = 'EXCELLENT'
      recommendation = 'Ideal conditions for execution. Low slippage expected.'
    } else if (maxImpact < 0.4) {
      quality = 'GOOD'
      recommendation = 'Good execution conditions. Moderate slippage expected.'
    } else if (maxImpact < 0.7) {
      quality = 'FAIR'
      recommendation = 'Fair execution conditions. Consider splitting large orders.'
    } else {
      quality = 'POOR'
      recommendation = 'High slippage expected. Strongly consider splitting order or using limit orders.'
    }

    log.debug(
      { quality, expectedSlippage, expectedSpread: spreadPercent, maxImpact },
      "EXECUTION_QUALITY_ESTIMATE",
    )

    return {
      quality,
      expectedSlippage,
      expectedSpread: spreadPercent,
      recommendation,
    }
  }

  /**
   * Simulate multiple executions to show price range
   * 
   * Useful for showing users what to expect
   */
  async simulateExecutionRange(
    basePrice: number,
    orderSide: OrderSide,
    segment: string,
    quantity: number,
    simulations: number = 100
  ): Promise<{
    minPrice: number
    maxPrice: number
    avgPrice: number
    mostLikelyPrice: number
    priceDistribution: number[]
  }> {
    log.debug(
      { basePrice, orderSide, segment, quantity, simulations },
      "SIMULATE_EXECUTION_RANGE_START",
    )

    const prices: number[] = []

    // Run multiple simulations
    for (let i = 0; i < simulations; i++) {
      const result = await this.applyMarketRealism(
        basePrice,
        orderSide,
        segment,
        quantity
      )
      prices.push(result.executionPrice)
    }

    // Calculate statistics
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length

    // Find most likely price (mode)
    const priceFrequency = new Map<number, number>()
    prices.forEach(price => {
      const roundedPrice = Math.round(price * 100) / 100
      priceFrequency.set(
        roundedPrice,
        (priceFrequency.get(roundedPrice) || 0) + 1
      )
    })

    let mostLikelyPrice = avgPrice
    let maxFrequency = 0
    priceFrequency.forEach((freq, price) => {
      if (freq > maxFrequency) {
        maxFrequency = freq
        mostLikelyPrice = price
      }
    })

    const result = {
      minPrice: Number(minPrice.toFixed(2)),
      maxPrice: Number(maxPrice.toFixed(2)),
      avgPrice: Number(avgPrice.toFixed(2)),
      mostLikelyPrice: Number(mostLikelyPrice.toFixed(2)),
      priceDistribution: prices
    }

    log.debug(
      {
        minPrice: result.minPrice,
        maxPrice: result.maxPrice,
        avgPrice: result.avgPrice,
        mostLikelyPrice: result.mostLikelyPrice,
        sampleCount: prices.length,
      },
      "SIMULATE_EXECUTION_RANGE_COMPLETE",
    )

    return result
  }
}

/**
 * Create market realism service instance
 */
export function createMarketRealismService(): MarketRealismService {
  return new MarketRealismService()
}