/**
 * @file components/admin-v2/client-360/tabs/trading.tsx
 * @module admin-v2/client-360
 * @description Trading tab — live positions + recent orders + margin viewer for one client.
 *              Reuses existing /api/admin/positions and /api/admin/orders with userId filter.
 *              Click a row → opens Command Centre v2 in the symbol view.
 *              Premium aesthetic: glass tiles, gradient hero, IBM Plex Mono numerics.
 *
 * @author StockTrade
 * @created 2026-04-26
 * @updated 2026-04-26 — Phase 9.5/10.5 wire-up: replaces "lands in Phase 6" placeholder
 *                      with the real implementation.
 */

"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { jsonFetcher, formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import type { UserDetail } from "../types"

interface PositionRow {
  id: string
  symbol: string
  segment?: string | null
  quantity: number
  averagePrice: number | string
  currentPrice?: number | string | null
  unrealizedPnL: number | string
  dayPnL?: number | string
  productType?: string | null
  closedAt?: string | null
  createdAt: string
}

interface PositionsResp {
  positions?: PositionRow[]
  data?: PositionRow[]
}

interface OrderRow {
  id: string
  symbol: string
  quantity: number
  filledQuantity?: number
  orderType: string
  orderSide: "BUY" | "SELL"
  status: string
  price?: number | string | null
  averagePrice?: number | string | null
  createdAt: string
  executedAt?: string | null
}

interface OrdersResp {
  orders?: OrderRow[]
  data?: OrderRow[]
}

