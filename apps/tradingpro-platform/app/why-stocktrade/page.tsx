/**
 * @file app/why-stocktrade/page.tsx
 * @module app/why-stocktrade
 * @description Public "Why StockTrade" page linked from marketing CTAs and navigation.
 * @author BharatERP
 * @created 2026-02-19
 */

import React from "react"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { BRAND_MARKETING } from "@/Branding"

export default function WhyStockTradePage(): React.JSX.Element {
  return (
    <MarketingPageShell title={BRAND_MARKETING.pages.whyUs.title}>
      <div className="max-w-3xl space-y-3 text-sm text-slate-700">
        <p>{BRAND_MARKETING.pages.whyUs.descriptionOne}</p>
        <p>{BRAND_MARKETING.pages.whyUs.descriptionTwo}</p>
      </div>
    </MarketingPageShell>
  )
}