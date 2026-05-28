/**
 * @file data-source.ts
 * @module admin-console
 * @description Data source status helpers for admin console UI states
 * @author StockTrade
 * @created 2026-01-15
 */

export type DataSourceStatus = "loading" | "live" | "partial" | "error" | "sample"

export type DataEndpointResult = {
  name: string
  ok: boolean
  error?: string
}

export type DataSourceSummary = {
  status: Exclude<DataSourceStatus, "loading" | "sample">
  errors: string[]
  okCount: number
  total: number
}

/**
 * Derive a consolidated data source status from endpoint results.
 */
export function deriveDataSourceStatus(results: DataEndpointResult[]): DataSourceSummary {
  const total = results.length
  const okCount = results.filter((result) => result.ok).length
  const errors = results
    .filter((result) => !result.ok)
    .map((result) => `${result.name}: ${result.error || "Request failed"}`)

  if (okCount === total) {
    return { status: "live", errors: [], okCount, total }
  }

  if (okCount === 0) {
    return { status: "error", errors, okCount, total }
  }

  return { status: "partial", errors, okCount, total }
}
