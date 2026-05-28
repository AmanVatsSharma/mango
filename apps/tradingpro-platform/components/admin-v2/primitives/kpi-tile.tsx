/**
 * @file components/admin-v2/primitives/kpi-tile.tsx
 * @module admin-v2/primitives
 * @description KPI tile — the most-seen primitive in v2. Glass card with gradient surface,
 *              big tabular display number, optional icon badge, optional sparkline slot,
 *              and a hover lift. Tone defaults to neutral; gain (green) and loss (red)
 *              produce gradient text + matching glow on hover.
 *
 *              Exports:
 *                - KpiTile  — props { label, value, delta?, deltaLabel?, hint?, tone?, icon?, sparkline?, loading?, error? }.
 *
 *              Side-effects: none.
 *
 *              Key invariants:
 *                - Numeric values render in IBM Plex Mono via .v2-num-display, slashed-zero, tabular.
 *                - When `loading`, a Skeleton replaces the value (never spinner).
 *                - Hover lift respects prefers-reduced-motion (handled in admin-v2.css).
 *
 *              Read order:
 *                1. KpiTileProps — the contract.
 *                2. KpiTile — the renderer.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { StatusTone } from "./status-pill"

interface KpiTileProps {
  label: string
  value: React.ReactNode
  delta?: number
  deltaLabel?: React.ReactNode
  hint?: React.ReactNode
  /** Override the tone (delta sign auto-derives if not set). */
  tone?: StatusTone
  /** Lucide icon (or any node). Rendered as a tinted badge in the top-right. */
  icon?: React.ReactNode
  sparkline?: React.ReactNode
  loading?: boolean
  error?: React.ReactNode
  className?: string
}

const DELTA_TONE: Record<"up" | "down" | "flat", StatusTone> = {
  up: "success",
  down: "danger",
  flat: "neutral",
}

const ICON_BG: Record<StatusTone, string> = {
  success: "bg-[var(--v2-gain-soft)] text-[#5DF7BC]",
  warning: "bg-[var(--v2-warn-soft)] text-[#FFCB66]",
  danger: "bg-[var(--v2-loss-soft)] text-[#FF8AA0]",
  info: "bg-[var(--v2-info-soft)] text-[#8AD3FF]",
  neutral: "bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]",
}

const DELTA_TEXT: Record<StatusTone, string> = {
  success: "text-[#5DF7BC]",
  warning: "text-[#FFCB66]",
  danger: "text-[#FF8AA0]",
  info: "text-[#8AD3FF]",
  neutral: "text-[var(--v2-text-mute)]",
}

const VALUE_GRAD: Record<StatusTone, string | undefined> = {
  success: "v2-text-gain",
  danger: "v2-text-loss",
  warning: undefined,
  info: undefined,
  neutral: "v2-text-grad-primary",
}

function deltaDirection(delta: number | undefined): "up" | "down" | "flat" {
  if (delta == null || delta === 0) return "flat"
  return delta > 0 ? "up" : "down"
}

export function KpiTile({
  label,
  value,
  delta,
  deltaLabel,
  hint,
  tone,
  icon,
  sparkline,
  loading = false,
  error = null,
  className,
}: KpiTileProps) {
  const dir = deltaDirection(delta)
  const resolvedTone: StatusTone = tone ?? DELTA_TONE[dir]
  const ArrowIcon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : ArrowRight
  const valueGradient = VALUE_GRAD[resolvedTone]

  return (
    <div className={cn("v2-card v2-card-hover relative overflow-hidden p-4", className)}>
      {/* Soft tonal glow in the corner — invisible until hover */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100",
          resolvedTone === "success" && "bg-[var(--v2-gain)]",
          resolvedTone === "danger" && "bg-[var(--v2-loss)]",
          resolvedTone === "warning" && "bg-[var(--v2-warn)]",
          resolvedTone === "info" && "bg-[var(--v2-info)]",
          resolvedTone === "neutral" && "bg-[var(--v2-cobalt)]",
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            {label}
          </div>
          <div
            className={cn(
              "mt-2 v2-num-display text-3xl font-semibold leading-none",
              valueGradient,
            )}
          >
            {loading ? (
              <Skeleton className="h-8 w-28 bg-white/[0.06]" />
            ) : error ? (
              <span className="text-base font-medium text-[#FF8AA0]">{error}</span>
            ) : (
              value
            )}
          </div>
          {deltaLabel ? (
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium",
                DELTA_TEXT[resolvedTone],
              )}
            >
              <ArrowIcon className="h-3 w-3" aria-hidden />
              <span className="v2-num">{deltaLabel}</span>
            </div>
          ) : null}
          {hint ? (
            <div className="mt-2 text-xs text-[var(--v2-text-mute)]">{hint}</div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {icon ? (
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06]",
                ICON_BG[resolvedTone],
              )}
            >
              {icon}
            </div>
          ) : null}
          {sparkline ? <div className="text-[var(--v2-text-mute)]">{sparkline}</div> : null}
        </div>
      </div>
    </div>
  )
}
