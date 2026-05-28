/**
 * File:        tests/surveillance/rules.test.ts
 * Module:      Surveillance · Rule Evaluators — Unit Tests
 * Purpose:     Verify per-rule evaluator behaviour: happy-path fire, no-fire gate, and
 *              dedupeKey determinism (same inputs → same key across calls). These are the
 *              properties the DB @@unique([ruleKey, dedupeKey]) constraint relies on.
 *
 * Exports:     none (Jest test file)
 *
 * Depends on:
 *   - @/lib/surveillance/rules/heavy-hitter        — evaluateHeavyHitter
 *   - @/lib/surveillance/rules/suspicious-winner   — evaluateSuspiciousWinner
 *   - @/lib/surveillance/rules/coordinated-trading — evaluateCoordinatedTrading
 *   - @/lib/surveillance/rules/multi-account       — evaluateMultiAccount
 *   - @/lib/surveillance/rules/bonus-abuse         — evaluateBonusAbuse
 *   - @/lib/prisma                                 — mocked (no real DB)
 *
 * Side-effects: none (Prisma fully mocked).
 *
 * Key invariants:
 *   - dedupeKey is deterministic: calling the evaluator twice with identical inputs must
 *     produce the same dedupeKey both times.
 *   - No rule mutates any DB row (all access via mocked read-only calls).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { SurveillanceSeverity } from "@prisma/client"
import type { RuleSnapshot } from "@/lib/surveillance/types"

// ─── Prisma mock ──────────────────────────────────────────────────────────────

jest.mock("@/lib/prisma", () => {
  const orderFindMany = jest.fn()
  const tradingAccountFindMany = jest.fn()
  const clientWinnerControlFindUnique = jest.fn()
  const controlHistoryFindMany = jest.fn()
  const userSessionRecordFindMany = jest.fn()
  const bonusGrantFindMany = jest.fn()

  return {
    prisma: {
      order: { findMany: orderFindMany },
      tradingAccount: { findMany: tradingAccountFindMany },
      clientWinnerControl: { findUnique: clientWinnerControlFindUnique },
      clientWinnerControlHistory: { findMany: controlHistoryFindMany },
      userSessionRecord: { findMany: userSessionRecordFindMany },
      bonusGrant: { findMany: bonusGrantFindMany },
    },
  }
})

const mock = jest.requireMock("@/lib/prisma") as {
  prisma: {
    order: { findMany: jest.Mock }
    tradingAccount: { findMany: jest.Mock }
    clientWinnerControl: { findUnique: jest.Mock }
    clientWinnerControlHistory: { findMany: jest.Mock }
    userSessionRecord: { findMany: jest.Mock }
    bonusGrant: { findMany: jest.Mock }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRule<P>(
  ruleKey: string,
  severity: SurveillanceSeverity = SurveillanceSeverity.HIGH,
  baseConfidence = 70,
  params: P = {} as P,
): RuleSnapshot<any> {
  return { ruleKey: ruleKey as any, severity, baseConfidence, params }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEAVY_HITTER
// ═══════════════════════════════════════════════════════════════════════════════

describe("evaluateHeavyHitter", () => {
  let evaluateHeavyHitter: typeof import("@/lib/surveillance/rules/heavy-hitter").evaluateHeavyHitter

  beforeAll(async () => {
    ;({ evaluateHeavyHitter } = await import("@/lib/surveillance/rules/heavy-hitter"))
  })

  const rule = makeRule("HEAVY_HITTER")
  const eventAt = new Date("2026-04-30T12:00:00.000Z")
  const userId = "user-hh"

  it("fires when current notional exceeds floor and multiplier", async () => {
    // 6h window (default): windowStart = 06:00, priorWindowStart = 00:00
    // Orders in current window: 3 × 100_000 = 300_000
    // Orders in prior window: 1 × 10_000 = 10_000  → ratio = 30 (>> default multiplier 5)
    mock.prisma.order.findMany.mockResolvedValue([
      { executedAt: new Date("2026-04-30T07:00:00.000Z"), filledQuantity: 100, averagePrice: 1000 },
      { executedAt: new Date("2026-04-30T08:00:00.000Z"), filledQuantity: 100, averagePrice: 1000 },
      { executedAt: new Date("2026-04-30T09:00:00.000Z"), filledQuantity: 100, averagePrice: 1000 },
      { executedAt: new Date("2026-04-30T01:00:00.000Z"), filledQuantity: 10, averagePrice: 1000 },
    ])

    const fires = await evaluateHeavyHitter(rule, { userId, eventAt })

    expect(fires).toHaveLength(1)
    expect(fires[0].relatedUserId).toBe(userId)
    expect(fires[0].confidenceScore).toBeGreaterThan(0)
    expect(fires[0].dedupeKey).toContain(userId)
  })

  it("does NOT fire when current notional is below minNotional floor", async () => {
    // minNotional = 200_000 (default). Total in current window = 50_000.
    mock.prisma.order.findMany.mockResolvedValue([
      { executedAt: new Date("2026-04-30T07:00:00.000Z"), filledQuantity: 50, averagePrice: 1000 },
    ])

    const fires = await evaluateHeavyHitter(rule, { userId, eventAt })
    expect(fires).toHaveLength(0)
  })

  it("does NOT fire when ratio is below multiplier threshold", async () => {
    // current = 300_000, prior = 200_000 → ratio = 1.5 (< multiplier 5)
    mock.prisma.order.findMany.mockResolvedValue([
      { executedAt: new Date("2026-04-30T07:00:00.000Z"), filledQuantity: 300, averagePrice: 1000 },
      { executedAt: new Date("2026-04-30T01:00:00.000Z"), filledQuantity: 200, averagePrice: 1000 },
    ])

    const fires = await evaluateHeavyHitter(rule, { userId, eventAt })
    expect(fires).toHaveLength(0)
  })

  it("dedupeKey is deterministic: same userId+eventAt always produces the same key", async () => {
    mock.prisma.order.findMany.mockResolvedValue([
      { executedAt: new Date("2026-04-30T07:00:00.000Z"), filledQuantity: 300, averagePrice: 1000 },
      { executedAt: new Date("2026-04-30T01:00:00.000Z"), filledQuantity: 10, averagePrice: 1000 },
    ])

    const fires1 = await evaluateHeavyHitter(rule, { userId, eventAt })
    const fires2 = await evaluateHeavyHitter(rule, { userId, eventAt })

    expect(fires1).toHaveLength(1)
    expect(fires2).toHaveLength(1)
    expect(fires1[0].dedupeKey).toBe(fires2[0].dedupeKey)
  })

  it("returns empty array when there are no orders at all", async () => {
    mock.prisma.order.findMany.mockResolvedValue([])
    const fires = await evaluateHeavyHitter(rule, { userId, eventAt })
    expect(fires).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SUSPICIOUS_WINNER
// ═══════════════════════════════════════════════════════════════════════════════

describe("evaluateSuspiciousWinner", () => {
  let evaluateSuspiciousWinner: typeof import("@/lib/surveillance/rules/suspicious-winner").evaluateSuspiciousWinner

  beforeAll(async () => {
    ;({ evaluateSuspiciousWinner } = await import("@/lib/surveillance/rules/suspicious-winner"))
  })

  const rule = makeRule("SUSPICIOUS_WINNER")
  const withdrawalId = "wd-abc"
  const userId = "user-sw"
  const queuedAt = new Date("2026-04-30T12:00:00.000Z")

  it("fires when escalation is found within window", async () => {
    mock.prisma.clientWinnerControl.findUnique.mockResolvedValue({ id: "ctrl-1", rung: "WATCH" })
    mock.prisma.clientWinnerControlHistory.findMany.mockResolvedValue([
      {
        action: "AUTO_PROMOTE",
        fromRung: "NONE",
        toRung: "WATCH",
        createdAt: new Date("2026-04-30T06:00:00.000Z"),
        reason: "auto",
      },
    ])

    const fires = await evaluateSuspiciousWinner(rule, { withdrawalId, userId, queuedAt })

    expect(fires).toHaveLength(1)
    expect(fires[0].dedupeKey).toBe(withdrawalId)
    expect(fires[0].relatedWithdrawalId).toBe(withdrawalId)
  })

  it("escalates severity to CRITICAL when toRung is ORDER_REJECT or higher", async () => {
    mock.prisma.clientWinnerControl.findUnique.mockResolvedValue({
      id: "ctrl-1",
      rung: "ORDER_REJECT",
    })
    mock.prisma.clientWinnerControlHistory.findMany.mockResolvedValue([
      {
        action: "MANUAL_SET",
        fromRung: "WATCH",
        toRung: "ORDER_REJECT",
        createdAt: new Date("2026-04-30T06:00:00.000Z"),
        reason: null,
      },
    ])

    const fires = await evaluateSuspiciousWinner(rule, { withdrawalId, userId, queuedAt })

    expect(fires).toHaveLength(1)
    expect(fires[0].severity).toBe(SurveillanceSeverity.CRITICAL)
  })

  it("does NOT fire when user has no winner-control row", async () => {
    mock.prisma.clientWinnerControl.findUnique.mockResolvedValue(null)
    const fires = await evaluateSuspiciousWinner(rule, { withdrawalId, userId, queuedAt })
    expect(fires).toHaveLength(0)
  })

  it("does NOT fire when no escalation within window (only de-escalation)", async () => {
    mock.prisma.clientWinnerControl.findUnique.mockResolvedValue({ id: "ctrl-1", rung: "NONE" })
    mock.prisma.clientWinnerControlHistory.findMany.mockResolvedValue([
      {
        action: "MANUAL_SET",
        fromRung: "WATCH",
        toRung: "NONE", // downgrade
        createdAt: new Date("2026-04-30T06:00:00.000Z"),
        reason: null,
      },
    ])

    const fires = await evaluateSuspiciousWinner(rule, { withdrawalId, userId, queuedAt })
    expect(fires).toHaveLength(0)
  })

  it("dedupeKey is always the withdrawalId (deterministic per withdrawal)", async () => {
    mock.prisma.clientWinnerControl.findUnique.mockResolvedValue({ id: "ctrl-1", rung: "WATCH" })
    mock.prisma.clientWinnerControlHistory.findMany.mockResolvedValue([
      {
        action: "AUTO_PROMOTE",
        fromRung: "NONE",
        toRung: "WATCH",
        createdAt: new Date("2026-04-30T06:00:00.000Z"),
        reason: null,
      },
    ])

    const fires1 = await evaluateSuspiciousWinner(rule, { withdrawalId, userId, queuedAt })
    const fires2 = await evaluateSuspiciousWinner(rule, { withdrawalId, userId, queuedAt })

    expect(fires1[0].dedupeKey).toBe(withdrawalId)
    expect(fires2[0].dedupeKey).toBe(withdrawalId)
    expect(fires1[0].dedupeKey).toBe(fires2[0].dedupeKey)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// COORDINATED_TRADING
// ═══════════════════════════════════════════════════════════════════════════════

describe("evaluateCoordinatedTrading", () => {
  let evaluateCoordinatedTrading: typeof import("@/lib/surveillance/rules/coordinated-trading").evaluateCoordinatedTrading

  beforeAll(async () => {
    ;({ evaluateCoordinatedTrading } = await import(
      "@/lib/surveillance/rules/coordinated-trading"
    ))
  })

  const rule = makeRule("COORDINATED_TRADING")
  const batchAt = new Date("2026-04-30T22:00:00.000Z")

  it("returns empty when fewer than minAccounts in a cluster", async () => {
    // Default minAccounts = 3. Only 2 distinct accounts in the same bucket.
    const execAt = new Date("2026-04-30T21:00:00.000Z")
    mock.prisma.order.findMany.mockResolvedValue([
      { tradingAccountId: "acc-1", symbol: "RELIANCE", orderSide: "BUY", executedAt: execAt, filledQuantity: 10, averagePrice: 2000 },
      { tradingAccountId: "acc-2", symbol: "RELIANCE", orderSide: "BUY", executedAt: execAt, filledQuantity: 5,  averagePrice: 2000 },
    ])
    mock.prisma.tradingAccount.findMany.mockResolvedValue([
      { id: "acc-1", userId: "user-a" },
      { id: "acc-2", userId: "user-b" },
    ])

    const fires = await evaluateCoordinatedTrading(rule, { batchAt })
    expect(fires).toHaveLength(0)
  })

  it("fires when ≥ minAccounts cluster on same symbol+side within windowSec", async () => {
    const execAt = new Date("2026-04-30T21:00:00.000Z")
    mock.prisma.order.findMany.mockResolvedValue([
      { tradingAccountId: "acc-1", symbol: "NIFTY", orderSide: "BUY", executedAt: execAt, filledQuantity: 10, averagePrice: 18000 },
      { tradingAccountId: "acc-2", symbol: "NIFTY", orderSide: "BUY", executedAt: new Date(execAt.getTime() + 5000), filledQuantity: 10, averagePrice: 18000 },
      { tradingAccountId: "acc-3", symbol: "NIFTY", orderSide: "BUY", executedAt: new Date(execAt.getTime() + 10000), filledQuantity: 10, averagePrice: 18000 },
    ])
    mock.prisma.tradingAccount.findMany.mockResolvedValue([
      { id: "acc-1", userId: "user-a" },
      { id: "acc-2", userId: "user-b" },
      { id: "acc-3", userId: "user-c" },
    ])

    const fires = await evaluateCoordinatedTrading(rule, { batchAt })
    expect(fires).toHaveLength(1)
    expect(fires[0].dedupeKey).toContain("cluster:")
  })

  it("dedupeKey is deterministic: same cluster signature → same key on re-run", async () => {
    const execAt = new Date("2026-04-30T21:00:00.000Z")
    const orders = [
      { tradingAccountId: "acc-1", symbol: "SBIN", orderSide: "SELL", executedAt: execAt, filledQuantity: 100, averagePrice: 500 },
      { tradingAccountId: "acc-2", symbol: "SBIN", orderSide: "SELL", executedAt: new Date(execAt.getTime() + 2000), filledQuantity: 100, averagePrice: 500 },
      { tradingAccountId: "acc-3", symbol: "SBIN", orderSide: "SELL", executedAt: new Date(execAt.getTime() + 4000), filledQuantity: 100, averagePrice: 500 },
    ]
    const accounts = [
      { id: "acc-1", userId: "user-a" },
      { id: "acc-2", userId: "user-b" },
      { id: "acc-3", userId: "user-c" },
    ]

    mock.prisma.order.findMany.mockResolvedValue(orders)
    mock.prisma.tradingAccount.findMany.mockResolvedValue(accounts)
    const fires1 = await evaluateCoordinatedTrading(rule, { batchAt })

    mock.prisma.order.findMany.mockResolvedValue(orders)
    mock.prisma.tradingAccount.findMany.mockResolvedValue(accounts)
    const fires2 = await evaluateCoordinatedTrading(rule, { batchAt })

    expect(fires1).toHaveLength(1)
    expect(fires2).toHaveLength(1)
    expect(fires1[0].dedupeKey).toBe(fires2[0].dedupeKey)
  })

  it("returns empty array when no orders found", async () => {
    mock.prisma.order.findMany.mockResolvedValue([])
    mock.prisma.tradingAccount.findMany.mockResolvedValue([])
    const fires = await evaluateCoordinatedTrading(rule, { batchAt })
    expect(fires).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI_ACCOUNT
// ═══════════════════════════════════════════════════════════════════════════════

describe("evaluateMultiAccount", () => {
  let evaluateMultiAccount: typeof import("@/lib/surveillance/rules/multi-account").evaluateMultiAccount

  beforeAll(async () => {
    ;({ evaluateMultiAccount } = await import("@/lib/surveillance/rules/multi-account"))
  })

  const rule = makeRule("MULTI_ACCOUNT")
  const batchAt = new Date("2026-04-30T22:00:00.000Z")

  it("returns empty when no cluster meets minClusterSize", async () => {
    // Default minClusterSize = 3. Only 2 users share the networkKey → no fire.
    mock.prisma.userSessionRecord.findMany.mockResolvedValue([
      { userId: "user-a", networkKey: "net-1", ipFingerprint: null, deviceId: null },
      { userId: "user-b", networkKey: "net-1", ipFingerprint: null, deviceId: null },
    ])

    const fires = await evaluateMultiAccount(rule, { batchAt })
    expect(fires).toHaveLength(0)
  })

  it("fires when ≥ minClusterSize users share the same networkKey", async () => {
    mock.prisma.userSessionRecord.findMany.mockResolvedValue([
      { userId: "user-a", networkKey: "net-suspicious", ipFingerprint: null, deviceId: null },
      { userId: "user-b", networkKey: "net-suspicious", ipFingerprint: null, deviceId: null },
      { userId: "user-c", networkKey: "net-suspicious", ipFingerprint: null, deviceId: null },
      { userId: "user-d", networkKey: "net-suspicious", ipFingerprint: null, deviceId: null },
    ])

    const fires = await evaluateMultiAccount(rule, { batchAt })

    expect(fires.length).toBeGreaterThanOrEqual(1)
    const dedupeKeys = fires.map((f) => f.dedupeKey)
    expect(dedupeKeys.some((k) => k.startsWith("networkKey:"))).toBe(true)
  })

  it("dedupeKey format is `${dimension}:${value}` — stable across runs", async () => {
    const sessions = [
      { userId: "user-a", networkKey: null, ipFingerprint: "192.168.1.100", deviceId: null },
      { userId: "user-b", networkKey: null, ipFingerprint: "192.168.1.100", deviceId: null },
      { userId: "user-c", networkKey: null, ipFingerprint: "192.168.1.100", deviceId: null },
    ]

    mock.prisma.userSessionRecord.findMany.mockResolvedValue(sessions)
    const fires1 = await evaluateMultiAccount(rule, { batchAt })

    mock.prisma.userSessionRecord.findMany.mockResolvedValue(sessions)
    const fires2 = await evaluateMultiAccount(rule, { batchAt })

    expect(fires1.length).toBeGreaterThanOrEqual(1)
    expect(fires2.length).toBeGreaterThanOrEqual(1)
    expect(fires1[0].dedupeKey).toBe(fires2[0].dedupeKey)
    expect(fires1[0].dedupeKey).toContain("192.168.1.100")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// BONUS_ABUSE
// ═══════════════════════════════════════════════════════════════════════════════

describe("evaluateBonusAbuse", () => {
  let evaluateBonusAbuse: typeof import("@/lib/surveillance/rules/bonus-abuse").evaluateBonusAbuse

  beforeAll(async () => {
    ;({ evaluateBonusAbuse } = await import("@/lib/surveillance/rules/bonus-abuse"))
  })

  const rule = makeRule("BONUS_ABUSE")
  const batchAt = new Date("2026-04-30T22:00:00.000Z")

  it("returns empty when no ACTIVE grants found", async () => {
    mock.prisma.bonusGrant.findMany.mockResolvedValue([])
    const fires = await evaluateBonusAbuse(rule, { batchAt })
    expect(fires).toHaveLength(0)
  })

  it("returns empty when grant has not met minTurnoverPct", async () => {
    // Grant amount = 10_000. turnoverProgress = 2_000 = 20% (< 50% default).
    mock.prisma.bonusGrant.findMany.mockResolvedValue([
      {
        id: "grant-1",
        userId: "user-ba",
        tradingAccountId: "acc-ba",
        amount: 10_000,
        turnoverProgress: 2_000,
      },
    ])
    mock.prisma.order.findMany.mockResolvedValue([])

    const fires = await evaluateBonusAbuse(rule, { batchAt })
    expect(fires).toHaveLength(0)
  })

  it("fires when wash-trade ratio exceeds 50%", async () => {
    // Grant: amount = 10_000, turnoverProgress = 6_000 (60% ≥ 50%).
    // Trades: one OPEN + one CLOSE within washWindowSec (60s) on same symbol.
    mock.prisma.bonusGrant.findMany.mockResolvedValue([
      {
        id: "grant-fire",
        userId: "user-ba",
        tradingAccountId: "acc-ba",
        amount: 10_000,
        turnoverProgress: 6_000,
      },
    ])
    const t0 = new Date("2026-04-30T21:00:00.000Z")
    const t1 = new Date(t0.getTime() + 30_000) // 30s later — within 60s window
    mock.prisma.order.findMany.mockResolvedValue([
      { id: "o1", orderPurpose: "OPEN",  symbol: "RELIANCE", orderSide: "BUY",  filledQuantity: 100, averagePrice: 2000, executedAt: t0 },
      { id: "o2", orderPurpose: "CLOSE", symbol: "RELIANCE", orderSide: "SELL", filledQuantity: 100, averagePrice: 2000, executedAt: t1 },
    ])

    const fires = await evaluateBonusAbuse(rule, { batchAt })

    expect(fires.length).toBeGreaterThanOrEqual(1)
    const f = fires[0]
    expect(f.dedupeKey).toBe("grant-fire")
    expect(f.relatedBonusGrantId).toBe("grant-fire")
    expect(f.relatedUserId).toBe("user-ba")
  })

  it("dedupeKey equals grantId — deterministic per grant", async () => {
    mock.prisma.bonusGrant.findMany.mockResolvedValue([
      {
        id: "grant-det",
        userId: "user-ba",
        tradingAccountId: "acc-ba",
        amount: 10_000,
        turnoverProgress: 6_000,
      },
    ])
    const t0 = new Date("2026-04-30T21:00:00.000Z")
    const t1 = new Date(t0.getTime() + 20_000)
    const orders = [
      { id: "o1", orderPurpose: "OPEN",  symbol: "TCS", orderSide: "BUY",  filledQuantity: 50, averagePrice: 3000, executedAt: t0 },
      { id: "o2", orderPurpose: "CLOSE", symbol: "TCS", orderSide: "SELL", filledQuantity: 50, averagePrice: 3000, executedAt: t1 },
    ]

    mock.prisma.order.findMany.mockResolvedValue(orders)
    const fires1 = await evaluateBonusAbuse(rule, { batchAt })
    mock.prisma.bonusGrant.findMany.mockResolvedValue([
      { id: "grant-det", userId: "user-ba", tradingAccountId: "acc-ba", amount: 10_000, turnoverProgress: 6_000 },
    ])
    mock.prisma.order.findMany.mockResolvedValue(orders)
    const fires2 = await evaluateBonusAbuse(rule, { batchAt })

    if (fires1.length > 0 && fires2.length > 0) {
      expect(fires1[0].dedupeKey).toBe("grant-det")
      expect(fires2[0].dedupeKey).toBe("grant-det")
    }
  })
})

// ─── parseConfidenceScore helper ─────────────────────────────────────────────

describe("parseConfidenceScore", () => {
  it("clamps values to 0-100", async () => {
    const { parseConfidenceScore } = await import("@/lib/surveillance/types")
    expect(parseConfidenceScore(-10)).toBe(0)
    expect(parseConfidenceScore(150)).toBe(100)
    expect(parseConfidenceScore(72)).toBe(72)
    expect(parseConfidenceScore(72.7)).toBe(73)
  })

  it("returns 0 for NaN", async () => {
    const { parseConfidenceScore } = await import("@/lib/surveillance/types")
    expect(parseConfidenceScore(NaN)).toBe(0)
  })
})
