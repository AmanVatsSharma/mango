/**
 * @file components/admin-v2/bonuses/rules-list.tsx
 * @module admin-v2/bonuses
 * @description Bonus rules table — premium glass row with kind chip, pct/flat preview,
 *              turnover requirement, and live grant counts. Click row → opens edit drawer.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { mutate as globalMutate } from "swr"
import { Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { V2Drawer, V2DrawerBody, V2DrawerHeader } from "@/components/admin-v2/primitives/drawer"
import { formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useBonusRules } from "./hooks"
import { RuleForm } from "./rule-form"
import { BONUS_KIND_META, type BonusRuleRow } from "./types"

export function RulesList() {
  const q = useBonusRules()
  const rows = q.data?.rows ?? []
  const [editing, setEditing] = React.useState<BonusRuleRow | null>(null)
  const [creating, setCreating] = React.useState(false)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">Bonus rules</h3>
          <p className="text-[11px] text-[var(--v2-text-mute)]">
            Templates that govern grants — % vs flat, max cap, turnover unlock.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void q.mutate()}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button onClick={() => setCreating(true)} size="sm" className="v2-btn-cta">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New rule
          </Button>
        </div>
      </div>

      <div className="v2-card overflow-hidden">
        {q.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--v2-text-mute)]">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No bonus rules yet"
            description="Add your first rule — % deposit-match, flat ₹ no-deposit, weekly lossback, or referral."
          />
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              <tr>
                <th className="px-3 py-2.5 text-left">Name · Kind</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5 text-right">Cap</th>
                <th className="px-3 py-2.5 text-right">Turnover ×</th>
                <th className="px-3 py-2.5 text-right">Expiry</th>
                <th className="px-3 py-2.5 text-right">Grants</th>
                <th className="px-3 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((row) => {
                const meta = BONUS_KIND_META[row.kind]
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-[var(--v2-cobalt-soft)]"
                    onClick={() => setEditing(row)}
                  >
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-[var(--v2-text)]">{row.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={cn(
                            "v2-pill",
                            meta.tone === "info"
                              ? "v2-pill-info"
                              : meta.tone === "success"
                                ? "v2-pill-success"
                                : meta.tone === "warning"
                                  ? "v2-pill-warning"
                                  : "v2-pill-neutral",
                          )}
                        >
                          {meta.label}
                        </span>
                        {row.description ? (
                          <span className="truncate text-[10px] text-[var(--v2-text-mute)]">
                            {row.description}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="v2-num px-3 py-2 text-right text-[var(--v2-text)]">
                      {meta.isPercentage
                        ? `${row.pctOrFlat.toFixed(0)}%`
                        : formatInr(row.pctOrFlat)}
                    </td>
                    <td className="v2-num px-3 py-2 text-right text-[var(--v2-text-mute)]">
                      {row.maxAmount ? formatInr(row.maxAmount) : "—"}
                    </td>
                    <td className="v2-num px-3 py-2 text-right text-[var(--v2-text-mute)]">
                      {row.turnoverMultiplier}×
                    </td>
                    <td className="v2-num px-3 py-2 text-right text-[var(--v2-text-mute)]">
                      {row.expiryDays ? `${row.expiryDays}d` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-[11px] text-[var(--v2-text)]">
                        {row.activeGrantCount ?? 0}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--v2-text-faint)]">
                        {" / "}
                        {row.totalGrantCount ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={cn(
                          "v2-pill",
                          row.isActive ? "v2-pill-success" : "v2-pill-neutral",
                        )}
                      >
                        {row.isActive ? "live" : "off"}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <V2Drawer open={creating} onOpenChange={setCreating}>
        <V2DrawerHeader title="New bonus rule" subtitle="" onClose={() => setCreating(false)} />
        <V2DrawerBody className="px-4 py-5 sm:px-6">
          <RuleForm
            onSaved={() => {
              setCreating(false)
              void q.mutate()
              void globalMutate("/api/admin/bonuses/rules")
            }}
            onCancel={() => setCreating(false)}
          />
        </V2DrawerBody>
      </V2Drawer>

      <V2Drawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <V2DrawerHeader
          title="Edit rule"
          subtitle={editing ? `${editing.name} · updated ${formatRelativeIst(editing.updatedAt)}` : ""}
          onClose={() => setEditing(null)}
        />
        <V2DrawerBody className="px-4 py-5 sm:px-6">
          {editing ? (
            <RuleForm
              initial={editing}
              onSaved={() => {
                setEditing(null)
                void q.mutate()
              }}
              onDeleted={() => {
                setEditing(null)
                void q.mutate()
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </V2DrawerBody>
      </V2Drawer>
    </div>
  )
}
