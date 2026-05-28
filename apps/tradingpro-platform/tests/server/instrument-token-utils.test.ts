/**
 * @file tests/server/instrument-token-utils.test.ts
 * @module tests-server
 * @description Unit tests for shared best-effort instrument token parsing.
 * @author StockTrade
 * @created 2026-02-16
 */

import { resolveInstrumentTokenBestEffort } from "@/lib/server/instrument-token-utils"

describe("instrument-token-utils", () => {
  it("resolves standard instrument id token values", () => {
    expect(resolveInstrumentTokenBestEffort("NSE_EQ-26000")).toBe(26000)
    expect(resolveInstrumentTokenBestEffort("NFO-RELIANCE-12345")).toBe(12345)
  })

  it("falls back to last strict positive-integer segment", () => {
    expect(resolveInstrumentTokenBestEffort("  NSE_EQ--NaN--7500  ")).toBe(7500)
  })

  it("returns null for blank, non-positive, and malformed token candidates", () => {
    expect(resolveInstrumentTokenBestEffort(null)).toBeNull()
    expect(resolveInstrumentTokenBestEffort(undefined)).toBeNull()
    expect(resolveInstrumentTokenBestEffort("   ")).toBeNull()
    expect(resolveInstrumentTokenBestEffort("NSE_EQ-NaN")).toBeNull()
    expect(resolveInstrumentTokenBestEffort("NSE_EQ-123.9")).toBeNull()
    expect(resolveInstrumentTokenBestEffort("NSE_EQ-1e3")).toBeNull()
    expect(resolveInstrumentTokenBestEffort("NSE_EQ-0")).toBeNull()
  })
})
