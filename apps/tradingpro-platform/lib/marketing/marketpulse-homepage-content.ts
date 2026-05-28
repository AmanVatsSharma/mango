/**
 * @file lib/marketing/marketpulse-homepage-content.ts
 * @module lib/marketing
 * @description Central marketing content config reused by MarketPulse marketing pages.
 * @author StockTrade
 * @created 2026-02-19
 */

import { BRAND_MARKETING } from "@/Branding"
import { buildRouteWithQuery, getUiRoutes } from "@/lib/branding-routes"

const routes = getUiRoutes()

export interface MarketPulseHomepageContent {
  hero: {
    headline: string
    productTabs: string[]
    subheadline: string
    ctas: { primaryLabel: string; primaryHref: string; secondaryLabel: string; secondaryHref: string }
  }
  stats: { value: string; label: string; ctas: { leftLabel: string; leftHref: string; rightLabel: string; rightHref: string } }
  highlights: string[]
  platforms: { label: string; href: string }[]
  blogTitles: string[]
}

export const MARKETPULSE_HOMEPAGE_CONTENT: MarketPulseHomepageContent = {
  hero: {
    headline: BRAND_MARKETING.homepage.hero.headline,
    productTabs: BRAND_MARKETING.homepage.hero.productTabs,
    subheadline: BRAND_MARKETING.homepage.hero.subheadline,
    ctas: {
      primaryLabel: BRAND_MARKETING.homepage.hero.primaryCtaLabel,
      primaryHref: routes.auth.register,
      secondaryLabel: BRAND_MARKETING.homepage.hero.secondaryCtaLabel,
      secondaryHref: routes.marketing.whyUs,
    },
  },
  stats: {
    value: BRAND_MARKETING.homepage.stats.value,
    label: BRAND_MARKETING.homepage.stats.label,
    ctas: {
      leftLabel: BRAND_MARKETING.homepage.stats.leftCtaLabel,
      leftHref: routes.marketing.whyUs,
      rightLabel: BRAND_MARKETING.homepage.stats.rightCtaLabel,
      rightHref: routes.auth.register,
    },
  },
  highlights: BRAND_MARKETING.homepage.highlights,
  platforms: BRAND_MARKETING.homepage.platforms.map((platform) => ({
    label: platform.label,
    href: buildRouteWithQuery(routes.marketing.downloads, {}, platform.anchor),
  })),
  blogTitles: BRAND_MARKETING.homepage.blogTitles,
}
