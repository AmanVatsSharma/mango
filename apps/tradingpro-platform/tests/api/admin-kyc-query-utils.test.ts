/**
 * @file tests/api/admin-kyc-query-utils.test.ts
 * @module tests-api
 * @description Unit tests for admin KYC query/date normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminKycLifecycleParam,
  normalizeAdminKycLimitParam,
  normalizeAdminKycOptionalDateField,
  normalizeAdminKycPageParam,
  normalizeAdminKycQueryDate,
} from "@/lib/server/admin-kyc-query-utils"

describe("admin-kyc-query-utils", () => {
  it("normalizes lifecycle filter param", () => {
    expect(normalizeAdminKycLifecycleParam(null)).toBe("ALL")
    expect(normalizeAdminKycLifecycleParam("lead")).toBe("LEAD")
    expect(normalizeAdminKycLifecycleParam("TRADING")).toBe("TRADING")
    expect(normalizeAdminKycLifecycleParam("bogus-segment")).toBe("ALL")
    expect(normalizeAdminKycLifecycleParam("APPROVED_NOT_TRADING")).toBe("APPROVED_NOT_TRADING")
    expect(normalizeAdminKycLifecycleParam("nope")).toBe("ALL")
  })

  it("normalizes page and limit query params with fallback and clamping", () => {
    expect(normalizeAdminKycPageParam("2")).toBe(2)
    expect(normalizeAdminKycPageParam("0")).toBe(1)
    expect(normalizeAdminKycPageParam("bad")).toBe(1)
    expect(normalizeAdminKycLimitParam("50")).toBe(50)
    expect(normalizeAdminKycLimitParam("500")).toBe(200)
    expect(normalizeAdminKycLimitParam("0")).toBe(1)
    expect(normalizeAdminKycLimitParam("bad")).toBe(20)
  })

  it("normalizes query dates and optional date fields safely", () => {
    expect(normalizeAdminKycQueryDate("2026-02-16")).toBeInstanceOf(Date)
    expect(normalizeAdminKycQueryDate("bad-date")).toBeNull()
    expect(normalizeAdminKycOptionalDateField(undefined)).toEqual({
      provided: false,
      valid: true,
      value: null,
    })
    expect(normalizeAdminKycOptionalDateField(null)).toEqual({
      provided: true,
      valid: true,
      value: null,
    })
    const validDateField = normalizeAdminKycOptionalDateField("2026-02-16T10:00:00.000Z")
    expect(validDateField.provided).toBe(true)
    expect(validDateField.valid).toBe(true)
    expect(validDateField.value).toBeInstanceOf(Date)
    expect(normalizeAdminKycOptionalDateField("bad-date")).toEqual({
      provided: true,
      valid: false,
      value: null,
    })
  })
})
