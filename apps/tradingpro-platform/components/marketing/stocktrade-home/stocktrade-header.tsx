/**
 * @file components/marketing/stocktrade-home/stocktrade-header.tsx
 * @module marketing/stocktrade-home
 * @description Public marketing header with desktop/mobile navigation for StockTrade pages.
 * @author BharatERP
 * @created 2026-02-19
 */

import React from "react"
import Link from "next/link"
import Image from "next/image"
import { BRAND_ASSETS, BRAND_IDENTITY, BRAND_MARKETING } from "@/Branding"
import { getUiRoutes } from "@/lib/branding-routes"

type NavLink = { label: string; href: string }
const routes = getUiRoutes()

const aboutLinks: NavLink[] = [
  { label: BRAND_MARKETING.pages.whyUs.title, href: routes.marketing.whyUs },
  { label: BRAND_MARKETING.pages.affiliate.title, href: routes.marketing.affiliate },
  { label: BRAND_MARKETING.pages.privacyPolicy.title, href: routes.marketing.privacyPolicy },
  { label: BRAND_MARKETING.pages.terms.title, href: routes.marketing.terms },
]

const productLinks: NavLink[] = BRAND_MARKETING.pages.products.items.map((item) => ({
  label: item.label,
  href: routes.marketing[item.routeKey],
}))

const paymentLinks: NavLink[] = BRAND_MARKETING.pages.paymentMethods.items.map((item) => ({
  label: item.label,
  href: routes.marketing[item.routeKey],
}))

function Dropdown({ label, items }: { label: string; items: NavLink[] }): React.JSX.Element {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 whitespace-nowrap px-2 py-1 text-sm font-medium text-white/80 hover:text-white">
        <span>{label}</span>
        <span className="text-white/60 group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute left-0 top-full z-50 mt-2 min-w-56 overflow-hidden rounded-lg border bg-white shadow-xl">
        <div className="p-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </details>
  )
}

export function StockTradeHeader(): React.JSX.Element {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-slate-900/90 backdrop-blur shadow-lg shadow-black/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href={routes.marketing.home} className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Image
              src={BRAND_ASSETS.logos.headerLogo}
              alt=""
              width={140}
              height={44}
              className="h-8 w-auto shrink-0 object-contain object-left sm:h-9"
            />
            <span className="truncate font-semibold tracking-tight text-white text-xs sm:text-sm md:text-base">
              {BRAND_IDENTITY.names.full}
            </span>
          </Link>

          <nav className="hidden items-center gap-3 lg:flex" aria-label="Primary">
            <Link href={routes.marketing.home} className="px-2 py-1 text-sm font-medium text-white">
              {BRAND_MARKETING.navigation.homeLabel}
            </Link>
            <Dropdown label={BRAND_MARKETING.navigation.aboutUsLabel} items={aboutLinks} />
            <Dropdown label={BRAND_MARKETING.navigation.productsLabel} items={productLinks} />
            <Link
              href={routes.marketing.newsBlogs}
              className="whitespace-nowrap px-2 py-1 text-sm font-medium text-white/80 hover:text-white"
            >
              {BRAND_MARKETING.navigation.newsBlogsLabel}
            </Link>
            <Link href={routes.marketing.contact} className="whitespace-nowrap px-2 py-1 text-sm font-medium text-white/80 hover:text-white">
              {BRAND_MARKETING.navigation.contactLabel}
            </Link>
            <Dropdown label={BRAND_MARKETING.navigation.paymentMethodLabel} items={paymentLinks} />
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href={routes.auth.login}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {BRAND_MARKETING.navigation.loginLabel}
            </Link>
            <Link
              href={routes.auth.register}
              className="stocktrade-cta-primary px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              {BRAND_MARKETING.navigation.signupLabel}
            </Link>
          </div>

          <details className="group relative lg:hidden">
            <summary
              className="inline-flex cursor-pointer list-none items-center justify-center rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              aria-label="Open menu"
            >
              <span className="mr-2">{BRAND_MARKETING.navigation.menuLabel}</span>
              <span className="text-white/70 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-xl border bg-white shadow-2xl">
              <div className="p-3">
                <div className="space-y-1">
                  <Link href={routes.marketing.home} className="block rounded-md px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                    {BRAND_MARKETING.navigation.homeLabel}
                  </Link>

                  <details className="rounded-md px-1 py-1">
                    <summary className="cursor-pointer list-none rounded-md px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      {BRAND_MARKETING.navigation.aboutUsLabel}
                    </summary>
                    <div className="mt-1 space-y-1 pl-2">
                      {aboutLinks.map((l) => (
                        <Link key={l.href} href={l.href} className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  </details>

                  <details className="rounded-md px-1 py-1">
                    <summary className="cursor-pointer list-none rounded-md px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      {BRAND_MARKETING.navigation.productsLabel}
                    </summary>
                    <div className="mt-1 space-y-1 pl-2">
                      {productLinks.map((l) => (
                        <Link key={l.href} href={l.href} className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  </details>

                  <Link href={routes.marketing.newsBlogs} className="block rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    {BRAND_MARKETING.navigation.newsBlogsLabel}
                  </Link>
                  <Link href={routes.marketing.contact} className="block rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    {BRAND_MARKETING.navigation.contactLabel}
                  </Link>

                  <details className="rounded-md px-1 py-1">
                    <summary className="cursor-pointer list-none rounded-md px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      {BRAND_MARKETING.navigation.paymentMethodLabel}
                    </summary>
                    <div className="mt-1 space-y-1 pl-2">
                      {paymentLinks.map((l) => (
                        <Link key={l.href} href={l.href} className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  </details>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link href={routes.auth.login} className="rounded-md border px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    {BRAND_MARKETING.navigation.loginLabel}
                  </Link>
                  <Link
                    href={routes.auth.register}
                    className="stocktrade-cta-primary px-3 py-2 text-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    {BRAND_MARKETING.navigation.signupLabel}
                  </Link>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}