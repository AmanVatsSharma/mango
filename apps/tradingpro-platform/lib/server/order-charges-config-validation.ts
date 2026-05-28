/**
 * @file order-charges-config-validation.ts
 * @module server
 * @description Server-side validation for `order_charges_config_v1` SystemSettings payloads.
 * @author StockTrade
 * @created 2026-03-27
 */

import { parseOrderChargesConfigJson } from "@/lib/order-charges/parse"
import { AppError } from "@/src/common/errors"

export function assertValidOrderChargesConfigSettingValue(value: unknown): void {
  const parsed = parseOrderChargesConfigJson(value)
  if (!parsed.ok) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: parsed.error,
      statusCode: 400,
    })
  }
}
