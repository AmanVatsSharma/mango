/**
 * @file prisma-middleware-number-utils.test.ts
 * @module tests-realtime
 * @description Unit tests for Prisma middleware realtime numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizePrismaMiddlewareOptionalNumber,
  normalizePrismaMiddlewareRequiredNumber,
} from "@/lib/server/prisma-middleware-number-utils"

describe("prisma-middleware-number-utils", () => {
  it("normalizes required numeric values with fallback", () => {
    expect(normalizePrismaMiddlewareRequiredNumber("100.5")).toBe(100.5)
    expect(normalizePrismaMiddlewareRequiredNumber(0)).toBe(0)
    expect(normalizePrismaMiddlewareRequiredNumber("bad", 7)).toBe(7)
    expect(normalizePrismaMiddlewareRequiredNumber(undefined, 3)).toBe(3)
  })

  it("normalizes optional numeric values to number or null", () => {
    expect(normalizePrismaMiddlewareOptionalNumber("25")).toBe(25)
    expect(normalizePrismaMiddlewareOptionalNumber("NaN")).toBeNull()
    expect(normalizePrismaMiddlewareOptionalNumber(null)).toBeNull()
  })
})
