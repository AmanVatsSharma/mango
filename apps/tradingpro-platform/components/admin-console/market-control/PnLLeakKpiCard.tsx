"use client"

/**
 * @file PnLLeakKpiCard.tsx
 * @module components/admin-console/market-control
 * @description House-vs-customer P&L KPI tile rendered at the top of the Market Control panel.
 *              Calls GET /api/admin/market-controls/pnl-leak and shows the four headline numbers
 *              that prove the B-book rules are actually working: houseNet, customerNet,
 *              effectiveSpreadPct, tradeCount. Colour-coded green when house > 0, red when the
 *              leak is back.
 * @author StockTrade
 * @created 2026-04-16
 */

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, TrendingUp, TrendingDown } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { InfoHint, MARKET_CONTROL_HELP } from "./market-control-help"

interface PnLLeakData {
  window: string
  since: string
  houseNet: number
  customerNet: number
  effectiveSpreadPct: number
  tradeCount: number
}

const WINDOWS = [
  { value: "24h", label: "Last 24 h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
]

function fmtInr(v: number): string {
  const sign = v < 0 ? "-" : ""
  const abs = Math.abs(v)
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(2)} K`
  return `${sign}₹${abs.toFixed(2)}`
}

export function PnLLeakKpiCard() {
  const [data, setData] = useState<PnLLeakData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [window, setWindow] = useState("24h")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/market-controls/pnl-leak?window=${window}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load")
      setData(json.data as PnLLeakData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [window])

  useEffect(() => {
    load()
  }, [load])

  const houseIsGreen = (data?.houseNet ?? 0) > 0
  const houseColor = houseIsGreen ? "text-emerald-400" : "text-red-400"
  const houseBg = houseIsGreen ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"

  return (
    <Card className="bg-card border-border shadow-sm neon-border">
      <CardContent className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              {houseIsGreen ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            </div>
            <div>
              <div className="text-sm font-semibold">House vs Customer P&amp;L</div>
              <div className="text-[11px] text-muted-foreground">
                The only metric that proves the Market Control rules are working
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={window} onValueChange={setWindow}>
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} className="gap-2 h-8">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reload
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className={`rounded border px-3 py-2 ${houseBg}`}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              House P&amp;L
              <InfoHint text={MARKET_CONTROL_HELP.kpiHouseNet} />
            </div>
            <div className={`text-lg font-bold font-mono ${houseColor}`}>
              {data ? fmtInr(data.houseNet) : "—"}
            </div>
          </div>
          <div className="rounded border border-border bg-background/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              Customer P&amp;L
              <InfoHint text={MARKET_CONTROL_HELP.kpiCustomerNet} />
            </div>
            <div className="text-lg font-bold font-mono">
              {data ? fmtInr(data.customerNet) : "—"}
            </div>
          </div>
          <div className="rounded border border-border bg-background/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              Effective Spread
              <InfoHint text={MARKET_CONTROL_HELP.kpiEffectiveSpread} />
            </div>
            <div className="text-lg font-bold font-mono text-primary">
              {data ? `${data.effectiveSpreadPct.toFixed(3)}%` : "—"}
            </div>
          </div>
          <div className="rounded border border-border bg-background/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              Trades
              <InfoHint text={MARKET_CONTROL_HELP.kpiTrades} />
            </div>
            <div className="text-lg font-bold font-mono">{data ? data.tradeCount.toLocaleString("en-IN") : "—"}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
