/**
 * @file tests/risk/dynamic-trading-policies-engine.test.ts
 * @module tests-risk
 * @description Unit tests for dynamic trading policy engine CRUD normalization and runtime evaluation.
 * @author StockTrade
 * @created 2026-03-05
 */

const getLatestActiveGlobalSettingsMock = jest.fn()
const upsertGlobalSettingMock = jest.fn()
const getLegacyTradingPoliciesMock = jest.fn()

jest.mock("@/lib/server/workers/system-settings", () => ({
  getLatestActiveGlobalSettings: (...args: any[]) => getLatestActiveGlobalSettingsMock(...args),
  upsertGlobalSetting: (...args: any[]) => upsertGlobalSettingMock(...args),
}))

jest.mock("@/lib/services/risk/trading-policies", () => ({
  getTradingPolicies: (...args: any[]) => getLegacyTradingPoliciesMock(...args),
}))

import { AppError } from "@/src/common/errors"
import {
  DYNAMIC_TRADING_POLICIES_KEY,
  createTradingPolicy,
  evaluateTradingPoliciesForContext,
  listTradingPolicies,
} from "@/lib/services/risk/dynamic-trading-policies"

function mockStoredDynamicPolicies(policies: unknown[]) {
  getLatestActiveGlobalSettingsMock.mockResolvedValue(
    new Map([
      [
        DYNAMIC_TRADING_POLICIES_KEY,
        {
          value: JSON.stringify(policies),
        },
      ],
    ]),
  )
}

