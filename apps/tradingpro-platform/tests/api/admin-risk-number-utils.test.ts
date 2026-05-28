/**
 * @file tests/api/admin-risk-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for admin risk config/limits numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminRiskOptionalBoolean,
  normalizeAdminRiskOptionalNullableNonNegativeInteger,
  normalizeAdminRiskOptionalNullableNonNegativeNumber,
  normalizeAdminRiskOutputNullableNumber,
  normalizeAdminRiskOutputNumber,
  normalizeAdminRiskRequiredNonNegativeInteger,
  normalizeAdminRiskRequiredNonNegativeNumber,
  normalizeAdminRiskRequiredPositiveNumber,
} from "@/lib/server/admin-risk-number-utils"

describe("admin-risk-number-utils", () => {
  it("normalizes required risk numeric fields", () => {
    expect(normalizeAdminRiskRequiredPositiveNumber("5")).toBe(5)
    expect(normalizeAdminRiskRequiredPositiveNumber("0")).toBeNull()
    expect(normalizeAdminRiskRequiredNonNegativeNumber("0")).toBe(0)
    expect(normalizeAdminRiskRequiredNonNegativeNumber("-1")).toBeNull()
    expect(normalizeAdminRiskRequiredNonNegativeInteger("10")).toBe(10)
    expect(normalizeAdminRiskRequiredNonNegativeInteger("10.5")).toBeNull()
  })

  it("normalizes optional nullable risk fields", () => {
    expect(normalizeAdminRiskOptionalNullableNonNegativeNumber(undefined)).toEqual({
      provided: false,
      valid: true,
      value: null,
    })
    expect(normalizeAdminRiskOptionalNullableNonNegativeNumber(null)).toEqual({
      provided: true,
      valid: true,
      value: null,
    })
    expect(normalizeAdminRiskOptionalNullableNonNegativeNumber("1.25")).toEqual({
      provided: true,
      valid: true,
      value: 1.25,
    })
    expect(normalizeAdminRiskOptionalNullableNonNegativeInteger("8")).toEqual({
      provided: true,
      valid: true,
      value: 8,
    })
    expect(normalizeAdminRiskOptionalNullableNonNegativeInteger("bad")).toEqual({
      provided: true,
      valid: false,
      value: null,
    })
  })

  it("normalizes optional booleans and output numeric serialization", () => {
    expect(normalizeAdminRiskOptionalBoolean(undefined)).toEqual({
      provided: false,
      valid: true,
      value: null,
    })
    expect(normalizeAdminRiskOptionalBoolean(true)).toEqual({
      provided: true,
      valid: true,
      value: true,
    })
    expect(normalizeAdminRiskOptionalBoolean("true")).toEqual({
      provided: true,
      valid: false,
      value: null,
    })
    expect(normalizeAdminRiskOutputNumber("100.5")).toBe(100.5)
    expect(normalizeAdminRiskOutputNumber("bad", 7)).toBe(7)
    expect(normalizeAdminRiskOutputNullableNumber("5")).toBe(5)
    expect(normalizeAdminRiskOutputNullableNumber("bad")).toBeNull()
  })
})
