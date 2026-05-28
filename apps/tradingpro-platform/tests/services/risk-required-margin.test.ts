/**
 * @file risk-required-margin.test.ts
 * @module tests-services-risk
 * @description Unit tests for base margin and short-option min per-lot floor helpers.
 * @author StockTrade
 * @created 2026-04-08
 */

import {
  applyShortOptionMinMarginPerLotFloor,
  computeBaseRequiredMarginFromTurnover,
} from "@/lib/services/risk/risk-required-margin"

describe("computeBaseRequiredMarginFromTurnover", () => {
  it("uses margin fraction when set", () => {
    expect(computeBaseRequiredMarginFromTurnover(10_000, 10, 0.1)).toBe(1000)
  })

  it("uses leverage divisor when fraction is null", () => {
    expect(computeBaseRequiredMarginFromTurnover(10_000, 25, null)).toBe(400)
  })
})

describe("applyShortOptionMinMarginPerLotFloor", () => {
  it("ignores floor for BUY margin side", () => {
    expect(
      applyShortOptionMinMarginPerLotFloor({
        baseRequiredMargin: 1,
        optionType: "CE",
        marginRiskSide: "BUY",
        quantity: 50,
        lotSize: 50,
        minMarginPerLot: 5000,
      }),
    ).toBe(1)
  })

  it("ignores floor for non-option instruments", () => {
    expect(
      applyShortOptionMinMarginPerLotFloor({
        baseRequiredMargin: 1,
        optionType: null,
        marginRiskSide: "SELL",
        quantity: 50,
        lotSize: 50,
        minMarginPerLot: 5000,
      }),
    ).toBe(1)
  })

  it("ignores floor when minMarginPerLot is null or non-positive", () => {
    expect(
      applyShortOptionMinMarginPerLotFloor({
        baseRequiredMargin: 1,
        optionType: "PE",
        marginRiskSide: "SELL",
        quantity: 50,
        lotSize: 50,
        minMarginPerLot: null,
      }),
    ).toBe(1)
  })

  it("raises margin for short CE when base is below lots × min per lot", () => {
    expect(
      applyShortOptionMinMarginPerLotFloor({
        baseRequiredMargin: 0,
        optionType: "CE",
        marginRiskSide: "SELL",
        quantity: 100,
        lotSize: 50,
        minMarginPerLot: 3000,
      }),
    ).toBe(6000)
  })

  it("does not reduce margin below base", () => {
    expect(
      applyShortOptionMinMarginPerLotFloor({
        baseRequiredMargin: 50_000,
        optionType: "CE",
        marginRiskSide: "SELL",
        quantity: 50,
        lotSize: 50,
        minMarginPerLot: 1000,
      }),
    ).toBe(50_000)
  })
})
