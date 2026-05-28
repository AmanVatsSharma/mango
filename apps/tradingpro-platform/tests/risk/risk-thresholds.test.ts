/**
 * @file risk-thresholds.test.ts
 * @module tests/risk
 * @description Unit tests for SystemSettings-backed risk thresholds helper.
 * @author StockTrade
 * @created 2026-02-13
 */

jest.mock("@/lib/server/workers/system-settings", () => {
  return {
    getLatestActiveGlobalSettings: jest.fn(async () => new Map()),
    upsertGlobalSetting: jest.fn(async () => {}),
  }
})

import {
  getRiskThresholds,
  upsertRiskThresholds,
  RISK_AUTO_CLOSE_THRESHOLD_KEY,
  RISK_WARNING_THRESHOLD_KEY,
  DEFAULT_RISK_UTILIZATION_THRESHOLDS,
} from "@/lib/services/risk/risk-thresholds"

const systemSettingsMock = jest.requireMock("@/lib/server/workers/system-settings") as {
  getLatestActiveGlobalSettings: jest.Mock
  upsertGlobalSetting: jest.Mock
}

describe("risk-thresholds", () => {
  it("exports product default utilization thresholds 75% / 80%", () => {
    expect(DEFAULT_RISK_UTILIZATION_THRESHOLDS.warningThreshold).toBeCloseTo(0.75, 8)
    expect(DEFAULT_RISK_UTILIZATION_THRESHOLDS.autoCloseThreshold).toBeCloseTo(0.8, 8)
  })

  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    delete (globalThis as any).__riskThresholdsCache
    process.env = { ...originalEnv }
    delete process.env.RISK_WARNING_THRESHOLD
    delete process.env.RISK_AUTO_CLOSE_THRESHOLD
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("uses SystemSettings when both keys exist", async () => {
    systemSettingsMock.getLatestActiveGlobalSettings.mockResolvedValueOnce(
      new Map([
        [RISK_WARNING_THRESHOLD_KEY, { key: RISK_WARNING_THRESHOLD_KEY, value: "0.75", updatedAt: new Date() }],
        [RISK_AUTO_CLOSE_THRESHOLD_KEY, { key: RISK_AUTO_CLOSE_THRESHOLD_KEY, value: "0.9", updatedAt: new Date() }],
      ]),
    )

    const t = await getRiskThresholds({ maxAgeMs: 0 })
    expect(t.source).toBe("system_settings")
    expect(t.warningThreshold).toBeCloseTo(0.75, 8)
    expect(t.autoCloseThreshold).toBeCloseTo(0.9, 8)
  })

  it("accepts percent values (0..100) and reconciles autoClose >= warning", async () => {
    systemSettingsMock.getLatestActiveGlobalSettings.mockResolvedValueOnce(
      new Map([
        [RISK_WARNING_THRESHOLD_KEY, { key: RISK_WARNING_THRESHOLD_KEY, value: "90", updatedAt: new Date() }],
        [RISK_AUTO_CLOSE_THRESHOLD_KEY, { key: RISK_AUTO_CLOSE_THRESHOLD_KEY, value: "80", updatedAt: new Date() }],
      ]),
    )

    const t = await getRiskThresholds({ maxAgeMs: 0 })
    expect(t.source).toBe("system_settings")
    expect(t.warningThreshold).toBeCloseTo(0.9, 8)
    // autoClose is reconciled up to warning
    expect(t.autoCloseThreshold).toBeCloseTo(0.9, 8)
  })

  it("falls back to env when SystemSettings keys missing", async () => {
    systemSettingsMock.getLatestActiveGlobalSettings.mockResolvedValueOnce(new Map())
    process.env.RISK_WARNING_THRESHOLD = "0.7"
    process.env.RISK_AUTO_CLOSE_THRESHOLD = "0.85"

    const t = await getRiskThresholds({ maxAgeMs: 0 })
    expect(t.source).toBe("env")
    expect(t.warningThreshold).toBeCloseTo(0.7, 8)
    expect(t.autoCloseThreshold).toBeCloseTo(0.85, 8)
  })

  it("uses defaults when neither SystemSettings nor env are present", async () => {
    systemSettingsMock.getLatestActiveGlobalSettings.mockResolvedValueOnce(new Map())
    const t = await getRiskThresholds({ maxAgeMs: 0 })
    expect(t.source).toBe("default")
    expect(t.warningThreshold).toBeCloseTo(0.75, 8)
    expect(t.autoCloseThreshold).toBeCloseTo(0.8, 8)
  })

  it("upserts both keys and returns system_settings source", async () => {
    const t = await upsertRiskThresholds({ warningThreshold: 0.77, autoCloseThreshold: 0.88 })
    expect(t.source).toBe("system_settings")
    expect(systemSettingsMock.upsertGlobalSetting).toHaveBeenCalledTimes(2)

    const calls = systemSettingsMock.upsertGlobalSetting.mock.calls.map((c) => c[0])
    expect(calls.some((c) => c.key === RISK_WARNING_THRESHOLD_KEY)).toBe(true)
    expect(calls.some((c) => c.key === RISK_AUTO_CLOSE_THRESHOLD_KEY)).toBe(true)
  })
})

