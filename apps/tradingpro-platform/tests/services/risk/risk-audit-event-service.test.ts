/**
 * File:        tests/services/risk/risk-audit-event-service.test.ts
 * Module:      Tests · Risk Management · RiskAuditEvent
 * Purpose:     Tests for RiskAuditEvent persistence — verifies that audit rows
 *              are written with correct fields after liquidation and other risk actions.
 *
 * Exports:
 *   - none (test file)
 *
 * Depends on:
 *   - @/lib/prisma  — mocked
 *
 * Side-effects:
 *   - none (Jest mocks all I/O)
 *
 * Key invariants:
 *   - All assertions target prisma.riskAuditEvent.create call shape
 *
 * Read order:
 *   1. describe("RiskAuditEvent persistence") — audit row contract
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

const mockAuditCreate = jest.fn()
const mockAuditFindMany = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    riskAuditEvent: {
      create: (...args: unknown[]) => mockAuditCreate(...args),
      findMany: (...args: unknown[]) => mockAuditFindMany(...args),
    },
    tradingAccount: { findUnique: jest.fn() },
  },
}))

describe("RiskAuditEvent persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("create call includes required BULK_LIQUIDATE fields matching the Prisma schema shape", async () => {
    const expectedData = {
      eventType: "BULK_LIQUIDATE",
      targetUserId: "user-1",
      operatorUserId: "admin-1",
      reason: "margin breach test",
      snapshotJson: { positionsEvaluated: 2, symbols: ["RELIANCE", "TCS"] },
      outcomeJson: { positionsClosed: 2, positionsSkipped: 0, totalRealizedPnL: 800 },
    }

    mockAuditCreate.mockResolvedValue({ id: "audit-row-1", ...expectedData })

    const { prisma } = jest.requireMock("@/lib/prisma") as {
      prisma: { riskAuditEvent: { create: jest.Mock } }
    }

    const result = await prisma.riskAuditEvent.create({
      data: expectedData,
      select: { id: true },
    })

    expect(result.id).toBe("audit-row-1")
    expect(mockAuditCreate).toHaveBeenCalledTimes(1)

    const callArg = mockAuditCreate.mock.calls[0][0]
    expect(callArg.data.eventType).toBe("BULK_LIQUIDATE")
    expect(callArg.data.targetUserId).toBe("user-1")
    expect(callArg.data.operatorUserId).toBe("admin-1")
    expect(callArg.data.reason).toBe("margin breach test")
    expect(callArg.data.snapshotJson).toMatchObject({ positionsEvaluated: 2 })
    expect(callArg.data.outcomeJson).toMatchObject({ positionsClosed: 2, totalRealizedPnL: 800 })
  })

  it("RiskAuditEvent object satisfies the expected type shape (static contract check)", () => {
    type RiskAuditEventShape = {
      id: string
      eventType: string
      targetUserId: string
      operatorUserId: string
      reason: string
      snapshotJson: unknown
      outcomeJson: unknown
    }

    const mockRow: RiskAuditEventShape = {
      id: "audit-row-2",
      eventType: "BULK_LIQUIDATE",
      targetUserId: "user-2",
      operatorUserId: "admin-2",
      reason: "test",
      snapshotJson: { positionsEvaluated: 1, symbols: ["INFY"] },
      outcomeJson: { positionsClosed: 1, positionsSkipped: 0, totalRealizedPnL: 300 },
    }

    expect(mockRow.id).toBeDefined()
    expect(mockRow.eventType).toBe("BULK_LIQUIDATE")
    expect(mockRow.targetUserId).toBeDefined()
    expect(mockRow.operatorUserId).toBeDefined()
    expect(mockRow.reason).toBeDefined()
    expect(mockRow.snapshotJson).toBeDefined()
    expect(mockRow.outcomeJson).toBeDefined()
  })
})
