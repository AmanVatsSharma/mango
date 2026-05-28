/**
 * @file market-display-config-loader.ts
 * @module server
 * @description Single Prisma read for global `market_display_config_v1` (cached parse per call site).
 * @author StockTrade
 * @created 2026-03-27
 */

import { prisma } from "@/lib/prisma"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  parseMarketDisplayConfigJson,
  type MarketDisplayConfigV1,
} from "@/lib/market-display/market-display-config.schema"

export async function loadGlobalMarketDisplayConfigV1(): Promise<MarketDisplayConfigV1> {
  const row = await prisma.systemSettings.findFirst({
    where: {
      isActive: true,
      ownerId: null,
      key: ADMIN_SETTING_KEYS.MARKET_DISPLAY_CONFIG_V1,
    },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  })
  return parseMarketDisplayConfigJson(row?.value ?? null)
}
