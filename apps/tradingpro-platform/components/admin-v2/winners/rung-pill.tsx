/**
 * @file components/admin-v2/winners/rung-pill.tsx
 * @module admin-v2/winners
 * @description Tone-coded pill for a WinnerRung. Reuses the v2-pill design language.
 *              Variants: default (full label) · compact (severity dot only) · with-count.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { WINNER_RUNG_META, type WinnerRung } from "./types"

const TONE_CLASS: Record<string, string> = {
  neutral: "v2-pill v2-pill-neutral",
  info: "v2-pill v2-pill-info",
  warning: "v2-pill v2-pill-warning",
  danger: "v2-pill v2-pill-danger",
}

interface RungPillProps {
  rung: WinnerRung
  count?: number | null
  size?: "xs" | "sm" | "md"
  showSeverity?: boolean
  className?: string
}

export function RungPill({
  rung,
  count,
  size = "sm",
  showSeverity = false,
  className,
}: RungPillProps) {
  const meta = WINNER_RUNG_META[rung]
  const baseTone = TONE_CLASS[meta.tone] ?? TONE_CLASS.neutral
  const sizeCls =
    size === "xs"
      ? "px-1.5 py-[1px] text-[9px]"
      : size === "md"
        ? "px-2.5 py-1 text-xs"
        : "px-2 py-0.5 text-[10px]"

  return (
    <span
      className={cn(baseTone, sizeCls, "inline-flex items-center gap-1", className)}
      title={meta.description}
    >
      {showSeverity ? (
        <span
          aria-hidden
          className="font-mono opacity-70"
        >
          {meta.severity}
        </span>
      ) : null}
      <span>{meta.label}</span>
      {count !== undefined && count !== null ? (
        <span className="ml-0.5 rounded-md border border-white/[0.06] bg-black/20 px-1 font-mono text-[9px] opacity-90">
          {count}
        </span>
      ) : null}
    </span>
  )
}
