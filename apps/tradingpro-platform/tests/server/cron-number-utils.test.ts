/**
 * @file tests/server/cron-number-utils.test.ts
 * @module tests-server
 * @description Unit tests for shared cron query-number parser.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteCronQueryNumber } from "@/lib/server/cron-number-utils"

describe("cron-number-utils", () => {
  it("parses finite numeric query candidates", () => {
    expect(parseFiniteCronQueryNumber("42")).toBe(42)
    expect(parseFiniteCronQueryNumber(" 7.5 ")).toBe(7.5)
    expect(parseFiniteCronQueryNumber("0")).toBe(0)
  })

  it("returns null for nullish, blank, sentinel, and malformed values", () => {
    expect(parseFiniteCronQueryNumber(null)).toBeNull()
    expect(parseFiniteCronQueryNumber(undefined)).toBeNull()
    expect(parseFiniteCronQueryNumber("")).toBeNull()
    expect(parseFiniteCronQueryNumber("NaN")).toBeNull()
    expect(parseFiniteCronQueryNumber("undefined")).toBeNull()
    expect(parseFiniteCronQueryNumber("not-a-number")).toBeNull()
  })
})
