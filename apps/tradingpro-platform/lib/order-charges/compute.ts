/**
 * @file compute.ts
 * @module order-charges
 * @description Pure non-brokerage charge computation from `OrderChargesConfigV1`.
 * @author StockTrade
 * @created 2026-03-27
 */

import { DEFAULT_ORDER_CHARGES_CONFIG_V1 } from "@/lib/order-charges/defaults"
import type {
  NonBrokerageChargesResult,
  OrderChargesComputeContext,
  OrderChargesConfigV1,
  OrderChargeLineV1,
} from "@/lib/order-charges/types"
import { orderChargeLineMatchesFilter } from "@/lib/order-charges/normalize"

function finiteNumber(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0
  return n
}

function computeLineAmount(line: OrderChargeLineV1, turnover: number): number {
  const t = Math.max(0, finiteNumber(turnover))
  const v = finiteNumber(line.value)
  if (line.mode === "flat_per_order") {
    return Math.max(0, v)
  }
  return Math.max(0, t * v)
}

/**
 * Computes statutory and custom charges (excludes brokerage). GST uses `config.gstRate`
 * and `config.gstBaseCodes`; include the synthetic code `brokerage` in base codes when
 * brokerage should be part of the GST base.
 */
export function computeNonBrokerageCharges(
  ctx: OrderChargesComputeContext,
  config: OrderChargesConfigV1 = DEFAULT_ORDER_CHARGES_CONFIG_V1,
): NonBrokerageChargesResult {
  const turnover = Math.max(0, finiteNumber(ctx.turnover))
  const brokerage = Math.max(0, finiteNumber(ctx.brokerage))
  const gstRate = Math.max(0, finiteNumber(config.gstRate))

  const matches = (line: OrderChargeLineV1) =>
    orderChargeLineMatchesFilter({
      lineSegment: line.segment,
      lineProduct: line.product,
      lineSide: line.side,
      segment: ctx.segment,
      productType: ctx.productType,
      orderSide: ctx.orderSide,
    })

  const byCode: Record<string, number> = {}
  const lineItems: NonBrokerageChargesResult["lineItems"] = []

  for (const line of config.lines) {
    if (!line.enabled || line.code !== "stt") continue
    if (!matches(line)) continue
    const amount = computeLineAmount(line, turnover)
    byCode.stt = (byCode.stt ?? 0) + amount
    lineItems.push({
      id: line.id,
      code: line.code,
      label: line.label,
      amount,
    })
    break
  }

  for (const line of config.lines) {
    if (!line.enabled || line.code === "stt") continue
    if (!matches(line)) continue
    const amount = computeLineAmount(line, turnover)
    const c = line.code || "custom"
    byCode[c] = (byCode[c] ?? 0) + amount
    lineItems.push({
      id: line.id,
      code: line.code,
      label: line.label,
      amount,
    })
  }

  const stt = finiteNumber(byCode.stt)
  const exchangeTransaction = finiteNumber(byCode.exchange_transaction)
  const stampDuty = finiteNumber(byCode.stamp_duty)

  let gstBase = 0
  const baseCodes = Array.isArray(config.gstBaseCodes) ? config.gstBaseCodes : []
  for (const code of baseCodes) {
    const key = String(code || "").trim()
    if (!key) continue
    if (key === "brokerage") {
      gstBase += brokerage
    } else {
      gstBase += finiteNumber(byCode[key])
    }
  }
  const gst = Math.max(0, gstBase * gstRate)

  if (gst > 0) {
    lineItems.push({
      id: "computed-gst",
      code: "gst",
      label: "GST",
      amount: gst,
    })
  }

  let other = 0
  for (const [k, v] of Object.entries(byCode)) {
    if (k === "stt" || k === "exchange_transaction" || k === "stamp_duty") continue
    other += finiteNumber(v)
  }

  const total = Math.max(0, stt + exchangeTransaction + stampDuty + other + gst)

  byCode.gst = (byCode.gst ?? 0) + gst

  return {
    byCode,
    lineItems,
    stt,
    exchangeTransaction,
    stampDuty,
    gst,
    other,
    total,
  }
}
