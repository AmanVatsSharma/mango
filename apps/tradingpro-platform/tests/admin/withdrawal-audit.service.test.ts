/**
 * @file tests/admin/withdrawal-audit.service.test.ts
 * @module admin-console
 * @description Validate WithdrawalAuditService filtering and mapping (amount + charges).
 * @author StockTrade
 * @created 2026-03-20
 */

import { LogCategory } from "@prisma/client"
import { WithdrawalAuditService } from "@/lib/services/admin/WithdrawalAuditService"

jest.mock("@/lib/prisma", () => {
  const findManyMock = jest.fn()
  const countMock = jest.fn()
  const withdrawalFindManyMock = jest.fn()

  return {
    prisma: {
      tradingLog: {
        findMany: findManyMock,
        count: countMock,
      },
      withdrawal: {
        findMany: withdrawalFindManyMock,
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
    withdrawal: {
      findMany: jest.Mock
    }
  }
}

describe("WithdrawalAuditService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns an empty result set when there are no audit entries", async () => {
    prisma.tradingLog.findMany.mockResolvedValue([])
    prisma.tradingLog.count.mockResolvedValue(0)

    const result = await WithdrawalAuditService.list()

    expect(prisma.tradingLog.findMany).toHaveBeenCalledWith({
      where: {
        category: LogCategory.FUNDS,
        action: {
          in: ["ADMIN_APPROVE_WITHDRAWAL_COMPLETED", "ADMIN_REJECT_WITHDRAWAL_COMPLETED"],
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

  it("maps audit entries with related withdrawal (amount + charges) and bank reference", async () => {
    const createdAt = new Date("2024-11-12T10:45:00Z")

    prisma.tradingLog.findMany.mockResolvedValue([
      {
        id: "log-w1",
        action: "ADMIN_APPROVE_WITHDRAWAL_COMPLETED",
        category: LogCategory.FUNDS,
        createdAt,
        details: {
          withdrawalId: "wd-1",
          adminId: "admin-42",
          adminName: "Shakti",
          actorRole: "SUPER_ADMIN",
          transactionId: "UTR123456",
        },
        message: "Admin approved withdrawal wd-1",
      },
    ])
    prisma.tradingLog.count.mockResolvedValue(1)
    prisma.withdrawal.findMany.mockResolvedValue([
      {
        id: "wd-1",
        userId: "user-1",
        amount: 40000,
        charges: 50,
        remarks: "Approved by Shakti",
        user: {
          id: "user-1",
          name: "Raghav",
          email: "raghav@example.com",
          clientId: "CLI-101",
        },
      },
    ])

    const result = await WithdrawalAuditService.list({
      status: "APPROVED",
      adminId: "admin-42",
      search: "wd-1",
    })

    expect(prisma.tradingLog.findMany).toHaveBeenCalledWith({
      where: {
        category: LogCategory.FUNDS,
        action: {
          in: ["ADMIN_APPROVE_WITHDRAWAL_COMPLETED"],
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
                  path: ["withdrawalId"],
                  string_contains: "wd-1",
                  mode: "insensitive",
                },
              },
              {
                message: {
                  contains: "wd-1",
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
      id: "log-w1",
      withdrawalId: "wd-1",
      status: "APPROVED",
      adminId: "admin-42",
      adminName: "Shakti",
      adminRole: "SUPER_ADMIN",
      amount: 40050,
      bankReference: "UTR123456",
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
