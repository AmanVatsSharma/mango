/**
 * @file get-order-charges-config.ts
 * @module server
 * @description Load `order_charges_config_v1` from SystemSettings with a short process-local cache.
 * @author StockTrade
 * @created 2026-03-27
 */

import { prisma } from "@/lib/prisma"
import { DEFAULT_ORDER_CHARGES_CONFIG_V1 } from "@/lib/order-charges/defaults"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import { parseOrderChargesConfigJson } from "@/lib/order-charges/parse"
import type { OrderChargesConfigV1 } from "@/lib/order-charges/types"

const TTL_MS = 15_000

let cached: { config: OrderChargesConfigV1; at: number } | null = null

export function invalidateOrderChargesConfigCache(): void {
  cached = null
}

export async function getOrderChargesConfig(): Promise<OrderChargesConfigV1> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) {
    return cached.config
  }

  const row = await prisma.systemSettings.findFirst({
    where: { key: ADMIN_SETTING_KEYS.ORDER_CHARGES_CONFIG_V1, ownerId: null, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  })

  const parsed = parseOrderChargesConfigJson(row?.value ?? null)
  const config = parsed.ok ? parsed.config : DEFAULT_ORDER_CHARGES_CONFIG_V1
  cached = { config, at: now }
  return config
}
