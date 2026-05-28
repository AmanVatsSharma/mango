/**
 * File:        lib/services/risk/risk-config-resolve-active.ts
 * Module:      Risk · ResolvedRiskConfigRow projection (back-compat shim)
 * Purpose:     Returns the winning active RiskConfig row for an instrument. Originally a
 *              standalone Prisma query; Trading-1z9 (2026-05-08) moved the actual fetch into
 *              the shared cached loader at lib/services/risk/risk-config-cache.ts. This module
 *              now exists as a thin projection: it forwards to the loader and returns only the
 *              fields its callers (app/api/admin/risk/coverage/route.ts and historical
 *              consumers) expect, preserving the existing typed contract.
 *
 * Exports:
 *   - ResolvedRiskConfigRow                                 — projected return shape
 *   - resolveActiveRiskConfigForInstrument(...)             — back-compat function preserved
 *
 * Depends on:
 *   - @/lib/services/risk/risk-config-cache — single source of truth (cached + pub/sub busted)
 *
 * Side-effects: none directly; the loader manages cache state.
 *
 * Key invariants:
 *   - Signature, return shape, and null semantics are unchanged from before Trading-1z9.
 *   - The only behavioural change is that successive calls within 30s hit the in-process
 *     cache instead of round-tripping the DB. Admin writes invalidate via Redis pub/sub.
 *
 * Read order:
 *   1. ResolvedRiskConfigRow — the typed projection
 *   2. resolveActiveRiskConfigForInstrument — the function (delegates to loader)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import type { Prisma, PrismaClient } from "@prisma/client"
import type { MarginRiskSide } from "@/lib/services/risk/risk-margin-side"
import { loadActiveRiskConfigForInstrument } from "@/lib/services/risk/risk-config-cache"

export type ResolvedRiskConfigRow = {
  id: string
  segment: string
  productType: string
  leverage: Prisma.Decimal
  marginRate: Prisma.Decimal | null
  minMarginPerLot: Prisma.Decimal | null
}

/**
 * Returns the first matching active risk_config row for instrument-aware product ordering.
 * Trading-1z9: this used to do its own findMany; it now delegates to the cached loader so
 * the query path is shared with MarginCalculator and the user-facing /api/risk/config route.
 */
export async function resolveActiveRiskConfigForInstrument(
  prisma: PrismaClient,
  segment: string,
  productType: string,
  optionType?: string | null,
  marginRiskSide?: MarginRiskSide | null,
): Promise<ResolvedRiskConfigRow | null> {
  const row = await loadActiveRiskConfigForInstrument({
    prisma,
    segment,
    productType,
    optionType: optionType ?? null,
    marginRiskSide: marginRiskSide ?? null,
  })
  if (!row) return null
  return {
    id: row.id,
    segment: row.segment,
    productType: row.productType,
    leverage: row.leverage,
    marginRate: row.marginRate,
    minMarginPerLot: row.minMarginPerLot,
  }
}
