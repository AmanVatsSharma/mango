/**
 * @file app/contact/page.tsx
 * @module app/contact
 * @description Public contact page for StockTrade onboarding and support.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import Link from "next/link"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"
import { BRAND_IDENTITY, BRAND_MARKETING, mailtoSupport } from "@/Branding"

export default function ContactPage(): React.JSX.Element {
  return (
    <MarketingPageShell title={BRAND_MARKETING.pages.contact.title}>
      <div className="max-w-2xl space-y-4 text-sm text-slate-700">
        <p>{BRAND_MARKETING.pages.contact.description}</p>
        <p>
          {`${BRAND_MARKETING.pages.contact.supportLabel}: `}
          <Link href={mailtoSupport()} className="font-semibold text-cyan-700 hover:underline">
            {BRAND_IDENTITY.email.support}
          </Link>
        </p>
      </div>
    </MarketingPageShell>
  )
}
