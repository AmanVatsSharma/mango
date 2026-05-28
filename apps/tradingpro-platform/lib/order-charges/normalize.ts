/**
 * @file normalize.ts
 * @module order-charges
 * @description Normalize segment/product/side strings for charge line matching.
 * @author StockTrade
 * @created 2026-03-27
 * @updated 2026-03-30 — NRML→CNC and MIS_OPT/MIS_FUT→MIS for charge line product filters (F&O parity with risk keys).
 */

export function normalizeOrderChargesSegment(segment: string): string {
  const u = String(segment || "").trim().toUpperCase()
  if (u === "NSE_EQ") return "NSE"
  if (u === "NSE_FO" || u === "FNO") return "NFO"
  return u
}

export function normalizeOrderChargesProduct(product: string): string {
  const u = String(product || "").trim().toUpperCase()
  if (u === "DELIVERY") return "CNC"
  if (u === "INTRADAY") return "MIS"
  if (u === "NRML") return "CNC"
  if (u === "MIS_OPT" || u === "MIS_FUT") return "MIS"
  return u
}

export function normalizeOrderChargesSide(side: string): "BUY" | "SELL" {
  const u = String(side || "").trim().toUpperCase()
  return u === "SELL" ? "SELL" : "BUY"
}

export function parseOrderChargesCsvSet(raw: string | null): Set<string> | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null
  const parts = s
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
  return new Set(parts)
}

export function orderChargeLineMatchesFilter(args: {
  lineSegment: string | null
  lineProduct: string | null
  lineSide: "BUY" | "SELL" | null
  segment: string
  productType: string
  orderSide: string
}): boolean {
  const segNorm = normalizeOrderChargesSegment(args.segment)
  const prodNorm = normalizeOrderChargesProduct(args.productType)
  const sideNorm = normalizeOrderChargesSide(args.orderSide)

  const segSet = parseOrderChargesCsvSet(args.lineSegment)
  if (segSet && segSet.size > 0) {
    const rawUpper = String(args.segment || "")
      .trim()
      .toUpperCase()
    if (!segSet.has(segNorm) && !segSet.has(rawUpper)) {
      return false
    }
  }

  const prodSet = parseOrderChargesCsvSet(args.lineProduct)
  if (prodSet && prodSet.size > 0 && !prodSet.has(prodNorm)) {
    return false
  }

  if (args.lineSide && args.lineSide !== sideNorm) {
    return false
  }

  return true
}
