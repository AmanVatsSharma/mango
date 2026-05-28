/**
 * @file tests/api/active-user-count-policy.test.ts
 * @module tests-api
 * @description Regression coverage for active-user eligibility policy where-clause shaping.
 * @author StockTrade
 * @created 2026-02-17
 */

import type { Prisma } from "@prisma/client"
import {
  activeHeadcountBaseWhere,
  applyActiveUserCountPolicy,
} from "@/lib/server/active-user-count-policy"

describe("active-user-count-policy", () => {
  it("returns original where when policy is disabled", () => {
    const baseWhere: Prisma.UserWhereInput = { isActive: true }
    const result = applyActiveUserCountPolicy(baseWhere, {
      enabled: false,
      lowBalanceThreshold: 1000,
      inactivityDays: 30,
      inactivityCutoff: new Date("2026-02-01T00:00:00.000Z"),
    })

    expect(result).toBe(baseWhere)
  })

  it("adds low-balance + inactivity exclusion clause when policy is enabled", () => {
    const baseWhere: Prisma.UserWhereInput = { isActive: true }
    const inactivityCutoff = new Date("2026-02-01T00:00:00.000Z")

    const result = applyActiveUserCountPolicy(baseWhere, {
      enabled: true,
      lowBalanceThreshold: 2500,
      inactivityDays: 15,
      inactivityCutoff,
    }) as any

    expect(Array.isArray(result.AND)).toBe(true)
    expect(result.AND[0]).toEqual(baseWhere)

    const exclusionClause = result.AND[1]
    expect(exclusionClause.NOT.AND[0]).toEqual({
      OR: [
        { tradingAccount: { is: null } },
        {
          tradingAccount: {
            is: {
              balance: { lt: 2500 },
            },
          },
        },
      ],
    })
    expect(exclusionClause.NOT.AND[1].OR[0]).toEqual({ tradingAccount: { is: null } })
    expect(exclusionClause.NOT.AND[1].OR[1].tradingAccount.is.orders.none.status).toBe("EXECUTED")
    expect(exclusionClause.NOT.AND[1].OR[1].tradingAccount.is.orders.none.createdAt.gte).toEqual(inactivityCutoff)
  })

  it("activeHeadcountBaseWhere requires isActive and no suspension", () => {
    const w = activeHeadcountBaseWhere()
    expect(w).toEqual({ isActive: true, suspendedAt: null })
    const merged = activeHeadcountBaseWhere({ role: "USER" })
    expect((merged as { AND: unknown[] }).AND).toHaveLength(2)
  })
})
