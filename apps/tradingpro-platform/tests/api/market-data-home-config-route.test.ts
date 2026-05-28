/**
 * @file tests/api/market-data-home-config-route.test.ts
 * @module tests-api
 * @description Route tests for merged Home config API (`/api/market-data/home-config`).
 * @author StockTrade
 * @created 2026-02-17
 */

const authMock = jest.fn()
jest.mock("@/auth", () => ({
  auth: (...args: any[]) => authMock(...args),
}))

const resolveHomeDashboardConfigMock = jest.fn()
const upsertUserHomeDashboardOverrideMock = jest.fn()
const resetUserHomeDashboardOverrideMock = jest.fn()
jest.mock("@/lib/server/home-dashboard-config", () => ({
  resolveHomeDashboardConfig: (...args: any[]) => resolveHomeDashboardConfigMock(...args),
  upsertUserHomeDashboardOverride: (...args: any[]) => upsertUserHomeDashboardOverrideMock(...args),
  resetUserHomeDashboardOverride: (...args: any[]) => resetUserHomeDashboardOverrideMock(...args),
}))

import { DELETE, GET, PUT } from "@/app/api/market-data/home-config/route"

describe("/api/market-data/home-config", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authMock.mockResolvedValue(null)
    resolveHomeDashboardConfigMock.mockResolvedValue({
      config: {
        tickerTapeSymbols: ["NSE:NIFTY"],
        chartSymbol: "NSE:NIFTY",
        enabledWidgets: {
          tickerTape: true,
          chart: true,
          heatmap: true,
          screener: true,
          topMovers: true,
          marketStats: true,
        },
        defaultSectors: ["IT"],
      },
      hasGlobalConfig: true,
      hasUserOverride: false,
      isDefault: false,
    })
    upsertUserHomeDashboardOverrideMock.mockResolvedValue(undefined)
    resetUserHomeDashboardOverrideMock.mockResolvedValue(undefined)
  })

  it("GET resolves merged config even for unauthenticated viewers", async () => {
    const req = new Request("http://localhost/api/market-data/home-config", { method: "GET" })
    const res = await GET(req as any)

    expect(res.status).toBe(200)
    expect(resolveHomeDashboardConfigMock).toHaveBeenCalledWith(undefined)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      isDefault: false,
      meta: { hasGlobalConfig: true, hasUserOverride: false },
    })
  })

  it("PUT returns 401 when user is unauthenticated", async () => {
    const req = new Request("http://localhost/api/market-data/home-config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ override: { tickerTapeSymbols: ["NSE:SBIN"] } }),
    })

    const res = await PUT(req as any)
    expect(res.status).toBe(401)
    expect(upsertUserHomeDashboardOverrideMock).not.toHaveBeenCalled()
  })

  it("PUT persists authenticated user override and returns merged config", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    resolveHomeDashboardConfigMock.mockResolvedValueOnce({
      config: {
        tickerTapeSymbols: ["NSE:SBIN"],
        chartSymbol: "NSE:SBIN",
        enabledWidgets: {
          tickerTape: true,
          chart: true,
          heatmap: false,
          screener: true,
          topMovers: true,
          marketStats: true,
        },
        defaultSectors: ["BANKING"],
      },
      hasGlobalConfig: true,
      hasUserOverride: true,
      isDefault: false,
    })

    const req = new Request("http://localhost/api/market-data/home-config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ override: { tickerTapeSymbols: ["NSE:SBIN"] } }),
    })
    const res = await PUT(req as any)

    expect(res.status).toBe(200)
    expect(upsertUserHomeDashboardOverrideMock).toHaveBeenCalledWith("user-1", {
      tickerTapeSymbols: ["NSE:SBIN"],
    })
    expect(resolveHomeDashboardConfigMock).toHaveBeenCalledWith("user-1")
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      meta: { hasUserOverride: true },
    })
  })

  it("DELETE resets authenticated user override", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } })

    const req = new Request("http://localhost/api/market-data/home-config", { method: "DELETE" })
    const res = await DELETE(req as any)

    expect(res.status).toBe(200)
    expect(resetUserHomeDashboardOverrideMock).toHaveBeenCalledWith("user-2")
    expect(resolveHomeDashboardConfigMock).toHaveBeenCalledWith("user-2")
  })
})
