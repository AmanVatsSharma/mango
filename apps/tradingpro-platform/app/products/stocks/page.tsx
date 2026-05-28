/**
 * @file app/products/stocks/page.tsx
 * @module app/products
 * @description Public product placeholder page for Stocks.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { BRAND_IDENTITY } from "@/Branding"

export default function StocksPage(): React.JSX.Element {
  return (
    <MarketingPageShell title="Stocks">
      <p className="text-sm text-slate-700">{`${BRAND_IDENTITY.names.short} stocks product details will be published here.`}</p>
    </MarketingPageShell>
  )
}
