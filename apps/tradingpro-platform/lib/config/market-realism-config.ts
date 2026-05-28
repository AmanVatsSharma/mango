/**
 * File:        lib/config/market-realism-config.ts
 * Module:      Market Realism · environment-tier slippage / spread / order-size config
 * Purpose:     Resolves per-segment slippage and bid-ask spread parameters with dev-vs-prod
 *              tiers, plus an order-size multiplier band for slippage scaling. Used by
 *              MarketRealismService at order admission to compute realistic fill prices.
 *
 * Exports:
 *   - SlippageConfig                        — { min, max } percentage band
 *   - MarketRealismConfig                   — full per-tier shape
 *   - MARKET_REALISM_CONFIG_DEV             — lenient dev-tier defaults
 *   - MARKET_REALISM_CONFIG_PROD            — stricter prod-tier defaults
 *   - getMarketRealismConfig()              — env-aware tier picker
 *   - getSlippageConfig(segment)            — alias-aware lookup with DEFAULT fallback
 *   - getBidAskSpread(segment) → number     — alias-aware lookup with DEFAULT fallback
 *   - getOrderSizeMultiplier(orderValue)    — small/medium/large multiplier
 *
 * Depends on: @/lib/observability/logger — Pino child logger (Trading-gl1)
 *
 * Side-effects: none (pure data + structured Pino logging at debug level)
 *
 * Key invariants:
 *   - Segment lookup is order-INDEPENDENT (alias map, not substring containment) — fixed
 *     in Trading-10b. Adding a new exchange means adding a key to SEGMENT_ALIAS_TABLE.
 *   - Dev tier → development+test envs; prod tier → only when NODE_ENV='production'.
 *
 * Read order:
 *   1. SlippageConfig / MarketRealismConfig types
 *   2. MARKET_REALISM_CONFIG_DEV (defaults for non-prod)
 *   3. SEGMENT_ALIAS_TABLE (deterministic alias chain)
 *   4. getSlippageConfig / getBidAskSpread (lookup helpers)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08 (Trading-gl1 — console.log → Pino sweep)
 */

import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "market-realism-config" })

export interface SlippageConfig {
  min: number  // Minimum slippage percentage
  max: number  // Maximum slippage percentage
}

export interface MarketRealismConfig {
  // Slippage configuration by segment
  slippage: {
    [segment: string]: SlippageConfig
  }
  
  // Bid-ask spread by segment (in percentage)
  spread: {
    [segment: string]: number
  }
  
  // (priceResolution config removed in Trading-0gu — was consumed only by
  // PriceResolutionService which itself was instantiated but never invoked.)

  // Order size thresholds for increased slippage
  orderSizeThresholds: {
    small: number      // < 10,000
    medium: number     // 10,000 - 100,000  
    large: number      // > 100,000
  }
  
  // Slippage multipliers based on order size
  orderSizeMultipliers: {
    small: number   // 1.0x (no increase)
    medium: number  // 1.5x (50% more slippage)
    large: number   // 2.0x (100% more slippage)
  }
}

/**
 * Development Configuration
 * More lenient settings for testing
 */
