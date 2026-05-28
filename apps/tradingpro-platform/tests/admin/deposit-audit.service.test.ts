/**
 * File: tests/admin/deposit-audit.service.test.ts
 * Module: admin-console
 * Purpose: Validate DepositAuditService filtering and mapping behaviour
 * Author: Cursor / GPT-5 Codex
 * Last-updated: 2025-11-12
 * Notes:
 * - Mocks Prisma client to simulate audit log retrieval
 * - Ensures filters and record shaping operate as intended
 */

import { LogCategory } from "@prisma/client"
import { DepositAuditService } from "@/lib/services/admin/DepositAuditService"

jest.mock("@/lib/prisma", () => {
  const findManyMock = jest.fn()
  const countMock = jest.fn()
  const depositFindManyMock = jest.fn()

  return {
    prisma: {
      tradingLog: {
        findMany: findManyMock,
        count: countMock,
      },
      deposit: {
        findMany: depositFindManyMock,
      },
    },
  }
})

const { prisma } = jest.requireMock("@/lib/prisma") as {
  prisma: {
    tradingLog: {
      findMany: jest.Mock
      count: jest.Mock
    }
    deposit: {
      findMany: jest.Mock
    }
  }
}

describe("DepositAuditService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns an empty result set when there are no audit entries", async () => {
    prisma.tradingLog.findMany.mockResolvedValue([])
    prisma.tradingLog.count.mockResolvedValue(0)

    const result = await DepositAuditService.list()

    expect(prisma.tradingLog.findMany).toHaveBeenCalledWith({
      where: {
        category: LogCategory.FUNDS,
        action: {
          in: ["ADMIN_APPROVE_DEPOSIT_COMPLETED", "ADMIN_REJECT_DEPOSIT_COMPLETED"],
        },
      },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    })
    expect(result).toEqual({
      records: [],
      page: 1,
      pageSize: 20,
      total: 0,
    })
  })

  it("maps audit entries with related deposit information", async () => {
    const createdAt = new Date("2024-11-12T10:45:00Z")

    prisma.tradingLog.findMany.mockResolvedValue([
      {
        id: "log-1",
        action: "ADMIN_APPROVE_DEPOSIT_COMPLETED",
        category: LogCategory.FUNDS,
        createdAt,
        details: {
          depositId: "dep-1",
          adminId: "admin-42",
          adminName: "Shakti",
          actorRole: "SUPER_ADMIN",
        },
        message: "Admin approved deposit dep-1",
      },
    ])
    prisma.tradingLog.count.mockResolvedValue(1)
    prisma.deposit.findMany.mockResolvedValue([
      {
        id: "dep-1",
        userId: "user-1",
        amount: 50000,
        remarks: "Approved by Shakti",
        user: {
          id: "user-1",
          name: "Raghav",
          email: "raghav@example.com",
          clientId: "CLI-101",
        },
      },
    ])

    const result = await DepositAuditService.list({
      status: "APPROVED",
      adminId: "admin-42",
      search: "dep-1",
    })

    expect(prisma.tradingLog.findMany).toHaveBeenCalledWith({
      where: {
        category: LogCategory.FUNDS,
        action: {
          in: ["ADMIN_APPROVE_DEPOSIT_COMPLETED"],
        },
        AND: [
          {
            details: {
              path: ["adminId"],
              equals: "admin-42",
            },
          },
          {
            OR: [
              {
                details: {
                  path: ["depositId"],
                  string_contains: "dep-1",
                  mode: "insensitive",
                },
              },
              {
                message: {
                  contains: "dep-1",
                  mode: "insensitive",
                },
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    })

    expect(result.records).toHaveLength(1)
    const [record] = result.records
    expect(record).toMatchObject({
      id: "log-1",
      depositId: "dep-1",
      status: "APPROVED",
      adminId: "admin-42",
      adminName: "Shakti",
      adminRole: "SUPER_ADMIN",
      amount: 50000,
      remarks: "Approved by Shakti",
    })
    expect(record.user).toEqual({
      id: "user-1",
      name: "Raghav",
      email: "raghav@example.com",
      clientId: "CLI-101",
    })
    expect(result.total).toBe(1)
  })
})
