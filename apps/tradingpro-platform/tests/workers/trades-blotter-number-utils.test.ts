/**
 * @file tests/workers/trades-blotter-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for Trades Blotter numeric + formatting helpers.
 * @author StockTrade
 * @created 2026-04-15
 */

import {
  normalizeTradesBlotterPage,
  normalizeTradesBlotterLimit,
  normalizeTradesBlotterPnL,
  formatTradesBlotterDuration,
  formatTradesBlotterRupees,
  formatTradesBlotterCompactRupees,
  tradesBlotterPnlClass,
  tradesBlotterSideClass,
  tradesBlotterStatusClass,
} from "@/components/admin-console/trades-blotter-number-utils"

describe("trades-blotter-number-utils", () => {
  describe("normalizeTradesBlotterPage", () => {
    it("returns positive integer or 1", () => {
      expect(normalizeTradesBlotterPage("3")).toBe(3)
      expect(normalizeTradesBlotterPage("0")).toBe(1)
      expect(normalizeTradesBlotterPage("-5")).toBe(1)
      expect(normalizeTradesBlotterPage("NaN")).toBe(1)
      expect(normalizeTradesBlotterPage(null)).toBe(1)
      expect(normalizeTradesBlotterPage("2.7")).toBe(2)
    })
  })

  describe("normalizeTradesBlotterLimit", () => {
    it("clamps to max and defaults on invalid", () => {
      expect(normalizeTradesBlotterLimit("50")).toBe(50)
      expect(normalizeTradesBlotterLimit("9999")).toBe(200)
      expect(normalizeTradesBlotterLimit("0")).toBe(50)
      expect(normalizeTradesBlotterLimit("abc")).toBe(50)
      expect(normalizeTradesBlotterLimit("30", 100, 150)).toBe(30)
      expect(normalizeTradesBlotterLimit("500", 100, 150)).toBe(150)
    })
  })

  describe("normalizeTradesBlotterPnL", () => {
    it("passes through numeric, null on invalid", () => {
      expect(normalizeTradesBlotterPnL("123.45")).toBe(123.45)
      expect(normalizeTradesBlotterPnL("-99")).toBe(-99)
      expect(normalizeTradesBlotterPnL("abc")).toBeNull()
    })
  })

  describe("formatTradesBlotterDuration", () => {
    it("formats days/hours/minutes/seconds", () => {
      expect(formatTradesBlotterDuration(0)).toBe("0s")
      expect(formatTradesBlotterDuration(-1000)).toBe("0s")
      expect(formatTradesBlotterDuration(45 * 1000)).toBe("45s")
      expect(formatTradesBlotterDuration(65 * 1000)).toBe("1m 05s")
      expect(formatTradesBlotterDuration(2 * 3600 * 1000 + 14 * 60 * 1000)).toBe("2h 14m")
      expect(formatTradesBlotterDuration((3 * 86400 + 2 * 3600) * 1000)).toBe("3d 02h")
    })
  })

  describe("formatTradesBlotterRupees", () => {
    it("formats with 2 decimals and sign", () => {
      expect(formatTradesBlotterRupees(1234.5)).toContain("₹")
      expect(formatTradesBlotterRupees(1234.5)).toContain("1,234.50")
      expect(formatTradesBlotterRupees(-500)).toBe("-₹500.00")
      expect(formatTradesBlotterRupees("abc")).toBe("₹0.00")
    })
  })

  describe("formatTradesBlotterCompactRupees", () => {
    it("uses Indian k/L/Cr buckets", () => {
      expect(formatTradesBlotterCompactRupees(250)).toBe("₹250.00")
      expect(formatTradesBlotterCompactRupees(12_500)).toBe("₹12.5k")
      expect(formatTradesBlotterCompactRupees(1_23_000)).toBe("₹1.23L")
      expect(formatTradesBlotterCompactRupees(4_56_00_000)).toBe("₹4.56Cr")
      expect(formatTradesBlotterCompactRupees(-1_23_000)).toBe("-₹1.23L")
      expect(formatTradesBlotterCompactRupees("xx")).toBe("₹0.00")
    })
  })

  describe("tradesBlotterPnlClass", () => {
    it("returns emerald for positive, rose for negative, muted for zero/invalid", () => {
      expect(tradesBlotterPnlClass(100)).toContain("emerald")
      expect(tradesBlotterPnlClass(-100)).toContain("rose")
      expect(tradesBlotterPnlClass(0)).toContain("muted")
      expect(tradesBlotterPnlClass("abc")).toContain("muted")
    })
  })

  describe("tradesBlotterSideClass", () => {
    it("returns emerald for LONG, rose for SHORT", () => {
      expect(tradesBlotterSideClass("LONG")).toContain("emerald")
      expect(tradesBlotterSideClass("SHORT")).toContain("rose")
      expect(tradesBlotterSideClass("OTHER")).toContain("muted")
    })
  })

  describe("tradesBlotterStatusClass", () => {
    it("returns distinct classes per status", () => {
      expect(tradesBlotterStatusClass("OPEN")).toContain("sky")
      expect(tradesBlotterStatusClass("CLOSED")).toContain("slate")
      expect(tradesBlotterStatusClass("PARTIAL")).toContain("amber")
      expect(tradesBlotterStatusClass("XXX")).toContain("muted")
    })
  })
})
