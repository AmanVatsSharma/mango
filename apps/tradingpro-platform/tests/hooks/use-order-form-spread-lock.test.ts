/**
 * File:        tests/hooks/use-order-form-spread-lock.test.ts
 * Module:      tests · hooks
 * Purpose:     Regression test for the spread-lock gate in `useOrderForm`. The
 *              displayed spread MUST be locked from the moment the order sheet
 *              opens until it closes — admin-saved spread changes that arrive
 *              while the sheet is open MUST NOT re-roll the locked value, or
 *              the user would pay a different price than they saw.
 *
 * Exports:     none (test file)
 *
 * Depends on: jest, @/lib/market-display/bid-ask-spread-config.schema
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - "What you see is what you pay": the locked spread persists across
 *     spreadConfig refetches while the sheet is open.
 *   - Closing the sheet resets the lock so the next open draws fresh.
 *
 * Read order:
 *   1. simulateGateRender — pure mirror of the useEffect gate in use-order-form.ts:404
 *   2. tests — drive the simulator through the relevant transitions
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-29
 */

import { pickRandomSpread, type BidAskSpreadConfigV1 } from "@/lib/market-display/bid-ask-spread-config.schema"

/**
 * Pure mirror of the spread-lock effect at lib/hooks/use-order-form.ts:404.
 * Returns the next state given the current state and the just-rendered inputs.
 *
 * The production gate condition is:
 *   if (isOpen && selectedStock && !hasPickedSpreadRef.current) → pick + flag = true
 *   else if (wasOpen && !isOpen)                                → reset + flag = false
 *
 * The boolean flag — not the numeric value — is what distinguishes "not yet picked"
 * from "legitimately picked at 0% markup".
 */
type GateState = { lockedSpread: number; hasPicked: boolean; prevIsOpen: boolean }

function simulateGateRender(
  prev: GateState,
  inputs: {
    isOpen: boolean
    hasSelectedStock: boolean
    spreadConfig: BidAskSpreadConfigV1
    segment: string
  },
): GateState {
  const wasOpen = prev.prevIsOpen
  const next: GateState = { ...prev, prevIsOpen: inputs.isOpen }

  if (inputs.isOpen && inputs.hasSelectedStock && !prev.hasPicked) {
    next.lockedSpread = pickRandomSpread(inputs.spreadConfig, inputs.segment)
    next.hasPicked = true
  } else if (wasOpen && !inputs.isOpen) {
    next.lockedSpread = 0
    next.hasPicked = false
  }
  return next
}

const INITIAL: GateState = { lockedSpread: 0, hasPicked: false, prevIsOpen: false }

const FIXED_NARROW: BidAskSpreadConfigV1 = {
  segments: { NSE_EQ: { min: 0.4, max: 0.4 } }, // single-point so pickRandomSpread is deterministic
}
const FIXED_WIDE: BidAskSpreadConfigV1 = {
  segments: { NSE_EQ: { min: 0.9, max: 0.9 } },
}
const FIXED_ZERO: BidAskSpreadConfigV1 = {
  segments: { NSE_EQ: { min: 0, max: 0 } }, // legitimate "no markup" config
}

describe("use-order-form · spread-lock gate (WYSIWYP invariant)", () => {
  it("picks a spread on the closed→open edge with stock present", () => {
    const after = simulateGateRender(INITIAL, {
      isOpen: true,
      hasSelectedStock: true,
      spreadConfig: FIXED_NARROW,
      segment: "NSE_EQ",
    })
    expect(after.lockedSpread).toBe(0.4)
    expect(after.hasPicked).toBe(true)
    expect(after.prevIsOpen).toBe(true)
  })

  it("picks the spread when selectedStock arrives async after isOpen flipped true", () => {
    // First render: dialog opened but stock not yet loaded — no pick yet.
    const r1 = simulateGateRender(INITIAL, {
      isOpen: true,
      hasSelectedStock: false,
      spreadConfig: FIXED_NARROW,
      segment: "NSE_EQ",
    })
    expect(r1.lockedSpread).toBe(0)
    expect(r1.hasPicked).toBe(false)

    // Second render: stock arrived. Should pick now.
    const r2 = simulateGateRender(r1, {
      isOpen: true,
      hasSelectedStock: true,
      spreadConfig: FIXED_NARROW,
      segment: "NSE_EQ",
    })
    expect(r2.lockedSpread).toBe(0.4)
    expect(r2.hasPicked).toBe(true)
  })

  it("does NOT re-roll when spreadConfig changes mid-open (admin save while sheet visible)", () => {
    const opened = simulateGateRender(INITIAL, {
      isOpen: true,
      hasSelectedStock: true,
      spreadConfig: FIXED_NARROW,
      segment: "NSE_EQ",
    })
    expect(opened.lockedSpread).toBe(0.4)

    // Admin saves a new (wider) config while the sheet is still open. SWR refetch
    // delivers FIXED_WIDE. Effect re-runs. Lock MUST stay at 0.4 — user pays what they saw.
    const afterAdminSave = simulateGateRender(opened, {
      isOpen: true,
      hasSelectedStock: true,
      spreadConfig: FIXED_WIDE,
      segment: "NSE_EQ",
    })
    expect(afterAdminSave.lockedSpread).toBe(0.4)
  })

  it("resets the lock on close so the next open draws fresh from latest config", () => {
    const opened = simulateGateRender(INITIAL, {
      isOpen: true,
      hasSelectedStock: true,
      spreadConfig: FIXED_NARROW,
      segment: "NSE_EQ",
    })
    const closed = simulateGateRender(opened, {
      isOpen: false,
      hasSelectedStock: true,
      spreadConfig: FIXED_NARROW,
      segment: "NSE_EQ",
    })
    expect(closed.lockedSpread).toBe(0)
    expect(closed.hasPicked).toBe(false)
    expect(closed.prevIsOpen).toBe(false)

    // Reopen with a wider config — fresh draw uses the new config.
    const reopened = simulateGateRender(closed, {
      isOpen: true,
      hasSelectedStock: true,
      spreadConfig: FIXED_WIDE,
      segment: "NSE_EQ",
    })
    expect(reopened.lockedSpread).toBe(0.9)
  })

  // Regression — a legitimate 0% spread config must lock at 0 and NOT re-pick when
  // admin later changes the config to a nonzero value while the sheet is still open.
  // (The earlier `lockedSpread === 0` sentinel quietly violated this; the new
  // hasPicked boolean fixes it.)
  it("locks a legitimate 0% spread and does not re-roll when admin later widens it mid-open", () => {
    const opened = simulateGateRender(INITIAL, {
      isOpen: true,
      hasSelectedStock: true,
      spreadConfig: FIXED_ZERO,
      segment: "NSE_EQ",
    })
    expect(opened.lockedSpread).toBe(0)
    expect(opened.hasPicked).toBe(true)

    const afterAdminWiden = simulateGateRender(opened, {
      isOpen: true,
      hasSelectedStock: true,
      spreadConfig: FIXED_WIDE,
      segment: "NSE_EQ",
    })
    expect(afterAdminWiden.lockedSpread).toBe(0)
    expect(afterAdminWiden.hasPicked).toBe(true)
  })
})
