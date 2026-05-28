/**
 * File:        lib/spread/spread-engine.ts
 * Module:      Spread · Markup Engine
 * Purpose:     Resolve the effective bid/ask markup for a (symbol, segment, tier)
 *              tuple from the SpreadConfig table, then optionally apply a per-client
 *              winner-control multiplier on top. Used by:
 *                - the slippage simulator UI
 *                - the future quote-delivery hook (Phase 9.5 wires into market-data layer)
 *
 * Exports:
 *   - listSpreadConfigs()              — admin list (all rows, ordered by specificity)
 *   - resolveSpread(scope)             — resolve a single scope to a ResolvedSpread
 *   - simulateSpread(input)            — what-if calculator for the simulator UI
 *   - createSpreadConfig(input, by)    — admin write
 *   - updateSpreadConfig(id, input, by)
 *   - deleteSpreadConfig(id, by)
 *
 * Depends on:
 *   - @/lib/prisma
 *   - @/lib/redis/redis-client — cache invalidation pub/sub
 *   - ./types
 *
 * Side-effects:
 *   - DB read/write on SpreadConfig
 *   - Redis publish on `spread_config:changed` after every mutation
 *
 * Key invariants:
 *   - Resolution precedence: most-specific match wins (see types.ts header).
 *   - bidMarkupBps + askMarkupBps stored at 4 decimals — convert to fraction by
 *     dividing by 10000 (10000 bps = 100% = 1.0 multiplier).
 *   - perClientMultiplier multiplies BOTH sides — winners pay wider on both bid AND ask.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { redisPublish } from "@/lib/redis/redis-client"
import type {
  ResolvedSpread,
  SimulationInput,
  SimulationResult,
  SpreadConfigInput,
  SpreadConfigRow,
  SpreadResolutionScope,
} from "./types"

const CACHE_BUST_CHANNEL = "spread_config:changed"

const ZERO_RESOLVED: ResolvedSpread = {
  configId: null,
  bidMarkupBps: 0,
  askMarkupBps: 0,
  perClientApplied: false,
  effectiveMultiplier: 1,
}

type PrismaSpreadRow = Prisma.SpreadConfigGetPayload<true>

function toRow(row: PrismaSpreadRow): SpreadConfigRow {
  return {
    id: row.id,
    instrument: row.instrument,
    segment: row.segment,
    clientTier: row.clientTier,
    bidMarkupBps: Number(row.bidMarkupBps),
    askMarkupBps: Number(row.askMarkupBps),
    isActive: row.isActive,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listSpreadConfigs(opts: { activeOnly?: boolean } = {}): Promise<SpreadConfigRow[]> {
  const rows = await prisma.spreadConfig.findMany({
    where: opts.activeOnly ? { isActive: true } : undefined,
    orderBy: [
      // most-specific first
      { instrument: "asc" },
      { segment: "asc" },
      { clientTier: "asc" },
      { createdAt: "desc" },
    ],
  })
  return rows.map(toRow)
}

/**
 * Resolve a single scope to its baseline + per-client markup. Pure function over the
 * full active config set — caller is expected to have warmed it (or hit DB once per request).
 */
export function resolveSpreadFromConfigs(
  scope: SpreadResolutionScope,
  configs: SpreadConfigRow[],
): ResolvedSpread {
  const matches = configs.filter((c) => c.isActive && matchesScope(c, scope))
  if (matches.length === 0) {
    return applyPerClient(ZERO_RESOLVED, scope.perClientMultiplier ?? null)
  }

  // Pick the most specific match — higher specificity = more non-null fields aligning.
  matches.sort((a, b) => specificity(b) - specificity(a))
  const top = matches[0]

  const baseline: ResolvedSpread = {
    configId: top.id,
    bidMarkupBps: top.bidMarkupBps,
    askMarkupBps: top.askMarkupBps,
    perClientApplied: false,
    effectiveMultiplier: 1,
  }
  return applyPerClient(baseline, scope.perClientMultiplier ?? null)
}

function applyPerClient(base: ResolvedSpread, mult: number | null): ResolvedSpread {
  if (mult === null || mult === undefined || mult === 1) return base
  return {
    ...base,
    bidMarkupBps: base.bidMarkupBps * mult,
    askMarkupBps: base.askMarkupBps * mult,
    perClientApplied: true,
    effectiveMultiplier: mult,
  }
}

