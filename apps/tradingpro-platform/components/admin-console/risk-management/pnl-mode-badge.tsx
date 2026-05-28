/**
 * File:        components/admin-console/risk-management/pnl-mode-badge.tsx
 * Module:      Admin Console · Risk Management
 * Purpose:     Renders a colored dot and label indicating the P&L price source tier for an account row.
 *
 * Exports:
 *   - PnlModeBadge({ mode })  — colored dot + label for "live" | "worker" | "db" | "legacy" | "unpriced" | undefined
 *
 * Depends on:
 *   - none (Tailwind utility classes only)
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - undefined mode renders the same as "unpriced" (grey dot, "–")
 *
 * Read order:
 *   1. DOT_CLASSES / LABELS — color/text map
 *   2. PnlModeBadge — component
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import type { ExposureRowPnlMode } from "./risk-types"

type PnlModeProps = { mode: ExposureRowPnlMode | undefined }

const DOT_CLASSES: Record<NonNullable<ExposureRowPnlMode>, string> = {
  live:     "bg-green-500",
  worker:   "bg-amber-400",
  db:       "bg-red-500",
  legacy:   "bg-red-500",
  unpriced: "bg-gray-400",
}

const LABELS: Record<NonNullable<ExposureRowPnlMode>, string> = {
  live:     "Live",
  worker:   "Worker",
  db:       "DB",
  legacy:   "Legacy",
  unpriced: "–",
}

export function PnlModeBadge({ mode }: PnlModeProps) {
  const key = mode ?? "unpriced"
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLASSES[key]}`} />
      {LABELS[key]}
    </span>
  )
}
