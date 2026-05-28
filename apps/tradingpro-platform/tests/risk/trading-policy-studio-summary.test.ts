/**
 * @file trading-policy-studio-summary.test.ts
 * @module tests-risk
 * @description Unit tests for extracted policy studio compile path and plain-language summaries.
 * @author StockTrade
 * @created 2026-03-30
 */

import {
  compilePolicyDraftFromStudioDraft,
  createDefaultPolicyStudioDraft,
} from "@/components/admin-console/risk-management/trading-policy-studio-state"
import {
  previewPolicyFromDraft,
  summarizePolicyPlainLine,
  summarizePolicyPlainBullets,
} from "@/components/admin-console/risk-management/trading-policy-plain-summary"
import { getTradingPolicyCatalog } from "@/lib/services/risk/dynamic-trading-policies"
import type { TradingPolicyDefinition } from "@/components/admin-console/risk-management/trading-policy-types"

describe("trading policy studio (extracted)", () => {
  it("compiles default BUY_ABOVE_LTP_OFFSET preset to non-empty conditions", () => {
    const draft = createDefaultPolicyStudioDraft("BUY_ABOVE_LTP_OFFSET")
    const catalog = getTradingPolicyCatalog()
    const compiled = compilePolicyDraftFromStudioDraft(draft, catalog)
    expect(compiled.conditions.length).toBeGreaterThan(0)
    expect(compiled.context).toBe("ORDER_PLACE")
    expect(compiled.action.type).toBe("BLOCK")
  })

  it("plain-line summary mentions template for preset-like policy", () => {
    const fake: TradingPolicyDefinition = {
      id: "t1",
      name: "Test",
      description: "",
      context: "ORDER_PLACE",
      enabled: true,
      priority: 100,
      matchType: "ALL",
      conditions: [
        { id: "c1", field: "order.side", operator: "EQ", value: "BUY" },
        { id: "c2", field: "order.priceOffsetFromLtpPercent", operator: "GTE", value: 1 },
      ],
      action: { type: "BLOCK", message: "No." },
      createdAt: "",
      updatedAt: "",
      source: "dynamic",
      readOnly: false,
      metadata: { policyBlueprint: "BUY_ABOVE_LTP_OFFSET" },
    }
    const line = summarizePolicyPlainLine(fake)
    expect(line.toLowerCase()).toContain("buy above")
    expect(line.toLowerCase()).toContain("order")
  })

  it("previewPolicyFromDraft bridges compiled draft to bullet summary", () => {
    const draft = createDefaultPolicyStudioDraft("MIN_AVAILABLE_MARGIN")
    const catalog = getTradingPolicyCatalog()
    const compiled = compilePolicyDraftFromStudioDraft(draft, catalog)
    const bullets = summarizePolicyPlainBullets(previewPolicyFromDraft(compiled))
    expect(bullets.length).toBeGreaterThan(1)
    expect(bullets.some((b) => b.includes("Priority"))).toBe(true)
  })

  it("compiles new strategic order presets with expected condition fields", () => {
    const catalog = getTradingPolicyCatalog()
    const qtyDraft = createDefaultPolicyStudioDraft("MAX_ORDER_QUANTITY_CAP")
    const qtyPol = compilePolicyDraftFromStudioDraft(qtyDraft, catalog)
    expect(qtyPol.conditions.some((c) => c.field === "order.quantity" && c.operator === "GT")).toBe(true)

    const comb = createDefaultPolicyStudioDraft("HIGH_TURNOVER_LOW_BALANCE")
    const combPol = compilePolicyDraftFromStudioDraft(comb, catalog)
    expect(combPol.conditions.some((c) => c.field === "order.turnover")).toBe(true)
    expect(combPol.conditions.some((c) => c.field === "account.balance")).toBe(true)

    const deny = { ...createDefaultPolicyStudioDraft("ORDER_USER_DENYLIST"), userIdDenyCsv: "u1,u2" }
    const denyPol = compilePolicyDraftFromStudioDraft(deny, catalog)
    expect(denyPol.conditions.some((c) => c.field === "meta.userId" && c.operator === "IN")).toBe(true)
  })

  it("compiles new strategic position-close presets including intraday and large-book OR match", () => {
    const catalog = getTradingPolicyCatalog()
    const partial = compilePolicyDraftFromStudioDraft(
      createDefaultPolicyStudioDraft("BLOCK_PARTIAL_POSITION_CLOSE"),
      catalog,
    )
    expect(partial.context).toBe("POSITION_CLOSE")
    expect(
      partial.conditions.some((c) => c.field === "position.remainingQuantityAfterClose" && c.operator === "GT"),
    ).toBe(true)

    const intra = compilePolicyDraftFromStudioDraft(
      createDefaultPolicyStudioDraft("BLOCK_INTRADAY_POSITION_CLOSE"),
      catalog,
    )
    expect(intra.conditions.some((c) => c.field === "position.isIntraday" && c.operator === "EQ")).toBe(true)

    const large = compilePolicyDraftFromStudioDraft(
      createDefaultPolicyStudioDraft("BLOCK_CLOSE_LARGE_POSITION"),
      catalog,
    )
    expect(large.matchType).toBe("ANY")
    expect(large.conditions.filter((c) => c.field === "position.quantity").length).toBe(2)
  })
})
