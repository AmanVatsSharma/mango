/**
 * File:        apps/frontend/lib/server/instrument-segment-normalize.ts
 * Module:      Instrument segment normalization
 * Purpose:     Maps exchange + segment to display labels.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

export function resolveVenueDisplayLabel(exchange: string, segment?: string): string {
  const labels: Record<string, string> = {
    NSE: "NSE",
    BSE: "BSE",
    NSE_FO: "NSE F&O",
    NSE_OPTIONS: "NSE Options",
    MCX: "MCX",
    NCDEX: "NCDEX",
  }
  if (segment) return labels[`${exchange}_${segment}`] || `${exchange} ${segment}`
  return labels[exchange] || exchange
}
