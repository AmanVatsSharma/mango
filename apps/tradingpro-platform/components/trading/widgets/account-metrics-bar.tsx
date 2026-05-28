/**
 * @file account-metrics-bar.tsx
 * @module components/trading/widgets
 * @description Compact, horizontal pro-style account metrics bar.
 * @author StockTrade
 * @created 2026-02-22
 */

"use client"

import React, { useMemo } from "react"
import { Card } from "@/components/ui/card"
import type { PnLData } from "@/types/trading"
import { buildTradingHomePortfolioSummary } from "@/components/trading/trading-home-number-utils"

interface AccountMetricsBarProps {
  portfolio?: any
  pnl?: PnLData
}

export const AccountMetricsBar: React.FC<AccountMetricsBarProps> = ({ portfolio, pnl }) => {
  const { totalPnL, dayPnL, buyingPower, marginPercent, netLiq } = useMemo(
    () => buildTradingHomePortfolioSummary({ portfolio, pnl }),
    [portfolio, pnl],
  )

  const formatCurrency = (val: number) => `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Card className="flex flex-wrap items-center justify-between border border-border/50 bg-card p-1.5 sm:p-2 shadow-sm rounded-md">
      <div className="flex flex-1 items-center gap-3 sm:gap-4 divide-x divide-border/50 overflow-x-auto scrollbar-width-none [&::-webkit-scrollbar]:hidden text-sm py-0.5">
        <div className="flex flex-col px-2 sm:px-3 min-w-fit">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Net Liq</span>
          <span className="font-mono font-bold text-foreground">{formatCurrency(netLiq)}</span>
        </div>
        <div className="flex flex-col pl-3 sm:pl-4 pr-2 sm:pr-3 min-w-fit">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Buying Power</span>
          <span className="font-mono font-bold text-foreground">{formatCurrency(buyingPower)}</span>
        </div>
        <div className="flex flex-col pl-3 sm:pl-4 pr-2 sm:pr-3 min-w-fit">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Margin %</span>
          <span className={`font-mono font-bold ${marginPercent > 80 ? "text-red-500" : marginPercent > 50 ? "text-yellow-500" : "text-foreground"}`}>
            {marginPercent.toFixed(1)}%
          </span>
        </div>
        <div className="flex flex-col pl-3 sm:pl-4 pr-2 sm:pr-3 min-w-fit">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Day PnL</span>
          <span className={`font-mono font-bold ${dayPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
            {dayPnL >= 0 ? "+" : ""}{formatCurrency(dayPnL)}
          </span>
        </div>
        <div className="flex flex-col pl-3 sm:pl-4 pr-2 sm:pr-3 min-w-fit">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Total PnL</span>
          <span className={`font-mono font-bold ${totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
            {totalPnL >= 0 ? "+" : ""}{formatCurrency(totalPnL)}
          </span>
        </div>
      </div>
    </Card>
  )
}
