"use client"

/**
 * @file rollup-table.tsx
 * @module admin-console/trades-blotter
 * @description Aggregated rollup tables for "By Client" and "By Symbol" tabs. Fetches the matching
 *              endpoint and renders a compact, sortable view. Clicking a row opens the matching
 *              user/symbol tab in the parent workspace.
 * @author StockTrade
 * @created 2026-04-15
 */

import React, { useCallback, useEffect, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { RefreshCw } from "lucide-react"
import type {
  ClientRollupRow,
  SymbolRollupRow,
} from "@/app/api/admin/trades/types"
import {
  formatTradesBlotterCompactRupees,
  formatTradesBlotterDuration,
  tradesBlotterPnlClass,
} from "@/components/admin-console/trades-blotter-number-utils"

export type RollupKind = "by-client" | "by-symbol"

export function RollupTable({
  kind,
  onUserClick,
  onSymbolClick,
}: {
  kind: RollupKind
  onUserClick?: (userId: string, clientId: string | null, name: string | null) => void
  onSymbolClick?: (symbol: string, segment: string | null) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientRows, setClientRows] = useState<ClientRollupRow[]>([])
  const [symbolRows, setSymbolRows] = useState<SymbolRollupRow[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url =
        kind === "by-client"
          ? "/api/admin/trades/rollup/by-client?limit=100"
          : "/api/admin/trades/rollup/by-symbol?limit=100"
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json()
      if (kind === "by-client") setClientRows(data.rows || [])
      else setSymbolRows(data.rows || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load rollup")
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {kind === "by-client" ? "Rollup by client" : "Rollup by symbol"}
        </h3>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => void fetchData()}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
          <AlertTitle className="text-red-500">Failed to load</AlertTitle>
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            {kind === "by-client" ? (
              <>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-xs">Client</TableHead>
                    <TableHead className="text-xs">Trades</TableHead>
                    <TableHead className="text-xs">Win rate</TableHead>
                    <TableHead className="text-xs">Realized P&L</TableHead>
                    <TableHead className="text-xs">Volume</TableHead>
                    <TableHead className="text-xs">Open</TableHead>
                    <TableHead className="text-xs">Avg held</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && clientRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                        No data
                      </TableCell>
                    </TableRow>
                  )}
                  {clientRows.map((r) => (
                    <TableRow
                      key={r.userId}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => onUserClick?.(r.userId, r.clientId, r.name)}
                    >
                      <TableCell>
                        <div className="text-xs">
                          <code className="text-primary font-mono">{r.clientId || "—"}</code>
                          {r.name && (
                            <div className="text-muted-foreground text-[11px]">{r.name}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {r.tradesCount}
                        <div className="text-muted-foreground text-[10px]">
                          {r.wins}W / {r.losses}L
                        </div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{r.winRatePct.toFixed(0)}%</TableCell>
                      <TableCell className={`text-xs font-bold tabular-nums ${tradesBlotterPnlClass(r.realizedPnL)}`}>
                        {formatTradesBlotterCompactRupees(r.realizedPnL)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {formatTradesBlotterCompactRupees(r.volumeNotional)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {r.openCount}
                        {r.openCount > 0 && (
                          <div className={`text-[10px] ${tradesBlotterPnlClass(r.openUnrealizedPnL)}`}>
                            {formatTradesBlotterCompactRupees(r.openUnrealizedPnL)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTradesBlotterDuration(r.avgHeldMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </>
            ) : (
              <>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-xs">Instrument</TableHead>
                    <TableHead className="text-xs">Trades</TableHead>
                    <TableHead className="text-xs">Clients</TableHead>
                    <TableHead className="text-xs">Win rate</TableHead>
                    <TableHead className="text-xs">Realized P&L</TableHead>
                    <TableHead className="text-xs">Volume</TableHead>
                    <TableHead className="text-xs">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && symbolRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                        No data
                      </TableCell>
                    </TableRow>
                  )}
                  {symbolRows.map((r) => (
                    <TableRow
                      key={`${r.symbol}-${r.segment}-${r.optionType}-${r.strikePrice}-${r.expiry}`}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => onSymbolClick?.(r.symbol, r.segment)}
                    >
                      <TableCell>
                        <div className="text-xs">
                          <span className="font-bold font-mono">{r.symbol}</span>
                          {r.instrumentLabel && r.instrumentLabel !== r.symbol && (
                            <div className="text-muted-foreground text-[11px] truncate max-w-[240px]">
                              {r.instrumentLabel}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{r.tradesCount}</TableCell>
                      <TableCell className="text-xs tabular-nums">{r.uniqueClients}</TableCell>
                      <TableCell className="text-xs tabular-nums">{r.winRatePct.toFixed(0)}%</TableCell>
                      <TableCell className={`text-xs font-bold tabular-nums ${tradesBlotterPnlClass(r.realizedPnL)}`}>
                        {formatTradesBlotterCompactRupees(r.realizedPnL)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {formatTradesBlotterCompactRupees(r.volumeNotional)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {r.openCount}
                        {r.openCount > 0 && (
                          <div className={`text-[10px] ${tradesBlotterPnlClass(r.openUnrealizedPnL)}`}>
                            {formatTradesBlotterCompactRupees(r.openUnrealizedPnL)}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </>
            )}
          </Table>
        </div>
      </div>
    </div>
  )
}