export const MARKET_REALISM_CONFIG_DEV: MarketRealismConfig = {
  slippage: {
    // Indian Equity - NSE Cash
    NSE_EQ: { min: 0.05, max: 0.15 },
    NSE: { min: 0.05, max: 0.15 },
    
    // Indian Derivatives - NSE F&O
    NSE_FO: { min: 0.10, max: 0.20 },
    FO: { min: 0.10, max: 0.20 },
    
    // BSE - Bombay Stock Exchange
    BSE_EQ: { min: 0.08, max: 0.18 },
    BSE: { min: 0.08, max: 0.18 },
    
    // MCX - Commodities
    MCX: { min: 0.15, max: 0.30 },
    MCX_FO: { min: 0.15, max: 0.30 },
    
    // Forex
    FOREX: { min: 0.03, max: 0.08 },
    CDS: { min: 0.03, max: 0.08 },
    
    // Crypto
    CRYPTO: { min: 0.20, max: 0.50 },
    
    // Default fallback
    DEFAULT: { min: 0.10, max: 0.25 }
  },
  
  spread: {
    // Bid-ask spread percentages
    NSE_EQ: 0.03,
    NSE: 0.03,
    NSE_FO: 0.08,
    FO: 0.08,
    BSE_EQ: 0.04,
    BSE: 0.04,
    MCX: 0.10,
    MCX_FO: 0.10,
    FOREX: 0.02,
    CDS: 0.02,
    CRYPTO: 0.20,
    DEFAULT: 0.05
  },
  
  orderSizeThresholds: {
    small: 10000,
    medium: 100000,
    large: 500000
  },

  orderSizeMultipliers: {
    small: 1.0,   // No increase for small orders
    medium: 1.5,  // 50% more slippage for medium orders
    large: 2.0    // 100% more slippage for large orders
  }
}

/**
 * Production Configuration
 * More realistic, stricter settings
 */
export const MARKET_REALISM_CONFIG_PROD: MarketRealismConfig = {
  slippage: {
    // More realistic slippage for production
    NSE_EQ: { min: 0.08, max: 0.25 },
    NSE: { min: 0.08, max: 0.25 },
    NSE_FO: { min: 0.12, max: 0.30 },
    FO: { min: 0.12, max: 0.30 },
    BSE_EQ: { min: 0.10, max: 0.28 },
    BSE: { min: 0.10, max: 0.28 },
    MCX: { min: 0.20, max: 0.40 },
    MCX_FO: { min: 0.20, max: 0.40 },
    FOREX: { min: 0.05, max: 0.10 },
    CDS: { min: 0.05, max: 0.10 },
    CRYPTO: { min: 0.30, max: 0.80 },
    DEFAULT: { min: 0.15, max: 0.35 }
  },
  
  spread: {
    NSE_EQ: 0.04,
    NSE: 0.04,
    NSE_FO: 0.10,
    FO: 0.10,
    BSE_EQ: 0.05,
    BSE: 0.05,
    MCX: 0.12,
    MCX_FO: 0.12,
    FOREX: 0.03,
    CDS: 0.03,
    CRYPTO: 0.25,
    DEFAULT: 0.08
  },
  
  orderSizeThresholds: {
    small: 10000,
    medium: 100000,
    large: 500000
  },

  orderSizeMultipliers: {
    small: 1.0,
    medium: 1.8,  // More impact in production
    large: 2.5    // Significant impact for large orders
  }
}

/**
 * Get active configuration based on environment
 */
export function getMarketRealismConfig(): MarketRealismConfig {
  const env = process.env.NODE_ENV || 'development'
  log.debug({ env }, "MARKET_REALISM_CONFIG_LOAD")
  return env === 'production' ? MARKET_REALISM_CONFIG_PROD : MARKET_REALISM_CONFIG_DEV
}

/**
 * Get slippage config for a segment
 */
export function getSlippageConfig(segment: string): SlippageConfig {
  const config = getMarketRealismConfig()
  const normalizedSegment = segment.toUpperCase().trim()

  if (config.slippage[normalizedSegment]) {
    log.debug(
      { segment, normalizedSegment, match: "exact", value: config.slippage[normalizedSegment] },
      "SLIPPAGE_RESOLVED",
    )
    return config.slippage[normalizedSegment]
  }

  // Trading-10b: pre-fix used substring containment — order-dependent. Now an explicit
  // alias table; lookup is deterministic and reviewable.
  const aliasMatch = SEGMENT_ALIAS_TABLE[normalizedSegment]
  if (aliasMatch && config.slippage[aliasMatch]) {
    log.debug(
      { segment, normalizedSegment, match: "alias", aliasMatch, value: config.slippage[aliasMatch] },
      "SLIPPAGE_RESOLVED",
    )
    return config.slippage[aliasMatch]
  }

  log.warn(
    { segment, normalizedSegment, match: "default", value: config.slippage.DEFAULT },
    "SLIPPAGE_RESOLVED — falling back to DEFAULT (unknown segment)",
  )
  return config.slippage.DEFAULT
}

