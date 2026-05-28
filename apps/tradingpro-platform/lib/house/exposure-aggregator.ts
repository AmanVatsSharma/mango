/**
 * File:        lib/house/exposure-aggregator.ts
 * Module:      House Book · Exposure Aggregator
 * Purpose:     Build the live broker counterparty exposure snapshot from all open positions.
 *              Reads `positions` (open only — closedAt IS NULL), groups by symbol, computes
 *              broker-side aggregates (broker P&L = −Σ client P&L), then derives concentration.
 *
 * Exports:
 *   - aggregateHouseExposure(opts?): Promise<HouseExposureSnapshot>
 *   - getCachedHouseExposure(): Promise<HouseExposureSnapshot> — Redis-cached, 1s TTL
 *
 * Depends on:
 *   - @/lib/prisma — open-position query
 *   - @/lib/redis/redis-client — 1s TTL cache to avoid stampede
 *   - ./types — HouseExposureSnapshot, SymbolExposure
 *
 * Side-effects:
 *   - DB read (positions where closedAt IS NULL)
 *   - Redis read/write on the cached path
 *
 * Key invariants:
 *   - brokerUnrealizedPnl = −Σ(position.unrealizedPnL). Same sign convention for day P&L.
 *   - netNotional from the BROKER POV is −Σ(signed_qty × averagePrice). We surface broker-side numbers.
 *   - Aggregation is unfiltered — includes EVERY open client position. No segment / instrument filter.
 *   - All amounts in rupees (Position uses Decimal; we coerce to Number — safe up to ~9 quadrillion).
 *
 * Read order:
 *   1. aggregateHouseExposure — the main aggregation loop
 *   2. computeConcentration — top-N share math
 *   3. getCachedHouseExposure — Redis layer
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import { prisma } from "@/lib/prisma"
import { isRedisEnabled, redisGet, redisSet } from "@/lib/redis/redis-client"
import type { HouseExposureSnapshot, SymbolExposure } from "./types"

const CACHE_KEY = "admin:house:exposure:snapshot"
const CACHE_TTL_SECONDS = 1

interface AggregateOpts {
  /** How many top-by-absNotional symbols to surface. Default 10. */
  topSymbolsCount?: number
}

/**
 * Build a live snapshot of the broker's counterparty book.
 * Streams open positions, groups by symbol, then derives broker-side aggregates.
 */
export async function aggregateHouseExposure(opts: AggregateOpts = {}): Promise<HouseExposureSnapshot> {
  const topN = opts.topSymbolsCount ?? 10

  const rows = await prisma.position.findMany({
    where: { closedAt: null },
    select: {
      symbol: true,
      segment: true,
      quantity: true,
      averagePrice: true,
      unrealizedPnL: true,
      dayPnL: true,
      tradingAccountId: true,
    },
  })

  const bySymbol = new Map<string, SymbolExposure>()
  const segmentTotals = new Map<string, { netNotional: number; absNotional: number; brokerPnl: number }>()
  const accountSet = new Set<string>()
  const accountAbsNotional = new Map<string, number>()

  let grossNotional = 0
  let netNotional = 0
  let brokerUnrealizedPnl = 0
  let brokerDayPnl = 0

  for (const row of rows) {
    accountSet.add(row.tradingAccountId)

    const qty = Number(row.quantity)
    const avg = Number(row.averagePrice)
    const clientUnrPnl = Number(row.unrealizedPnL)
    const clientDayPnl = Number(row.dayPnL)
    const signedNotional = qty * avg
    const absNotional = Math.abs(signedNotional)

    grossNotional += absNotional
    // Broker is the inverse of client positions.
    netNotional += -signedNotional
    brokerUnrealizedPnl += -clientUnrPnl
    brokerDayPnl += -clientDayPnl

    const accAbs = accountAbsNotional.get(row.tradingAccountId) ?? 0
    accountAbsNotional.set(row.tradingAccountId, accAbs + absNotional)

    const existing = bySymbol.get(row.symbol)
    if (existing) {
      existing.netQuantity += qty
      existing.netNotional += -signedNotional
      existing.absNotional += absNotional
      existing.clientCount += 1
      existing.brokerUnrealizedPnl += -clientUnrPnl
    } else {
      bySymbol.set(row.symbol, {
        symbol: row.symbol,
        segment: row.segment ?? null,
        netQuantity: qty,
        netNotional: -signedNotional,
        absNotional,
        clientCount: 1,
        brokerUnrealizedPnl: -clientUnrPnl,
      })
    }

    const segKey = row.segment ?? "UNCLASSIFIED"
    const seg = segmentTotals.get(segKey) ?? { netNotional: 0, absNotional: 0, brokerPnl: 0 }
    seg.netNotional += -signedNotional
    seg.absNotional += absNotional
    seg.brokerPnl += -clientUnrPnl
    segmentTotals.set(segKey, seg)
  }

  const topSymbols = Array.from(bySymbol.values())
    .sort((a, b) => b.absNotional - a.absNotional)
    .slice(0, topN)

  const concentrationTop5 = computeConcentration(
    Array.from(bySymbol.values()).map((s) => s.absNotional),
    grossNotional,
    5,
  )
  const concentrationTop5Clients = computeConcentration(
    Array.from(accountAbsNotional.values()),
    grossNotional,
    5,
  )

  const bySegment = Array.from(segmentTotals.entries())
    .map(([segment, v]) => ({ segment, ...v }))
    .sort((a, b) => b.absNotional - a.absNotional)

  return {
    asOf: new Date().toISOString(),
    openPositions: rows.length,
    activeClients: accountSet.size,
    grossNotional,
    netNotional,
    brokerUnrealizedPnl,
    brokerDayPnl,
    topSymbols,
    concentrationTop5,
    concentrationTop5Clients,
    bySegment,
  }
}

/**
 * Top-N share of total — guards divide-by-zero on an empty book.
 */
function computeConcentration(values: number[], total: number, topN: number): number {
  if (total <= 0 || values.length === 0) return 0
  const top = values.sort((a, b) => b - a).slice(0, topN).reduce((s, v) => s + v, 0)
  return top / total
}

/**
 * Cached entrypoint used by the API route.
 * 1s TTL is intentional: fresh enough for ops, blocks DB stampede during traffic spikes.
 */
export async function getCachedHouseExposure(): Promise<HouseExposureSnapshot> {
  if (isRedisEnabled()) {
    const cached = await redisGet(CACHE_KEY)
    if (cached) {
      try {
        return JSON.parse(cached) as HouseExposureSnapshot
      } catch {
        // fall through to recompute on parse failure
      }
    }
  }

  const snapshot = await aggregateHouseExposure()

  if (isRedisEnabled()) {
    void redisSet(CACHE_KEY, JSON.stringify(snapshot), CACHE_TTL_SECONDS)
  }

  return snapshot
}

/** Channel + cache key are exported so the worker + SSE layer can subscribe in Phase 8.5. */
export const HOUSE_EXPOSURE_CACHE_KEY = CACHE_KEY
export const HOUSE_EXPOSURE_CHANNEL = "admin:house:exposure:delta"
