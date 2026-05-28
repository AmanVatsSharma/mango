/**
 * @file lib/admin-v2/api-client.ts
 * @module admin-v2
 * @description Shared SWR fetcher + small helpers for v2. Ensures every v2 fetch goes
 *              through the same error-shaped path and produces a typed `ApiError` on
 *              non-2xx responses (so SWR's `error` is always something the UI can render).
 *
 *              Exports:
 *                - jsonFetcher<T>(url)       — SWR-compatible fetcher returning parsed T.
 *                - ApiError                  — error class thrown by jsonFetcher.
 *                - withQuery(path, params)   — build a URL with non-empty query params.
 *                - formatInr(amount)         — Indian-style currency (₹1.2L / ₹84.4Cr).
 *                - formatDateTimeIst(date)   — IST date/time string (e.g., "26 Apr 26, 14:32 IST").
 *                - formatRelativeIst(date)   — "2 hours ago" relative.
 *
 *              Side-effects: network on jsonFetcher; pure on the rest.
 *
 *              Read order:
 *                1. ApiError + jsonFetcher  — the canonical fetch contract.
 *                2. withQuery               — query-string builder used by every list hook.
 *                3. formatters              — display helpers used by every tab.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/** SWR-compatible fetcher. Throws ApiError on non-2xx so SWR's `error` always has shape. */
export async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    let code: string | undefined
    try {
      const body = (await res.json()) as { message?: string; code?: string; error?: string }
      if (body.message) message = body.message
      else if (body.error) message = body.error
      code = body.code
    } catch {
      // body wasn't JSON — keep status-text message
    }
    throw new ApiError(message, res.status, code)
  }
  return (await res.json()) as T
}

/** Build a URL with only non-empty params. `null` / `undefined` / "" are skipped. */
export function withQuery(
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue
    search.set(k, String(v))
  }
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Indian-style INR formatter. <1L → "₹12,300"; 1L–99L → "₹1.2L"; ≥1Cr → "₹84.4Cr".
 * Always uses 1 decimal for L/Cr to keep KPI tiles compact.
 */
export function formatInr(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : amount
  if (n === null || n === undefined || Number.isNaN(n)) return "—"
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

const IST_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export function formatDateTimeIst(date: Date | string | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return "—"
  return `${IST_FMT.format(d)} IST`
}

const RELATIVE_FMT = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" })
const REL_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
]

export function formatRelativeIst(date: Date | string | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return "—"
  let duration = (d.getTime() - Date.now()) / 1000
  for (const div of REL_DIVISIONS) {
    if (Math.abs(duration) < div.amount) {
      return RELATIVE_FMT.format(Math.round(duration), div.unit)
    }
    duration /= div.amount
  }
  return formatDateTimeIst(d)
}
