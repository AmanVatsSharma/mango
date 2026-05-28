/**
 * @file market-display-pnl-meta.ts
 * @module server
 * @description Resolve positions-list and worker freshness limits from global `market_display_config_v1` (database only).
 * @author StockTrade
 * @created 2026-03-24
 * @updated 2026-03-30
 *
 * Notes:
 * - Business-rule max ages come from Settings, not `REDIS_POSITIONS_PNL_MAX_AGE_MS` / `REDIS_MARKET_QUOTE_MAX_AGE_MS`.
 */

import { prisma } from "@/lib/prisma"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  parseMarketDisplayConfigJson,
  type MarketDisplayConfigV1,
} from "@/lib/market-display/market-display-config.schema"

export type MarketDisplayQuoteFreshnessResolved = {
  pnlServerMaxAgeMs: number
  redisMarketQuoteMaxAgeMs: number
  positionPnlQuoteMaxAgeMs: number
  marketQuoteRedisWriteMinIntervalMs: number
}

function freshnessFromDoc(doc: MarketDisplayConfigV1): MarketDisplayQuoteFreshnessResolved {
  const q = doc.quoteFreshness
  return {
    pnlServerMaxAgeMs: q.pnlServerMaxAgeMs,
    redisMarketQuoteMaxAgeMs: q.redisMarketQuoteMaxAgeMs,
    positionPnlQuoteMaxAgeMs: q.positionPnlQuoteMaxAgeMs,
    marketQuoteRedisWriteMinIntervalMs: q.marketQuoteRedisWriteMinIntervalMs,
  }
}

/**
 * Active global market display document quoteFreshness fields.
 */
export async function resolveMarketDisplayQuoteFreshness(): Promise<MarketDisplayQuoteFreshnessResolved> {
  const row = await prisma.systemSettings.findFirst({
    where: {
      isActive: true,
      ownerId: null,
      key: ADMIN_SETTING_KEYS.MARKET_DISPLAY_CONFIG_V1,
    },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  })
  const doc = parseMarketDisplayConfigJson(row?.value ?? null)
  return freshnessFromDoc(doc)
}

/**
 * Max age for accepting `positions:pnl:<id>` snapshot envelope (`updatedAtMs`).
 * @deprecatedParam normalizeEnvMs — retained for call-site compatibility; ignored.
 */
export async function resolvePositionsListPnlMaxAgeMs(
  _normalizeEnvMs?: (raw: unknown) => number,
): Promise<number> {
  const f = await resolveMarketDisplayQuoteFreshness()
  return f.pnlServerMaxAgeMs
}
