/**
 * File:        lib/services/risk/LiquidationService.ts
 * Module:      Risk Management · Liquidation
 * Purpose:     Orchestrates bulk account liquidation — resolves live prices,
 *              closes positions, records audit row — for both real and dry-run paths.
 *
 * Exports:
 *   - LiquidationPreviewResult                  — type for dry-run response
 *   - LiquidationExecuteResult                  — type for real execute response
 *   - previewLiquidation(opts) → Promise<LiquidationPreviewResult>  — dry-run, no DB writes
 *   - executeLiquidation(opts) → Promise<LiquidationExecuteResult>  — positions closed + audit row
 *
 * Depends on:
 *   - @/lib/market-data/live-quote-ladder  — resolveLivePrice for Redis-first price ladder
 *   - @/lib/prisma                          — DB client for account/audit queries
 *   - @/lib/repositories/PositionRepository — findActive positions for account
 *   - @/lib/services/position/PositionManagementService — atomic per-position close
 *   - @/lib/observability/logger            — structured logging
 *
 * Side-effects:
 *   - previewLiquidation: Redis GETs only (no DB writes)
 *   - executeLiquidation: calls closePosition (DB write, margin release, exit order)
 *     per position, then writes one RiskAuditEvent row
 *
 * Key invariants:
 *   - Quotes are resolved OUTSIDE any transaction to avoid connection pool drain
 *   - Positions where source === "unpriced" are skipped (not closed) and reported
 *   - Each position is closed via PositionManagementService which owns its own transaction
 *   - Audit row is only written if ALL close attempts succeed (no partial-failure audit)
 *   - Concurrency is capped at 3 concurrent close operations to limit DB contention
 *   - targetUserId is resolved from tradingAccountId — callers need not supply it
 *
 * Read order:
 *   1. LiquidationPreviewResult / LiquidationExecuteResult — output shapes
 *   2. resolvePositionQuotes — quote pre-resolution helper
 *   3. runWithConcurrency — concurrency pool helper
 *   4. previewLiquidation — dry-run path
 *   5. executeLiquidation — real close path
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { prisma } from "@/lib/prisma"
import { resolveLivePrice } from "@/lib/market-data/live-quote-ladder"
import { PositionRepository } from "@/lib/repositories/PositionRepository"
import { createPositionManagementService } from "@/lib/services/position/PositionManagementService"
import { parseFiniteRiskNumber } from "@/lib/services/risk/risk-number-utils"
import { baseLogger } from "@/lib/observability/logger"

const logger = baseLogger.child({ module: "LiquidationService" })

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LiquidationPreviewPositionRow = {
  positionId: string
  symbol: string
  quantity: number
  averagePrice: number
  projectedExitPrice: number
  projectedRealizedPnL: number
  projectedMarginFreed: number
  pnlMode: string
  skippedNoPrice: boolean
}

export type LiquidationPreviewResult = {
  positions: LiquidationPreviewPositionRow[]
  totalProjectedPnL: number
  totalMarginFreed: number
  positionsToClose: number
  positionsSkipped: number
  warnings: string[]
}

export type LiquidationExecuteResult = {
  success: true
  auditEventId: string
  positionsClosed: number
  positionsSkipped: number
  totalRealizedPnL: number
  marginFreed: number
}

// ---------------------------------------------------------------------------
// Shared option shapes
// ---------------------------------------------------------------------------

type PreviewOpts = {
  tradingAccountId: string
  reason: string
  operatorUserId: string
}

type ExecuteOpts = {
  tradingAccountId: string
  reason: string
  operatorUserId: string
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

type PositionQuoteEntry = { price: number; pnlMode: string; skippedNoPrice: boolean }

/** Resolves live prices for all positions via Redis-first ladder. Called OUTSIDE any Prisma tx. */
async function resolvePositionQuotes(
  positions: Array<{
    id: string
    token: number | null
    averagePrice: unknown
    Stock?: { ltp?: unknown } | null
  }>,
): Promise<Map<string, PositionQuoteEntry>> {
  const map = new Map<string, PositionQuoteEntry>()
  for (const pos of positions) {
    const fallbackLtp =
      parseFiniteRiskNumber(pos.Stock?.ltp) ?? parseFiniteRiskNumber(pos.averagePrice) ?? 0
    const result = await resolveLivePrice({
      instrumentToken: pos.token,
      positionId: pos.id,
      fallbackLtp,
    })
    map.set(pos.id, {
      price: result.price,
      pnlMode: result.source,
      skippedNoPrice: result.source === "unpriced",
    })
  }
  return map
}

/** Simple concurrency-capped promise pool. */
async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item !== undefined) await fn(item)
    }
  })
  await Promise.all(workers)
}

/** Looks up the userId owner of a trading account. */
async function resolveTargetUserId(tradingAccountId: string): Promise<string> {
  const account = await prisma.tradingAccount.findUnique({
    where: { id: tradingAccountId },
    select: { userId: true },
  })
  if (!account) throw new Error(`TradingAccount not found: ${tradingAccountId}`)
  return account.userId
}

// ---------------------------------------------------------------------------
// previewLiquidation — dry-run, no DB writes
// ---------------------------------------------------------------------------

