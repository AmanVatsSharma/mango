/**
 * @file position-feed-freeze-utils.ts
 * @module components/trading
 * @description Freeze-last-live display policy helpers for resilient positions MTM rendering.
 * @author StockTrade
 * @created 2026-03-05
 * @updated 2026-03-24
 */

import type { ResolvedTradingPositionPnl } from "@/components/trading/trading-dashboard-number-utils"
import type { PositionsRowPriceBasis } from "@/lib/market-display/market-display-config.schema"

export type PositionDisplayFeedState = "LIVE" | "FROZEN" | "STALE" | "CLOSED"

export type FrozenLiveSnapshot = {
  displayPrice: number | null
  totalPnl: number
  dayPnl: number
  unrealizedPnl: number
  capturedAtMs: number
}

export type PositionDisplayState = {
  positionId: string
  isClosed: boolean
  feedState: PositionDisplayFeedState
  source: ResolvedTradingPositionPnl["source"] | "frozen" | "unknown"
  displayPrice: number | null
  totalPnl: number | null
  dayPnl: number | null
  unrealizedPnl: number | null
  quoteAgeMs: number | null
  frozenAgeMs: number | null
}

export type PositionFreezeResolution = {
  cache: Map<string, FrozenLiveSnapshot>
  displayByPositionId: Map<string, PositionDisplayState>
  openMtm: number | null
  bookedToday: number
  totalPositions: number
  hasUnknownOpenPositions: boolean
}

