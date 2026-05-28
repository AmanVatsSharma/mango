/**
 * File:        app/api/admin/risk/exposure-preview/route.ts
 * Module:      Admin Console · Risk Management
 * Purpose:     Read-only preview of per-account loss utilisation vs canonical risk thresholds,
 *              now using the live-price ladder (market-quote → position-pnl → stock-ltp) for P&L.
 *
 * Exports:
 *   - GET(req) → NextResponse  — returns rows per trading account with risk status and P&L mode
 *
 * Depends on:
 *   - @/lib/market-data/live-quote-ladder — tiered live price resolution
 *   - @/lib/services/position/position-risk-evaluator — margin utilisation + auto-close logic
 *   - @/lib/rbac/admin-api                — auth guard
 *
 * Side-effects:
 *   - DB read (prisma.tradingAccount.findMany) + Redis GETs per position.
 *
 * Key invariants:
 *   - Positions with source "unpriced" are SKIPPED — not included in P&L math
 *   - pnlMode on each row is the worst-source across the account's positions
 *   - ?pnl=legacy uses old Stock.ltp-only path (available until 2026-04-27 IST)
 *   - CUTOFF_DATE guards the legacy escape hatch; after it the param is ignored silently
 *
 * Read order:
 *   1. PNLMODE_PRIORITY — tier ordering
 *   2. GET handler — main flow
 *   3. buildLegacySnapshots — old path preserved for rollback
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { getRiskThresholds } from "@/lib/services/risk/risk-thresholds"
import {
  computeMarginUtilizationPercent,
  pickRiskAutoClosePositions,
  type RiskPositionSnapshot,
} from "@/lib/services/position/position-risk-evaluator"
import { parseFinitePositionNumber } from "@/lib/services/position/position-number-utils"
import { resolveLivePrice, type LivePriceSource } from "@/lib/market-data/live-quote-ladder"
import type { ExposureRowPnlMode } from "@/components/admin-console/risk-management/risk-types"

/** Legacy escape hatch expires at midnight IST 2026-04-27 */
const CUTOFF_DATE = new Date("2026-04-27T00:00:00+05:30")

const PNLMODE_PRIORITY: ExposureRowPnlMode[] = [
  "unpriced",
  "legacy",
  "db",
  "worker",
  "live",
]

function worstPnlMode(modes: ExposureRowPnlMode[]): ExposureRowPnlMode {
  if (modes.length === 0) return "unpriced"
  let worst = modes[0]
  for (const m of modes) {
    if (PNLMODE_PRIORITY.indexOf(m) < PNLMODE_PRIORITY.indexOf(worst)) {
      worst = m
    }
  }
  return worst
}

function sourceToMode(src: LivePriceSource): ExposureRowPnlMode {
  switch (src) {
    case "market-quote": return "live"
    case "position-pnl": return "worker"
    case "stock-ltp":    return "db"
    default:             return "unpriced"
  }
}

function parseLimit(value: string | null, fallback: number, max: number): number {
  if (value == null || value === "") return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(max, Math.trunc(n)))
}

function toNum(v: unknown): number {
  const n = parseFinitePositionNumber(v)
  return n === null ? 0 : n
}

type PositionRow = {
  id: string
  symbol: string | null
  quantity: unknown
  averagePrice: unknown
  token: number | null
  instrumentId: string | null
  Stock: { instrumentId: string | null; ltp: unknown; symbol: string | null; token: number | null } | null
}

