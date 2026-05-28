/**
 * @file app/terms/page.tsx
 * @module app/terms
 * @description Public terms and conditions placeholder page for StockTrade.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { BRAND_MARKETING } from "@/Branding"

export default function TermsPage(): React.JSX.Element {
  return (
    <MarketingPageShell title={BRAND_MARKETING.pages.terms.title}>
      <div className="max-w-3xl space-y-3 text-sm text-slate-700">
        <p>{BRAND_MARKETING.pages.terms.summary}</p>
      </div>
    </MarketingPageShell>
  )
}
