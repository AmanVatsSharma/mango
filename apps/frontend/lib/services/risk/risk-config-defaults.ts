/**
 * File:        apps/frontend/lib/services/risk/risk-config-defaults.ts
 * Module:      Risk config defaults
 * Purpose:     Provides default risk/leverage settings for the trading terminal.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

export function getDefaultLeverage(exchange: string, segment?: string): number {
  if (segment === "NSE_FO" || segment === "NSE_OPTIONS") return 3
  if (exchange === "NSE" || exchange === "BSE") return 5
  return 1
}

export function resolveMarginFractionFromStoredRate(rate: number | null | undefined): number {
  // Convert a stored margin rate (e.g., 0.20 = 20%) to a fraction (e.g., 5 = 5x leverage)
  if (!rate || rate <= 0) return 1
  return 1 / rate
}
