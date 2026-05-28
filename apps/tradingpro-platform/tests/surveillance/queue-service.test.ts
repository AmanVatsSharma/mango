/**
 * File:        tests/surveillance/queue-service.test.ts
 * Module:      Surveillance · Queue Service — Unit Tests
 * Purpose:     Verify KPI tile count semantics — the most subtle correctness requirement
 *              in queue-service.ts that is not obvious from the code alone:
 *                - `open`          counts OPEN status only (not ASSIGNED, not INVESTIGATING).
 *                - `highSeverity`  counts HIGH+CRITICAL alerts in OPEN *or* ASSIGNED states.
 *                - `unassigned`    counts OPEN with no assignedToId.
 *                - `resolvedToday` counts RESOLVED since start-of-day.
 *              Also tests status-transition helpers (assignAlert, dismissAlert, resolveAlert).
 *
 * Exports:     none (Jest test file)
 *
 * Depends on:
 *   - @/lib/surveillance/queue-service — module under test
 *   - @/lib/prisma                     — mocked
 *
 * Side-effects: none (Prisma fully mocked).
 *
 * Key invariants:
 *   - `highSeverity` DOES include ASSIGNED alerts (operators in-flight on a HIGH/CRITICAL alert
 *     still represent live risk — they should appear in the KPI).
 *   - `highSeverity` does NOT include DISMISSED or RESOLVED HIGH/CRITICAL alerts.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { SurveillanceAlertStatus } from "@prisma/client"

jest.mock("@/lib/prisma", () => {
  const findMany = jest.fn()
  const count = jest.fn()
  const update = jest.fn()
  const surveillanceRuleFindMany = jest.fn()

  return {
    prisma: {
      houseSurveillanceAlert: { findMany, count, update },
      surveillanceRule: { findMany: surveillanceRuleFindMany },
    },
  }
})

const mock = jest.requireMock("@/lib/prisma") as {
  prisma: {
    houseSurveillanceAlert: { findMany: jest.Mock; count: jest.Mock; update: jest.Mock }
    surveillanceRule: { findMany: jest.Mock }
  }
}

import {
  listQueue,
  assignAlert,
  dismissAlert,
  resolveAlert,
} from "@/lib/surveillance/queue-service"

/**
 * listQueue fires count() in this exact order (determined by Promise.all call sequencing):
 *   1. total  — the pagination row count (where = active filter)
 *   2. open   — status=OPEN  (computeKpis Promise.all[0])
 *   3. highSeverity — status OPEN|ASSIGNED, severity HIGH|CRITICAL  (computeKpis Promise.all[1])
 *   4. unassigned — status=OPEN, assignedToId=null  (computeKpis Promise.all[2])
 *   5. resolvedToday — status=RESOLVED, resolvedAt>=startOfDay  (computeKpis Promise.all[3])
 */
function setupCounts(total: number, open: number, highSeverity: number, unassigned: number, resolvedToday: number) {
  mock.prisma.houseSurveillanceAlert.count
    .mockResolvedValueOnce(total)
    .mockResolvedValueOnce(open)
    .mockResolvedValueOnce(highSeverity)
    .mockResolvedValueOnce(unassigned)
    .mockResolvedValueOnce(resolvedToday)
}

beforeEach(() => {
  jest.clearAllMocks()
  mock.prisma.houseSurveillanceAlert.findMany.mockResolvedValue([])
  mock.prisma.surveillanceRule.findMany.mockResolvedValue([])
})

// ─── KPI tile semantics ───────────────────────────────────────────────────────

