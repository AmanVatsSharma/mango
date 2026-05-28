/**
 * @file components/admin-v2/primitives/status-pill.tsx
 * @module admin-v2/primitives
 * @description Canonical status pill for v2 — uses the brand v2-pill classes from admin-v2.css
 *              for a glassy, gradient-tinted look. Single source of status colors across v2.
 *
 *              Exports:
 *                - StatusPill           — the renderer.
 *                - StatusKind           — supported domain status kinds.
 *                - StatusTone           — supported tones.
 *                - statusKindToTone(k)  — utility mapping.
 *
 *              Side-effects: none.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"

export type StatusKind =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "REVIEW"
  | "ESCALATED"
  | "CLEAR"
  | "CLEARED"
  | "HIT"
  | "NONE"
  | "OVERDUE"
  | "DUE_SOON"
  | "ON_TRACK"
  | "WATCH"
  | "SPREAD_WIDEN"
  | "POSITION_CAP"
  | "INSTRUMENT_BLOCK"
  | "ORDER_REJECT"
  | "CLOSE_ONLY"
  | "CLOSED_OUT"

const KIND_TO_TONE: Record<StatusKind, StatusTone> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  SUSPENDED: "danger",
  PENDING: "info",
  APPROVED: "success",
  REJECTED: "danger",
  REVIEW: "warning",
  ESCALATED: "danger",
  CLEAR: "success",
  CLEARED: "success",
  HIT: "danger",
  NONE: "neutral",
  OVERDUE: "danger",
  DUE_SOON: "warning",
  ON_TRACK: "success",
  WATCH: "info",
  SPREAD_WIDEN: "warning",
  POSITION_CAP: "warning",
  INSTRUMENT_BLOCK: "warning",
  ORDER_REJECT: "danger",
  CLOSE_ONLY: "danger",
  CLOSED_OUT: "danger",
}

export function statusKindToTone(kind: StatusKind): StatusTone {
  return KIND_TO_TONE[kind] ?? "neutral"
}

const TONE_CLASS: Record<StatusTone, string> = {
  success: "v2-pill-success",
  warning: "v2-pill-warning",
  danger: "v2-pill-danger",
  info: "v2-pill-info",
  neutral: "v2-pill-neutral",
}

const SIZE_CLASS = {
  sm: "!px-2 !py-[1px] !text-[9px]",
  md: "",
  lg: "!px-2.5 !py-1 !text-[11px]",
} as const

type Size = keyof typeof SIZE_CLASS

interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  kind?: StatusKind
  tone?: StatusTone
  label?: React.ReactNode
  size?: Size
  /** Pulsing live dot prefix (uses .v2-dot-live; success-tinted when tone=success). */
  dot?: boolean
}

export function StatusPill({
  kind,
  tone,
  label,
  size = "md",
  dot = false,
  className,
  ...rest
}: StatusPillProps) {
  const resolvedTone: StatusTone = tone ?? (kind ? statusKindToTone(kind) : "neutral")
  const resolvedLabel = label ?? kind ?? ""
  return (
    <span
      role="status"
      className={cn("v2-pill", TONE_CLASS[resolvedTone], SIZE_CLASS[size], className)}
      {...rest}
    >
      {dot ? <span aria-hidden className="v2-dot-live" /> : null}
      {resolvedLabel}
    </span>
  )
}
