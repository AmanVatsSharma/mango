/**
 * File:        app/api/risk/config/route.ts
 * Module:      api · risk-config (user-facing preview)
 * Purpose:     User-side margin/brokerage preview lookup for the Order dialog. Returns the
 *              winning RiskConfig fields for a (segment, productType[, optionType, orderSide])
 *              tuple, falling back to in-code defaults when no row is configured.
 *
 *              Trading-1z9 (2026-05-08): the route used to inline its own
 *              `prisma.riskConfig.findMany` + `pickActiveRiskConfigRow` pair. It now delegates
 *              to the shared cached loader at lib/services/risk/risk-config-cache.ts so the
 *              query is the same code path the order engine uses, and the response benefits
 *              from the 30s in-process cache + Redis pub/sub invalidation on admin writes.
 *
 * Exports:
 *   - GET(req) → NextResponse — risk config preview (auth required; 401 otherwise)
 *
 * Depends on:
 *   - @/auth — session check
 *   - @/lib/prisma — used only as the loader's prisma client argument
 *   - @/lib/services/risk/risk-config-cache — shared loader
 *   - @/lib/services/risk/risk-config-defaults — segment-default leverage when no row exists
 *   - @/lib/services/risk/risk-config-normalizer — segment/productType input normalization
 *   - @/lib/services/risk/risk-margin-side — option-row precedence for BUY vs SELL
 *
 * Side-effects: none (pure read).
 *
 * Key invariants:
 *   - Unauthenticated callers get 401 (no leak of margin schedules to anonymous users).
 *   - Missing segment/productType returns 400, not 500.
 *   - When no RiskConfig row matches, response leaves brokerage fields null and uses
 *     `getDefaultLeverage` for leverage — same back-compat shape callers expect.
 *
 * Read order:
 *   1. parameter normalization
 *   2. loadActiveRiskConfigForInstrument call
 *   3. response shape
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalizeApiFiniteNumber } from '@/lib/server/api-number-utils'
import { getDefaultLeverage } from '@/lib/services/risk/risk-config-defaults'
import {
  normalizeRiskConfigProductType,
  normalizeRiskConfigSegment,
} from "@/lib/services/risk/risk-config-normalizer"
import { marginRiskSideForPlacementOrder } from "@/lib/services/risk/risk-margin-side"
import { loadActiveRiskConfigForInstrument } from "@/lib/services/risk/risk-config-cache"

export async function GET(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: 'unauthenticated', code: 'RISK_CONFIG_UNAUTHENTICATED' },
      { status: 401 }
    )
  }

  try {
    const url = new URL(req.url)
    const rawSegment = url.searchParams.get('segment') || ''
    const rawProductType = url.searchParams.get('productType') || ''
    const optionTypeRaw = url.searchParams.get('optionType') || ''
    const orderSideRaw = url.searchParams.get('orderSide') || ''

    const segment = normalizeRiskConfigSegment(rawSegment)
    const productType = normalizeRiskConfigProductType(rawProductType)
    const optionType =
      optionTypeRaw.trim().toUpperCase() === 'CE' || optionTypeRaw.trim().toUpperCase() === 'PE'
        ? optionTypeRaw.trim().toUpperCase()
        : ''
    const marginRiskSide =
      optionType !== '' && orderSideRaw.trim() !== ''
        ? marginRiskSideForPlacementOrder(orderSideRaw)
        : undefined

    if (!rawSegment.trim() || !rawProductType.trim()) {
      return NextResponse.json(
        { success: false, error: 'segment and productType are required' },
        { status: 400 }
      )
    }

    const config = await loadActiveRiskConfigForInstrument({
      prisma,
      segment,
      productType,
      optionType: optionType || null,
      marginRiskSide: marginRiskSide ?? null,
    })

    const response = {
      success: true,
      data: {
        segment,
        productType,
        leverage: normalizeApiFiniteNumber(config?.leverage, getDefaultLeverage(segment, productType)),
        marginRate: config?.marginRate != null ? normalizeApiFiniteNumber(config.marginRate) : null,
        minMarginPerLot:
          config?.minMarginPerLot != null ? normalizeApiFiniteNumber(config.minMarginPerLot) : null,
        // Leave brokerage fields as provided by DB; if null, client should fallback to defaults
        brokerageFlat: config?.brokerageFlat != null ? normalizeApiFiniteNumber(config.brokerageFlat) : null,
        brokerageRate: config?.brokerageRate != null ? normalizeApiFiniteNumber(config.brokerageRate) : null,
        brokerageCap: config?.brokerageCap != null ? normalizeApiFiniteNumber(config.brokerageCap) : null
      }
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load risk config' },
      { status: 500 }
    )
  }
}
