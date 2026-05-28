/**
 * @file parse.ts
 * @module order-charges
 * @description Parse and validate order charges JSON into `OrderChargesConfigV1`.
 * @author StockTrade
 * @created 2026-03-27
 */

import { DEFAULT_ORDER_CHARGES_CONFIG_V1 } from "@/lib/order-charges/defaults"
import { orderChargesConfigV1Schema } from "@/lib/order-charges/schema"
import type { OrderChargesConfigV1 } from "@/lib/order-charges/types"

export type ParseOrderChargesResult =
  | { ok: true; config: OrderChargesConfigV1 }
  | { ok: false; error: string }

/**
 * Parses JSON string or object; returns default on empty input (for first boot).
 */
export function parseOrderChargesConfigJson(raw: unknown): ParseOrderChargesResult {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, config: DEFAULT_ORDER_CHARGES_CONFIG_V1 }
  }

  let parsed: unknown
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw
  } catch {
    return { ok: false, error: "order_charges_config_v1 must be valid JSON" }
  }

  const result = orderChargesConfigV1Schema.safeParse(parsed)
  if (!result.success) {
    return { ok: false, error: "Invalid order_charges_config_v1 schema" }
  }

  for (const line of result.data.lines) {
    if (String(line.code).toLowerCase() === "gst") {
      return { ok: false, error: "Charge line code \"gst\" is reserved; GST is computed from gstRate and gstBaseCodes" }
    }
    if (line.source === "custom" && (!line.label || !line.label.trim())) {
      return { ok: false, error: "Custom charge lines require a non-empty label" }
    }
    if (line.mode === "turnover_rate" && line.value < 0) {
      return { ok: false, error: "turnover_rate values must be non-negative" }
    }
    if (line.mode === "flat_per_order" && line.value < 0) {
      return { ok: false, error: "flat_per_order values must be non-negative" }
    }
  }

  return { ok: true, config: result.data as OrderChargesConfigV1 }
}
