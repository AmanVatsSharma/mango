/**
 * @file tests/api/admin-cleanup-automation-route.test.ts
 * @module tests-api
 * @description Route-level coverage for /api/admin/cleanup/automation read/write behavior.
 * @author StockTrade
 * @created 2026-02-17
 */

const getCleanupAutoRunnerConfigMock = jest.fn()
const getLatestActiveGlobalSettingsMock = jest.fn()
const upsertGlobalSettingMock = jest.fn()

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: async (_req: Request, _opts: any, handler: any) => {
    try {
      return await handler({
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
      })
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message || "failed",
        }),
        { status: error?.statusCode || 500, headers: { "content-type": "application/json" } },
      )
    }
  },
}))

jest.mock("@/lib/server/workers/cleanup-auto-runner", () => ({
  getCleanupAutoRunnerConfig: (...args: any[]) => getCleanupAutoRunnerConfigMock(...args),
}))

jest.mock("@/lib/server/workers/system-settings", () => ({
  getLatestActiveGlobalSettings: (...args: any[]) => getLatestActiveGlobalSettingsMock(...args),
  upsertGlobalSetting: (...args: any[]) => upsertGlobalSettingMock(...args),
  parseBooleanSetting: (value: string | null | undefined) => {
    if (value == null) return null
    const normalized = value.trim().toLowerCase()
    if (["true", "1", "yes", "on", "enabled", "y", "t"].includes(normalized)) return true
    if (["false", "0", "no", "off", "disabled", "n", "f"].includes(normalized)) return false
    return null
  },
}))

import { GET, POST } from "@/app/api/admin/cleanup/automation/route"

describe("/api/admin/cleanup/automation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getCleanupAutoRunnerConfigMock.mockResolvedValue({
      enabled: true,
      retentionDays: 0,
      dailyRunHourIst: 6,
      lastRunDateIst: "2026-02-17",
    })
    getLatestActiveGlobalSettingsMock.mockResolvedValue(
      new Map([
        [
          "cleanup_last_run_summary",
          {
            value: JSON.stringify({
              source: "cron_order_worker",
              deletedOrders: 11,
              deletedPositions: 6,
            }),
          },
        ],
      ]),
    )
    upsertGlobalSettingMock.mockResolvedValue(undefined)
  })

  it("returns cleanup automation config and parsed summary", async () => {
    const req = new Request("http://localhost/api/admin/cleanup/automation", { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      automation: {
        enabled: true,
        retentionDays: 0,
        dailyRunHourIst: 6,
        lastRunDateIst: "2026-02-17",
        summary: {
          source: "cron_order_worker",
          deletedOrders: 11,
          deletedPositions: 6,
        },
      },
    })
  })

  it("persists automation settings and returns refreshed snapshot", async () => {
    const req = new Request("http://localhost/api/admin/cleanup/automation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        retentionDays: 2,
        dailyRunHourIst: 5,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      automation: {
        enabled: true,
      },
    })

    expect(upsertGlobalSettingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "cleanup_auto_enabled",
        value: "true",
      }),
    )
    expect(upsertGlobalSettingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "cleanup_retention_days",
        value: "2",
      }),
    )
    expect(upsertGlobalSettingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "cleanup_daily_run_hour_ist",
        value: "5",
      }),
    )
  })
})