type PositionIdentityLike = {
  id?: string | null
  quantity?: number
  isClosed?: boolean
  status?: string | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function resolveLiveDisplayPrice(
  resolved: ResolvedTradingPositionPnl,
  basis: PositionsRowPriceBasis,
): number | null {
  if (basis === "exchange_ltp") {
    if (isFiniteNumber(resolved.currentPrice) && resolved.currentPrice > 0) {
      return resolved.currentPrice
    }
    if (isFiniteNumber(resolved.displayPrice) && resolved.displayPrice > 0) {
      return resolved.displayPrice
    }
    return null
  }
  if (isFiniteNumber(resolved.displayPrice) && resolved.displayPrice > 0) {
    return resolved.displayPrice
  }
  if (isFiniteNumber(resolved.currentPrice) && resolved.currentPrice > 0) {
    return resolved.currentPrice
  }
  return null
}

function isOpenPosition(position: PositionIdentityLike, resolved?: ResolvedTradingPositionPnl): boolean {
  if (resolved) {
    return !resolved.isClosed
  }
  if (position.isClosed) {
    return false
  }
  if (typeof position.status === "string" && position.status.toUpperCase() === "CLOSED") {
    return false
  }
  return Number(position.quantity ?? 0) !== 0
}

export function resolveFrozenPositionDisplay(input: {
  positions: PositionIdentityLike[]
  resolvedByPositionId: Map<string, ResolvedTradingPositionPnl>
  previousCache?: Map<string, FrozenLiveSnapshot>
  nowMs?: number
  /** When false, non-live feeds do not use last-live freeze cache (STALE instead). */
  freezeLastLiveEnabled?: boolean
  /** Smoothed display vs exchange LTP for visible mark on LIVE rows. */
  positionsRowPriceBasis?: PositionsRowPriceBasis
}): PositionFreezeResolution {
  const nowMs = isFiniteNumber(input.nowMs) ? input.nowMs : Date.now()
  const freezeLastLiveEnabled = input.freezeLastLiveEnabled !== false
  const rowBasis: PositionsRowPriceBasis = input.positionsRowPriceBasis ?? "smoothed_display"
  const nextCache = new Map(input.previousCache ?? [])
  const displayByPositionId = new Map<string, PositionDisplayState>()
  const activeIds = new Set<string>()

  let openMtmTotal = 0
  let bookedToday = 0
  let totalPositions = 0
  let hasUnknownOpenPositions = false

  for (const position of input.positions ?? []) {
    const positionId = typeof position?.id === "string" ? position.id : null
    if (!positionId) {
      continue
    }
    activeIds.add(positionId)

    const resolved = input.resolvedByPositionId.get(positionId)
    if (!resolved) {
      const open = isOpenPosition(position)
      if (open) {
        totalPositions += 1
        hasUnknownOpenPositions = true
      }
      displayByPositionId.set(positionId, {
        positionId,
        isClosed: !open,
        feedState: open ? "STALE" : "CLOSED",
        source: "unknown",
        displayPrice: null,
        totalPnl: open ? null : 0,
        dayPnl: open ? null : 0,
        unrealizedPnl: open ? null : 0,
        quoteAgeMs: null,
        frozenAgeMs: null,
      })
      continue
    }

    if (resolved.isClosed) {
      nextCache.delete(positionId)
      bookedToday += isFiniteNumber(resolved.bookedPnl) ? resolved.bookedPnl : 0
      displayByPositionId.set(positionId, {
        positionId,
        isClosed: true,
        feedState: "CLOSED",
        source: resolved.source,
        displayPrice: resolved.displayPrice,
        totalPnl: resolved.totalPnl,
        dayPnl: resolved.dayPnl,
        unrealizedPnl: 0,
        quoteAgeMs: resolved.quoteAgeMs,
        frozenAgeMs: null,
      })
      continue
    }

    totalPositions += 1

    if (resolved.source === "live") {
      const snapshot: FrozenLiveSnapshot = {
        displayPrice: resolveLiveDisplayPrice(resolved, rowBasis),
        totalPnl: resolved.totalPnl,
        dayPnl: resolved.dayPnl,
        unrealizedPnl: resolved.unrealizedPnl,
        capturedAtMs: nowMs,
      }
      nextCache.set(positionId, snapshot)
      openMtmTotal += snapshot.unrealizedPnl
      displayByPositionId.set(positionId, {
        positionId,
        isClosed: false,
        feedState: "LIVE",
        source: resolved.source,
        displayPrice: snapshot.displayPrice,
        totalPnl: snapshot.totalPnl,
        dayPnl: snapshot.dayPnl,
        unrealizedPnl: snapshot.unrealizedPnl,
        quoteAgeMs: resolved.quoteAgeMs,
        frozenAgeMs: 0,
      })
      continue
    }

    const frozenSnapshot = freezeLastLiveEnabled ? nextCache.get(positionId) : undefined
    if (frozenSnapshot) {
      openMtmTotal += frozenSnapshot.unrealizedPnl
      displayByPositionId.set(positionId, {
        positionId,
        isClosed: false,
        feedState: "FROZEN",
        source: "frozen",
        displayPrice: frozenSnapshot.displayPrice,
        totalPnl: frozenSnapshot.totalPnl,
        dayPnl: frozenSnapshot.dayPnl,
        unrealizedPnl: frozenSnapshot.unrealizedPnl,
        quoteAgeMs: resolved.quoteAgeMs,
        frozenAgeMs: Math.max(0, nowMs - frozenSnapshot.capturedAtMs),
      })
      continue
    }

    hasUnknownOpenPositions = true
    displayByPositionId.set(positionId, {
      positionId,
      isClosed: false,
      feedState: "STALE",
      source: resolved.source,
      displayPrice: null,
      totalPnl: null,
      dayPnl: null,
      unrealizedPnl: null,
      quoteAgeMs: resolved.quoteAgeMs,
      frozenAgeMs: null,
    })
  }

  for (const cachedId of Array.from(nextCache.keys())) {
    if (!activeIds.has(cachedId)) {
      nextCache.delete(cachedId)
    }
  }

  return {
    cache: nextCache,
    displayByPositionId,
    openMtm: hasUnknownOpenPositions ? null : openMtmTotal,
    bookedToday,
    totalPositions,
    hasUnknownOpenPositions,
  }
}

export function resolveGroupDisplayTotal(input: {
  positionIds: string[]
  displayByPositionId: Map<string, PositionDisplayState>
}): number | null {
  let total = 0
  for (const positionId of input.positionIds) {
    const row = input.displayByPositionId.get(positionId)
    if (!row) return null
    if (row.totalPnl === null) return null
    total += row.totalPnl
  }
  return total
}
