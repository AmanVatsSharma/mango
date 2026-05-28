/**
 * @file components/admin-v2/spread/spread-workbench.tsx
 * @module admin-v2/spread
 * @description /admin-v2/house/quotes — list spread configs + edit drawer + simulator panel.
 *              Premium broker aesthetic: glass cards, brand pills, gradient hero.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { mutate as globalMutate } from "swr"
import { Plus, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { V2Drawer, V2DrawerBody, V2DrawerHeader } from "@/components/admin-v2/primitives/drawer"
import { formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useSpreadConfigs } from "./hooks"
import { SpreadForm } from "./spread-form"
import { SlippageSimulator } from "./slippage-simulator"
import type { SpreadConfigRow } from "./types"

export function SpreadWorkbench() {
  const q = useSpreadConfigs()
  const rows = q.data?.rows ?? []
  const [editing, setEditing] = React.useState<SpreadConfigRow | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [simulatorPrefill, setSimulatorPrefill] = React.useState<SpreadConfigRow | undefined>(undefined)

  const activeCount = rows.filter((r) => r.isActive).length
  const widestBid = rows.reduce((m, r) => Math.max(m, r.bidMarkupBps), 0)
  const widestAsk = rows.reduce((m, r) => Math.max(m, r.askMarkupBps), 0)

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Spread &amp; Quotes</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-amber-300/80">
              orphan engine · NOT wired to live quotes
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Markup engine
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--v2-text-mute)]">
            Per-instrument · per-segment · per-tier markup applied on top of raw upstream quotes.
            Per-client winner-control multipliers stack on top.
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
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add config
          </Button>
        </div>
      </header>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Total configs"
          value={rows.length}
          tone="info"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <KpiTile label="Active" value={activeCount} tone="success" />
        <KpiTile
          label="Widest bid markup"
          value={`${widestBid.toFixed(1)} bps`}
          tone="neutral"
        />
        <KpiTile
          label="Widest ask markup"
          value={`${widestAsk.toFixed(1)} bps`}
          tone="neutral"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="v2-card overflow-hidden">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
              <h3 className="text-sm font-semibold text-[var(--v2-text)]">Spread configs</h3>
              <span className="text-[11px] text-[var(--v2-text-faint)]">
                most-specific match wins
              </span>
            </header>
            {q.isLoading ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--v2-text-mute)]">Loading…</p>
            ) : rows.length === 0 ? (
              <EmptyState
                title="No spread configs yet"
                description="Add your first markup row — defaults are 0 bps until at least one config exists."
              />
            ) : (
              <table className="min-w-full text-xs">
                <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Scope</th>
                    <th className="px-3 py-2.5 text-right">Bid bps</th>
                    <th className="px-3 py-2.5 text-right">Ask bps</th>
                    <th className="px-3 py-2.5 text-center">Active</th>
                    <th className="px-3 py-2.5 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer transition-colors hover:bg-[var(--v2-cobalt-soft)]"
                      onClick={() => {
                        setEditing(row)
                        setSimulatorPrefill(row)
                      }}
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                          {row.instrument ? (
                            <ScopeChip label={row.instrument} tone="info" />
                          ) : null}
                          {row.segment ? <ScopeChip label={row.segment} tone="warning" /> : null}
                          {row.clientTier ? (
                            <ScopeChip label={row.clientTier} tone="neutral" />
                          ) : null}
                          {!row.instrument && !row.segment && !row.clientTier ? (
                            <ScopeChip label="GLOBAL DEFAULT" tone="neutral" />
                          ) : null}
                        </div>
                        {row.reason ? (
                          <div className="mt-1 truncate text-[10px] text-[var(--v2-text-mute)]">
                            {row.reason}
                          </div>
                        ) : null}
                      </td>
                      <td className="v2-num px-3 py-2 text-right text-[var(--v2-text)]">
                        {row.bidMarkupBps.toFixed(2)}
                      </td>
                      <td className="v2-num px-3 py-2 text-right text-[var(--v2-text)]">
                        {row.askMarkupBps.toFixed(2)}
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
                      <td className="px-3 py-2 text-right text-[10px] text-[var(--v2-text-faint)]">
                        {formatRelativeIst(row.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <SlippageSimulator
            prefill={
              simulatorPrefill
                ? {
                    instrument: simulatorPrefill.instrument,
                    segment: simulatorPrefill.segment,
                    clientTier: simulatorPrefill.clientTier,
                    bidMarkupBps: simulatorPrefill.bidMarkupBps,
                    askMarkupBps: simulatorPrefill.askMarkupBps,
                  }
                : undefined
            }
          />
        </div>
      </div>

      <V2Drawer open={creating} onOpenChange={setCreating}>
        <V2DrawerHeader title="New spread config" subtitle="" onClose={() => setCreating(false)} />
        <V2DrawerBody className="px-4 py-5 sm:px-6">
          <SpreadForm
            onSaved={() => {
              setCreating(false)
              void q.mutate()
              void globalMutate("/api/admin/spread/configs")
            }}
            onCancel={() => setCreating(false)}
          />
        </V2DrawerBody>
      </V2Drawer>

      <V2Drawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <V2DrawerHeader
          title="Edit spread config"
          subtitle={editing ? `id · ${editing.id.slice(0, 8)}…` : ""}
          onClose={() => setEditing(null)}
        />
        <V2DrawerBody className="px-4 py-5 sm:px-6">
          {editing ? (
            <SpreadForm
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

function ScopeChip({
  label,
  tone,
}: {
  label: string
  tone: "info" | "warning" | "neutral"
}) {
  const cls =
    tone === "info" ? "v2-pill-info" : tone === "warning" ? "v2-pill-warning" : "v2-pill-neutral"
  return <span className={cn("v2-pill", cls)}>{label}</span>
}
