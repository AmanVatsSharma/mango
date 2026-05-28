/**
 * @file app/affiliate/page.tsx
 * @module app/affiliate
 * @description Public affiliate placeholder page linked from StockTrade marketing nav.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import Link from "next/link"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { BRAND_MARKETING } from "@/Branding"
import { getMarketingRoute } from "@/lib/branding-routes"

export default function AffiliatePage(): React.JSX.Element {
  return (
    <MarketingPageShell title={BRAND_MARKETING.pages.affiliate.title}>
      <div className="max-w-3xl space-y-3 text-sm text-slate-700">
        <p>{BRAND_MARKETING.pages.affiliate.intro}</p>
        <p>
          {`${BRAND_MARKETING.pages.affiliate.partnershipText} `}
          <Link href={getMarketingRoute("contact")} className="font-semibold text-cyan-700 hover:underline">
            {BRAND_MARKETING.pages.affiliate.contactLabel}
          </Link>
          .
        </p>
      </div>
    </MarketingPageShell>
  )
}
