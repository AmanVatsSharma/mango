"use client"

/**
 * @file trades-blotter.tsx
 * @module admin-console
 * @description Top-level Trades command center for /admin-console/advanced. Composes the PageHeader,
 *              the top row (Active Users panel + Stats/Risk cell), and the bottom tabs area
 *              (All · By Client · By Symbol + dynamic user/symbol tabs, LRU cap 10).
 * @author StockTrade
 * @created 2026-04-15
 */

import React, { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, Download, RefreshCw, X } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { ActiveUsersPanel } from "@/components/admin-console/trades-blotter/active-users-panel"
import { StatsAndRisk } from "@/components/admin-console/trades-blotter/stats-and-risk"
import {
  TradesTable,
  type TradesTableScope,
} from "@/components/admin-console/trades-blotter/trades-table"
import { RollupTable } from "@/components/admin-console/trades-blotter/rollup-table"
import {
  UserHeaderBar,
  type UserTabContext,
} from "@/components/admin-console/trades-blotter/user-header-bar"
import {
  SymbolHeaderBar,
  type SymbolTabContext,
} from "@/components/admin-console/trades-blotter/symbol-header-bar"
import { TradesFilterSlotContext } from "@/components/admin-console/trades-blotter/filter-slot-context"

const MAX_DYNAMIC_TABS = 10

type DynamicTab =
  | { id: string; kind: "user"; ctx: UserTabContext; addedAt: number }
  | { id: string; kind: "symbol"; ctx: SymbolTabContext; addedAt: number }

export function TradesBlotter() {
  const [activeTab, setActiveTab] = useState<string>("all")
  const [dynamicTabs, setDynamicTabs] = useState<DynamicTab[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [filterSlotEl, setFilterSlotEl] = useState<HTMLDivElement | null>(null)

  const addUserTab = useCallback(
    (userId: string, clientId: string | null, name: string | null) => {
      const id = `user:${userId}`
      setDynamicTabs((prev) => {
        const existing = prev.find((t) => t.id === id)
        if (existing) return prev
        const next: DynamicTab = {
          id,
          kind: "user",
          ctx: { userId, clientId, name },
          addedAt: Date.now(),
        }
        const combined = [...prev, next]
        if (combined.length > MAX_DYNAMIC_TABS) {
          // LRU evict oldest
          combined.sort((a, b) => a.addedAt - b.addedAt)
          const evicted = combined.shift()!
          toast({
            title: "Tab limit reached",
            description: `Closed the oldest tab to make room.`,
          })
          void evicted
        }
        return combined
      })
      setActiveTab(id)
    },
    [],
  )

  const addSymbolTab = useCallback(
    (symbol: string, segment: string | null) => {
      const id = `symbol:${symbol}:${segment ?? ""}`
      setDynamicTabs((prev) => {
        if (prev.some((t) => t.id === id)) return prev
        const next: DynamicTab = {
          id,
          kind: "symbol",
          ctx: { symbol, segment },
          addedAt: Date.now(),
        }
        const combined = [...prev, next]
        if (combined.length > MAX_DYNAMIC_TABS) {
          combined.sort((a, b) => a.addedAt - b.addedAt)
          combined.shift()
          toast({
            title: "Tab limit reached",
            description: `Closed the oldest tab to make room.`,
          })
        }
        return combined
      })
      setActiveTab(id)
    },
    [],
  )

  const closeDynamicTab = (id: string) => {
    setDynamicTabs((prev) => prev.filter((t) => t.id !== id))
    setActiveTab((current) => (current === id ? "all" : current))
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const res = await fetch("/api/admin/trades/export")
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: "Export ready", description: "CSV downloaded." })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Export failed"
      toast({ title: "Export failed", description: msg, variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-88px)] min-h-[640px] gap-2">
      {/* Compact command-bar header — single horizontal strip, no tall hero */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 text-primary shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground leading-tight truncate">
              Trades command center
            </h1>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              Monitor, manage & analyze every trade across all clients
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => void exportCsv()}
            disabled={exporting}
          >
            <Download className="w-3 h-3 mr-1" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Top row — Active Users + Stats/Risk, compact */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_1fr] gap-2 h-[232px] shrink-0">
        <ActiveUsersPanel onUserClick={addUserTab} />
        <StatsAndRisk onUserClick={addUserTab} onSymbolClick={addSymbolTab} />
      </div>

      {/* Bottom area — tabs (owns remaining viewport) */}
      <TradesFilterSlotContext.Provider value={filterSlotEl}>
      <div className="flex-1 min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
          {/* Single strip: tabs (left) + filter slot (right) */}
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <TabsList className="flex flex-wrap h-auto gap-0.5 bg-muted/40 p-0.5 justify-start rounded-md shrink-0">
              <TabsTrigger value="all" className="text-xs h-7 px-2.5">
                All trades
              </TabsTrigger>
              <TabsTrigger value="by-client" className="text-xs h-7 px-2.5">
                By client
              </TabsTrigger>
              <TabsTrigger value="by-symbol" className="text-xs h-7 px-2.5">
                By symbol
              </TabsTrigger>
              {dynamicTabs.map((t) => (
                <div key={t.id} className="flex items-center">
                  <TabsTrigger value={t.id} className="text-xs h-7 pl-2.5 pr-1">
                    {t.kind === "user"
                      ? t.ctx.name ?? t.ctx.clientId ?? t.ctx.userId.slice(0, 6)
                      : t.ctx.symbol}
                  </TabsTrigger>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeDynamicTab(t.id)
                    }}
                    className="ml-0.5 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label={`Close ${t.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </TabsList>
            <div
              ref={setFilterSlotEl}
              className="flex-1 min-w-0 flex items-center justify-end"
            />
          </div>

          <TabsContent value="all" className="mt-1.5 flex-1 min-h-0">
            <TradesTable
              scope={{ kind: "all" }}
              onUserClick={addUserTab}
              refreshKey={refreshKey}
            />
          </TabsContent>

          <TabsContent value="by-client" className="mt-1.5 flex-1 min-h-0">
            <RollupTable kind="by-client" onUserClick={addUserTab} />
          </TabsContent>

          <TabsContent value="by-symbol" className="mt-1.5 flex-1 min-h-0">
            <RollupTable kind="by-symbol" onSymbolClick={addSymbolTab} />
          </TabsContent>

          {dynamicTabs.map((t) => {
            const scope: TradesTableScope =
              t.kind === "user"
                ? { kind: "user", userId: t.ctx.userId, clientId: t.ctx.clientId }
                : { kind: "symbol", symbol: t.ctx.symbol, segment: t.ctx.segment }
            return (
              <TabsContent key={t.id} value={t.id} className="mt-1.5 flex-1 min-h-0 flex flex-col gap-1.5">
                {t.kind === "user" ? (
                  <UserHeaderBar user={t.ctx} />
                ) : (
                  <SymbolHeaderBar context={t.ctx} />
                )}
                <div className="flex-1 min-h-0">
                  <TradesTable scope={scope} onUserClick={addUserTab} refreshKey={refreshKey} />
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
      </TradesFilterSlotContext.Provider>
    </div>
  )
}
