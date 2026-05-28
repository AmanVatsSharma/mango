/**
 * @file components/marketing/stocktrade-home/stocktrade-footer.tsx
 * @module marketing/stocktrade-home
 * @description Public marketing footer with StockTrade navigation and support links.
 * @author BharatERP
 * @created 2026-02-19
 */

import React from "react"
import Link from "next/link"
import Image from "next/image"
import { BRAND_ASSETS, BRAND_IDENTITY, BRAND_MARKETING, mailtoSupport } from "@/Branding"
import { buildRouteWithQuery, getUiRoutes } from "@/lib/branding-routes"

const routes = getUiRoutes()

export function StockTradeFooter(): React.JSX.Element {
  return (
    <footer className="border-t border-white/10 bg-slate-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Image src={BRAND_ASSETS.logos.mark} alt={`${BRAND_IDENTITY.names.full} mark`} width={36} height={36} className="h-9 w-9 rounded-lg" />
              <span className="text-sm font-semibold text-white sm:text-base">{BRAND_IDENTITY.names.full}</span>
            </div>
            <p className="mt-3 text-sm text-white/75">{BRAND_IDENTITY.messaging.shortTagline}</p>

            <div className="mt-5 flex items-center gap-3">
              <a
                href="#"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/15"
                aria-label={`${BRAND_IDENTITY.names.full} on Facebook`}
              >
                <span className="text-sm font-extrabold" aria-hidden="true">f</span>
              </a>
              <a
                href="#"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/15"
                aria-label={`${BRAND_IDENTITY.names.full} on Instagram`}
              >
                <span className="text-sm font-extrabold" aria-hidden="true">ig</span>
              </a>
              <a
                href="#"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/15"
                aria-label={`${BRAND_IDENTITY.names.full} on YouTube`}
              >
                <span className="text-sm font-extrabold" aria-hidden="true">yt</span>
              </a>
              <a
                href="#"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/15"
                aria-label={`${BRAND_IDENTITY.names.full} on WhatsApp`}
              >
                <span className="text-sm font-extrabold" aria-hidden="true">wa</span>
              </a>
              <a
                href={mailtoSupport()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/15"
                aria-label={`Email ${BRAND_IDENTITY.names.full} support`}
              >
                <span className="text-sm font-extrabold" aria-hidden="true">@</span>
              </a>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{BRAND_MARKETING.navigation.aboutUsLabel}</p>
            <div className="mt-4 space-y-2">
              <Link href={routes.marketing.whyUs} className="block text-sm text-white/80 hover:text-white hover:underline">
                {BRAND_MARKETING.pages.whyUs.title}
              </Link>
              <Link href={routes.marketing.affiliate} className="block text-sm text-white/80 hover:text-white hover:underline">
                {BRAND_MARKETING.pages.affiliate.title}
              </Link>
              <Link href={routes.marketing.privacyPolicy} className="block text-sm text-white/80 hover:text-white hover:underline">
                {BRAND_MARKETING.pages.privacyPolicy.title}
              </Link>
              <Link href={routes.marketing.terms} className="block text-sm text-white/80 hover:text-white hover:underline">
                {BRAND_MARKETING.pages.terms.title}
              </Link>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{BRAND_MARKETING.navigation.productsLabel}</p>
            <div className="mt-4 space-y-2">
              {BRAND_MARKETING.pages.products.items.map((item) => (
                <Link key={item.label} href={routes.marketing[item.routeKey]} className="block text-sm text-white/80 hover:text-white hover:underline">
                  {item.label}
                </Link>
              ))}
              <Link href={routes.marketing.newsBlogs} className="block text-sm text-white/80 hover:text-white hover:underline">
                {BRAND_MARKETING.navigation.newsBlogsLabel}
              </Link>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{BRAND_MARKETING.navigation.platformsLabel}</p>
            <div className="mt-4 space-y-2">
              {BRAND_MARKETING.homepage.platforms.map((platform) => (
                <Link
                  key={platform.anchor}
                  href={buildRouteWithQuery(routes.marketing.downloads, {}, platform.anchor)}
                  className="block text-sm text-white/80 hover:text-white hover:underline"
                >
                  {platform.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
          <span>{`Copyright ${BRAND_IDENTITY.legal.copyrightYear} - ${BRAND_IDENTITY.legal.companyName} | All rights reserved.`}</span>
          <span className="text-white/50">{BRAND_IDENTITY.messaging.shortTagline}</span>
        </div>
      </div>
    </footer>
  )
}