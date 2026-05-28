/**
 * @file app/downloads/page.tsx
 * @module app/downloads
 * @description Public downloads page for StockTrade platforms.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import Link from "next/link"
import { BRAND_MARKETING } from "@/Branding"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { getMarketingRoute } from "@/lib/branding-routes"

const items = BRAND_MARKETING.pages.downloads.items

export default function DownloadsPage(): React.JSX.Element {
  return (
    <MarketingPageShell title={BRAND_MARKETING.pages.downloads.title}>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <section key={item.id} id={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
            <p className="mt-2 text-xs text-slate-600">{item.hint}</p>
            <div className="mt-4">
              <Link href={getMarketingRoute("contact")} className="text-sm font-semibold text-cyan-700 hover:underline">
                {BRAND_MARKETING.pages.downloads.contactSupportToGetAccessLabel}
              </Link>
            </div>
          </section>
        ))}
      </div>
    </MarketingPageShell>
  )
}
