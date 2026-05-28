/**
 * File:        tests/api/admin-users-risk-limit-route.test.ts
 * Module:      Tests · API · Admin User Risk Limit
 * Purpose:     Tests for PUT /api/admin/users/[userId]/risk-limit — verifies threshold
 *              override fields are persisted and NULLed correctly.
 *
 * Exports:
 *   - none (test file)
 *
 * Depends on:
 *   - @/lib/prisma      — mocked
 *   - @/lib/rbac/admin-api — mocked
 *
 * Side-effects:
 *   - none (Jest mocks all I/O)
 *
 * Key invariants:
 *   - Threshold fields present in body are passed to upsert
 *   - Threshold fields absent from body are stored as null (clears override)
 *
 * Read order:
 *   1. describe("PUT /api/admin/users/[userId]/risk-limit") — upsert shape tests
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

const mockUpsert = jest.fn()
const mockUserFindUnique = jest.fn()
const mockRiskConfigFindMany = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    riskLimit: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    riskConfig: {
      findMany: (...args: unknown[]) => mockRiskConfigFindMany(...args),
    },
  },
}))

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: jest.fn(async (_req: unknown, _opts: unknown, handler: (ctx: unknown) => unknown) => {
    return handler({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn() } })
  }),
}))

import { PUT } from "@/app/api/admin/users/[userId]/risk-limit/route"

function makePutRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/users/user-1/risk-limit", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const BASE_LIMIT = {
  id: "limit-1",
  userId: "user-1",
  maxDailyLoss: { toNumber: () => 10000 },
  maxPositionSize: { toNumber: () => 50000 },
  maxLeverage: { toNumber: () => 5 },
  maxDailyTrades: 20,
  status: "ACTIVE",
  riskLevelLowPct: null,
  riskLevelMediumPct: null,
  riskLevelHighPct: null,
  autoCloseLevelPct: null,
  maxDailyLossInr: null,
}

describe("PUT /api/admin/users/[userId]/risk-limit", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUserFindUnique.mockResolvedValue({ id: "user-1", name: "Test User", email: "test@test.com" })
    mockRiskConfigFindMany.mockResolvedValue([])
  })

  it("PUT with threshold overrides stores them in the upsert call", async () => {
    mockUpsert.mockResolvedValue({
      ...BASE_LIMIT,
      riskLevelHighPct: 75,
    })

    const req = makePutRequest({
      maxDailyLoss: 10000,
      maxPositionSize: 50000,
      maxLeverage: 5,
      maxDailyTrades: 20,
      riskLevelHighPct: 75,
    })

    const res = await PUT(req, { params: { userId: "user-1" } })
    expect(res.status).toBe(200)

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const upsertCall = mockUpsert.mock.calls[0][0]

    // riskLevelHighPct should be forwarded in both create and update paths
    expect(upsertCall.update.riskLevelHighPct).toBe(75)
    expect(upsertCall.create.riskLevelHighPct).toBe(75)
  })

  it("PUT without threshold fields stores NULLs in the upsert call", async () => {
    mockUpsert.mockResolvedValue(BASE_LIMIT)

    const req = makePutRequest({
      maxDailyLoss: 10000,
      maxPositionSize: 50000,
      maxLeverage: 5,
      maxDailyTrades: 20,
      // no threshold fields
    })

    const res = await PUT(req, { params: { userId: "user-1" } })
    expect(res.status).toBe(200)

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const upsertCall = mockUpsert.mock.calls[0][0]

    expect(upsertCall.update.riskLevelHighPct).toBeNull()
    expect(upsertCall.update.riskLevelLowPct).toBeNull()
    expect(upsertCall.update.riskLevelMediumPct).toBeNull()
    expect(upsertCall.update.autoCloseLevelPct).toBeNull()
    expect(upsertCall.update.maxDailyLossInr).toBeNull()
  })
})
