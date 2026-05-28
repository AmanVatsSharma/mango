/**
 * File:        components/trading/widgets/terminal-bottom-bar.tsx
 * Module:      components/trading/widgets
 * Purpose:     Resizable bottom panel in the desktop terminal showing open positions,
 *              recent orders, and today's closed-position history — tabbed, compact, read-only.
 *              Height is 100% — must be placed inside a ResizablePanel to control size.
 *
 * Exports:
 *   - TerminalBottomBar(props) — tabbed bottom strip component
 *
 * Depends on:
 *   - @/lib/market-data/utils/quote-lookup — resolveQuoteFromMap, resolveDisplayPriceFromQuote,
 *                                            parsePositiveIntegerMarketNumber
 *   - @/lib/hooks/use-position-history — PositionHistoryRow type
 *   - @/types/trading — Stock
 *   - @/lib/utils — cn
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - Live P&L = (ltp - avgPrice) × qty (same formula as TerminalRightPanel and PositionTracking)
 *   - Quotes keyed by token string; same resolution as TerminalRightPanel
 *   - History tab shows today's closed positions (entry/exit/held/P&L/balance); Orders tab shows top-20
 *
 * Read order:
 *   1. TerminalBottomBarProps — data contract
 *   2. fmtHeld — duration formatter
 *   3. resolvePositionLtp — live P&L helper
 *   4. TerminalBottomBar — render
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

"use client"

import React, { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import {
  resolveQuoteFromMap,
  resolveDisplayPriceFromQuote,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"
import type { PositionHistoryRow } from "@/lib/hooks/use-position-history"
import type { Stock } from "@/types/trading"

export interface TerminalBottomBarProps {
  positions: any[]
  orders: any[]
  quotes: Record<string, any> | undefined
  totalPnL: number
  dayPnL: number
  onQuickBuy: (stock: Stock) => void
  onQuickSell: (stock: Stock) => void
  closedPositionHistory?: PositionHistoryRow[]
}

type BottomTab = "positions" | "orders" | "history"

const STATUS_COLORS: Record<string, string> = {
  PENDING:   "text-amber-400",
  OPEN:      "text-amber-400",
  COMPLETE:  "text-emerald-400",
  EXECUTED:  "text-emerald-400",
  FILLED:    "text-emerald-400",
  CANCELLED: "text-[oklch(0.5_0_0)]",
  REJECTED:  "text-rose-400",
}

function resolvePositionLtp(position: any, quotes: Record<string, any> | undefined): number | null {
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

const fmtPrice = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtPnL = (n: number) => {
  const sign = n >= 0 ? "+" : "−"
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtHeld(ms: number): string {
  if (ms < 60_000) return "<1m"
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtTime(isoStr: string | null): string {
  if (!isoStr) return "—"
  const d = new Date(isoStr)
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

export function TerminalBottomBar({
  positions,
  orders,
  quotes,
  totalPnL,
  dayPnL,
  closedPositionHistory,
}: TerminalBottomBarProps) {
  const [activeTab, setActiveTab] = useState<BottomTab>("positions")

  const openPositions = useMemo(
    () => (positions ?? []).filter((p) => !p?.isClosed && Number(p?.quantity ?? p?.qty ?? 0) !== 0),
    [positions],
  )

  const sortedOrders = useMemo(
    () =>
      [...(orders ?? [])].sort(
        (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      ),
    [orders],
  )

  const recentOrders = useMemo(() => sortedOrders.slice(0, 20), [sortedOrders])

  const historyCount = closedPositionHistory?.length ?? 0

  const tabs: { id: BottomTab; label: string; count?: number }[] = [
    { id: "positions", label: "Positions", count: openPositions.length },
    { id: "orders", label: "Orders", count: recentOrders.length },
    { id: "history", label: "History", count: historyCount > 0 ? historyCount : undefined },
  ]

  return (
    <div
      className="flex flex-col border-t"
      style={{
        height: "100%",
        borderColor: "var(--terminal-border)",
        background: "var(--terminal-surface)",
      }}
    >
      {/* ── Tab bar + P&L summary ── */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          flexShrink: 0,
          height: 38,
          borderBottom: "1px solid var(--terminal-border)",
          background: "var(--terminal-surface)",
          padding: "0 16px",
          gap: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", gap: 2, flex: 1 }}>
          {tabs.map((t) => {
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "0 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: "transparent",
                  border: "none",
                  borderBottom: isActive ? "2px solid var(--terminal-accent, #22D3EE)" : "2px solid transparent",
                  color: isActive ? "var(--terminal-accent, #22D3EE)" : "var(--terminal-text-muted)",
                  cursor: "pointer",
                  transition: "color 100ms, border-color 100ms",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--terminal-text)" }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--terminal-text-muted)" }}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: 10,
                      background: isActive ? "var(--terminal-accent-dim, rgba(34,211,238,.12))" : "var(--terminal-surface-hi)",
                      border: `1px solid ${isActive ? "var(--terminal-accent-border, rgba(34,211,238,.25))" : "var(--terminal-separator, rgba(255,255,255,.06))"}`,
                      color: isActive ? "var(--terminal-accent, #22D3EE)" : "var(--terminal-text-muted)",
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Enclosed P&L chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "4px 10px",
            margin: "5px 0",
            borderRadius: 6,
            background: "var(--terminal-surface-hi)",
            border: "1px solid var(--terminal-separator, rgba(255,255,255,.06))",
            fontSize: 11,
            fontFamily: "var(--font-mono, monospace)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ color: "var(--terminal-text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Total P&L</span>
            <strong style={{ color: totalPnL >= 0 ? "var(--terminal-up, #10D996)" : "var(--terminal-dn, #FF3B5C)", fontWeight: 700 }}>
              {fmtPnL(totalPnL)}
            </strong>
          </span>
          <span style={{ color: "var(--terminal-separator, rgba(255,255,255,.1))", fontSize: 14 }}>·</span>
          <span style={{ color: "var(--terminal-text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Day</span>
            <strong style={{ color: dayPnL >= 0 ? "var(--terminal-up, #10D996)" : "var(--terminal-dn, #FF3B5C)", fontWeight: 700 }}>
              {dayPnL >= 0 ? "+" : ""}{dayPnL.toFixed(2)}%
            </strong>
          </span>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        {/* Positions */}
        {activeTab === "positions" && (
          openPositions.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6, color: "var(--terminal-text-muted)" }}>
              <span style={{ fontSize: 18, opacity: 0.25 }}>◈</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>No open positions</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>Your active trades will appear here</span>
            </div>
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {["Symbol", "Product", "Qty", "Avg", "LTP", "P&L"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                        textAlign: i < 2 ? "left" : "right",
                        padding: "5px 12px",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--terminal-text-muted)",
                        background: "var(--terminal-surface-hi)",
                        borderBottom: "1px solid var(--terminal-border)",
                        height: 26,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openPositions.map((pos, idx) => {
                  const ltp = resolvePositionLtp(pos, quotes)
                  const pnl = derivePnL(pos, ltp)
                  const avgPrice = Number(pos?.averagePrice ?? pos?.average_price ?? 0)
                  const qty = Number(pos?.quantity ?? pos?.qty ?? 0)
                  const symbol = pos?.symbol ?? pos?.tradingSymbol ?? "—"
                  const product = pos?.productType ?? pos?.product ?? "—"
                  const pnlUp = (pnl ?? 0) >= 0
                  const pnlColor = pnl == null ? "var(--terminal-text-muted)" : pnlUp ? "var(--terminal-up, #10D996)" : "var(--terminal-dn, #FF3B5C)"
                  const pnlGlow = pnl != null && pnlUp ? "0 0 10px rgba(16,217,150,.30)" : pnl != null ? "0 0 10px rgba(255,59,92,.25)" : "none"

                  return (
                    <tr
                      key={pos?.id ?? idx}
                      style={{ borderBottom: "1px solid var(--terminal-separator, rgba(255,255,255,.04))", transition: "background 80ms" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--terminal-surface-hi)" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                    >
                      <td style={{ padding: "7px 12px", fontWeight: 700, color: "var(--terminal-text)" }}>
                        {symbol}
                      </td>
                      <td style={{ padding: "7px 12px", color: "var(--terminal-text-muted)" }}>
                        {product}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                        {qty}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text-muted)" }}>
                        {avgPrice > 0 ? fmtPrice(avgPrice) : "—"}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text)" }}>
                        {ltp != null ? fmtPrice(ltp) : "—"}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", fontWeight: 700, color: pnlColor, textShadow: pnlGlow }}>
                        {pnl != null ? fmtPnL(pnl) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )}

        {/* Orders */}
        {activeTab === "orders" && (
          recentOrders.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6, color: "var(--terminal-text-muted)" }}>
              <span style={{ fontSize: 18, opacity: 0.25 }}>◫</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>No orders today</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>Placed orders will appear here</span>
            </div>
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {["Symbol", "Side", "Qty", "Price", "Status"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                        textAlign: i < 2 ? "left" : "right",
                        padding: "5px 12px",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--terminal-text-muted)",
                        background: "var(--terminal-surface-hi)",
                        borderBottom: "1px solid var(--terminal-border)",
                        height: 26,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order, idx) => {
                  const symbol = order?.symbol ?? order?.tradingSymbol ?? "—"
                  const side = String(order?.orderSide ?? order?.transactionType ?? "—").toUpperCase()
                  const qty = Number(order?.quantity ?? order?.qty ?? 0)
                  const price = Number(order?.price ?? 0)
                  const status = String(order?.status ?? "—").toUpperCase()
                  const isBuy = side === "BUY"
                  const sideColor = isBuy ? "var(--terminal-up, #10D996)" : "var(--terminal-dn, #FF3B5C)"

                  return (
                    <tr
                      key={order?.id ?? idx}
                      style={{ borderBottom: "1px solid var(--terminal-separator, rgba(255,255,255,.04))", transition: "background 80ms" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--terminal-surface-hi)" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                    >
                      <td style={{ padding: "7px 12px", fontWeight: 700, color: "var(--terminal-text)" }}>
                        {symbol}
                      </td>
                      <td style={{ padding: "7px 12px", fontWeight: 700, color: sideColor }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 9 }}>{isBuy ? "▲" : "▼"}</span>
                          {side}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text-muted)" }}>
                        {qty}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text-muted)" }}>
                        {price > 0 ? fmtPrice(price) : "MKT"}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600 }} className={STATUS_COLORS[status] ?? "text-[oklch(0.5_0_0)]"}>
                        {status}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )}

        {/* History — today's closed positions */}
        {activeTab === "history" && (
          !closedPositionHistory || closedPositionHistory.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6, color: "var(--terminal-text-muted)" }}>
              <span style={{ fontSize: 18, opacity: 0.25 }}>◱</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>No closed trades today</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>Completed trades will appear here</span>
            </div>
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {[
                    { label: "Symbol",  align: "left"  },
                    { label: "Side",    align: "left"  },
                    { label: "Entry",   align: "right" },
                    { label: "Exit",    align: "right" },
                    { label: "Held",    align: "right" },
                    { label: "Entry ₹", align: "right" },
                    { label: "Exit ₹",  align: "right" },
                    { label: "P&L",     align: "right" },
                    { label: "Balance", align: "right" },
                  ].map(({ label, align }) => (
                    <th
                      key={label}
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                        textAlign: align as "left" | "right",
                        padding: "5px 12px",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--terminal-text-muted)",
                        background: "var(--terminal-surface-hi)",
                        borderBottom: "1px solid var(--terminal-border)",
                        height: 26,
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closedPositionHistory.map((row) => {
                  const sideLabel = row.side === "LONG" ? "LONG" : "SHORT"
                  const isLong = row.side === "LONG"
                  const pnlPos = row.realizedPnL >= 0
                  const pnlColor = pnlPos ? "var(--terminal-up, #10D996)" : "var(--terminal-dn, #FF3B5C)"
                  const pnlGlow = pnlPos ? "0 0 10px rgba(16,217,150,.30)" : "0 0 10px rgba(255,59,92,.25)"
                  const sideColor = isLong ? "var(--terminal-up, #10D996)" : "var(--terminal-dn, #FF3B5C)"

                  return (
                    <tr
                      key={row.positionId}
                      style={{ borderBottom: "1px solid var(--terminal-separator, rgba(255,255,255,.04))", transition: "background 80ms" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--terminal-surface-hi)" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                    >
                      <td style={{ padding: "7px 12px", fontWeight: 700, color: "var(--terminal-text)" }}>
                        <div>{row.symbol}</div>
                        {row.productType && (
                          <div style={{ fontSize: 9, color: "var(--terminal-text-muted)", marginTop: 1 }}>{row.productType}</div>
                        )}
                      </td>
                      <td style={{ padding: "7px 12px", fontWeight: 700, color: sideColor }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 9 }}>{isLong ? "▲" : "▼"}</span>
                          {sideLabel}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text-muted)" }}>
                        {fmtTime(row.entryAt)}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text-muted)" }}>
                        {fmtTime(row.exitAt)}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text-muted)" }}>
                        {fmtHeld(row.heldMs)}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text-muted)" }}>
                        {fmtPrice(row.averageEntryPrice)}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text-muted)" }}>
                        {row.averageExitPrice != null ? fmtPrice(row.averageExitPrice) : "—"}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", fontWeight: 700, color: pnlColor, textShadow: pnlGlow }}>
                        {fmtPnL(row.realizedPnL)}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--terminal-text)" }}>
                        {row.balanceAfter != null ? `₹${fmtPrice(row.balanceAfter)}` : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  )
}
