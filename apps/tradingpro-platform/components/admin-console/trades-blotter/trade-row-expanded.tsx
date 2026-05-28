"use client"

/**
 * File:        components/admin-console/trades-blotter/trade-row-expanded.tsx
 * Module:      admin-console/trades-blotter
 * Purpose:     Inline accordion content for an expanded trade row. Shows action buttons,
 *              P&L metrics strip, connected orders (entry + exit pills), and ledger statement.
 *
 * Exports:
 *   - TradeRowExpanded(props) — accordion content rendered below the parent table row
 *
 * Depends on:
 *   - ./trade-actions          — TradeActionInline (buttons + dialogs)
 *   - @/app/api/admin/trades/types — TradeRow
 *
 * Side-effects: none (delegates HTTP side-effects to TradeActionInline)
 *
 * Key invariants:
 *   - onChanged and onPauseAutoRefresh must be threaded from TradesTable so auto-refresh
 *     pauses correctly while force-close / edit-note dialogs are open
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-20
 */

import React from "react"
import { Badge } from "@/components/ui/badge"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { ArrowRight } from "lucide-react"
import type { TradeRow } from "@/app/api/admin/trades/types"
import {
  formatTradesBlotterDuration,
  formatTradesBlotterRupees,
  tradesBlotterPnlClass,
} from "@/components/admin-console/trades-blotter-number-utils"
import { TradeActionInline } from "./trade-actions"

function fmtTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return iso
  }
}

function closureLabel(reason: TradeRow["closureReason"]): { label: string; cls: string } {
  switch (reason) {
    case "USER_CLOSED":      return { label: "User closed",    cls: "bg-sky-500/10 text-sky-600 border-sky-500/30" }
    case "ADMIN_CLOSED":     return { label: "Admin closed",   cls: "bg-violet-500/10 text-violet-600 border-violet-500/30" }
    case "AUTO_LIQUIDATED":  return { label: "Liquidated",     cls: "bg-rose-500/10 text-rose-600 border-rose-500/30" }
    case "EXPIRY_SQUAREOFF": return { label: "Expiry",         cls: "bg-amber-500/10 text-amber-600 border-amber-500/30" }
    case "SYSTEM_CLOSED":    return { label: "System",         cls: "bg-slate-500/10 text-slate-500 border-slate-500/30" }
    case "MANUAL_OTHER":     return { label: "Manual",         cls: "bg-slate-500/10 text-slate-500 border-slate-500/30" }
    default:                 return { label: "—",              cls: "bg-muted text-muted-foreground border-border" }
  }
}

function KV({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold leading-none">
        {label}
      </span>
      <span className={`text-[11px] font-bold tabular-nums leading-snug mt-0.5 ${valueClass ?? "text-foreground"}`}>
        {value}
      </span>
    </div>
  )
}

