/**
 * File:        tests/services/order/order-behavior-emergency-levers.test.ts
 * Module:      Tests · Services · Order · Emergency Levers
 * Purpose:     Lock the schema-default + parse behaviour of the two admin-controlled
 *              emergency levers added on 2026-05-06: `orderBehavior.marketOrder.bypassServerQuote`
 *              and `orderBehavior.limitOrder.disabled`. These flags exist for the case where
 *              the upstream WS feed is mis-routed and the server cannot get fresh ticks but
 *              the frontend can — operator turns them on, MARKET orders execute at client
 *              price, LIMIT orders are rejected at placement, until the feed is fixed.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/lib/market-control/market-control-config.schema — system under test
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - Both flags default to FALSE (safe state — no bypass, no LIMIT block).
 *   - Both flags survive a parseMarketControlConfigJson round-trip.
 *   - DEFAULT_MARKET_CONTROL_CONFIG_V1 carries the safe defaults explicitly so a brand-new
 *     deployment never has the bypass silently absent (which would cause runtime undefined
 *     reads in the placement gate).
 *
 * Read order:
 *   1. The "defaults" describe — locks safe behaviour.
 *   2. The "explicit on" describe — locks the parse path the toggle UI exercises.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

import {
  orderBehaviorSchema,
  DEFAULT_MARKET_CONTROL_CONFIG_V1,
} from "@/lib/market-control/market-control-config.schema"

describe("orderBehavior emergency levers — defaults", () => {
  it("DEFAULT_MARKET_CONTROL_CONFIG_V1 has bypassServerQuote = false (safe state)", () => {
    expect(DEFAULT_MARKET_CONTROL_CONFIG_V1.orderBehavior.marketOrder.bypassServerQuote).toBe(false)
  })

  it("DEFAULT_MARKET_CONTROL_CONFIG_V1 has limitOrder.disabled = false (safe state)", () => {
    expect(DEFAULT_MARKET_CONTROL_CONFIG_V1.orderBehavior.limitOrder.disabled).toBe(false)
  })

  it("orderBehaviorSchema parse with no levers set hydrates both to false", () => {
    const parsed = orderBehaviorSchema.parse({
      marketOrder: {},
      limitOrder: { fillDelayMs: { min: 0, max: 50 } },
    })
    expect(parsed.marketOrder.bypassServerQuote).toBe(false)
    expect(parsed.limitOrder.disabled).toBe(false)
  })
})

describe("orderBehavior emergency levers — explicit ON survives round-trip", () => {
  it("bypassServerQuote=true is preserved", () => {
    const parsed = orderBehaviorSchema.parse({
      marketOrder: { bypassServerQuote: true },
      limitOrder: { fillDelayMs: { min: 0, max: 50 } },
    })
    expect(parsed.marketOrder.bypassServerQuote).toBe(true)
    // The other safe defaults must NOT be flipped on by setting bypass — separate flags.
    expect(parsed.marketOrder.rejectOnStaleQuote).toBe(true)
    expect(parsed.marketOrder.rejectOnKillSwitch).toBe(true)
  })

  it("limitOrder.disabled=true is preserved without affecting other limit-order fields", () => {
    const parsed = orderBehaviorSchema.parse({
      marketOrder: {},
      limitOrder: { disabled: true, fillDelayMs: { min: 0, max: 50 } },
    })
    expect(parsed.limitOrder.disabled).toBe(true)
    // Realistic-fill knobs are independent — must keep their defaults, not silently zero out.
    expect(parsed.limitOrder.marketability).toBe("ask_bid")
    expect(parsed.limitOrder.expireAfterMin).toBeGreaterThan(0)
  })

  it("both levers can be ON simultaneously (the canonical 'feed broken' configuration)", () => {
    const parsed = orderBehaviorSchema.parse({
      marketOrder: { bypassServerQuote: true },
      limitOrder: { disabled: true, fillDelayMs: { min: 0, max: 50 } },
    })
    expect(parsed.marketOrder.bypassServerQuote).toBe(true)
    expect(parsed.limitOrder.disabled).toBe(true)
  })
})