export async function previewLiquidation(opts: PreviewOpts): Promise<LiquidationPreviewResult> {
  const { tradingAccountId, reason } = opts
  const repo = new PositionRepository()
  const openPositions = await repo.findActive(tradingAccountId)
  const quoteMap = await resolvePositionQuotes(openPositions)

  const warnings: string[] = []
  const rows: LiquidationPreviewPositionRow[] = []

  for (const pos of openPositions) {
    const qty = Math.trunc(parseFiniteRiskNumber(pos.quantity) ?? 0)
    if (qty === 0) continue

    const avgPrice = parseFiniteRiskNumber(pos.averagePrice) ?? 0
    const quote = quoteMap.get(pos.id) ?? { price: 0, pnlMode: "unpriced", skippedNoPrice: true }

    if (quote.skippedNoPrice) {
      warnings.push(`${pos.symbol}: no live price — position will be skipped`)
    }

    const exitPrice = quote.price
    const projectedRealizedPnL = (exitPrice - avgPrice) * qty
    const projectedMarginFreed = avgPrice * Math.abs(qty)

    rows.push({
      positionId: pos.id,
      symbol: pos.symbol,
      quantity: qty,
      averagePrice: avgPrice,
      projectedExitPrice: exitPrice,
      projectedRealizedPnL,
      projectedMarginFreed,
      pnlMode: quote.pnlMode,
      skippedNoPrice: quote.skippedNoPrice,
    })
  }

  const toClose = rows.filter((r) => !r.skippedNoPrice)
  const skipped = rows.filter((r) => r.skippedNoPrice)

  logger.info({ tradingAccountId, reason, toClose: toClose.length, skipped: skipped.length }, "preview-liquidation")

  return {
    positions: rows,
    totalProjectedPnL: toClose.reduce((s, r) => s + r.projectedRealizedPnL, 0),
    totalMarginFreed: toClose.reduce((s, r) => s + r.projectedMarginFreed, 0),
    positionsToClose: toClose.length,
    positionsSkipped: skipped.length,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// executeLiquidation — closes positions and writes audit row
// ---------------------------------------------------------------------------

export async function executeLiquidation(opts: ExecuteOpts): Promise<LiquidationExecuteResult> {
  const { tradingAccountId, reason, operatorUserId } = opts

  // Step 1: resolve target user and open positions OUTSIDE any transaction
  const targetUserId = await resolveTargetUserId(tradingAccountId)
  const repo = new PositionRepository()
  const openPositions = await repo.findActive(tradingAccountId)
  const quoteMap = await resolvePositionQuotes(openPositions)

  const positionService = createPositionManagementService()
  const closedIds: string[] = []
  const skippedIds: string[] = []
  let totalRealizedPnL = 0
  let totalMarginFreed = 0
  const errors: Array<{ positionId: string; message: string }> = []

  // Step 2: close each non-skipped position with concurrency cap of 3
  const eligible = openPositions.filter((pos) => {
    const q = Math.trunc(parseFiniteRiskNumber(pos.quantity) ?? 0)
    const quote = quoteMap.get(pos.id)
    if (q === 0 || !quote || quote.skippedNoPrice) {
      skippedIds.push(pos.id)
      return false
    }
    return true
  })

  await runWithConcurrency(eligible, async (pos) => {
    const quote = quoteMap.get(pos.id)!
    const qty = Math.trunc(parseFiniteRiskNumber(pos.quantity) ?? 0)
    const avgPrice = parseFiniteRiskNumber(pos.averagePrice) ?? 0

    try {
      const res = await positionService.closePosition(
        pos.id,
        tradingAccountId,
        quote.price,
        undefined,
        {
          reason: "ADMIN_CLOSED",
          closedByUserId: operatorUserId,
          note: `Admin bulk liquidation: ${reason}`,
        },
      )
      if (res.success) {
        closedIds.push(pos.id)
        totalRealizedPnL += res.realizedPnL
        totalMarginFreed += res.marginReleased
      } else {
        errors.push({ positionId: pos.id, message: res.message })
      }
    } catch (err) {
      errors.push({ positionId: pos.id, message: (err as Error)?.message ?? String(err) })
    }

    // keep qty referenced to avoid "unused" lint warnings
    void qty
    void avgPrice
  }, 3)

  if (errors.length > 0) {
    logger.error({ tradingAccountId, errors }, "executeLiquidation: partial close failures")
    throw new Error(
      `Liquidation failed for ${errors.length} position(s): ${errors.map((e) => e.message).join("; ")}`,
    )
  }

  // Step 3: write audit row only after all closes succeed
  const auditEvent = await prisma.riskAuditEvent.create({
    data: {
      eventType: "BULK_LIQUIDATE",
      targetUserId,
      operatorUserId,
      reason,
      snapshotJson: {
        positionsEvaluated: openPositions.length,
        symbols: eligible.map((p) => p.symbol),
      },
      outcomeJson: {
        positionsClosed: closedIds.length,
        positionsSkipped: skippedIds.length,
        totalRealizedPnL,
      },
    },
    select: { id: true },
  })

  logger.info(
    { tradingAccountId, targetUserId, operatorUserId, positionsClosed: closedIds.length, auditEventId: auditEvent.id },
    "executeLiquidation complete",
  )

  return {
    success: true,
    auditEventId: auditEvent.id,
    positionsClosed: closedIds.length,
    positionsSkipped: skippedIds.length,
    totalRealizedPnL,
    marginFreed: totalMarginFreed,
  }
}
