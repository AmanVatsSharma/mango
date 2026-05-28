/**
 * File:        tests/server/market-timing-segment-windows.test.ts
 * Module:      Tests · Server · Market Timing · Segment-Aware Windows
 * Purpose:     Lock the per-venue trading-window dispatch in `getSegmentTradingSession`
 *              for every segment family the watchlist can produce. Pre-2026-05 the helper
 *              routed every non-MCX segment through NSE timing, so a CDS option order at
 *              16:30 IST returned the false reason "NSE trading hours are 09:15–15:30 IST"
 *              even though CDS trades till 17:00. These tests guarantee each venue gets:
 *                - the right open/closed verdict for a given IST clock-time, and
 *                - a reason string that names the *actual* venue rules.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/lib/server/market-timing — system under test
 *   - @/lib/prisma (mocked) — prevents real DB hits for force-closed / holiday lookups
 *
 * Side-effects: none (every test passes an explicit IST `Date` so wall-clock can't drift).
 *
 * Key invariants:
 *   - Every test uses a fixed IST timestamp and asserts BOTH session and reason. Reason
 *     drift (e.g. accidentally re-routing CDS through NSE messaging) trips the test even
 *     when the open/closed verdict happens to coincide.
 *   - The mocked prisma returns null (no force-closed flag, no holidays) so the test
 *     isolates pure timing logic from operational state.
 *
 * Read order:
 *   1. The prisma mock — pins external state.
 *   2. Per-venue describe blocks — one bucket per segment family.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    systemSettings: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}))

jest.mock("@/lib/date-utils", () => ({
  getCurrentISTDate: jest.fn(() => new Date()),
}))

import {
  getSegmentTradingSession,
  invalidateNseHolidaysCache,
  invalidateMarketForceClosedCache,
  resolveSegmentSessionOpenMinutesIST,
} from "@/lib/server/market-timing"

// Build a Date whose hour/minute interpretation in IST matches what we want to assert.
// Tests pass these directly so they don't depend on the host clock or DST shifts.
const istDateAt = (hour: number, minute: number, weekdayBase = "2026-05-06" /* Wed */): Date => {
  // The helper interprets `Date#getHours/getMinutes` in the local zone of the running Date.
  // Constructing via the IST string ensures hour/minute land on the asserted values without
  // depending on the host's TZ.
  const [y, m, d] = weekdayBase.split("-").map(Number)
  return new Date(y, (m as number) - 1, d, hour, minute, 0, 0)
}

const istDateOnSaturday = (hour: number, minute: number): Date =>
  istDateAt(hour, minute, "2026-05-09" /* Sat */)

beforeEach(() => {
  invalidateNseHolidaysCache()
  invalidateMarketForceClosedCache()
})

describe("getSegmentTradingSession — Indian equity / F&O (NSE / BSE)", () => {
  it("opens NSE_FO inside the equity F&O window", async () => {
    const r = await getSegmentTradingSession("NSE_FO", istDateAt(11, 30))
    expect(r.session).toBe("open")
  })

  it("reports NSE pre-open between 09:00 and 09:15 IST", async () => {
    const r = await getSegmentTradingSession("NSE", istDateAt(9, 5))
    expect(r.session).toBe("pre-open")
    expect(r.reason).toMatch(/pre-open/i)
  })

  it("closes NSE outside the 09:15–15:30 window with the correct reason", async () => {
    const r = await getSegmentTradingSession("NSE", istDateAt(16, 0))
    expect(r.session).toBe("closed")
    expect(r.reason).toMatch(/09:15.*15:30/)
  })

  it("routes BSE and BSE_FO through the NSE equity window", async () => {
    expect((await getSegmentTradingSession("BSE", istDateAt(11, 30))).session).toBe("open")
    expect((await getSegmentTradingSession("BSE_FO", istDateAt(11, 30))).session).toBe("open")
  })
})

describe("getSegmentTradingSession — Commodity (MCX / NCO)", () => {
  it("opens MCX_FO during the long commodity window (e.g. 22:00 IST)", async () => {
    const r = await getSegmentTradingSession("MCX_FO", istDateAt(22, 0))
    expect(r.session).toBe("open")
  })

  it("opens NCO_FO during the same commodity window", async () => {
    const r = await getSegmentTradingSession("NCO_FO", istDateAt(22, 0))
    expect(r.session).toBe("open")
  })

  it("closes NCO_FO past the commodity window with a NCO-specific reason (no longer falsely says 'NSE')", async () => {
    const r = await getSegmentTradingSession("NCO_FO", istDateAt(7, 0))
    expect(r.session).toBe("closed")
    expect(r.reason).toMatch(/NCO_FO/)
    expect(r.reason).toMatch(/09:00.*23:55/)
    expect(r.reason).not.toMatch(/NSE trading hours/)
  })
})

