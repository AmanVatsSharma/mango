/**
 * @file components/admin-v2/client-360/tab-strip.tsx
 * @module admin-v2/client-360
 * @description Permission-gated tab strip for Client 360. Tabs that the user lacks permissions
 *              for are not rendered (never rendered then hidden — RBAC drives mount/unmount).
 *              Active tab is URL-driven via ?tab=… so deep links work and state survives reload.
 *
 *              Exports:
 *                - ClientTabStrip  — props { active, onChange, permissions, counts? }.
 *                - DEFAULT_TAB     — fallback tab when none is in URL.
 *                - TAB_PERMISSIONS — permission key required per tab.
 *
 *              Side-effects: none.
 *
 *              Read order:
 *                1. TAB_PERMISSIONS — gate map.
 *                2. ClientTabStrip — the renderer.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import type { TabKey } from "./types"

interface TabDef {
  key: TabKey
  label: string
}

export const TABS: TabDef[] = [
  { key: "overview", label: "Overview" },
  { key: "compliance", label: "Compliance" },
  { key: "trading", label: "Trading" },
  { key: "funds", label: "Funds" },
  { key: "crm", label: "CRM" },
  { key: "risk", label: "Risk" },
  { key: "winners", label: "Winner controls" },
  { key: "bonuses", label: "Bonuses" },
  { key: "affiliate", label: "Affiliate" },
  { key: "comms", label: "Comms" },
  { key: "sessions", label: "Sessions" },
  { key: "audit", label: "Audit" },
]

/** Required permission key per tab. Empty string = always visible (Overview is always shown). */
export const TAB_PERMISSIONS: Record<TabKey, string> = {
  overview: "",
  compliance: "admin.users.kyc",
  trading: "admin.users.read",
  funds: "admin.users.read",
  crm: "admin.users.crm",
  risk: "admin.users.risk",
  winners: "admin.house.winner",
  bonuses: "admin.bonus.read",
  affiliate: "admin.affiliate.read",
  comms: "admin.comms.read",
  sessions: "admin.session-security.read",
  audit: "admin.users.read",
}

export const DEFAULT_TAB: TabKey = "overview"

interface ClientTabStripProps {
  active: TabKey
  onChange: (next: TabKey) => void
  permissions: string[]
  /** Optional counts to render as small chips next to a tab label (e.g., CRM open tasks). */
  counts?: Partial<Record<TabKey, number>>
}

function isPermitted(tab: TabKey, permissions: string[]): boolean {
  const required = TAB_PERMISSIONS[tab]
  if (!required) return true
  if (permissions.includes("admin.all")) return true
  return permissions.includes(required)
}

export function ClientTabStrip({
  active,
  onChange,
  permissions,
  counts,
}: ClientTabStripProps) {
  return (
    <div
      role="tablist"
      aria-label="Client tabs"
      className="sticky top-[88px] z-10 flex gap-1 overflow-x-auto border-b border-zinc-800/60 bg-zinc-950/95 px-3 py-1 backdrop-blur"
    >
      {TABS.filter((t) => isPermitted(t.key, permissions)).map((tab) => {
        const isActive = active === tab.key
        const count = counts?.[tab.key]
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-zinc-800/60 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200",
            )}
          >
            {tab.label}
            {count !== undefined && count > 0 ? (
              <span className="rounded-full bg-zinc-700/60 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200 tabular-nums">
                {count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