function matchesScope(c: SpreadConfigRow, s: SpreadResolutionScope): boolean {
  if (c.instrument && c.instrument !== s.symbol) return false
  if (c.segment && c.segment !== s.segment) return false
  if (c.clientTier && c.clientTier !== s.clientTier) return false
  return true
}

function specificity(c: SpreadConfigRow): number {
  return (c.instrument ? 4 : 0) + (c.segment ? 2 : 0) + (c.clientTier ? 1 : 0)
}

/** Convenience — fetch active configs + resolve a scope. One DB call. */
export async function resolveSpread(scope: SpreadResolutionScope): Promise<ResolvedSpread> {
  const configs = await listSpreadConfigs({ activeOnly: true })
  return resolveSpreadFromConfigs(scope, configs)
}

export async function simulateSpread(input: SimulationInput): Promise<SimulationResult> {
  const configs = await listSpreadConfigs({ activeOnly: true })
  const baseline = resolveSpreadFromConfigs(
    {
      symbol: input.symbol,
      segment: input.segment,
      clientTier: input.clientTier,
      perClientMultiplier: input.perClientMultiplier ?? null,
    },
    configs,
  )

  const override: ResolvedSpread = applyPerClient(
    {
      configId: baseline.configId,
      bidMarkupBps:
        input.overrideBidBps !== undefined ? input.overrideBidBps : baseline.bidMarkupBps,
      askMarkupBps:
        input.overrideAskBps !== undefined ? input.overrideAskBps : baseline.askMarkupBps,
      perClientApplied: false,
      effectiveMultiplier: 1,
    },
    input.perClientMultiplier ?? null,
  )

  const baselineBidPrice = input.mid * (1 - baseline.bidMarkupBps / 10_000)
  const baselineAskPrice = input.mid * (1 + baseline.askMarkupBps / 10_000)
  const overrideBidPrice = input.mid * (1 - override.bidMarkupBps / 10_000)
  const overrideAskPrice = input.mid * (1 + override.askMarkupBps / 10_000)

  const baselineRoundTrip = baselineAskPrice - baselineBidPrice
  const overrideRoundTrip = overrideAskPrice - overrideBidPrice
  const deltaRevenuePerLot = overrideRoundTrip - baselineRoundTrip
  const projectedDailyImpact =
    input.averageDailyVolume !== undefined && input.averageDailyVolume !== null
      ? deltaRevenuePerLot * input.averageDailyVolume
      : null

  return {
    baseline,
    override,
    baselineBidPrice,
    baselineAskPrice,
    overrideBidPrice,
    overrideAskPrice,
    deltaRevenuePerLot,
    projectedDailyImpact,
  }
}

interface MutationActor {
  performedById: string
}

export async function createSpreadConfig(
  input: SpreadConfigInput,
  actor: MutationActor,
): Promise<SpreadConfigRow> {
  const row = await prisma.spreadConfig.create({
    data: {
      instrument: input.instrument ?? null,
      segment: input.segment ?? null,
      clientTier: input.clientTier ?? null,
      bidMarkupBps: input.bidMarkupBps,
      askMarkupBps: input.askMarkupBps,
      isActive: input.isActive ?? true,
      reason: input.reason ?? null,
      createdById: actor.performedById,
    },
  })
  void redisPublish(CACHE_BUST_CHANNEL, JSON.stringify({ op: "create", id: row.id }))
  return toRow(row)
}

export async function updateSpreadConfig(
  id: string,
  input: SpreadConfigInput,
  _actor: MutationActor,
): Promise<SpreadConfigRow> {
  const row = await prisma.spreadConfig.update({
    where: { id },
    data: {
      instrument: input.instrument ?? null,
      segment: input.segment ?? null,
      clientTier: input.clientTier ?? null,
      bidMarkupBps: input.bidMarkupBps,
      askMarkupBps: input.askMarkupBps,
      isActive: input.isActive ?? true,
      reason: input.reason ?? null,
    },
  })
  void redisPublish(CACHE_BUST_CHANNEL, JSON.stringify({ op: "update", id }))
  return toRow(row)
}

export async function deleteSpreadConfig(id: string, _actor: MutationActor): Promise<void> {
  await prisma.spreadConfig.delete({ where: { id } })
  void redisPublish(CACHE_BUST_CHANNEL, JSON.stringify({ op: "delete", id }))
}
