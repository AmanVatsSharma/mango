/**
 * @file components/admin-v2/primitives/empty-state.tsx
 * @module admin-v2/primitives
 * @description Empty state — gradient ring around an icon badge, refined typography.
 *              Used by DataTable when row-count is zero and by every workbench's first-run.
 *
 *              Exports:
 *                - EmptyState  — props { icon?, title, description?, action? }.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Inbox } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "v2-card relative flex flex-col items-center justify-center gap-3 overflow-hidden px-6 py-12 text-center",
        className,
      )}
    >
      {/* Subtle gradient backdrop for empty states — enough to show this isn't a broken render. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(420px 220px at 50% 0%, rgba(77,124,254,0.10) 0%, rgba(77,124,254,0) 60%)",
        }}
      />
      <div
        aria-hidden
        className="v2-ring-grad relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] text-[var(--v2-text-mute)]"
      >
        {icon ?? <Inbox className="h-6 w-6" aria-hidden />}
      </div>
      <h3 className="relative text-base font-semibold text-[var(--v2-text)]">{title}</h3>
      {description ? (
        <p className="relative max-w-sm text-sm leading-relaxed text-[var(--v2-text-mute)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="relative pt-1">{action}</div> : null}
    </div>
  )
}
