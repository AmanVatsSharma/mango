/**
 * File:        tests/server/position-instrument-resolution-canonical.test.ts
 * Module:      Tests · Server · Position Instrument Resolution · Canonical Symbol Threading
 * Purpose:     Lock the post-2026-05 behaviour of `resolvePositionRowSubscriptionIdentity`
 *              so backend subscription keys MATCH what the frontend's
 *              `WebSocketMarketDataProvider` produces — i.e. canonical "EX:SYM" wins over
 *              numeric/exchange-qualified forms when no `uirId` is set. Pre-fix the resolver
 *              ignored `canonicalSymbol`, the backend emitted everything as `instruments[]`
 *              while the frontend emitted canonical strings as `symbols[]`, the upstream
 *              gateway treated them as separate subscriptions, and orders failed with
 *              "stale quote at execution time" because the backend's socket never got ticks.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/lib/server/position-instrument-resolution — system under test
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - uirId always wins (numeric, goes to `instruments[]` upstream).
 *   - canonicalSymbol takes priority over exchange-qualified instrumentId when uirId is null.
 *   - canonicalSymbol from the position row beats canonicalSymbol from the stock row.
 *   - When neither uirId nor canonicalSymbol is set, the resolver still falls through to
 *     the prior exchange-qualified / numeric token shape — backwards-compatible.
 *
 * Read order:
 *   1. The "uirId wins" describe — guarantees we don't regress the priority order.
 *   2. The "canonical wins over exchange-qualified" describe — the new behaviour.
 *   3. The "fallbacks" describe — proves the change is additive.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

import { resolvePositionRowSubscriptionIdentity } from "@/lib/server/position-instrument-resolution"

describe("resolvePositionRowSubscriptionIdentity — canonicalSymbol threading", () => {
  describe("uirId wins (highest priority — gateway emits ticks indexed by uirId)", () => {
    it("returns numeric uirId even when canonicalSymbol is also set on the position row", () => {
      const out = resolvePositionRowSubscriptionIdentity(
        {
          token: 738561,
          uirId: 999_001,
          instrumentId: "NSE-738561",
          segment: "NSE",
          exchange: "NSE",
          canonicalSymbol: "NSE:RELIANCE",
        },
        null,
      )
      expect(out.subscriptionKey).toBe(999_001)
    })

    it("uses uirId from the stock row when the position row has none", () => {
      const out = resolvePositionRowSubscriptionIdentity(
        {
          token: 738561,
          instrumentId: "NSE-738561",
          segment: "NSE",
          exchange: "NSE",
        },
        {
          token: 738561,
          uirId: 999_002,
          canonicalSymbol: "NSE:RELIANCE",
        },
      )
      expect(out.subscriptionKey).toBe(999_002)
    })
  })

  describe("canonicalSymbol wins when uirId is missing (was the regression — backend silently fell through to instruments[])", () => {
    it("returns canonical 'NSE:RELIANCE' when only canonicalSymbol is on the position row", () => {
      const out = resolvePositionRowSubscriptionIdentity(
        {
          token: 738561,
          instrumentId: "NSE-738561",
          segment: "NSE",
          exchange: "NSE",
          canonicalSymbol: "NSE:RELIANCE",
        },
        null,
      )
      expect(out.subscriptionKey).toBe("NSE:RELIANCE")
      expect(out.isCanonical).toBe(true)
    })

    it("returns canonical 'BSE_FO:SENSEX25MAY80000CE' for new derivative venue rows", () => {
      const out = resolvePositionRowSubscriptionIdentity(
        {
          token: 12345,
          segment: "BSE_FO",
          exchange: "BSE_FO",
          canonicalSymbol: "BSE_FO:SENSEX25MAY80000CE",
        },
        null,
      )
      expect(out.subscriptionKey).toBe("BSE_FO:SENSEX25MAY80000CE")
    })

    it("returns canonical 'NCO:CASTOR25JUNFUT' for commodity rows", () => {
      const out = resolvePositionRowSubscriptionIdentity(
        {
          token: 67890,
          segment: "NCO_FO",
          exchange: "NCO",
          canonicalSymbol: "NCO:CASTOR25JUNFUT",
        },
        null,
      )
      expect(out.subscriptionKey).toBe("NCO:CASTOR25JUNFUT")
    })

    it("falls back to canonicalSymbol on the stock row when the position row has none", () => {
      const out = resolvePositionRowSubscriptionIdentity(
        {
          token: 738561,
          instrumentId: "NSE-738561",
          segment: "NSE",
          exchange: "NSE",
        },
        {
          token: 738561,
          canonicalSymbol: "NSE:RELIANCE",
        },
      )
      expect(out.subscriptionKey).toBe("NSE:RELIANCE")
    })

    it("position-row canonical beats stock-row canonical (mirrors the position-first authority)", () => {
      const out = resolvePositionRowSubscriptionIdentity(
        {
          token: 738561,
          canonicalSymbol: "BSE:RELIANCE",
        },
        {
          token: 738561,
          canonicalSymbol: "NSE:RELIANCE",
        },
      )
      expect(out.subscriptionKey).toBe("BSE:RELIANCE")
    })
  })

  describe("backwards-compatible fallbacks (rows without canonicalSymbol or uirId still work)", () => {
    it("returns exchange-qualified key when only instrumentId+segment is set (resolver maps NSE → NSE_EQ)", () => {
      const out = resolvePositionRowSubscriptionIdentity(
        {
          token: 12345,
          instrumentId: "NSE-12345",
          segment: "NSE",
          exchange: "NSE",
        },
        null,
      )
      expect(typeof out.subscriptionKey).toBe("string")
      // Either prefix-mapped form is acceptable; the contract is "no canonical, no uirId
      // → numeric/exchange-qualified key that goes to instruments[]".
      expect(String(out.subscriptionKey)).toMatch(/^NSE(_EQ)?-12345$/)
    })

    it("returns numeric token when nothing else is set", () => {
      const out = resolvePositionRowSubscriptionIdentity({ token: 738561 }, null)
      expect(out.subscriptionKey).toBe(738561)
    })

    it("returns null when neither row has any resolvable identity", () => {
      const out = resolvePositionRowSubscriptionIdentity({}, null)
      expect(out.subscriptionKey).toBeNull()
    })
  })

  describe("string trimming — empty/whitespace canonicalSymbol does NOT short-circuit the fallback", () => {
    it("ignores empty canonicalSymbol and falls back to exchange-qualified", () => {
      const out = resolvePositionRowSubscriptionIdentity(
        {
          token: 12345,
          instrumentId: "NSE-12345",
          segment: "NSE",
          canonicalSymbol: "   ",
        },
        null,
      )
      expect(out.subscriptionKey).not.toBe("   ")
      expect(out.subscriptionKey).not.toBeNull()
      expect(String(out.subscriptionKey)).toMatch(/^NSE(_EQ)?-12345$/)
    })
  })
})