describe("listQueue — KPI tile count semantics", () => {
  it("open KPI reflects only OPEN status alerts", async () => {
    // Call order: total=0, open=7, highSeverity=3, unassigned=5, resolvedToday=2
    setupCounts(0, 7, 3, 5, 2)

    const result = await listQueue({ status: "ANY" })

    expect(result.kpis.open).toBe(7)

    // Verify the `open` query was scoped to status=OPEN (call index 1 = open)
    const countCalls = mock.prisma.houseSurveillanceAlert.count.mock.calls
    const openQuery = countCalls[1]?.[0]
    expect(openQuery?.where?.status).toBe(SurveillanceAlertStatus.OPEN)
  })

  it("highSeverity KPI includes both OPEN and ASSIGNED alerts with HIGH/CRITICAL severity", async () => {
    setupCounts(0, 4, 9, 3, 1)

    const result = await listQueue({ status: "ANY" })

    expect(result.kpis.highSeverity).toBe(9)

    // highSeverity is call index 2
    const countCalls = mock.prisma.houseSurveillanceAlert.count.mock.calls
    const highSevQuery = countCalls[2]?.[0]
    expect(highSevQuery?.where?.status?.in).toContain(SurveillanceAlertStatus.OPEN)
    expect(highSevQuery?.where?.status?.in).toContain(SurveillanceAlertStatus.ASSIGNED)
    // Must NOT include DISMISSED or RESOLVED
    expect(highSevQuery?.where?.status?.in).not.toContain(SurveillanceAlertStatus.DISMISSED)
    expect(highSevQuery?.where?.status?.in).not.toContain(SurveillanceAlertStatus.RESOLVED)
    // Must scope to HIGH/CRITICAL severity
    const sevIn = highSevQuery?.where?.severity?.in ?? []
    expect(sevIn).toContain("HIGH")
    expect(sevIn).toContain("CRITICAL")
  })

  it("unassigned KPI scopes to OPEN status AND null assignedToId", async () => {
    setupCounts(0, 10, 6, 8, 0)

    const result = await listQueue({ status: "ANY" })

    expect(result.kpis.unassigned).toBe(8)

    // unassigned is call index 3
    const countCalls = mock.prisma.houseSurveillanceAlert.count.mock.calls
    const unassignedQuery = countCalls[3]?.[0]
    expect(unassignedQuery?.where?.status).toBe(SurveillanceAlertStatus.OPEN)
    expect(unassignedQuery?.where?.assignedToId).toBeNull()
  })

  it("resolvedToday KPI is scoped to RESOLVED status with resolvedAt ≥ start-of-day", async () => {
    setupCounts(0, 0, 0, 0, 12)

    const result = await listQueue({ status: "ANY" })

    expect(result.kpis.resolvedToday).toBe(12)

    // resolvedToday is call index 4
    const countCalls = mock.prisma.houseSurveillanceAlert.count.mock.calls
    const resolvedQuery = countCalls[4]?.[0]
    expect(resolvedQuery?.where?.status).toBe(SurveillanceAlertStatus.RESOLVED)
    expect(resolvedQuery?.where?.resolvedAt?.gte).toBeInstanceOf(Date)
    const gte: Date = resolvedQuery?.where?.resolvedAt?.gte
    expect(gte.getHours()).toBe(0)
    expect(gte.getMinutes()).toBe(0)
    expect(gte.getSeconds()).toBe(0)
  })

  it("all four KPI values are returned together", async () => {
    setupCounts(0, 5, 3, 2, 1)

    const result = await listQueue({ status: "ANY" })

    expect(result.kpis).toEqual({
      open: 5,
      highSeverity: 3,
      unassigned: 2,
      resolvedToday: 1,
    })
  })
})

// ─── listQueue — row mapping ───────────────────────────────────────────────────

describe("listQueue — row shape", () => {
  it("maps raw DB row to SurveillanceQueueRow DTO", async () => {
    const rawRow = {
      id: "alert-xyz",
      ruleKey: "HEAVY_HITTER",
      severity: "HIGH",
      confidenceScore: 80,
      status: SurveillanceAlertStatus.OPEN,
      message: "Heavy hitter detected.",
      createdAt: new Date("2026-04-30T10:00:00.000Z"),
      relatedUser: { id: "user-1", name: "Alice", email: "alice@test.com", phone: "9999999999" },
      relatedWithdrawalId: null,
      relatedTransactionId: null,
      relatedBonusGrantId: null,
      relatedAffiliateId: null,
      assignedTo: null,
      evidence: { ratio: 6.5 },
    }

    mock.prisma.houseSurveillanceAlert.findMany.mockResolvedValue([rawRow])
    // Call order: total, open, highSeverity, unassigned, resolvedToday
    setupCounts(1, 1, 0, 1, 0)
    mock.prisma.surveillanceRule.findMany.mockResolvedValue([
      { ruleKey: "HEAVY_HITTER", name: "Heavy Hitter" },
    ])

    const result = await listQueue({ status: "OPEN" as any })
    const row = result.rows[0]

    expect(row.id).toBe("alert-xyz")
    expect(row.ruleKey).toBe("HEAVY_HITTER")
    expect(row.ruleName).toBe("Heavy Hitter")
    expect(row.severity).toBe("HIGH")
    expect(row.confidenceScore).toBe(80)
    expect(row.createdAt).toBe("2026-04-30T10:00:00.000Z")
    expect(row.user.email).toBe("alice@test.com")
    expect(row.assignedTo).toBeNull()
  })

  it("falls back to ruleKey as ruleName when no SurveillanceRule row exists", async () => {
    const rawRow = {
      id: "alert-2",
      ruleKey: "UNKNOWN_RULE",
      severity: "MEDIUM",
      confidenceScore: 50,
      status: SurveillanceAlertStatus.OPEN,
      message: "Test.",
      createdAt: new Date(),
      relatedUser: null,
      relatedWithdrawalId: null,
      relatedTransactionId: null,
      relatedBonusGrantId: null,
      relatedAffiliateId: null,
      assignedTo: null,
      evidence: {},
    }

    mock.prisma.houseSurveillanceAlert.findMany.mockResolvedValue([rawRow])
    setupCounts(1, 0, 0, 1, 0)
    mock.prisma.surveillanceRule.findMany.mockResolvedValue([]) // no matching rule

    const result = await listQueue({ status: "ANY" })
    expect(result.rows[0].ruleName).toBe("UNKNOWN_RULE")
  })
})

