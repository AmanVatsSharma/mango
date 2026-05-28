/**
 * File:        lib/utils/format-ist.ts
 * Module:      Utilities · Date Formatting
 * Purpose:     IST (Asia/Kolkata) date/time formatters for admin UI display.
 *
 * Exports:
 *   - formatIstDateTime(date) → string   — e.g. "20 Apr 2026, 14:35:22 IST"
 *   - formatIstDate(date) → string       — e.g. "20 Apr 2026"
 *   - formatIstTime(date) → string       — e.g. "14:35:22"
 *
 * Depends on: none (Intl.DateTimeFormat only)
 * Side-effects: none
 * Key invariants:
 *   - India has no DST — Asia/Kolkata is always UTC+5:30
 *   - Accepts Date | string | number; null/undefined returns "–"
 * Read order: formatIstDateTime, formatIstDate, formatIstTime
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

const IST_TZ = "Asia/Kolkata"

/** Formatter instances are expensive — create once. */
const dtFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

function toDate(date: Date | string | number | null | undefined): Date | null {
  if (date == null) return null
  const d = new Date(date)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Formats a date as a full IST date + time string.
 * Example output: "01 Jun 2026, 05:30:00 IST"
 */
export function formatIstDateTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date)
  if (!d) return "–"
  return dtFormatter.format(d) + " IST"
}

/**
 * Formats a date as an IST date-only string.
 * Example output: "16 Jan 2026"
 */
export function formatIstDate(date: Date | string | number | null | undefined): string {
  const d = toDate(date)
  if (!d) return "–"
  return dateFormatter.format(d)
}

/**
 * Formats a date as an IST time-only string.
 * Example output: "05:30:00"
 */
export function formatIstTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date)
  if (!d) return "–"
  return timeFormatter.format(d)
}
