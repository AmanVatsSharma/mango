/**
 * @file tests/api/admin-risk-policies-route.test.ts
 * @module tests-api
 * @description Route-level tests for /api/admin/risk/policies dynamic + legacy policy branches.
 * @author StockTrade
 * @created 2026-03-05
 */

const listTradingPoliciesMock = jest.fn()
const getTradingPolicyCatalogMock = jest.fn()
const createTradingPolicyMock = jest.fn()
const updateTradingPolicyMock = jest.fn()
const deleteTradingPolicyMock = jest.fn()
const getLegacyTradingPoliciesMock = jest.fn()
const upsertLegacyTradingPoliciesMock = jest.fn()

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: async (_req: Request, _opts: any, handler: any) => {
    try {
      return await handler({
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        },
      })
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message || "failed",
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      )
    }
  },
}))

jest.mock("@/lib/services/risk/dynamic-trading-policies", () => ({
  listTradingPolicies: (...args: any[]) => listTradingPoliciesMock(...args),
  getTradingPolicyCatalog: (...args: any[]) => getTradingPolicyCatalogMock(...args),
  createTradingPolicy: (...args: any[]) => createTradingPolicyMock(...args),
  updateTradingPolicy: (...args: any[]) => updateTradingPolicyMock(...args),
  deleteTradingPolicy: (...args: any[]) => deleteTradingPolicyMock(...args),
}))

jest.mock("@/lib/services/risk/trading-policies", () => ({
  getTradingPolicies: (...args: any[]) => getLegacyTradingPoliciesMock(...args),
  upsertTradingPolicies: (...args: any[]) => upsertLegacyTradingPoliciesMock(...args),
}))

import { DELETE, GET, POST, PUT } from "@/app/api/admin/risk/policies/route"

const nowIso = "2026-03-05T10:00:00.000Z"

const basePolicy = {
  id: "policy-1",
  name: "Block quick close",
  description: "Block early close on negative pnl positions.",
  context: "POSITION_CLOSE",
  enabled: true,
  priority: 100,
  matchType: "ALL",
  conditions: [{ id: "cond-1", field: "position.holdMinutes", operator: "LT", value: 15 }],
  action: { type: "BLOCK", message: "Blocked by policy", retryAfterSeconds: 60 },
  createdAt: nowIso,
  updatedAt: nowIso,
  source: "dynamic",
  readOnly: false,
}

const catalogFixture = {
  contexts: [
    { value: "POSITION_CLOSE", label: "Position Close" },
    { value: "ORDER_PLACE", label: "Order Placement" },
  ],
  matchTypes: [
    { value: "ALL", label: "All conditions (AND)" },
    { value: "ANY", label: "Any condition (OR)" },
  ],
  operators: [{ value: "EQ", label: "Equal (=)", supportedDataTypes: ["number", "string"] }],
  fieldsByContext: {
    POSITION_CLOSE: [{ field: "position.holdMinutes", label: "Position Hold Time (minutes)", dataType: "number" }],
    ORDER_PLACE: [{ field: "order.side", label: "Order Side", dataType: "string" }],
  },
  actions: [{ value: "BLOCK", label: "Block Request" }],
}

