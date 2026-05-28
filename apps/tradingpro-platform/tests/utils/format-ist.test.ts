/**
 * File:        tests/utils/format-ist.test.ts
 * Module:      Utilities · Date Formatting · Tests
 * Purpose:     Unit tests for IST date/time formatters in lib/utils/format-ist.ts
 *
 * Exports:     none (test file)
 * Depends on:  @/lib/utils/format-ist — the module under test
 * Side-effects: none
 * Key invariants:
 *   - UTC+5:30 offset means 2026-06-01T00:00:00Z → 05:30 IST same day
 *   - UTC+5:30 offset means 2026-01-15T18:30:00Z → 00:00 IST next day (16 Jan)
 *   - null/undefined → "–" sentinel
 *   - invalid date string → "–" sentinel
 *
 * Read order:
 *   1. Test case 1 — UTC→IST datetime with known offset
 *   2. Test case 2 — date boundary roll-over (day change)
 *   3. Test case 3 — time-only offset check
 *   4. Test cases 4–5 — null-guard sentinel
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { formatIstDateTime, formatIstDate, formatIstTime } from "@/lib/utils/format-ist"

describe("formatIstDateTime", () => {
  it("converts UTC midnight to IST 05:30 and includes IST suffix", () => {
    // 2026-06-01T00:00:00Z → 2026-06-01T05:30:00 IST
    const result = formatIstDateTime(new Date("2026-06-01T00:00:00Z"))
    expect(result).toMatch(/2026/)
    // Must contain the IST timezone suffix
    expect(result).toMatch(/IST$/)
    // The time in IST should show 05:30
    expect(result).toContain("05:30")
  })

  it("returns '–' for null", () => {
    expect(formatIstDateTime(null)).toBe("–")
  })

  it("returns '–' for undefined", () => {
    expect(formatIstDateTime(undefined)).toBe("–")
  })

  it("returns '–' for invalid date string", () => {
    expect(formatIstDateTime("invalid-date")).toBe("–")
  })
})

describe("formatIstDate", () => {
  it("rolls over day boundary: 2026-01-15T18:30:00Z becomes 16 Jan 2026 in IST", () => {
    // 18:30 UTC + 5:30 = 00:00 IST next day = 16 Jan 2026
    const result = formatIstDate(new Date("2026-01-15T18:30:00Z"))
    expect(result).toMatch(/2026/)
    // Must not still say 15 — it should be 16 in IST
    expect(result).not.toMatch(/\b15\b/)
    expect(result).toMatch(/\b16\b/)
  })

  it("returns '–' for null", () => {
    expect(formatIstDate(null)).toBe("–")
  })
})

describe("formatIstTime", () => {
  it("converts 2026-01-01T00:00:00Z to IST 05:30:00", () => {
    // UTC midnight → IST 05:30:00
    const result = formatIstTime(new Date("2026-01-01T00:00:00Z"))
    expect(result).toContain("05:30")
  })

  it("returns '–' for null", () => {
    expect(formatIstTime(null)).toBe("–")
  })
})
