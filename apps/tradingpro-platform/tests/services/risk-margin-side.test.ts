/**
 * @file risk-margin-side.test.ts
 * @module tests-services
 * @description Unit tests for margin risk side helpers (option long vs short exposure).
 * @author StockTrade
 * @created 2026-04-08
 */

import {
  marginRiskSideForOffsetRelease,
  marginRiskSideForPlacementOrder,
  marginRiskSideForPositionCloseOpening,
  marginRiskSideForSignedPositionQty,
  normalizeMarginRiskSide,
} from "@/lib/services/risk/risk-margin-side"

describe("normalizeMarginRiskSide", () => {
  it("maps to BUY or SELL", () => {
    expect(normalizeMarginRiskSide("sell")).toBe("SELL")
    expect(normalizeMarginRiskSide("BUY")).toBe("BUY")
    expect(normalizeMarginRiskSide("")).toBe("BUY")
  })
})

describe("marginRiskSideForPlacementOrder", () => {
  it("follows order side", () => {
    expect(marginRiskSideForPlacementOrder("SELL")).toBe("SELL")
    expect(marginRiskSideForPlacementOrder("buy")).toBe("BUY")
  })
})

describe("marginRiskSideForOffsetRelease", () => {
  it("inverts executing side", () => {
    expect(marginRiskSideForOffsetRelease("SELL")).toBe("BUY")
    expect(marginRiskSideForOffsetRelease("BUY")).toBe("SELL")
  })
})

describe("marginRiskSideForSignedPositionQty", () => {
  it("maps long to BUY and short to SELL", () => {
    expect(marginRiskSideForSignedPositionQty(50)).toBe("BUY")
    expect(marginRiskSideForSignedPositionQty(-50)).toBe("SELL")
  })
})

describe("marginRiskSideForPositionCloseOpening", () => {
  it("matches signed open quantity", () => {
    expect(marginRiskSideForPositionCloseOpening(10)).toBe("BUY")
    expect(marginRiskSideForPositionCloseOpening(-10)).toBe("SELL")
  })
})
