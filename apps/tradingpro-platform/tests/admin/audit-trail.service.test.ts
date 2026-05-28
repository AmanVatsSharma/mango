/**
 * @file audit-trail.service.test.ts
 * @module admin-console
 * @description Unit tests for audit trail status mapping and metadata parsing helpers.
 * @author StockTrade
 * @created 2026-03-20
 */

import { AuthEventSeverity, AuthEventType, LogLevel } from "@prisma/client"
import {
  AUTH_EVENT_TYPES,
  AuditTrailService,
  authEventTypesForStatusFilter,
  deriveAuthRowStatus,
  parseAuthMetadataString,
  tradingLevelToRiskSeverity,
} from "@/lib/services/admin/audit-trail.service"

describe("audit-trail helpers", () => {
  it("deriveAuthRowStatus: success and verified patterns", () => {
    expect(deriveAuthRowStatus(AuthEventType.LOGIN_SUCCESS)).toBe("SUCCESS")
    expect(deriveAuthRowStatus(AuthEventType.OTP_VERIFIED)).toBe("SUCCESS")
    expect(deriveAuthRowStatus(AuthEventType.PHONE_VERIFIED)).toBe("SUCCESS")
  })

  it("deriveAuthRowStatus: failed and rejected patterns", () => {
    expect(deriveAuthRowStatus(AuthEventType.LOGIN_FAILED)).toBe("FAILED")
    expect(deriveAuthRowStatus(AuthEventType.KYC_REJECTED)).toBe("FAILED")
  })

  it("deriveAuthRowStatus: pending / attempts", () => {
    expect(deriveAuthRowStatus(AuthEventType.LOGIN_ATTEMPT)).toBe("PENDING")
    expect(deriveAuthRowStatus(AuthEventType.OTP_SENT)).toBe("PENDING")
  })

  it("authEventTypesForStatusFilter returns undefined for all", () => {
    expect(authEventTypesForStatusFilter("all")).toBeUndefined()
    expect(authEventTypesForStatusFilter("")).toBeUndefined()
  })

  it("authEventTypesForStatusFilter buckets partition all enum values", () => {
    const success = new Set(authEventTypesForStatusFilter("SUCCESS") ?? [])
    const failed = new Set(authEventTypesForStatusFilter("FAILED") ?? [])
    const pending = new Set(authEventTypesForStatusFilter("PENDING") ?? [])
    for (const t of AUTH_EVENT_TYPES) {
      const b = deriveAuthRowStatus(t)
      if (b === "SUCCESS") expect(success.has(t)).toBe(true)
      else if (b === "FAILED") expect(failed.has(t)).toBe(true)
      else expect(pending.has(t)).toBe(true)
    }
    expect(success.size + failed.size + pending.size).toBe(AUTH_EVENT_TYPES.length)
  })

  it("parseAuthMetadataString extracts ip and userAgent", () => {
    const meta = JSON.stringify({ ipAddress: "1.2.3.4", userAgent: "curl/8" })
    const p = parseAuthMetadataString(meta)
    expect(p.ipAddress).toBe("1.2.3.4")
    expect(p.userAgent).toBe("curl/8")
    expect(p.raw).toEqual({ ipAddress: "1.2.3.4", userAgent: "curl/8" })
  })

  it("parseAuthMetadataString handles invalid JSON safely", () => {
    const p = parseAuthMetadataString("{not json")
    expect(p.ipAddress).toBe("—")
    expect(p.userAgent).toBe("—")
    expect(p.raw).toBeNull()
  })

  it("tradingLevelToRiskSeverity maps levels", () => {
    expect(tradingLevelToRiskSeverity(LogLevel.ERROR)).toBe(AuthEventSeverity.HIGH)
    expect(tradingLevelToRiskSeverity(LogLevel.WARN)).toBe(AuthEventSeverity.MEDIUM)
    expect(tradingLevelToRiskSeverity(LogLevel.INFO)).toBe(AuthEventSeverity.LOW)
  })
})

jest.mock("@/lib/prisma", () => {
  const authFindMany = jest.fn()
  const authCount = jest.fn()
  const tlFindMany = jest.fn()
  const tlCount = jest.fn()
  return {
    prisma: {
      authEvent: { findMany: authFindMany, count: authCount },
      tradingLog: { findMany: tlFindMany, count: tlCount },
    },
  }
})

const { prisma } = jest.requireMock("@/lib/prisma") as {
  prisma: {
    authEvent: { findMany: jest.Mock; count: jest.Mock }
    tradingLog: { findMany: jest.Mock; count: jest.Mock }
  }
}

describe("AuditTrailService.listAuth", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.authEvent.findMany.mockResolvedValue([])
    prisma.authEvent.count.mockResolvedValue(0)
  })

  it("returns empty when action enum is invalid", async () => {
    const r = await AuditTrailService.listAuth({
      page: 1,
      limit: 10,
      action: "NOT_A_REAL_EVENT",
    })
    expect(r.logs).toEqual([])
    expect(r.total).toBe(0)
    expect(prisma.authEvent.findMany).not.toHaveBeenCalled()
  })
})
