/**
 * @file admin-position-exit-price.test.ts
 * @module tests-server
 * @description Unit tests for admin exit price mode normalization.
 * @author StockTrade
 * @created 2026-03-30
 */

import { normalizeAdminExitPriceMode } from "@/lib/server/admin-position-exit-price"

describe("normalizeAdminExitPriceMode", () => {
  it('defaults to live when no mode and no price', () => {
    expect(normalizeAdminExitPriceMode(undefined, false)).toBe("live")
  })

  it('defaults to manual when no mode but explicit price flag', () => {
    expect(normalizeAdminExitPriceMode(undefined, true)).toBe("manual")
  })

  it('maps ltp alias to stock_ltp', () => {
    expect(normalizeAdminExitPriceMode("ltp", false)).toBe("stock_ltp")
  })

  it('accepts explicit modes', () => {
    expect(normalizeAdminExitPriceMode("live", true)).toBe("live")
    expect(normalizeAdminExitPriceMode("stock_ltp", false)).toBe("stock_ltp")
    expect(normalizeAdminExitPriceMode("manual", true)).toBe("manual")
  })
})
