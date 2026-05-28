/**
 * @file app/products/indexes/page.tsx
 * @module app/products
 * @description Public product placeholder page for Indexes.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { BRAND_IDENTITY } from "@/Branding"

export default function IndexesPage(): React.JSX.Element {
  return (
    <MarketingPageShell title="Indexes">
      <p className="text-sm text-slate-700">{`${BRAND_IDENTITY.names.short} index product details will be published here.`}</p>
    </MarketingPageShell>
  )
}
