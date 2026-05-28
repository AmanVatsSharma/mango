/**
 * @file market-display-exit-policy.ts
 * @module server
 * @description Read square-off + positions pricing UI from global `market_display_config_v1`.
 * @author StockTrade
 * @created 2026-03-24
 * @updated 2026-03-30
 */

import { loadGlobalMarketDisplayConfigV1 } from "@/lib/server/market-display-config-loader"
import type {
  PositionCloseExitPricePolicy,
  PositionSquareOffPriceAuthority,
  PositionsTabMtmDisplayMode,
} from "@/lib/market-display/market-display-config.schema"

export type { PositionCloseExitPricePolicy }

export type MarketDisplayPositionPricingPolicies = {
  positionCloseExitPricePolicy: PositionCloseExitPricePolicy
  positionSquareOffPriceAuthority: PositionSquareOffPriceAuthority
  positionsTabMtmDisplayMode: PositionsTabMtmDisplayMode
  positionSquareOffClientMaxDeviationBps: number
  /** Admin-only: stale last tick from server market cache when fresh quote missing */
  adminSquareOffAllowLastSubscriptionTick: boolean
  positionCloseUseClientPriceWhenWithinBand: boolean
  adminPositionCloseMaxDeviationBps: number | null
  positionCloseReferenceDivergenceMaxBps: number | null
  /** From `quoteFreshness` (database). */
  pnlServerMaxAgeMs: number
  redisMarketQuoteMaxAgeMs: number
  positionPnlQuoteMaxAgeMs: number
}

export async function getMarketDisplayPositionPricingPolicies(): Promise<MarketDisplayPositionPricingPolicies> {
  const doc = await loadGlobalMarketDisplayConfigV1()
  const q = doc.quoteFreshness
  return {
    positionCloseExitPricePolicy: doc.ui.positionCloseExitPricePolicy,
    positionSquareOffPriceAuthority: doc.ui.positionSquareOffPriceAuthority,
    positionsTabMtmDisplayMode: doc.ui.positionsTabMtmDisplayMode,
    positionSquareOffClientMaxDeviationBps: doc.ui.positionSquareOffClientMaxDeviationBps,
    adminSquareOffAllowLastSubscriptionTick: doc.ui.adminSquareOffAllowLastSubscriptionTick,
    positionCloseUseClientPriceWhenWithinBand: doc.ui.positionCloseUseClientPriceWhenWithinBand,
    adminPositionCloseMaxDeviationBps: doc.ui.adminPositionCloseMaxDeviationBps,
    positionCloseReferenceDivergenceMaxBps: doc.ui.positionCloseReferenceDivergenceMaxBps,
    pnlServerMaxAgeMs: q.pnlServerMaxAgeMs,
    redisMarketQuoteMaxAgeMs: q.redisMarketQuoteMaxAgeMs,
    positionPnlQuoteMaxAgeMs: q.positionPnlQuoteMaxAgeMs,
  }
}

export async function getPositionCloseExitPricePolicy(): Promise<PositionCloseExitPricePolicy> {
  const doc = await loadGlobalMarketDisplayConfigV1()
  return doc.ui.positionCloseExitPricePolicy
}