function pickArray<T>(payload: { positions?: T[]; orders?: T[]; data?: T[] } | undefined): T[] {
  if (!payload) return []
  return payload.positions ?? payload.orders ?? payload.data ?? []
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function TradingTab({ user }: { user: UserDetail }) {
  const positionsQuery = useSWR<PositionsResp>(
    `/api/admin/positions?userId=${user.id}&openOnly=true&limit=200`,
    jsonFetcher,
    { refreshInterval: 5_000, revalidateOnFocus: false },
  )
  const ordersQuery = useSWR<OrdersResp>(
    `/api/admin/orders?userId=${user.id}&limit=20`,
    jsonFetcher,
    { refreshInterval: 10_000, revalidateOnFocus: false },
  )

  const positions = pickArray<PositionRow>(positionsQuery.data).filter(
    (p) => num(p.quantity) !== 0 && !p.closedAt,
  )
  const orders = pickArray<OrderRow>(ordersQuery.data)

  const totalUnrealized = positions.reduce((s, p) => s + num(p.unrealizedPnL), 0)
  const totalDayPnl = positions.reduce((s, p) => s + num(p.dayPnL), 0)
  const longCount = positions.filter((p) => num(p.quantity) > 0).length
  const shortCount = positions.filter((p) => num(p.quantity) < 0).length

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Trading</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              live · positions every 5s · orders every 10s
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--v2-text)]">
            Live trading state
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin-v2/command-centre?tab=client%3A${user.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--v2-text-mute)] hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
          >
            <ExternalLink className="h-3 w-3" /> Command Centre
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void positionsQuery.mutate()
              void ordersQuery.mutate()
            }}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Wallet balance"
          value={formatInr(user.tradingAccount?.balance)}
          tone="neutral"
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiTile
          label="Available margin"
          value={formatInr(user.tradingAccount?.availableMargin)}
          tone="info"
        />
        <KpiTile
          label="Used margin"
          value={formatInr(user.tradingAccount?.usedMargin)}
          tone="neutral"
        />
        <KpiTile
          label="Open positions"
          value={positions.length}
          tone="neutral"
          icon={<Activity className="h-4 w-4" />}
          hint={`${longCount} long · ${shortCount} short`}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <PnlTile
          label="Unrealised P&L (client)"
          amount={totalUnrealized}
          subtitle="Sum across all open positions"
        />
        <PnlTile label="Day P&L (client)" amount={totalDayPnl} subtitle="Today's mark-to-market" />
      </section>

      <section>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">Open positions</h3>
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            broker P&L is the inverse · click row → command centre
          </span>
        </header>
        <div className="v2-card overflow-hidden">
          {positionsQuery.isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--v2-text-mute)]">
              Loading positions…
            </p>
          ) : positions.length === 0 ? (
            <EmptyState
              title="No open positions"
              description="Client is currently flat — no live exposure."
            />
          ) : (
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Avg</th>
                  <th className="px-3 py-2 text-right">LTP</th>
                  <th className="px-3 py-2 text-right">Day P&L</th>
                  <th className="px-3 py-2 text-right">Unrealised</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {positions.map((p) => {
                  const qty = num(p.quantity)
                  const avg = num(p.averagePrice)
                  const ltp = num(p.currentPrice)
                  const dayPnl = num(p.dayPnL)
                  const unrPnl = num(p.unrealizedPnL)
                  const long = qty > 0
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-[var(--v2-cobalt-soft)]">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin-v2/command-centre?tab=symbol%3A${encodeURIComponent(p.symbol)}`}
                          className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--v2-text)] hover:text-[#9DB6FF]"
                        >
                          {p.symbol}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </Link>
                        <div className="mt-0.5 text-[10px] text-[var(--v2-text-faint)]">
                          {p.segment ?? "NSE"} · {p.productType ?? "MIS"}
                        </div>
                      </td>
                      <td className="v2-num px-3 py-2 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 font-semibold",
                            long ? "text-[var(--v2-gain)]" : "text-[var(--v2-loss)]",
                          )}
                        >
                          {long ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )}
                          {Math.abs(qty).toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td className="v2-num px-3 py-2 text-right text-[var(--v2-text)]">
                        ₹{avg.toFixed(2)}
                      </td>
                      <td className="v2-num px-3 py-2 text-right text-[var(--v2-text-mute)]">
                        {ltp > 0 ? `₹${ltp.toFixed(2)}` : "—"}
                      </td>
                      <td
                        className={cn(
                          "v2-num px-3 py-2 text-right font-semibold",
                          dayPnl >= 0 ? "text-[var(--v2-gain)]" : "text-[var(--v2-loss)]",
                        )}
                      >
                        {formatInr(dayPnl)}
                      </td>
                      <td
                        className={cn(
                          "v2-num px-3 py-2 text-right font-semibold",
                          unrPnl >= 0 ? "text-[var(--v2-gain)]" : "text-[var(--v2-loss)]",
                        )}
                      >
                        {formatInr(unrPnl)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">Recent orders</h3>
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            last 20
          </span>
        </header>
        <div className="v2-card overflow-hidden">
          {ordersQuery.isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--v2-text-mute)]">
              Loading orders…
            </p>
          ) : orders.length === 0 ? (
            <EmptyState title="No orders yet" />
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {orders.map((o) => {
                const filled = num(o.filledQuantity)
                const total = num(o.quantity)
                const fillPct = total > 0 ? Math.min(100, (filled / total) * 100) : 0
                const tone =
                  o.status === "EXECUTED"
                    ? "v2-pill-success"
                    : o.status === "PENDING"
                      ? "v2-pill-info"
                      : o.status === "CANCELLED"
                        ? "v2-pill-neutral"
                        : "v2-pill-warning"
                return (
                  <li
                    key={o.id}
                    className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs"
                  >
                    <span className="col-span-3 min-w-0">
                      <Link
                        href={`/admin-v2/command-centre?tab=symbol%3A${encodeURIComponent(o.symbol)}`}
                        className="font-mono text-xs font-semibold text-[var(--v2-text)] hover:text-[#9DB6FF]"
                      >
                        {o.symbol}
                      </Link>
                    </span>
                    <span className="col-span-2">
                      <span
                        className={cn(
                          "v2-pill",
                          o.orderSide === "BUY" ? "v2-pill-success" : "v2-pill-danger",
                        )}
                      >
                        {o.orderSide === "BUY" ? (
                          <TrendingUp className="h-2.5 w-2.5" />
                        ) : (
                          <TrendingDown className="h-2.5 w-2.5" />
                        )}
                        {o.orderSide}
                      </span>
                    </span>
                    <span className="col-span-2 v2-num text-right text-[var(--v2-text-mute)]">
                      {filled} / {total}
                    </span>
                    <span className="col-span-2 v2-num text-right text-[var(--v2-text-mute)]">
                      {o.averagePrice
                        ? `₹${num(o.averagePrice).toFixed(2)}`
                        : o.price
                          ? `₹${num(o.price).toFixed(2)}`
                          : "MKT"}
                    </span>
                    <span className="col-span-2 text-center">
                      <span className={cn("v2-pill", tone)}>{o.status}</span>
                    </span>
                    <span className="col-span-1 text-right text-[10px] text-[var(--v2-text-faint)]">
                      {formatRelativeIst(o.executedAt ?? o.createdAt)}
                    </span>
                    {fillPct > 0 && fillPct < 100 ? (
                      <span className="col-span-12 mt-1 h-0.5 overflow-hidden rounded-full bg-white/[0.04]">
                        <span
                          className="block h-full rounded-full bg-[var(--v2-cobalt)]"
                          style={{ width: `${fillPct}%` }}
                        />
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function PnlTile({
  label,
  amount,
  subtitle,
}: {
  label: string
  amount: number
  subtitle: string
}) {
  const positive = amount >= 0
  return (
    <div
      className={cn(
        "v2-card p-4",
        !!amount &&
          (positive
            ? "shadow-[0_0_28px_-12px_rgba(16,233,160,0.4)]"
            : "shadow-[0_0_28px_-12px_rgba(255,77,107,0.4)]"),
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-text-faint)]">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md border border-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold",
            positive
              ? "bg-[var(--v2-gain-soft)] text-[var(--v2-gain)]"
              : "bg-[var(--v2-loss-soft)] text-[var(--v2-loss)]",
          )}
        >
          {positive ? (
            <TrendingUp className="h-2.5 w-2.5" />
          ) : (
            <TrendingDown className="h-2.5 w-2.5" />
          )}
          {positive ? "client +" : "client −"}
        </span>
      </div>
      <div
        className={cn(
          "v2-num-display mt-2 text-2xl font-bold",
          positive ? "text-[var(--v2-gain)]" : "text-[var(--v2-loss)]",
        )}
      >
        {formatInr(amount)}
      </div>
      <div className="mt-1 text-[11px] text-[var(--v2-text-mute)]">{subtitle}</div>
    </div>
  )
}
