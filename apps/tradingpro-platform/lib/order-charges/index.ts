/**
 * @file index.ts
 * @module order-charges
 * @description Public exports for order charge types, defaults, parsing, and computation.
 * @author StockTrade
 * @created 2026-03-27
 */

export * from "@/lib/order-charges/types"
export * from "@/lib/order-charges/defaults"
export * from "@/lib/order-charges/normalize"
export * from "@/lib/order-charges/compute"
export * from "@/lib/order-charges/parse"
export * from "@/lib/order-charges/schema"

import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"

/** SystemSettings key for `OrderChargesConfigV1` (see `ADMIN_SETTING_KEYS.ORDER_CHARGES_CONFIG_V1`). */
export const ORDER_CHARGES_CONFIG_V1_KEY = ADMIN_SETTING_KEYS.ORDER_CHARGES_CONFIG_V1
