/**
 * @file price-chart.tsx
 * @module components/trading/widgets
 * @description Trading home chart: Obsidian-mobile shell below `lg`; desktop terminal on `lg+`.
 * @author StockTrade
 * @created 2026-01-24
 * @updated 2026-03-28
 */

"use client"

import React from "react"
import { DesktopTradingChartPanel } from "@/components/trading/widgets/desktop-trading-chart-panel"
import { MobileTradingChartPanel } from "@/components/trading/widgets/mobile-trading-chart-panel"
import type { Stock } from "@/types/trading"

export type ChartSymbol = {
  key: string
  label: string
  token: number
}

type PriceChartProps = {
  symbols: ChartSymbol[]
  defaultSymbolKey?: string
  watchlists?: any[] | null | undefined
  onQuickBuy?: (stock: Stock) => void
  onQuickSell?: (stock: Stock) => void
}

export function PriceChart(props: PriceChartProps) {
  return (
    <>
      <div className="h-full min-h-[400px] lg:hidden">
        <MobileTradingChartPanel
          symbols={props.symbols}
          defaultSymbolKey={props.defaultSymbolKey}
          watchlists={props.watchlists}
          onQuickBuy={props.onQuickBuy}
          onQuickSell={props.onQuickSell}
        />
      </div>
      <div className="hidden h-full min-h-[520px] lg:block">
        <DesktopTradingChartPanel symbols={props.symbols} defaultSymbolKey={props.defaultSymbolKey} />
      </div>
    </>
  )
}
