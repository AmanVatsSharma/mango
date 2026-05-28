/**
 * @file components/admin-v2/house/concentration-meter.tsx
 * @module admin-v2/house
 * @description Concentration risk dial — top-5 share of book, both by symbol and by client.
 *              Higher concentration = bigger risk that one symbol or one whale moves the
 *              broker P&L sharply. Coloured tonal bands: <30% safe, 30–60% warn, >60% danger.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ConcentrationMeterProps {
  label: string
  /** Fractional share, 0..1 */
  share: number
  hint?: string
}

function toneFor(share: number): { bar: string; text: string; band: string } {
  if (share >= 0.6) {
    return {
      bar: "from-[var(--v2-loss)] to-[#FF8AA0]",
      text: "text-[var(--v2-loss)]",
      band: "danger",
    }
  }
  if (share >= 0.3) {
    return {
      bar: "from-[var(--v2-warn)] to-[#FFCB66]",
      text: "text-[var(--v2-warn)]",
      band: "warn",
    }
  }
  return {
    bar: "from-[var(--v2-gain)] to-[#5BC1FF]",
    text: "text-[var(--v2-gain)]",
    band: "safe",
  }
}

export function ConcentrationMeter({ label, share, hint }: ConcentrationMeterProps) {
  const safeShare = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0
  const pct = (safeShare * 100).toFixed(1)
  const tone = toneFor(safeShare)

  return (
    <div className="v2-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-text-faint)]">
          {label}
        </span>
        <span
          className={cn(
            "v2-num-display text-lg font-bold",
            tone.text,
          )}
        >
          {pct}%
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--v2-text-faint)]">
        <span>0%</span>
        <span className={cn("font-semibold uppercase tracking-[0.08em]", tone.text)}>{tone.band}</span>
        <span>100%</span>
      </div>
      {hint ? (
        <p className="mt-2 text-[11px] text-[var(--v2-text-mute)]">{hint}</p>
      ) : null}
    </div>
  )
}