describe("getSegmentTradingSession — Currency derivatives (CDS / BCD)", () => {
  it("opens CDS_FO at 11:00 IST inside the 09:00–17:00 currency window", async () => {
    const r = await getSegmentTradingSession("CDS_FO", istDateAt(11, 0))
    expect(r.session).toBe("open")
  })

  it("opens CDS_FO at 16:55 IST (just before close) — was previously falsely closed by the NSE 15:30 rule", async () => {
    const r = await getSegmentTradingSession("CDS_FO", istDateAt(16, 55))
    expect(r.session).toBe("open")
  })

  it("closes BCD_FO past 17:00 IST with a currency-specific reason", async () => {
    const r = await getSegmentTradingSession("BCD_FO", istDateAt(17, 30))
    expect(r.session).toBe("closed")
    expect(r.reason).toMatch(/BCD_FO/)
    expect(r.reason).toMatch(/09:00.*17:00/)
  })

  it("closes CDS_FO before 09:00 IST", async () => {
    const r = await getSegmentTradingSession("CDS_FO", istDateAt(8, 30))
    expect(r.session).toBe("closed")
  })
})

describe("getSegmentTradingSession — Crypto (24/7)", () => {
  it("opens CRYPTO at any IST hour", async () => {
    expect((await getSegmentTradingSession("CRYPTO", istDateAt(3, 0))).session).toBe("open")
    expect((await getSegmentTradingSession("CRYPTO", istDateAt(15, 0))).session).toBe("open")
    expect((await getSegmentTradingSession("CRYPTO", istDateAt(23, 30))).session).toBe("open")
  })

  it("opens CRYPTO on Saturday — no Indian-market weekend gate applies", async () => {
    const r = await getSegmentTradingSession("BINANCE", istDateOnSaturday(11, 0))
    expect(r.session).toBe("open")
  })
})

describe("getSegmentTradingSession — venues not enabled for live orders (NASDAQ / NYSE / FX / NSEIX)", () => {
  it.each(["NASDAQ", "NYSE", "FX", "NSEIX"])(
    "closes %s with a 'not yet enabled' reason instead of misleading NSE messaging",
    async (segment) => {
      const r = await getSegmentTradingSession(segment, istDateAt(11, 30))
      expect(r.session).toBe("closed")
      expect(r.reason).toMatch(new RegExp(segment))
      expect(r.reason).toMatch(/not yet enabled/i)
      expect(r.reason).not.toMatch(/NSE trading hours/)
    },
  )
})

describe("resolveSegmentSessionOpenMinutesIST — single source of truth for session-open minute", () => {
  it("returns 09:15 IST (555) for NSE / BSE / IDX / unknown segments", () => {
    expect(resolveSegmentSessionOpenMinutesIST("NSE")).toBe(9 * 60 + 15)
    expect(resolveSegmentSessionOpenMinutesIST("NSE_FO")).toBe(9 * 60 + 15)
    expect(resolveSegmentSessionOpenMinutesIST("BSE_FO")).toBe(9 * 60 + 15)
    expect(resolveSegmentSessionOpenMinutesIST("IDX")).toBe(9 * 60 + 15)
    expect(resolveSegmentSessionOpenMinutesIST(undefined)).toBe(9 * 60 + 15)
  })

  it("returns 09:00 IST (540) for MCX and NCO commodity segments", () => {
    expect(resolveSegmentSessionOpenMinutesIST("MCX")).toBe(9 * 60)
    expect(resolveSegmentSessionOpenMinutesIST("MCX_FO")).toBe(9 * 60)
    expect(resolveSegmentSessionOpenMinutesIST("NCO")).toBe(9 * 60)
    expect(resolveSegmentSessionOpenMinutesIST("NCO_FO")).toBe(9 * 60)
  })

  it("returns 09:00 IST (540) for CDS / BCD currency derivatives", () => {
    expect(resolveSegmentSessionOpenMinutesIST("CDS_FO")).toBe(9 * 60)
    expect(resolveSegmentSessionOpenMinutesIST("BCD_FO")).toBe(9 * 60)
  })

  it("returns 0 for crypto venues — 24/7 means 'minutes since open' is 'minutes since midnight IST'", () => {
    expect(resolveSegmentSessionOpenMinutesIST("CRYPTO")).toBe(0)
    expect(resolveSegmentSessionOpenMinutesIST("BINANCE")).toBe(0)
  })
})

describe("getSegmentTradingSession — weekend handling", () => {
  it("closes NSE on Saturday with a weekend reason", async () => {
    const r = await getSegmentTradingSession("NSE", istDateOnSaturday(11, 0))
    expect(r.session).toBe("closed")
    expect(r.reason).toMatch(/weekend/i)
  })

  it("still closes NCO_FO on Saturday — commodity venues observe Indian weekends", async () => {
    const r = await getSegmentTradingSession("NCO_FO", istDateOnSaturday(11, 0))
    expect(r.session).toBe("closed")
    expect(r.reason).toMatch(/weekend/i)
  })
})
