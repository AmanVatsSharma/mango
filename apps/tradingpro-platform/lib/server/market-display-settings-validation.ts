/**
 * @file market-display-settings-validation.ts
 * @module server
 * @description Server-side validation for `market_display_config_v1` SystemSettings payloads.
 * @author StockTrade
 * @created 2026-03-24
 */

import { marketDisplayConfigV1Schema } from "@/lib/market-display/market-display-config.schema"
import { AppError } from "@/src/common/errors"

export function assertValidMarketDisplayConfigSettingValue(value: unknown): void {
  let parsed: unknown
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value
  } catch {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "market_display_config_v1 must be valid JSON",
      statusCode: 400,
    })
  }

  const result = marketDisplayConfigV1Schema.safeParse(parsed)
  if (!result.success) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid market_display_config_v1 schema",
      statusCode: 400,
    })
  }
}
