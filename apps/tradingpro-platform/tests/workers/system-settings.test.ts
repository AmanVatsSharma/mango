/**
 * @file tests/workers/system-settings.test.ts
 * @module tests-workers
 * @description Unit tests for worker system-settings normalization and parsing helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

const findManyMock = jest.fn()
const findFirstMock = jest.fn()
const updateMock = jest.fn()
const updateManyMock = jest.fn()
const createMock = jest.fn()
const transactionMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    systemSettings: {
      findMany: (...args: any[]) => findManyMock(...args),
    },
    $transaction: (...args: any[]) => transactionMock(...args),
  },
}))

import { getLatestActiveGlobalSettings, parseBooleanSetting, upsertGlobalSetting } from "@/lib/server/workers/system-settings"

describe("workers system-settings helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findManyMock.mockResolvedValue([])
    findFirstMock.mockResolvedValue(null)
    updateMock.mockResolvedValue({})
    updateManyMock.mockResolvedValue({})
    createMock.mockResolvedValue({})
    transactionMock.mockImplementation(async (callback: any) =>
      callback({
        systemSettings: {
          findFirst: findFirstMock,
          update: updateMock,
          updateMany: updateManyMock,
          create: createMock,
        },
      }),
    )
  })

  it("parses boolean setting values with trim/case and numeric aliases", () => {
    expect(parseBooleanSetting(" true ")).toBe(true)
    expect(parseBooleanSetting("YES")).toBe(true)
    expect(parseBooleanSetting("1")).toBe(true)
    expect(parseBooleanSetting("On")).toBe(true)
    expect(parseBooleanSetting("Y")).toBe(true)
    expect(parseBooleanSetting("t")).toBe(true)
    expect(parseBooleanSetting("enabled")).toBe(true)

    expect(parseBooleanSetting(" false ")).toBe(false)
    expect(parseBooleanSetting("NO")).toBe(false)
    expect(parseBooleanSetting("0")).toBe(false)
    expect(parseBooleanSetting("off")).toBe(false)
    expect(parseBooleanSetting("N")).toBe(false)
    expect(parseBooleanSetting("f")).toBe(false)
    expect(parseBooleanSetting("disabled")).toBe(false)

    expect(parseBooleanSetting("maybe")).toBeNull()
    expect(parseBooleanSetting("   ")).toBeNull()
    expect(parseBooleanSetting(null)).toBeNull()
  })

  it("normalizes requested keys in latest-setting lookup", async () => {
    const now = new Date("2026-02-16T00:00:00.000Z")
    findManyMock.mockResolvedValue([
      { key: "worker_order_execution_enabled", value: "true", updatedAt: now },
      { key: "worker_risk_monitoring_enabled", value: "false", updatedAt: now },
    ])

    const result = await getLatestActiveGlobalSettings([
      " worker_order_execution_enabled ",
      "",
      "worker_order_execution_enabled",
      "   ",
      "worker_risk_monitoring_enabled",
    ])

    const queriedKeys = findManyMock.mock.calls[0]?.[0]?.where?.key?.in
    expect(queriedKeys).toEqual(["worker_order_execution_enabled", "worker_risk_monitoring_enabled"])
    expect(result.get("worker_order_execution_enabled")?.value).toBe("true")
    expect(result.get("worker_risk_monitoring_enabled")?.value).toBe("false")
  })

  it("normalizes and validates keys before upsert", async () => {
    findFirstMock.mockResolvedValue({ id: "setting-1" })

    await upsertGlobalSetting({
      key: " worker_order_execution_enabled ",
      value: "true",
      category: "SYSTEM",
    })

    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          key: "worker_order_execution_enabled",
        }),
      }),
    )
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          key: "worker_order_execution_enabled",
        }),
      }),
    )

    await expect(
      upsertGlobalSetting({
        key: "   ",
        value: "true",
      }),
    ).rejects.toThrow("Invalid global setting key")

    expect(transactionMock).toHaveBeenCalledTimes(1)
  })
})

