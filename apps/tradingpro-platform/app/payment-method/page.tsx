/**
 * @file app/payment-method/page.tsx
 * @module app/payment-method
 * @description Public payment method landing page for StockTrade marketing navigation.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import Link from "next/link"
import { BRAND_MARKETING } from "@/Branding"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { getUiRoutes } from "@/lib/branding-routes"

const routes = getUiRoutes()

const items = BRAND_MARKETING.pages.paymentMethods.items.map((item) => ({
  label: item.label,
  href: routes.marketing[item.routeKey],
}))

export default function PaymentMethodPage(): React.JSX.Element {
  return (
    <MarketingPageShell title={BRAND_MARKETING.pages.paymentMethods.title}>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border bg-white p-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </MarketingPageShell>
  )
}