// ─── Status-transition helpers ────────────────────────────────────────────────

describe("assignAlert", () => {
  it("updates status to ASSIGNED and sets assignedToId + assignedAt", async () => {
    mock.prisma.houseSurveillanceAlert.update.mockResolvedValue({ id: "alert-1" })

    await assignAlert("alert-1", "admin-1")

    const arg = mock.prisma.houseSurveillanceAlert.update.mock.calls[0][0]
    expect(arg.where.id).toBe("alert-1")
    expect(arg.data.status).toBe(SurveillanceAlertStatus.ASSIGNED)
    expect(arg.data.assignedToId).toBe("admin-1")
    expect(arg.data.assignedAt).toBeInstanceOf(Date)
  })
})

describe("dismissAlert", () => {
  it("updates status to DISMISSED with reason (truncated to 255)", async () => {
    mock.prisma.houseSurveillanceAlert.update.mockResolvedValue({ id: "alert-1" })

    const longReason = "A".repeat(300)
    await dismissAlert("alert-1", "admin-1", longReason)

    const arg = mock.prisma.houseSurveillanceAlert.update.mock.calls[0][0]
    expect(arg.data.status).toBe(SurveillanceAlertStatus.DISMISSED)
    expect(arg.data.dismissReason?.length).toBeLessThanOrEqual(255)
    expect(arg.data.dismissedAt).toBeInstanceOf(Date)
    expect(arg.data.dismissedById).toBe("admin-1")
  })

  it("sets reason verbatim when ≤ 255 chars", async () => {
    mock.prisma.houseSurveillanceAlert.update.mockResolvedValue({ id: "alert-1" })
    await dismissAlert("alert-1", "admin-1", "False positive — known pattern")

    const arg = mock.prisma.houseSurveillanceAlert.update.mock.calls[0][0]
    expect(arg.data.dismissReason).toBe("False positive — known pattern")
  })
})

describe("resolveAlert", () => {
  it("updates status to RESOLVED with note and resolvedAt", async () => {
    mock.prisma.houseSurveillanceAlert.update.mockResolvedValue({ id: "alert-1" })

    await resolveAlert("alert-1", "admin-2", "Reviewed and closed.")

    const arg = mock.prisma.houseSurveillanceAlert.update.mock.calls[0][0]
    expect(arg.data.status).toBe(SurveillanceAlertStatus.RESOLVED)
    expect(arg.data.resolvedAt).toBeInstanceOf(Date)
    expect(arg.data.resolutionNote).toBe("Reviewed and closed.")
  })
})

// ─── listQueue — filter passthrough ───────────────────────────────────────────

describe("listQueue — filter application", () => {
  it("omits status filter from where clause when status is ANY", async () => {
    setupCounts(0, 0, 0, 0, 0)

    await listQueue({ status: "ANY" })

    const findManyArg = mock.prisma.houseSurveillanceAlert.findMany.mock.calls[0][0]
    expect(findManyArg?.where?.status).toBeUndefined()
  })

  it("applies status filter when a specific status is provided", async () => {
    setupCounts(0, 0, 0, 0, 0)

    await listQueue({ status: SurveillanceAlertStatus.DISMISSED })

    const findManyArg = mock.prisma.houseSurveillanceAlert.findMany.mock.calls[0][0]
    expect(findManyArg?.where?.status).toBe(SurveillanceAlertStatus.DISMISSED)
  })
})
