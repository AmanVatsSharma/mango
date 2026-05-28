/**
 * File:        components/admin-v2/surveillance/severity-pill.tsx
 * Module:      admin-v2/surveillance
 * Purpose:     Tiny visual primitive — colour-coded severity pill + confidence meter
 *              shared across the queue, drawer, and rule editor.
 *
 * Exports:
 *   - SeverityPill   — props: { severity }
 *   - ConfidenceMeter — props: { score } — 0-100 horizontal bar, gradient tone.
 *
 * Side-effects: none.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import type { SurveillanceSeverity } from "./types"

const SEV_TONE: Record<SurveillanceSeverity, string> = {
  LOW: "v2-pill v2-pill-info",
  MEDIUM: "v2-pill v2-pill-warning",
  HIGH: "v2-pill v2-pill-danger",
  CRITICAL: "v2-pill v2-pill-danger",
}

export function SeverityPill({ severity }: { severity: SurveillanceSeverity }) {
  return (
    <span
      className={cn(
        SEV_TONE[severity],
        severity === "CRITICAL" &&
          "border-[var(--v2-loss)] !text-[var(--v2-loss)] shadow-[0_0_18px_-6px_var(--v2-loss)]",
      )}
    >
      {severity}
    </span>
  )
}

/**
 * Horizontal 0-100 bar; tone ramps loss (low conf) → warn (mid) → cobalt (good) → gain (very strong).
 * Mirrors the withdrawal RiskMeter ramp, inverted (here higher = more confident the signal is real).
 */
export function ConfidenceMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  let bar = "var(--v2-loss)"
  if (clamped >= 80) bar = "var(--v2-gain)"
  else if (clamped >= 60) bar = "var(--v2-cobalt)"
  else if (clamped >= 40) bar = "var(--v2-warn)"
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${clamped}%`, background: bar }}
        />
      </div>
      <span className="v2-num text-xs tabular-nums text-[var(--v2-text-mute)]">
        {clamped}
      </span>
    </div>
  )
}
