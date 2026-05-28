/**
 * File:        components/trading/widgets/terminal-right-panel.tsx
 * Module:      components/trading/widgets
 * Purpose:     Compact right-column panel for the desktop trading terminal.
 *              Positions / Orders tabs fill the top; a pinned Obsidian-style
 *              AccountSummary strip sits at the bottom showing Balance, Equity,
 *              Unrealized P&L, Today P&L, Available Margin, and a margin-usage bar.
 *
 * Exports:
 *   - TerminalRightPanel(props) — positions/orders tabs (no account strip; strip is in layout)
 *   - AccountSummaryStrip(props) — pinned bottom account panel; rendered by DesktopTerminalLayout
 *   - AccountSummaryStripProps   — prop contract for the strip
 *
 * Depends on:
 *   - @/lib/market-data/utils/quote-lookup — resolveQuoteFromMap, resolveDisplayPriceFromQuote
 *   - @/components/ui/* — Tabs, Badge, Button
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - Live P&L = (ltp - avgPrice) × qty  (same formula as position-tracking.tsx)
 *   - balance defaults to availableMargin + usedMargin when not supplied by parent
 *   - Margin usage bar color: green <20%, amber <50%, red ≥50%
 *
 * Read order:
 *   1. TerminalRightPanelProps — data contract
 *   2. AccountSummaryStrip — bottom account panel
 *   3. TerminalRightPanel — full layout
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-23
 */

"use client"

import React, { useMemo } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, ShoppingCart, ClipboardList, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { resolveQuoteFromMap, resolveDisplayPriceFromQuote, parsePositiveIntegerMarketNumber } from "@/lib/market-data/utils/quote-lookup"
import type { Stock } from "@/types/trading"

interface TerminalRightPanelProps {
  positions: any[]
  orders: any[]
  quotes: Record<string, any> | undefined
  onQuickBuy: (stock: Stock) => void
  onQuickSell: (stock: Stock) => void
  availableMargin: number
  usedMargin: number
  totalPnL: number
  dayPnL: number
  /** Gross account balance; falls back to availableMargin + usedMargin when absent */
  balance?: number
}

function resolvePositionLiveLtp(position: any, quotes: Record<string, any> | undefined): number | null {
  const token = parsePositiveIntegerMarketNumber(position?.token ?? position?.instrumentToken)
  const instrumentId = position?.instrumentId ?? position?.instrument_id ?? null
  const quote = resolveQuoteFromMap(quotes, { token: token ?? undefined, instrumentId })
  if (!quote) return null
  return resolveDisplayPriceFromQuote(quote, 0) || null
}

function derivePnL(position: any, ltp: number | null): number | null {
  const avgPrice = Number(position?.averagePrice ?? position?.average_price ?? 0)
  const qty = Number(position?.quantity ?? position?.qty ?? 0)
  if (!avgPrice || !qty || ltp == null) return null
  return (ltp - avgPrice) * qty
}

