/**
 * @file tests/workers/worker-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for shared worker numeric parsing helper.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"

describe("worker-number-utils", () => {
  it("parses finite numeric candidates", () => {
    expect(parseFiniteWorkerNumber(17)).toBe(17)
    expect(parseFiniteWorkerNumber(" 42.5 ")).toBe(42.5)
    expect(parseFiniteWorkerNumber("0")).toBe(0)
  })

  it("returns null for nullish, sentinel, boolean, and non-coercible inputs", () => {
    expect(parseFiniteWorkerNumber(null)).toBeNull()
    expect(parseFiniteWorkerNumber(undefined)).toBeNull()
    expect(parseFiniteWorkerNumber("")).toBeNull()
    expect(parseFiniteWorkerNumber("NaN")).toBeNull()
    expect(parseFiniteWorkerNumber("undefined")).toBeNull()
    expect(parseFiniteWorkerNumber(true)).toBeNull()
    expect(parseFiniteWorkerNumber(Symbol("worker-number"))).toBeNull()
  })
})
