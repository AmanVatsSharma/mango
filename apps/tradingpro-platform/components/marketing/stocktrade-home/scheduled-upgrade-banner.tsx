/**
 * @file components/marketing/stocktrade-home/scheduled-upgrade-banner.tsx
 * @module marketing/stocktrade-home
 * @description Env-toggled scheduled upgrade banner for StockTrade marketing pages.
 * @author BharatERP
 * @created 2026-02-19
 */

import React from "react"
import { BRAND_IDENTITY } from "@/Branding"

function isEnabled(value: string | undefined, fallback = true): boolean {
  if (value === undefined) return fallback
  return value === "true"
}

export function ScheduledUpgradeBanner(): React.JSX.Element | null {
  const enabled = isEnabled(process.env.SITE_BANNER_ENABLED, true)
  if (!enabled) return null

  const title = process.env.SITE_BANNER_TITLE || "Scheduled Server Upgrade in Progress"
  const message =
    process.env.SITE_BANNER_MESSAGE ||
    `We are currently upgrading our infrastructure to provide faster execution, stronger reliability, and a smoother trading experience on ${BRAND_IDENTITY.names.full}. Some services may be temporarily limited during this maintenance window.`

  return (
    <section aria-label="Scheduled upgrade notice" className="w-full border-t border-b border-amber-200/70 bg-amber-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold text-amber-900">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900/90">{message}</p>
      </div>
    </section>
  )
}