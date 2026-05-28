"use client"

/**
 * @file symbol-header-bar.tsx
 * @module admin-console/trades-blotter
 * @description Header shown above the trades table inside a symbol-scoped tab.
 * @author StockTrade
 * @created 2026-04-15
 */

import React from "react"
import { Badge } from "@/components/ui/badge"
import { TrendingUp } from "lucide-react"

export interface SymbolTabContext {
  symbol: string
  segment: string | null
  instrumentLabel?: string | null
}

export function SymbolHeaderBar({ context }: { context: SymbolTabContext }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <TrendingUp className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-mono text-foreground">{context.symbol}</span>
          {context.segment && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {context.segment}
            </Badge>
          )}
        </div>
        {context.instrumentLabel && context.instrumentLabel !== context.symbol && (
          <div className="text-[11px] text-muted-foreground truncate">
            {context.instrumentLabel}
          </div>
        )}
      </div>
    </div>
  )
}
