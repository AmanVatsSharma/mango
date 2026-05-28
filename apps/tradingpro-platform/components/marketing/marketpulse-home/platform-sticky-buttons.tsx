/**
 * @file components/marketing/marketpulse-home/platform-sticky-buttons.tsx
 * @module marketing/marketpulse-home
 * @description Sticky quick-access platform buttons for MarketPulse downloads.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import Image from "next/image"
import Link from "next/link"
import { BRAND_ASSETS } from "@/Branding"
import { buildRouteWithQuery, getUiRoutes } from "@/lib/branding-routes"

type PlatformLink = {
  id: "android" | "ios" | "desktop" | "web"
  label: string
  href: string
  iconSrc: string
}

const routes = getUiRoutes()

const PLATFORM_LINKS: PlatformLink[] = [
  { id: "android", label: "Android", href: buildRouteWithQuery(routes.marketing.downloads, {}, "android"), iconSrc: BRAND_ASSETS.icons.platformAndroid },
  { id: "ios", label: "IOS", href: buildRouteWithQuery(routes.marketing.downloads, {}, "ios"), iconSrc: BRAND_ASSETS.icons.platformIos },
  { id: "desktop", label: "Desktop", href: buildRouteWithQuery(routes.marketing.downloads, {}, "desktop"), iconSrc: BRAND_ASSETS.icons.platformDesktop },
  { id: "web", label: "Web Terminal", href: buildRouteWithQuery(routes.marketing.downloads, {}, "web"), iconSrc: BRAND_ASSETS.icons.platformWeb },
]

export function PlatformStickyButtons(): React.JSX.Element {
  return (
    <div className="fixed bottom-24 right-5 z-40 flex flex-col gap-2">
      {PLATFORM_LINKS.map((p) => (
        <Link
          key={p.id}
          href={p.href}
          className="group relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-black/20 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          aria-label={`Open ${p.label} downloads`}
        >
          <Image
            src={p.iconSrc}
            alt=""
            width={18}
            height={18}
            className="h-[18px] w-[18px] brightness-0 invert"
            aria-hidden="true"
          />
          <span className="pointer-events-none absolute right-full mr-2 hidden whitespace-nowrap rounded-lg bg-slate-900/95 px-2 py-1 text-xs font-semibold text-white shadow-lg shadow-black/25 backdrop-blur group-hover:block group-focus-visible:block">
            {p.label}
          </span>
        </Link>
      ))}
    </div>
  )
}
