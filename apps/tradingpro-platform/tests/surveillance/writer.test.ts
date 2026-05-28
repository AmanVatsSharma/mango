/**
 * File:        tests/surveillance/writer.test.ts
 * Module:      Surveillance · Alert Writer — Unit Tests
 * Purpose:     Verify the three invariants stated in writer.ts:
 *                1. Same (ruleKey, dedupeKey) produces exactly one row (idempotency).
 *                2. Re-fire updates evidence/confidence/message but NOT status.
 *                3. A DISMISSED alert stays DISMISSED on re-fire (the critical invariant).
 *
 * Exports:     none (Jest test file)
 *
 * Depends on:
 *   - @/lib/surveillance/writer — module under test
 *   - @/lib/prisma              — mocked
 *
 * Side-effects: none (Prisma fully mocked).
 *
 * Key invariants:
 *   - autoDismissLowConfidence always passes `status: DISMISSED` in the update payload.
 *   - persistFires update branch NEVER sends a `status` field.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { SurveillanceAlertStatus } from "@prisma/client"

jest.mock("@/lib/prisma", () => {
  const findUnique = jest.fn()
  const create = jest.fn()
  const update = jest.fn()
  const updateMany = jest.fn()
  return {
    prisma: {
      houseSurveillanceAlert: { findUnique, create, update, updateMany },
    },
  }
})

const { prisma } = jest.requireMock("@/lib/prisma") as {
  prisma: {
    houseSurveillanceAlert: {
      findUnique: jest.Mock
      create: jest.Mock
      update: jest.Mock
      updateMany: jest.Mock
    }
  }
}

import { persistFires, autoDismissLowConfidence } from "@/lib/surveillance/writer"
import type { RuleFireResult } from "@/lib/surveillance/types"

const RULE_KEY = "HEAVY_HITTER"
const DEDUPE_KEY = "user-abc:17000"

const baseFire: RuleFireResult = {
  dedupeKey: DEDUPE_KEY,
  relatedUserId: "user-abc",
  confidenceScore: 72,
  severity: "HIGH",
  message: "Heavy hitter: ₹5,00,000 in last 6h (5.2× prior window).",
  evidence: { windowStart: "2026-04-30T06:00:00.000Z", ratio: 5.2 },
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.houseSurveillanceAlert.create.mockResolvedValue({ id: "alert-1" })
  prisma.houseSurveillanceAlert.update.mockResolvedValue({ id: "alert-1" })
  prisma.houseSurveillanceAlert.updateMany.mockResolvedValue({ count: 0 })
})

// ─── persistFires: create path ────────────────────────────────────────────────

describe("persistFires — create path (no existing row)", () => {
  beforeEach(() => {
    prisma.houseSurveillanceAlert.findUnique.mockResolvedValue(null)
  })

  it("calls create with ruleKey and dedupeKey", async () => {
    const result = await persistFires(RULE_KEY, [baseFire])

    expect(prisma.houseSurveillanceAlert.create).toHaveBeenCalledTimes(1)
    const createArg = prisma.houseSurveillanceAlert.create.mock.calls[0][0]
    expect(createArg.data.ruleKey).toBe(RULE_KEY)
    expect(createArg.data.dedupeKey).toBe(DEDUPE_KEY)
  })

  it("returns created=1, updated=0, failed=0", async () => {
    const result = await persistFires(RULE_KEY, [baseFire])
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 })
  })

  it("does NOT call update when row is absent", async () => {
    await persistFires(RULE_KEY, [baseFire])
    expect(prisma.houseSurveillanceAlert.update).not.toHaveBeenCalled()
  })
})

// ─── persistFires: update path (existing row) ─────────────────────────────────

describe("persistFires — update path (existing row)", () => {
  beforeEach(() => {
    prisma.houseSurveillanceAlert.findUnique.mockResolvedValue({ id: "alert-existing" })
  })

  it("calls update NOT create on re-fire", async () => {
    await persistFires(RULE_KEY, [baseFire])
    expect(prisma.houseSurveillanceAlert.update).toHaveBeenCalledTimes(1)
    expect(prisma.houseSurveillanceAlert.create).not.toHaveBeenCalled()
  })

  it("returns created=0, updated=1, failed=0", async () => {
    const result = await persistFires(RULE_KEY, [baseFire])
    expect(result).toEqual({ created: 0, updated: 1, failed: 0 })
  })

  it("update payload contains confidenceScore, message, evidence", async () => {
    const updated = { ...baseFire, confidenceScore: 90, message: "Updated message." }
    await persistFires(RULE_KEY, [updated])
    const updateArg = prisma.houseSurveillanceAlert.update.mock.calls[0][0]
    expect(updateArg.data.confidenceScore).toBe(90)
    expect(updateArg.data.message).toBe("Updated message.")
    expect(updateArg.data.evidence).toBeDefined()
  })

  // ── CRITICAL INVARIANT ──────────────────────────────────────────────────────
  it("update payload NEVER contains a status field (dismissed stays dismissed)", async () => {
    await persistFires(RULE_KEY, [baseFire])
    const updateArg = prisma.houseSurveillanceAlert.update.mock.calls[0][0]
    // The update data must not carry `status` — if it did, a DISMISSED alert would reopen.
    expect(updateArg.data).not.toHaveProperty("status")
  })
})

// ─── persistFires: idempotency ────────────────────────────────────────────────

describe("persistFires — idempotency", () => {
  it("two fires with the same dedupeKey result in one findUnique call each, no double-create", async () => {
    // First fire: no existing row → create.
    prisma.houseSurveillanceAlert.findUnique.mockResolvedValueOnce(null)
    const r1 = await persistFires(RULE_KEY, [baseFire])
    expect(r1.created).toBe(1)

    // Second fire: row now exists → update.
    prisma.houseSurveillanceAlert.findUnique.mockResolvedValueOnce({ id: "alert-1" })
    const r2 = await persistFires(RULE_KEY, [baseFire])
    expect(r2.updated).toBe(1)
    expect(r2.created).toBe(0)

    expect(prisma.houseSurveillanceAlert.create).toHaveBeenCalledTimes(1)
    expect(prisma.houseSurveillanceAlert.update).toHaveBeenCalledTimes(1)
  })

  it("two fires with DIFFERENT dedupeKeys → two separate create calls", async () => {
    prisma.houseSurveillanceAlert.findUnique.mockResolvedValue(null)

    const fire1: RuleFireResult = { ...baseFire, dedupeKey: "user-abc:17000" }
    const fire2: RuleFireResult = { ...baseFire, dedupeKey: "user-abc:17001" }

    const result = await persistFires(RULE_KEY, [fire1, fire2])

    expect(result.created).toBe(2)
    expect(prisma.houseSurveillanceAlert.create).toHaveBeenCalledTimes(2)
  })
})

// ─── persistFires: error isolation ────────────────────────────────────────────

describe("persistFires — error isolation", () => {
  it("one failed row does not block the rest", async () => {
    // Row 1: findUnique throws; Row 2: succeeds (no existing row).
    prisma.houseSurveillanceAlert.findUnique
      .mockRejectedValueOnce(new Error("DB timeout"))
      .mockResolvedValueOnce(null)

    const fire2: RuleFireResult = { ...baseFire, dedupeKey: "user-abc:17001" }

    const result = await persistFires(RULE_KEY, [baseFire, fire2])

    expect(result.failed).toBe(1)
    expect(result.created).toBe(1)
  })
})

// ─── autoDismissLowConfidence ─────────────────────────────────────────────────

describe("autoDismissLowConfidence", () => {
  it("calls updateMany with OPEN status and confidence lt cutoff", async () => {
    prisma.houseSurveillanceAlert.updateMany.mockResolvedValue({ count: 3 })

    const before = new Date("2026-04-29T00:00:00.000Z")
    const result = await autoDismissLowConfidence({
      beforeAt: before,
      ruleKey: RULE_KEY,
      confidenceScoreCutoff: 40,
    })

    expect(result.dismissed).toBe(3)
    const arg = prisma.houseSurveillanceAlert.updateMany.mock.calls[0][0]
    expect(arg.where.status).toBe(SurveillanceAlertStatus.OPEN)
    expect(arg.where.confidenceScore).toEqual({ lt: 40 })
    expect(arg.data.status).toBe(SurveillanceAlertStatus.DISMISSED)
  })

  it("sets dismissedAt and includes a reason in the update", async () => {
    prisma.houseSurveillanceAlert.updateMany.mockResolvedValue({ count: 1 })

    await autoDismissLowConfidence({
      beforeAt: new Date(),
      ruleKey: RULE_KEY,
      confidenceScoreCutoff: 50,
      reason: "Nightly sweep",
    })

    const arg = prisma.houseSurveillanceAlert.updateMany.mock.calls[0][0]
    expect(arg.data.dismissedAt).toBeInstanceOf(Date)
    expect(arg.data.dismissReason).toBe("Nightly sweep")
  })

  it("returns dismissed=0 when updateMany returns count 0", async () => {
    prisma.houseSurveillanceAlert.updateMany.mockResolvedValue({ count: 0 })
    const result = await autoDismissLowConfidence({
      beforeAt: new Date(),
      ruleKey: RULE_KEY,
      confidenceScoreCutoff: 30,
    })
    expect(result.dismissed).toBe(0)
  })
})