describe("dynamic-trading-policies engine", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete (globalThis as any).__dynamicTradingPoliciesCache
    mockStoredDynamicPolicies([])
    upsertGlobalSettingMock.mockResolvedValue(undefined)
    getLegacyTradingPoliciesMock.mockResolvedValue({
      negativePnlCloseDelayEnabled: false,
      negativePnlCloseDelayMinutes: 0,
      source: "system_settings",
    })
  })

  it("createTradingPolicy normalizes valid payload and persists dynamic policy", async () => {
    const created = await createTradingPolicy({
      name: "  Margin Guard  ",
      description: "  Prevent risky closes  ",
      context: "position_close",
      priority: "88.9",
      matchType: "all",
      conditions: [
        { field: "position.segment", operator: "in", value: [" nse ", " nfo "] },
        { field: "position.productType", operator: "neq", value: " mis " },
        { field: "position.holdMinutes", operator: "lt", value: "15" },
      ],
      action: {
        type: "BLOCK",
        message: "  Hold window active  ",
        retryAfterSeconds: "7.9",
      },
    })

    expect(created).toMatchObject({
      name: "Margin Guard",
      description: "Prevent risky closes",
      context: "POSITION_CLOSE",
      enabled: true,
      priority: 88,
      matchType: "ALL",
      source: "dynamic",
      readOnly: false,
      action: {
        type: "BLOCK",
        message: "Hold window active",
        retryAfterSeconds: 7,
      },
    })
    expect(created.id).toEqual(expect.any(String))
    expect(created.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "position.segment", operator: "IN", value: ["nse", "nfo"] }),
        expect.objectContaining({ field: "position.productType", operator: "NEQ", value: "mis" }),
        expect.objectContaining({ field: "position.holdMinutes", operator: "LT", value: 15 }),
      ]),
    )
    expect(upsertGlobalSettingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: DYNAMIC_TRADING_POLICIES_KEY,
        category: "RISK",
      }),
    )
  })

  it("createTradingPolicy rejects invalid payload", async () => {
    await expect(
      createTradingPolicy({
        name: "Bad policy",
        context: "POSITION_CLOSE",
        conditions: [{ field: "position.segment", operator: "GT", value: "NSE" }],
        action: { type: "BLOCK", message: "bad" },
      }),
    ).rejects.toBeInstanceOf(AppError)

    await expect(
      createTradingPolicy({
        name: "Bad policy",
        context: "POSITION_CLOSE",
        conditions: [{ field: "position.segment", operator: "GT", value: "NSE" }],
        action: { type: "BLOCK", message: "bad" },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid policy payload. Ensure context, name, conditions, and action are valid.",
    })
    expect(upsertGlobalSettingMock).not.toHaveBeenCalled()
  })

  it("listTradingPolicies(includeLegacy=true) includes synthesized legacy policy when enabled", async () => {
    mockStoredDynamicPolicies([
      {
        id: "dynamic-1",
        name: "Dynamic guard",
        description: "",
        context: "POSITION_CLOSE",
        enabled: true,
        priority: 10,
        matchType: "ALL",
        conditions: [{ id: "cond-1", field: "position.unrealizedPnl", operator: "LT", value: -50 }],
        action: { type: "BLOCK", message: "Dynamic block" },
        createdAt: "2026-03-05T10:00:00.000Z",
        updatedAt: "2026-03-05T10:00:00.000Z",
        source: "dynamic",
        readOnly: false,
      },
    ])
    getLegacyTradingPoliciesMock.mockResolvedValueOnce({
      negativePnlCloseDelayEnabled: true,
      negativePnlCloseDelayMinutes: 12,
      source: "system_settings",
    })

    const policies = await listTradingPolicies({ includeLegacy: true, maxAgeMs: 0 })

    expect(policies.map((policy) => policy.source)).toEqual(expect.arrayContaining(["dynamic", "legacy"]))
    expect(policies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "legacy-negative-pnl-close-delay",
          context: "POSITION_CLOSE",
          source: "legacy",
          readOnly: true,
          conditions: expect.arrayContaining([
            expect.objectContaining({ field: "position.unrealizedPnl", operator: "LT", value: 0 }),
            expect.objectContaining({ field: "position.holdMinutes", operator: "LT", value: 12 }),
          ]),
        }),
      ]),
    )
  })

  it("evaluateTradingPoliciesForContext blocks matching dynamic holdMinutes rule with retry hint", async () => {
    mockStoredDynamicPolicies([
      {
        id: "dynamic-hold-policy",
        name: "Hold guard",
        description: "",
        context: "POSITION_CLOSE",
        enabled: true,
        priority: 150,
        matchType: "ALL",
        conditions: [
          { id: "cond-pnl", field: "position.unrealizedPnl", operator: "LT", value: 0 },
          { id: "cond-hold", field: "position.holdMinutes", operator: "LT", value: 20 },
        ],
        action: { type: "BLOCK", message: "Close allowed after hold window." },
        createdAt: "2026-03-05T10:00:00.000Z",
        updatedAt: "2026-03-05T10:00:00.000Z",
        source: "dynamic",
        readOnly: false,
      },
    ])

    const result = await evaluateTradingPoliciesForContext({
      context: "POSITION_CLOSE",
      maxAgeMs: 0,
      snapshot: {
        position: {
          unrealizedPnl: -120,
          holdMinutes: 5,
          segment: "NSE",
          productType: "MIS",
        },
        account: { availableMargin: 75_000 },
      },
    })

    expect(result).toMatchObject({
      blocked: true,
      message: "Close allowed after hold window.",
      policy: expect.objectContaining({ id: "dynamic-hold-policy", context: "POSITION_CLOSE" }),
    })
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("supports ANY matchType by blocking when any one condition matches", async () => {
    mockStoredDynamicPolicies([
      {
        id: "dynamic-any-policy",
        name: "Any custom guard",
        description: "",
        context: "ORDER_PLACE",
        enabled: true,
        priority: 120,
        matchType: "ANY",
        conditions: [
          { id: "cond-side", field: "order.side", operator: "EQ", value: "BUY" },
          { id: "cond-product", field: "order.productType", operator: "EQ", value: "MIS" },
        ],
        action: { type: "BLOCK", message: "Blocked by ANY policy." },
        createdAt: "2026-03-05T10:00:00.000Z",
        updatedAt: "2026-03-05T10:00:00.000Z",
        source: "dynamic",
        readOnly: false,
      },
    ])

    const result = await evaluateTradingPoliciesForContext({
      context: "ORDER_PLACE",
      maxAgeMs: 0,
      snapshot: {
        order: {
          side: "SELL",
          productType: "MIS",
          orderType: "MARKET",
          segment: "NSE",
        },
        account: { availableMargin: 25_000 },
      },
    })

    expect(result.blocked).toBe(true)
    expect(result.message).toBe("Blocked by ANY policy.")
    expect(result.policy?.id).toBe("dynamic-any-policy")
  })
})