export function TradeRowExpanded({
  trade,
  onChanged,
  onPauseAutoRefresh,
}: {
  trade: TradeRow
  onChanged: () => void
  onPauseAutoRefresh?: (paused: boolean) => void
}) {
  const closure = closureLabel(trade.closureReason)
  const allOrders = [...trade.openOrders, ...trade.closeOrders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  return (
    <div className="border-t border-border/40 bg-gradient-to-b from-muted/15 to-transparent">
      {/* ─── Action bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/30 bg-muted/20">
        <TradeActionInline
          trade={trade}
          onChanged={onChanged}
          onPauseAutoRefresh={onPauseAutoRefresh}
        />
        <div className="ml-auto flex items-center gap-2">
          {trade.closedByName && (
            <span className="text-[10px] text-muted-foreground">
              closed by <span className="text-foreground font-medium">{trade.closedByName}</span>
            </span>
          )}
          {trade.closureNote && (
            <HoverCard openDelay={100} closeDelay={80}>
              <HoverCardTrigger asChild>
                <button type="button" className="text-[10px] text-primary underline underline-offset-2 hover:opacity-80">
                  note
                </button>
              </HoverCardTrigger>
              <HoverCardContent className="w-72 p-2.5 text-xs" side="left">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Closure note</div>
                <div className="text-foreground italic">{trade.closureNote}</div>
              </HoverCardContent>
            </HoverCard>
          )}
          <HoverCard openDelay={100} closeDelay={80}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground font-mono"
                onClick={() => void navigator.clipboard?.writeText(trade.positionId)}
                title="Click to copy"
              >
                #{trade.positionId.slice(0, 8)}
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-auto p-2 text-[10px] font-mono" side="left">
              {trade.positionId}
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>

      {/* ─── Metrics strip ──────────────────────────────────── */}
      <div className="px-4 py-2.5 flex items-center gap-5 flex-wrap border-b border-border/20">
        {/* Timeline */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
          <span className="font-mono">{fmtTime(trade.entryAt)}</span>
          <ArrowRight className="w-3 h-3 opacity-50" />
          <span className="font-mono">{fmtTime(trade.exitAt)}</span>
        </div>

        <div className="w-px h-6 bg-border/50 shrink-0" />

        <KV label="Gross P&L"   value={formatTradesBlotterRupees(trade.grossPnL)}    valueClass={tradesBlotterPnlClass(trade.grossPnL)} />
        <KV label="Charges"     value={`−${formatTradesBlotterRupees(Math.abs(trade.charges))}`} valueClass="text-rose-500" />
        <KV label="Net realized" value={formatTradesBlotterRupees(trade.realizedPnL)} valueClass={tradesBlotterPnlClass(trade.realizedPnL)} />
        {trade.status !== "CLOSED" && (
          <KV label="Unrealized" value={formatTradesBlotterRupees(trade.unrealizedPnL)} valueClass={tradesBlotterPnlClass(trade.unrealizedPnL)} />
        )}

        <div className="w-px h-6 bg-border/50 shrink-0" />

        <KV label="Held"    value={formatTradesBlotterDuration(trade.heldMs)} />
        <KV label="Product" value={trade.productType ?? "—"} />
        <KV label="Segment" value={`${trade.segment ?? "—"} · ${trade.exchange ?? "—"}`} />
        {trade.expiry && (
          <KV
            label="Expiry"
            value={new Date(trade.expiry).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
          />
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${closure.cls}`}>
            {closure.label}
          </Badge>
        </div>
      </div>

      {/* ─── Orders + Statement ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
        {/* Orders */}
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Orders</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 leading-none">{allOrders.length}</Badge>
          </div>
          {allOrders.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No orders linked</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {allOrders.map((o) => {
                const isEntry = o.orderPurpose === "OPEN"
                const isBuy = o.orderSide === "BUY"
                return (
                  <HoverCard key={o.id} openDelay={120} closeDelay={80}>
                    <HoverCardTrigger asChild>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors cursor-default ${
                          isEntry
                            ? "bg-blue-500/5 border-blue-500/25 hover:bg-blue-500/10"
                            : "bg-purple-500/5 border-purple-500/25 hover:bg-purple-500/10"
                        }`}
                      >
                        <span className={`font-bold ${isEntry ? "text-blue-500" : "text-purple-500"}`}>
                          {isEntry ? "E" : "X"}
                        </span>
                        <span className={`font-semibold ${isBuy ? "text-emerald-500" : "text-rose-500"}`}>
                          {o.orderSide}
                        </span>
                        <span className="font-semibold text-foreground tabular-nums">{o.filledQuantity}</span>
                        <span className="text-muted-foreground tabular-nums">
                          @₹{(o.averagePrice ?? o.price ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </span>
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80 p-3" side="top">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isEntry ? "bg-blue-500/10 text-blue-600 border-blue-500/30" : "bg-purple-500/10 text-purple-600 border-purple-500/30"}`}>
                            {isEntry ? "ENTRY" : "EXIT"}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${isBuy ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-rose-500/10 text-rose-600 border-rose-500/30"}`}>
                            {o.orderSide}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{o.orderType}</Badge>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{o.status}</Badge>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        <dt className="text-muted-foreground">Qty</dt>
                        <dd className="text-right tabular-nums">
                          {o.filledQuantity}
                          {o.quantity > o.filledQuantity && <span className="text-muted-foreground"> / {o.quantity}</span>}
                        </dd>
                        <dt className="text-muted-foreground">Price</dt>
                        <dd className="text-right tabular-nums">
                          ₹{(o.averagePrice ?? o.price ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </dd>
                        {o.blockedMargin != null && (
                          <>
                            <dt className="text-muted-foreground">Margin</dt>
                            <dd className="text-right tabular-nums">{formatTradesBlotterRupees(o.blockedMargin)}</dd>
                          </>
                        )}
                        {o.placementCharges != null && (
                          <>
                            <dt className="text-muted-foreground">Charges</dt>
                            <dd className="text-right tabular-nums text-rose-500">−{formatTradesBlotterRupees(Math.abs(o.placementCharges))}</dd>
                          </>
                        )}
                        <dt className="text-muted-foreground">Placed</dt>
                        <dd className="text-right">{fmtTime(o.createdAt)}</dd>
                        <dt className="text-muted-foreground">Executed</dt>
                        <dd className="text-right">{fmtTime(o.executedAt)}</dd>
                        <dt className="text-muted-foreground">ID</dt>
                        <dd className="text-right font-mono text-[10px] truncate">{o.id.slice(0, 12)}…</dd>
                      </dl>
                      {o.failureReason && (
                        <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-rose-500">{o.failureReason}</div>
                      )}
                    </HoverCardContent>
                  </HoverCard>
                )
              })}
            </div>
          )}
        </div>

        {/* Statement */}
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Statement</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 leading-none">{trade.ledger.length}</Badge>
          </div>
          {trade.ledger.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No linked transactions</p>
          ) : (
            <div className="rounded-md border border-border/50 bg-card/30 max-h-[100px] overflow-y-auto">
              {trade.ledger.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border/20 last:border-0 text-[11px]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-foreground leading-tight">{t.description}</div>
                    <div className="text-[9px] text-muted-foreground leading-tight font-mono">{fmtTime(t.createdAt)}</div>
                  </div>
                  <div className="text-right whitespace-nowrap shrink-0">
                    <div className={`font-bold tabular-nums leading-tight text-xs ${t.type === "CREDIT" ? "text-emerald-500" : "text-rose-500"}`}>
                      {t.type === "CREDIT" ? "+" : "−"}{formatTradesBlotterRupees(Math.abs(t.amount))}
                    </div>
                    {t.balanceAfter !== null && (
                      <div className="text-[9px] text-muted-foreground leading-tight">
                        Bal {formatTradesBlotterRupees(t.balanceAfter)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