const fmt = (n: number) =>
  `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const fmtSigned = (n: number) => `${n >= 0 ? "+" : "-"}${fmt(n)}`

const STATUS_COLOR: Record<string, string> = {
  PENDING:   "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  OPEN:      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  COMPLETE:  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  FILLED:    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  CANCELLED: "bg-muted/60 text-muted-foreground border-border",
  REJECTED:  "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
}

/* ── Obsidian-style AccountSummary strip ─────────────────────────────────── */
export interface AccountSummaryStripProps {
  balance: number
  equity: number
  totalPnL: number
  dayPnL: number
  availableMargin: number
  usedMargin: number
}

export function AccountSummaryStrip({ balance, equity, totalPnL, dayPnL, availableMargin, usedMargin }: AccountSummaryStripProps) {
  const totalFunds = availableMargin + usedMargin
  const marginUsedPct = totalFunds > 0 ? Math.min((usedMargin / totalFunds) * 100, 100) : 0
  const barColor =
    marginUsedPct < 20
      ? "var(--terminal-up, #10D996)"
      : marginUsedPct < 50
        ? "#F59E0B"
        : "var(--terminal-dn, #FF3B5C)"
  const barGlow = marginUsedPct >= 50
    ? "0 0 8px rgba(255,59,92,.40)"
    : marginUsedPct >= 20
      ? "0 0 6px rgba(245,158,11,.30)"
      : "0 0 8px rgba(16,217,150,.30)"

  // 3×2 grid: Balance | Equity | Available / Unrlzd P&L | Today P&L | Margin Used
  const cells = [
    { label: "Balance",     value: fmt(balance),         up: null },
    { label: "Equity",      value: fmt(equity),          up: equity >= balance },
    { label: "Available",   value: fmt(availableMargin), up: true },
    { label: "Unrlzd P&L",  value: fmtSigned(totalPnL), up: totalPnL >= 0 },
    { label: "Today P&L",   value: fmtSigned(dayPnL),   up: dayPnL >= 0 },
    { label: "Margin Used", value: fmt(usedMargin),      up: null as boolean | null },
  ]

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: "1px solid var(--terminal-border)",
        background: "var(--terminal-surface)",
        padding: "10px 12px",
      }}
    >
      {/* Header strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--terminal-text-muted)" }}>
            Account
          </span>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--terminal-up, #10D996)", boxShadow: "0 0 4px rgba(16,217,150,.6)", display: "inline-block" }} />
        </div>
        <span style={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", color: "var(--terminal-text-muted)", letterSpacing: "0.04em" }}>
          Live
        </span>
      </div>

      {/* 3-column stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 10 }}>
        {cells.map((c) => {
          const valueColor =
            c.up === null
              ? c.label === "Margin Used" ? "#F59E0B" : "var(--terminal-text)"
              : c.up
                ? "var(--terminal-up, #10D996)"
                : "var(--terminal-dn, #FF3B5C)"
          const cellGlow =
            c.up === true ? "inset 0 0 0 1px rgba(16,217,150,.12)" :
            c.up === false ? "inset 0 0 0 1px rgba(255,59,92,.10)" : "none"
          return (
            <div
              key={c.label}
              style={{
                background: "var(--terminal-bg)",
                borderRadius: 5,
                padding: "6px 8px",
                border: "1px solid var(--terminal-separator, rgba(255,255,255,.06))",
                boxShadow: c.up !== null ? cellGlow : "none",
              }}
            >
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--terminal-text-muted)", marginBottom: 3 }}>
                {c.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono, monospace)",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: valueColor,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.value}
              </div>
            </div>
          )
        })}
      </div>

      {/* Margin usage bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--terminal-text-muted)" }}>
            Margin Usage
          </span>
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fontWeight: 700, color: barColor }}>
            {marginUsedPct.toFixed(1)}%
          </span>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: "var(--terminal-hover)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${marginUsedPct}%`,
              background: barColor,
              borderRadius: 3,
              transition: "width 500ms ease, background 400ms ease",
              boxShadow: barGlow,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export function TerminalRightPanel({
  positions,
  orders,
  quotes,
  onQuickBuy,
  onQuickSell,
  availableMargin,
  usedMargin,
  totalPnL,
  dayPnL,
  balance: balanceProp,
}: TerminalRightPanelProps) {
  const openPositions = useMemo(
    () => (positions ?? []).filter((p) => !p?.isClosed && Number(p?.quantity ?? p?.qty ?? 0) !== 0),
    [positions],
  )

  const recentOrders = useMemo(
    () => [...(orders ?? [])].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()).slice(0, 30),
    [orders],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Tabs (Positions / Orders) — fills remaining space ── */}
      <Tabs defaultValue="positions" className="flex flex-col flex-1 overflow-hidden min-h-0">
        <TabsList
          style={{
            flexShrink: 0,
            width: "100%",
            height: 36,
            display: "flex",
            alignItems: "stretch",
            padding: 0,
            gap: 0,
            borderRadius: 0,
            borderBottom: "1px solid var(--terminal-border)",
            background: "var(--terminal-surface)",
          }}
        >
          <TabsTrigger
            value="positions"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              height: "100%",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              borderRadius: 0,
              border: "none",
              background: "transparent",
              borderBottom: "2px solid transparent",
              padding: "0 8px",
              cursor: "pointer",
              transition: "color 120ms, border-color 120ms",
            }}
            className="terminal-tab-trigger"
          >
            <TrendingUp className="h-3 w-3 shrink-0" />
            Positions
            {openPositions.length > 0 && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: 10,
                  lineHeight: 1.5,
                  background: "var(--terminal-accent-dim, rgba(34,211,238,.12))",
                  border: "1px solid var(--terminal-accent-border, rgba(34,211,238,.25))",
                  color: "var(--terminal-accent, #22D3EE)",
                }}
              >
                {openPositions.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              height: "100%",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              borderRadius: 0,
              border: "none",
              background: "transparent",
              borderBottom: "2px solid transparent",
              padding: "0 8px",
              cursor: "pointer",
              transition: "color 120ms, border-color 120ms",
            }}
            className="terminal-tab-trigger"
          >
            <ClipboardList className="h-3 w-3 shrink-0" />
            Orders
            {recentOrders.length > 0 && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: 10,
                  lineHeight: 1.5,
                  background: "var(--terminal-surface-hi)",
                  border: "1px solid var(--terminal-separator, rgba(255,255,255,.06))",
                  color: "var(--terminal-text-muted)",
                }}
              >
                {recentOrders.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Positions ── */}
        <TabsContent value="positions" className="flex-1 overflow-y-auto m-0 p-0">
          {openPositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-12">
              <TrendingUp className="h-8 w-8 opacity-20" />
              <p className="text-xs font-medium">No open positions</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {openPositions.map((pos, i) => {
                const symbol: string = pos?.symbol ?? pos?.tradingSymbol ?? pos?.instrumentKey ?? "—"
                const qty = Number(pos?.quantity ?? pos?.qty ?? 0)
                const avgPrice = Number(pos?.averagePrice ?? pos?.average_price ?? 0)
                const isBuy = qty > 0
                const ltp = resolvePositionLiveLtp(pos, quotes)
                const pnl = derivePnL(pos, ltp)
                const pnlUp = (pnl ?? 0) >= 0

                const stockForOrder: Stock = {
                  id: pos?.id ?? String(i),
                  symbol,
                  name: symbol,
                  instrumentId: pos?.instrumentId ?? pos?.instrument_id ?? symbol,
                  segment: pos?.segment ?? "NSE_EQ",
                }

                const pnlColor = pnlUp ? "var(--terminal-up, #10D996)" : "var(--terminal-dn, #FF3B5C)"
                const pnlGlow = pnlUp ? "0 0 10px rgba(16,217,150,.30)" : "0 0 10px rgba(255,59,92,.30)"
                const sideBorderColor = pnlUp ? "var(--terminal-up, #10D996)" : "var(--terminal-dn, #FF3B5C)"

                return (
                  <div
                    key={pos?.id ?? i}
                    className="group"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      padding: "8px 10px 8px 12px",
                      borderLeft: `2px solid ${sideBorderColor}`,
                      borderBottom: "1px solid var(--terminal-separator, rgba(255,255,255,.06))",
                      transition: "background 100ms",
                      cursor: "default",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--terminal-surface-hi)" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--terminal-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{symbol}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                            background: isBuy ? "var(--terminal-up-dim, rgba(16,217,150,.10))" : "var(--terminal-dn-dim, rgba(255,59,92,.10))",
                            border: `1px solid ${isBuy ? "rgba(16,217,150,.25)" : "rgba(255,59,92,.25)"}`,
                            color: isBuy ? "var(--terminal-up, #10D996)" : "var(--terminal-dn, #FF3B5C)",
                          }}>
                            {isBuy ? "LONG" : "SHORT"} {Math.abs(qty)}
                          </span>
                        </div>
                        <p style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", color: "var(--terminal-text-muted)", margin: 0 }}>
                          Avg ₹{avgPrice.toFixed(2)}
                          {ltp != null && (
                            <span style={{ marginLeft: 4, color: "var(--terminal-text)" }}>· LTP ₹{ltp.toFixed(2)}</span>
                          )}
                        </p>
                      </div>

                      {pnl != null && (
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
                            <span style={{ fontSize: 9, color: pnlColor }}>{pnlUp ? "▲" : "▼"}</span>
                            <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", fontWeight: 700, color: pnlColor, textShadow: pnlGlow }}>
                              {fmtSigned(pnl)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="hidden group-hover:flex" style={{ gap: 4, marginTop: 6 }}>
                      <Button size="sm" onClick={() => onQuickBuy(stockForOrder)}
                        style={{ height: 22, flex: 1, fontSize: 10, background: "var(--terminal-up, #10D996)", color: "#000", borderRadius: 4, padding: "0 6px", fontWeight: 700, border: "none" }}>
                        + Buy
                      </Button>
                      <Button size="sm" onClick={() => onQuickSell(stockForOrder)}
                        style={{ height: 22, flex: 1, fontSize: 10, background: "var(--terminal-dn, #FF3B5C)", color: "#fff", borderRadius: 4, padding: "0 6px", fontWeight: 700, border: "none" }}>
                        – Sell
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Orders ── */}
        <TabsContent value="orders" className="flex-1 overflow-y-auto m-0 p-0">
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-12">
              <ShoppingCart className="h-8 w-8 opacity-20" />
              <p className="text-xs font-medium">No orders today</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recentOrders.map((order, i) => {
                const symbol: string = order?.symbol ?? order?.tradingSymbol ?? "—"
                const side: string = (order?.orderSide ?? order?.side ?? "BUY").toUpperCase()
                const status: string = (order?.status ?? "PENDING").toUpperCase()
                const qty = Number(order?.quantity ?? order?.qty ?? 0)
                const price = Number(order?.price ?? 0)
                const isBuy = side === "BUY"
                const statusClass = STATUS_COLOR[status] ?? STATUS_COLOR["PENDING"]

                return (
                  <div key={order?.id ?? i} className="px-2.5 py-2 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold truncate text-foreground">{symbol}</span>
                          <Badge variant="outline" className={cn(
                            "text-[9px] h-4 px-1 shrink-0 border font-semibold rounded",
                            isBuy ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                  : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                          )}>
                            {side}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Qty {qty}{price > 0 ? ` · ₹${price.toFixed(2)}` : " · MKT"}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-[9px] h-4 px-1 shrink-0 border rounded", statusClass)}>
                        {status}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

    </div>
  )
}