/**
 * Get bid-ask spread for a segment
 */
export function getBidAskSpread(segment: string): number {
  const config = getMarketRealismConfig()
  const normalizedSegment = segment.toUpperCase().trim()

  if (config.spread[normalizedSegment] !== undefined) {
    log.debug(
      { segment, normalizedSegment, match: "exact", value: config.spread[normalizedSegment] },
      "SPREAD_RESOLVED",
    )
    return config.spread[normalizedSegment]
  }

  // Trading-10b: see getSlippageConfig — explicit alias map.
  const aliasMatch = SEGMENT_ALIAS_TABLE[normalizedSegment]
  if (aliasMatch && config.spread[aliasMatch] !== undefined) {
    log.debug(
      { segment, normalizedSegment, match: "alias", aliasMatch, value: config.spread[aliasMatch] },
      "SPREAD_RESOLVED",
    )
    return config.spread[aliasMatch]
  }

  log.warn(
    { segment, normalizedSegment, match: "default", value: config.spread.DEFAULT },
    "SPREAD_RESOLVED — falling back to DEFAULT (unknown segment)",
  )
  return config.spread.DEFAULT
}

/**
 * Trading-10b: deterministic alias map for segment lookup. Maps the
 * concrete exchange-qualified segment names to their canonical config key.
 * Order-independent (object key) and reviewable in source — replaces the
 * order-dependent substring-containment match that could silently return
 * the wrong slippage band when iteration order shifted (e.g. "NSE_EQ"
 * resolving to "NSE_FO" because the FO key happened to be enumerated first).
 *
 * Update this table when a new exchange/segment family is added — the
 * default fallback (config.slippage.DEFAULT / config.spread.DEFAULT) only
 * fires for genuinely unknown values now, not for known ones that lost a
 * race to a substring sibling.
 */
const SEGMENT_ALIAS_TABLE: Readonly<Record<string, string>> = Object.freeze({
  // Equity
  NSE: "NSE",
  NSE_EQ: "NSE",
  BSE: "BSE",
  BSE_EQ: "BSE",
  // Equity derivatives
  NFO: "NSE_FO",
  NSE_FO: "NSE_FO",
  BFO: "NSE_FO",
  BSE_FO: "NSE_FO",
  FO: "FO",
  FNO: "FO",
  // Commodity
  MCX: "MCX",
  MCX_FO: "MCX_FO",
  NCO: "MCX",
  NCO_FO: "MCX_FO",
  // Currency
  CDS: "CDS",
  CDS_FO: "CDS",
  BCD: "CDS",
  BCD_FO: "CDS",
  // FX / forex
  FOREX: "FOREX",
  FX: "FOREX",
  // Crypto
  CRYPTO: "CRYPTO",
  BINANCE: "CRYPTO",
  SPOT: "CRYPTO",
})

/**
 * Get order size multiplier based on order value
 */
export function getOrderSizeMultiplier(orderValue: number): number {
  const config = getMarketRealismConfig()

  if (orderValue < config.orderSizeThresholds.small) {
    log.debug(
      { orderValue, category: "small", multiplier: config.orderSizeMultipliers.small },
      "ORDER_SIZE_MULTIPLIER",
    )
    return config.orderSizeMultipliers.small
  }

  if (orderValue < config.orderSizeThresholds.medium) {
    log.debug(
      { orderValue, category: "medium", multiplier: config.orderSizeMultipliers.medium },
      "ORDER_SIZE_MULTIPLIER",
    )
    return config.orderSizeMultipliers.medium
  }

  log.debug(
    { orderValue, category: "large", multiplier: config.orderSizeMultipliers.large },
    "ORDER_SIZE_MULTIPLIER",
  )
  return config.orderSizeMultipliers.large
}