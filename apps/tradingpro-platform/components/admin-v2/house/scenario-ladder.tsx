/**
 * @file components/admin-v2/house/scenario-ladder.tsx
 * @module admin-v2/house
 * @description "If NIFTY moves ±2%, broker P&L shifts by ±₹X" panel. Renders one ladder
 *              card per scenario. Each rung shows shock % and broker P&L impact, tinted by
 *              sign. Conservative naive linear delta — Phase 13 lands Greek-aware.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { formatInr } from "@/lib/admin-v2/api-client"
import type { ScenarioLadder } from "./types"

interface ScenarioLadderCardProps {
  ladder: ScenarioLadder
}

export function ScenarioLadderCard({ ladder }: ScenarioLadderCardProps) {
  const maxAbs = Math.max(1, ...ladder.rungs.map((r) => Math.abs(r.brokerPnlImpact)))

  return (
    <div className="v2-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[var(--v2-text)]">{ladder.scenario}</h4>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            {ladder.symbols.length === 0
              ? "no positions"
              : `${ladder.symbols.length} symbols in basket`}
          </p>
        </div>
        <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-[var(--v2-text-mute)]">
          linear · phase 8
        </span>
      </div>
      <ol className="space-y-1.5">
        {ladder.rungs.map((rung) => {
          const positive = rung.brokerPnlImpact >= 0
          const widthPct = (Math.abs(rung.brokerPnlImpact) / maxAbs) * 100
          return (
            <li key={rung.shockPct} className="grid grid-cols-12 items-center gap-2 text-xs">
              <span className="col-span-2 font-mono text-[11px] text-[var(--v2-text-mute)]">
                {rung.shockPct > 0 ? "+" : ""}
                {rung.shockPct}%
              </span>
              <div className="col-span-6 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className={cn(
                    "h-full rounded-full",
                    positive ? "bg-[var(--v2-gain)]" : "bg-[var(--v2-loss)]",
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span
                className={cn(
                  "col-span-4 v2-num text-right font-semibold",
                  positive ? "text-[var(--v2-gain)]" : "text-[var(--v2-loss)]",
                )}
              >
                {formatInr(rung.brokerPnlImpact)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
