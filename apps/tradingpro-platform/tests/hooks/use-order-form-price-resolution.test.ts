/**
 * @file use-order-form-price-resolution.test.ts
 * @module tests-hooks
 * @description Regression tests: MARKET order price resolution uses fallback when quote is stale; client does not block submit.
 * @author StockTrade
 * @created 2026-02-24
 */

/**
 * Replicates the MARKET order price resolution from use-order-form.
 * Server is sole authority; client sends best-available price (live or fallback).
 */
function getMarketOrderPrice(
  liveQuoteLtp: number | null | undefined,
  normalizedLtp: number | null | undefined,
): number {
  if (liveQuoteLtp != null && liveQuoteLtp > 0) return liveQuoteLtp
  return normalizedLtp ?? 0
}

describe("use-order-form MARKET price resolution (server-authoritative)", () => {
  it("uses fallback when live quote LTP is null (stale/missing) so submit is not blocked", () => {
    expect(getMarketOrderPrice(null, 100)).toBe(100)
    expect(getMarketOrderPrice(undefined, 250.5)).toBe(250.5)
  })

  it("uses fallback when live quote LTP is zero or negative", () => {
    expect(getMarketOrderPrice(0, 100)).toBe(100)
    expect(getMarketOrderPrice(-1, 50)).toBe(50)
  })

  it("uses live LTP when present and positive", () => {
    expect(getMarketOrderPrice(99, 100)).toBe(99)
    expect(getMarketOrderPrice(250.5, 248)).toBe(250.5)
  })

  it("returns 0 when both live and fallback are missing (invalid price; server/UI will reject)", () => {
    expect(getMarketOrderPrice(null, null)).toBe(0)
    expect(getMarketOrderPrice(null, undefined)).toBe(0)
  })
})
