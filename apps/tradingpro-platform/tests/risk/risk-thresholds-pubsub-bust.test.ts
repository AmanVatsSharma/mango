/**
 * File:        tests/risk/risk-thresholds-pubsub-bust.test.ts
 * Module:      Risk · risk-thresholds · Trading-z9b cross-container bust
 * Purpose:     Locks in Trading-z9b: upsertRiskThresholds publishes the new values via the
 *              Redis pub/sub channel (mocked here) AND clears the local in-process cache so
 *              the next read serves the new values without waiting for the 60s TTL.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: mocks @/lib/services/risk/risk-config-pubsub and
 *               @/lib/server/workers/system-settings; resets module state between tests.
 *
 * Key invariants:
 *   - upsertRiskThresholds writes both keys via upsertGlobalSetting
 *   - upsertRiskThresholds calls publishRiskThresholdsChanged with the reconciled values
 *   - the next getRiskThresholds returns the updated values (cache was cleared on upsert)
 *   - bustRiskThresholdsCache() exposed and works without going through upsert
 *
 * Read order:
 *   1. mock setup
 *   2. publish-on-write test
 *   3. cache-cleared-after-write test
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

const upsertGlobalSettingMock = jest.fn(async () => undefined)
const getLatestActiveGlobalSettingsMock = jest.fn()
const publishRiskThresholdsChangedMock = jest.fn(async () => undefined)
const subscribeRiskThresholdsChangedMock = jest.fn(async () => () => undefined)

jest.mock("@/lib/server/workers/system-settings", () => ({
  upsertGlobalSetting: (...args: any[]) => upsertGlobalSettingMock(...args),
  getLatestActiveGlobalSettings: (...args: any[]) => getLatestActiveGlobalSettingsMock(...args),
}))

jest.mock("@/lib/services/risk/risk-config-pubsub", () => ({
  publishRiskThresholdsChanged: (...args: any[]) => publishRiskThresholdsChangedMock(...args),
  subscribeRiskThresholdsChanged: (...args: any[]) => subscribeRiskThresholdsChangedMock(...args),
  publishRiskConfigChanged: jest.fn(async () => undefined),
  subscribeRiskConfigChanged: jest.fn(async () => () => undefined),
  RISK_CONFIG_CHANNEL: "risk-config:changed",
  RISK_THRESHOLDS_CHANNEL: "risk-thresholds:changed",
}))

import {
  getRiskThresholds,
  upsertRiskThresholds,
  bustRiskThresholdsCache,
} from "@/lib/services/risk/risk-thresholds"

beforeEach(() => {
  jest.clearAllMocks()
  bustRiskThresholdsCache()
  // Default: SystemSettings returns nothing → fall through to defaults
  getLatestActiveGlobalSettingsMock.mockResolvedValue(new Map())
})

describe("risk-thresholds — Trading-z9b cross-container bust", () => {
  it("upsertRiskThresholds publishes a Redis bust event with the reconciled values", async () => {
    await upsertRiskThresholds({ warningThreshold: 0.6, autoCloseThreshold: 0.7 })
    expect(publishRiskThresholdsChangedMock).toHaveBeenCalledTimes(1)
    expect(publishRiskThresholdsChangedMock).toHaveBeenCalledWith({
      warningThreshold: 0.6,
      autoCloseThreshold: 0.7,
    })
  })

  it("getRiskThresholds AFTER an upsert returns the new values immediately (no 60s wait)", async () => {
    // First read seeds the cache with defaults
    const initial = await getRiskThresholds()
    expect(initial.source).toBe("default")

    // Admin upserts new lower thresholds — this should clear the cache
    await upsertRiskThresholds({ warningThreshold: 0.4, autoCloseThreshold: 0.5 })

    // Next read should reflect the upsert. Note: upsert sets the cache directly, so the
    // next getRiskThresholds returns the cached upserted value WITHOUT calling
    // getLatestActiveGlobalSettings again.
    const afterUpsert = await getRiskThresholds()
    expect(afterUpsert.warningThreshold).toBeCloseTo(0.4)
    expect(afterUpsert.autoCloseThreshold).toBeCloseTo(0.5)
    expect(afterUpsert.source).toBe("system_settings")
  })

  it("bustRiskThresholdsCache() forces the next read to re-fetch from SystemSettings", async () => {
    // Seed cache with defaults
    await getRiskThresholds()
    expect(getLatestActiveGlobalSettingsMock).toHaveBeenCalledTimes(1)

    // Within TTL, second read is cached
    await getRiskThresholds()
    expect(getLatestActiveGlobalSettingsMock).toHaveBeenCalledTimes(1)

    // Bust → next read fetches again
    bustRiskThresholdsCache()
    await getRiskThresholds()
    expect(getLatestActiveGlobalSettingsMock).toHaveBeenCalledTimes(2)
  })

  it("upsert reconciliation enforces autoClose >= warning before publishing", async () => {
    // Admin tries to set autoClose < warning → reconciler raises autoClose to warning
    await upsertRiskThresholds({ warningThreshold: 0.8, autoCloseThreshold: 0.5 })
    expect(publishRiskThresholdsChangedMock).toHaveBeenCalledWith({
      warningThreshold: 0.8,
      autoCloseThreshold: 0.8, // raised to match warning
    })
  })
})
