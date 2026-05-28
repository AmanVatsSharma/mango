"use client"

/**
 * File:        components/trading/order-drawer/DrawerPeekActions.tsx
 * Module:      Trading · Watchlist Order Drawer
 * Purpose:     Primary action zone for the peek/expanded drawer — Buy/Sell pair plus two rows of secondary
 *              actions (View chart + Option chain on row 1; Set alert + Add notes + Create GTT on row 2),
 *              inspired by Kite Zerodha.
 *
 * Exports:
 *   - DrawerPeekActions (props: { onBuy, onSell, onViewChart?, onOptionChain?, onSetAlert?, onAddNotes?, onCreateGTT?, isOptionable?, comingSoon? }) — renders the action stack
 *
 * Depends on:
 *   - lib/utils (cn)
 *   - lucide-react — small inline action icons
 *
 * Side-effects:
 *   - none (delegates every action to a handler prop)
 *
 * Key invariants:
 *   - The codebase's globals.css remaps every `bg-blue-*` / `text-blue-*` / `border-blue-*` to a pale
 *     brand-tinted color via `!important` (see app/globals.css ~L290–315). To render a SOLID brand-colored
 *     BUY button we use the design-system token `bg-primary text-primary-foreground` instead. Sell uses
 *     `bg-rose-500` which is NOT remapped.
 *   - When a secondary handler is undefined OR comingSoon[id] === true, the action still renders (as a
 *     muted ghost button) so the layout never reflows between instruments.
 *   - Layout: row 1 (View chart, Option chain) and row 2 (Set alert, Add notes, Create GTT) are split by
 *     a hairline divider. Same as the Kite reference (image #4) — option chain may be hidden when the
 *     instrument is not optionable.
 *
 * Read order:
 *   1. DrawerPeekActionsProps
 *   2. CHART_ROW + ALERTS_ROW — semantic grouping
 *   3. JSX — Buy/Sell row, divider, action rows
 *
 * Author:      Aman Sharma
 * Last-updated: 2026-04-29
 */

import * as React from "react"
import { BarChart3, Bell, FileText, Send, Sliders } from "lucide-react"
import { cn } from "@/lib/utils"

type SecondaryActionId = "chart" | "options" | "alert" | "notes" | "gtt"

export interface DrawerPeekActionsProps {
  onBuy: () => void
  onSell: () => void
  onViewChart?: () => void
  onOptionChain?: () => void
  onSetAlert?: () => void
  onAddNotes?: () => void
  onCreateGTT?: () => void
  /** Hide the option-chain action when the instrument has no derivatives (cash equity with no F&O underlying). */
  isOptionable?: boolean
  /** Map of action ids that should render greyed even if a handler is provided — e.g. feature behind a flag. */
  comingSoon?: Partial<Record<SecondaryActionId, boolean>>
}

interface SecondaryAction {
  id: SecondaryActionId
  label: string
  icon: React.ComponentType<{ className?: string }>
  handler?: () => void
}

export function DrawerPeekActions({
  onBuy,
  onSell,
  onViewChart,
  onOptionChain,
  onSetAlert,
  onAddNotes,
  onCreateGTT,
  isOptionable = true,
  comingSoon = {},
}: DrawerPeekActionsProps) {
  const chartRow: SecondaryAction[] = [
    { id: "chart", label: "View chart", icon: BarChart3, handler: onViewChart },
    ...(isOptionable
      ? [{ id: "options" as const, label: "Option chain", icon: Sliders, handler: onOptionChain }]
      : []),
  ]
  const alertsRow: SecondaryAction[] = [
    { id: "alert", label: "Set alert", icon: Bell, handler: onSetAlert },
    { id: "notes", label: "Add notes", icon: FileText, handler: onAddNotes },
    { id: "gtt", label: "Create GTT", icon: Send, handler: onCreateGTT },
  ]

  return (
    <div className="px-5 pb-3">
      {/* Buy / Sell — the headline action pair.
          NOTE: bg-primary/text-primary-foreground (NOT bg-blue-600) because globals.css remaps blue. */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onBuy}
          className={cn(
            "h-12 rounded-xl text-sm font-bold uppercase tracking-wider shadow-sm transition-all",
            "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]",
          )}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={onSell}
          className={cn(
            "h-12 rounded-xl text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-all",
            "bg-rose-500 hover:bg-rose-600 active:scale-[0.98]",
          )}
        >
          Sell
        </button>
      </div>

      {/* Secondary actions — two rows separated by a hairline divider. */}
      <ActionRow actions={chartRow} comingSoon={comingSoon} columns={chartRow.length} className="mt-4" />
      <div className="mx-1 mt-3 border-t border-border" />
      <ActionRow actions={alertsRow} comingSoon={comingSoon} columns={alertsRow.length} className="mt-3" />
    </div>
  )
}

interface ActionRowProps {
  actions: SecondaryAction[]
  comingSoon: Partial<Record<SecondaryActionId, boolean>>
  columns: number
  className?: string
}

function ActionRow({ actions, comingSoon, columns, className }: ActionRowProps) {
  return (
    <div
      className={cn("grid items-center gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {actions.map((action) => {
        const isComingSoon = comingSoon[action.id] === true
        const isLive = !!action.handler && !isComingSoon
        return (
          <button
            key={action.id}
            type="button"
            disabled={!isLive}
            onClick={action.handler}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1.5 px-1 py-1.5 text-sm font-medium transition-colors",
              isLive
                ? "text-primary hover:opacity-80"
                : "cursor-not-allowed text-muted-foreground/60",
            )}
          >
            <action.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{action.label}</span>
          </button>
        )
      })}
    </div>
  )
}