function buildLegacySnapshots(
  positions: PositionRow[],
  skipReasons: string[],
): { snapshots: RiskPositionSnapshot[]; modes: ExposureRowPnlMode[] } {
  const snapshots: RiskPositionSnapshot[] = []
  const modes: ExposureRowPnlMode[] = []
  for (const p of positions) {
    const qty = toNum(p.quantity)
    const avg = toNum(p.averagePrice)
    const ltp = toNum(p.Stock?.ltp)
    const instrumentId = p.Stock?.instrumentId
    if (!instrumentId) skipReasons.push(`no_instrument:${p.symbol}`)
    let price = ltp
    if (!Number.isFinite(price) || price <= 0) {
      skipReasons.push(`missing_ltp:${p.symbol}`)
      price = avg > 0 ? avg : 0
    }
    const unrealizedPnL = Number(((price - avg) * qty).toFixed(2))
    snapshots.push({ positionId: p.id, symbol: String(p.symbol || ""), quantity: qty, unrealizedPnL })
    modes.push("legacy")
  }
  return { snapshots, modes }
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/exposure-preview",
      required: "admin.risk.read",
      fallbackMessage: "Failed to load risk exposure preview",
    },
    async (ctx) => {
      const url = new URL(req.url)
      const limit = parseLimit(url.searchParams.get("limit"), 100, 500)
      const useLegacy =
        url.searchParams.get("pnl") === "legacy" && new Date() < CUTOFF_DATE

      const thresholdsRow = await getRiskThresholds({ maxAgeMs: 0 })
      const thresholds = {
        warningThreshold: thresholdsRow.warningThreshold,
        autoCloseThreshold: thresholdsRow.autoCloseThreshold,
        source: thresholdsRow.source,
      }

      const accounts = await adminPrisma.tradingAccount.findMany({
        where: { positions: { some: { quantity: { not: 0 } } } },
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true, clientId: true } },
          positions: {
            where: { quantity: { not: 0 } },
            include: {
              Stock: { select: { instrumentId: true, ltp: true, symbol: true, token: true } },
            },
          },
        },
      })

      const rows: Array<{
        tradingAccountId: string
        userId: string
        userName: string
        clientId: string | null
        totalFunds: number
        totalUnrealizedPnL: number
        lossUtilizationPercent: number
        openPositions: number
        wouldWarn: boolean
        wouldAutoClose: boolean
        skipReasons: string[]
        pnlMode: ExposureRowPnlMode
      }> = []

      for (const acc of accounts) {
        const balance = toNum(acc.balance)
        const availableMargin = toNum(acc.availableMargin)
        const totalFunds = balance + availableMargin

        const skipReasons: string[] = []
        let snapshots: RiskPositionSnapshot[]
        let modes: ExposureRowPnlMode[]

        if (useLegacy) {
          const result = buildLegacySnapshots(acc.positions as PositionRow[], skipReasons)
          snapshots = result.snapshots
          modes = result.modes
        } else {
          const resolved = await Promise.all(
            (acc.positions as PositionRow[]).map(async (p) => {
              const qty = toNum(p.quantity)
              const avg = toNum(p.averagePrice)
              const instrumentToken = p.token ?? p.Stock?.token ?? null
              const fallbackLtp = toNum(p.Stock?.ltp)

              const livePrice = await resolveLivePrice({
                instrumentToken,
                positionId: p.id,
                fallbackLtp: fallbackLtp > 0 ? fallbackLtp : null,
              })

              if (livePrice.source === "unpriced") {
                skipReasons.push(`no_live_price:${p.symbol}`)
                return null
              }

              const unrealizedPnL = Number(((livePrice.price - avg) * qty).toFixed(2))
              return {
                snapshot: {
                  positionId: p.id,
                  symbol: String(p.symbol || ""),
                  quantity: qty,
                  unrealizedPnL,
                } satisfies RiskPositionSnapshot,
                mode: sourceToMode(livePrice.source),
              }
            }),
          )

          snapshots = []
          modes = []
          for (const r of resolved) {
            if (r !== null) {
              snapshots.push(r.snapshot)
              modes.push(r.mode)
            }
          }
        }

        const totalUnrealizedPnL = snapshots.reduce((s, x) => s + x.unrealizedPnL, 0)
        const lossUtilizationPercent = computeMarginUtilizationPercent(totalUnrealizedPnL, totalFunds)

        const selection = pickRiskAutoClosePositions({
          positions: snapshots,
          totalFunds,
          thresholds: { warningThreshold: thresholds.warningThreshold, autoCloseThreshold: thresholds.autoCloseThreshold },
        })

        if (totalFunds <= 0) skipReasons.push("zero_total_funds")

        rows.push({
          tradingAccountId: acc.id,
          userId: acc.userId,
          userName: acc.user.name || acc.user.email || "Unknown",
          clientId: acc.user.clientId ?? null,
          totalFunds,
          totalUnrealizedPnL,
          lossUtilizationPercent,
          openPositions: snapshots.length,
          wouldWarn: selection.shouldWarn,
          wouldAutoClose: selection.shouldAutoClose,
          skipReasons: Array.from(new Set(skipReasons)),
          pnlMode: worstPnlMode(modes),
        })
      }

      ctx.logger.info({ count: rows.length, limit, useLegacy }, "GET /api/admin/risk/exposure-preview")

      return NextResponse.json(
        {
          success: true,
          generatedAt: new Date().toISOString(),
          thresholds,
          note: useLegacy
            ? "Legacy mode: P&L uses Stock.ltp (DB snapshot). Switch off before 2026-04-27."
            : "P&L uses live market ladder (market-quote → position-pnl worker → stock-ltp). Positions with no live price are excluded from utilisation math.",
          rows,
        },
        { status: 200 },
      )
    },
  )
}
