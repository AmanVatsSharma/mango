/**
 * @file app/products/commodity/page.tsx
 * @module app/products
 * @description Public product placeholder page for Commodity.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { BRAND_IDENTITY } from "@/Branding"

export default function CommodityPage(): React.JSX.Element {
  return (
    <MarketingPageShell title="Commodity">
      <p className="text-sm text-slate-700">{`${BRAND_IDENTITY.names.short} commodity product details will be published here.`}</p>
    </MarketingPageShell>
  )
}
