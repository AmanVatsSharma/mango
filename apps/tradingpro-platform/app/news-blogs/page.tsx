/**
 * @file app/news-blogs/page.tsx
 * @module app/news-blogs
 * @description Public news and blogs landing route aligned to StockTrade marketing navigation.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import Link from "next/link"
import { BRAND_MARKETING } from "@/Branding"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { STOCKTRADE_HOMEPAGE_CONTENT } from "@/lib/marketing/stocktrade-homepage-content"
import { getMarketingRoute } from "@/lib/branding-routes"

export default function NewsBlogsPage(): React.JSX.Element {
  return (
    <MarketingPageShell title={BRAND_MARKETING.pages.newsBlogs.title}>
      <div className="grid gap-3 sm:grid-cols-2">
        {STOCKTRADE_HOMEPAGE_CONTENT.blogTitles.map((title) => (
          <Link
            key={title}
            href={getMarketingRoute("blog")}
            className="rounded-xl border bg-white p-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            {title}
          </Link>
        ))}
      </div>
    </MarketingPageShell>
  )
}
