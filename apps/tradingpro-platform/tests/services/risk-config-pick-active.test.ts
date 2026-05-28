/**
 * @file risk-config-pick-active.test.ts
 * @module tests-services
 * @description Unit tests for risk config row precedence picker.
 * @author StockTrade
 * @created 2026-04-08
 */

import { pickActiveRiskConfigRow } from "@/lib/services/risk/risk-config-pick-active"

describe("pickActiveRiskConfigRow", () => {
  it("returns null for empty configs", () => {
    expect(pickActiveRiskConfigRow(["NFO"], ["NRML_OPT_BUY", "NRML_OPT"], [])).toBeNull()
  })

  it("prefers first segment x product pair that exists in configs", () => {
    const configs = [
      { segment: "NFO", productType: "NRML_OPT", leverage: 100 },
      { segment: "NFO", productType: "NRML_OPT_BUY", leverage: 50 },
    ]
    const picked = pickActiveRiskConfigRow(["NFO"], ["NRML_OPT_BUY", "NRML_OPT"], configs)
    expect(picked?.productType).toBe("NRML_OPT_BUY")
    expect(picked?.leverage).toBe(50)
  })

  it("scans segments in order", () => {
    const configs = [{ segment: "FNO", productType: "NRML", leverage: 1 }]
    expect(
      pickActiveRiskConfigRow(["NFO", "FNO"], ["NRML"], configs)?.segment,
    ).toBe("FNO")
  })
})