describe("/api/admin/risk/policies route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    listTradingPoliciesMock.mockResolvedValue([basePolicy])
    getTradingPolicyCatalogMock.mockReturnValue(catalogFixture)
    createTradingPolicyMock.mockResolvedValue({ ...basePolicy, id: "policy-created" })
    updateTradingPolicyMock.mockResolvedValue({ ...basePolicy, id: "policy-updated", name: "Updated policy" })
    deleteTradingPolicyMock.mockResolvedValue(basePolicy)
    getLegacyTradingPoliciesMock.mockResolvedValue({
      negativePnlCloseDelayEnabled: false,
      negativePnlCloseDelayMinutes: 0,
      source: "system_settings",
    })
    upsertLegacyTradingPoliciesMock.mockResolvedValue({
      negativePnlCloseDelayEnabled: true,
      negativePnlCloseDelayMinutes: 12,
      source: "system_settings",
    })
  })

  it("GET returns success payload with policies and catalog", async () => {
    const req = new Request("http://localhost/api/admin/risk/policies", { method: "GET" })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      policies: [expect.objectContaining({ id: "policy-1" })],
      catalog: expect.objectContaining({
        contexts: expect.any(Array),
        operators: expect.any(Array),
      }),
    })
    expect(listTradingPoliciesMock).toHaveBeenCalledWith({ maxAgeMs: 0, includeLegacy: true })
    expect(getTradingPolicyCatalogMock).toHaveBeenCalledTimes(1)
  })

  it("POST invalid body returns wrapper error with AppError message", async () => {
    const req = new Request("http://localhost/api/admin/risk/policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["invalid"]),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toMatchObject({
      success: false,
      error: "Invalid JSON body",
    })
    expect(createTradingPolicyMock).not.toHaveBeenCalled()
  })

  it("POST success returns 201 with policy payload", async () => {
    const payload = {
      name: "New dynamic policy",
      context: "POSITION_CLOSE",
      conditions: [{ field: "position.holdMinutes", operator: "LT", value: 10 }],
      action: { type: "BLOCK", message: "Too early" },
    }

    const req = new Request("http://localhost/api/admin/risk/policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toMatchObject({
      success: true,
      policy: expect.objectContaining({ id: "policy-created" }),
    })
    expect(createTradingPolicyMock).toHaveBeenCalledWith(payload)
  })

  it("PUT dynamic update success returns 200", async () => {
    const payload = { id: "policy-1", name: "Updated policy" }
    const req = new Request("http://localhost/api/admin/risk/policies", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })

    const res = await PUT(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      policy: expect.objectContaining({ id: "policy-updated", name: "Updated policy" }),
    })
    expect(updateTradingPolicyMock).toHaveBeenCalledWith(payload)
    expect(upsertLegacyTradingPoliciesMock).not.toHaveBeenCalled()
  })

  it("PUT legacy branch updates old policy keys and returns message plus policies", async () => {
    listTradingPoliciesMock.mockResolvedValueOnce([
      basePolicy,
      {
        ...basePolicy,
        id: "legacy-negative-pnl-close-delay",
        source: "legacy",
        readOnly: true,
      },
    ])
    getLegacyTradingPoliciesMock.mockResolvedValueOnce({
      negativePnlCloseDelayEnabled: false,
      negativePnlCloseDelayMinutes: 5,
      source: "system_settings",
    })
    upsertLegacyTradingPoliciesMock.mockResolvedValueOnce({
      negativePnlCloseDelayEnabled: true,
      negativePnlCloseDelayMinutes: 20,
      source: "system_settings",
    })

    const req = new Request("http://localhost/api/admin/risk/policies", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        negativePnlCloseDelayEnabled: true,
        negativePnlCloseDelayMinutes: 20,
      }),
    })

    const res = await PUT(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      message: "Legacy policy keys updated",
      policies: expect.any(Array),
      legacyPolicy: {
        negativePnlCloseDelayEnabled: true,
        negativePnlCloseDelayMinutes: 20,
      },
    })
    expect(updateTradingPolicyMock).not.toHaveBeenCalled()
    expect(getLegacyTradingPoliciesMock).toHaveBeenCalledWith({ maxAgeMs: 0 })
    expect(upsertLegacyTradingPoliciesMock).toHaveBeenCalledWith({
      negativePnlCloseDelayEnabled: true,
      negativePnlCloseDelayMinutes: 20,
    })
  })

  it("DELETE requires id from query/body and returns success for both paths", async () => {
    const missingIdReq = new Request("http://localhost/api/admin/risk/policies", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const missingIdRes = await DELETE(missingIdReq)
    const missingIdBody = await missingIdRes.json()
    expect(missingIdRes.status).toBe(500)
    expect(missingIdBody).toMatchObject({
      success: false,
      error: "Policy id is required",
    })
    expect(deleteTradingPolicyMock).not.toHaveBeenCalled()

    const queryReq = new Request("http://localhost/api/admin/risk/policies?id=policy-1", { method: "DELETE" })
    const queryRes = await DELETE(queryReq)
    expect(queryRes.status).toBe(200)
    await expect(queryRes.json()).resolves.toMatchObject({
      success: true,
      deletedPolicy: expect.objectContaining({ id: "policy-1" }),
    })
    expect(deleteTradingPolicyMock).toHaveBeenCalledWith("policy-1")

    const bodyReq = new Request("http://localhost/api/admin/risk/policies", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "policy-body-1" }),
    })
    deleteTradingPolicyMock.mockResolvedValueOnce({ ...basePolicy, id: "policy-body-1" })
    const bodyRes = await DELETE(bodyReq)
    expect(bodyRes.status).toBe(200)
    await expect(bodyRes.json()).resolves.toMatchObject({
      success: true,
      deletedPolicy: expect.objectContaining({ id: "policy-body-1" }),
    })
    expect(deleteTradingPolicyMock).toHaveBeenCalledWith("policy-body-1")
  })
})
