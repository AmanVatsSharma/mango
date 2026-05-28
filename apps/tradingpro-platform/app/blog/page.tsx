/**
 * @file app/blog/page.tsx
 * @module app/blog
 * @description Public blog placeholder route for StockTrade marketing cards.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { BRAND_MARKETING } from "@/Branding"
import { STOCKTRADE_HOMEPAGE_CONTENT } from "@/lib/marketing/stocktrade-homepage-content"

export default function BlogPage(): React.JSX.Element {
  return (
    <MarketingPageShell title={BRAND_MARKETING.pages.blog.title}>
      <p className="text-sm text-slate-600">{BRAND_MARKETING.pages.blog.intro}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {STOCKTRADE_HOMEPAGE_CONTENT.blogTitles.map((title) => (
          <div key={title} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-2 text-xs text-slate-600">{BRAND_MARKETING.pages.blog.comingSoonLabel}</p>
          </div>
        ))}
      </div>
    </MarketingPageShell>
  )
}
