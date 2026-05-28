/**
 * File:        lib/marketing/stocktrade-homepage-content.ts
 * Module:      lib/marketing
 * Purpose:     Central marketing content config reused by StockTrade marketing pages.
 *              Also exports HomePageConfigData types + DEFAULT_HOME_PAGE_CONFIG for admin
 *              homepage config, and mergeWithFallback() to merge live partial config with defaults.
 *
 * Exports:
 *   - HomePageConfigData                   — full homepage config shape (admin DB table)
 *   - HomePageToken / HomePageHighlight / HomePageStat / HomePagePlatformLink — sub-types
 *   - DEFAULT_HOME_PAGE_CONFIG             — default config derived from BRAND_MARKETING
 *   - mergeWithFallback(live?) → HomePageConfigData — fills empty arrays from defaults
 *   - STOCKTRADE_HOMEPAGE_CONTENT          — legacy marketing content shape
 *
 * Depends on:
 *   - @/Branding — BRAND_MARKETING for all default values
 *   - @/lib/branding-routes — getUiRoutes(), buildRouteWithQuery()
 *
 * Side-effects: none
 *
 * Read order:
 *   1. HomePageConfigData + sub-types — data model
 *   2. DEFAULT_HOME_PAGE_CONFIG — brand defaults
 *   3. mergeWithFallback — runtime merge helper
 *   4. STOCKTRADE_HOMEPAGE_CONTENT — legacy unified content (still used by stocktrade-sections.tsx)
 *
 * Author:      BharatERP / StockTrade
 * Last-updated: 2026-05-16
 */

import { BRAND_MARKETING } from "@/Branding"
import { buildRouteWithQuery, getUiRoutes } from "@/lib/branding-routes"

const routes = getUiRoutes()

// ─────────────────────────────────────────────
// HomePageConfig types (admin-managed homepage)
// ─────────────────────────────────────────────

/** Token displayed in the homepage ticker / featured section */
export interface HomePageToken {
  token: string
  symbol: string
  name: string
  exchange: string
  order: number
}

/** Highlight card on the homepage (announcement, news, promotion) */
export interface HomePageHighlight {
  id: string
  text: string
  icon?: string
  order: number
}

/** Stat card shown on the homepage (e.g. "5M+ Traders", "2000 Cr Volume") */
export interface HomePageStat {
  id: string
  value: string
  label: string
  order: number
}

/** App store / download link for a platform */
export interface HomePagePlatformLink {
  id: string
  platform: "ios" | "android" | "desktop" | "web"
  url: string
}

/** Full homepage configuration stored in `HomePageConfig` DB table */
export interface HomePageConfigData {
  tickerSymbols: string[]
  featuredTokens: HomePageToken[]
  highlights: HomePageHighlight[]
  statsData: HomePageStat[]
  platformLinks: HomePagePlatformLink[]
  blogPosts: unknown[]
}

// ─────────────────────────────────────────────
// Default config from BRAND_MARKETING
// ─────────────────────────────────────────────

export const DEFAULT_HOME_PAGE_CONFIG: HomePageConfigData = {
  tickerSymbols: [
    "NSE:NIFTY",
    "NSE:BANKNIFTY",
    "NSE:RELIANCE",
    "NSE:TCS",
    "NSE:HDFCBANK",
    "NSE:INFY",
  ],
  featuredTokens: [],
  highlights: BRAND_MARKETING.homepage.highlights.map((text, i) => ({
    id: `default-highlight-${i}`,
    text,
    order: i,
  })),
  statsData: [
    {
      id: "default-stat-0",
      value: BRAND_MARKETING.homepage.stats.value,
      label: BRAND_MARKETING.homepage.stats.label,
      order: 0,
    },
  ],
  platformLinks: BRAND_MARKETING.homepage.platforms.map((p, i) => ({
    id: `default-platform-${i}`,
    platform: (p.label.toLowerCase() as HomePageConfigData["platformLinks"][number]["platform"]),
    url: buildRouteWithQuery(routes.marketing.downloads, {}, p.anchor),
  })),
  blogPosts: [],
}

/**
 * Merge live partial config with defaults.
 * Empty arrays in `live` are replaced with defaults so callers always get complete data.
 */
export function mergeWithFallback(live?: Partial<HomePageConfigData>): HomePageConfigData {
  if (!live) return DEFAULT_HOME_PAGE_CONFIG
  return {
    tickerSymbols: live.tickerSymbols ?? DEFAULT_HOME_PAGE_CONFIG.tickerSymbols,
    featuredTokens: live.featuredTokens ?? DEFAULT_HOME_PAGE_CONFIG.featuredTokens,
    highlights:
      Array.isArray(live.highlights) && live.highlights.length > 0
        ? live.highlights
        : DEFAULT_HOME_PAGE_CONFIG.highlights,
    statsData:
      Array.isArray(live.statsData) && live.statsData.length > 0
        ? live.statsData
        : DEFAULT_HOME_PAGE_CONFIG.statsData,
    platformLinks:
      Array.isArray(live.platformLinks) && live.platformLinks.length > 0
        ? live.platformLinks
        : DEFAULT_HOME_PAGE_CONFIG.platformLinks,
    blogPosts: live.blogPosts ?? DEFAULT_HOME_PAGE_CONFIG.blogPosts,
  }
}

// ─────────────────────────────────────────────
// Legacy unified content (still used by stocktrade-sections.tsx)
// ─────────────────────────────────────────────

export interface StockTradeHomepageContent {
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

export const STOCKTRADE_HOMEPAGE_CONTENT: StockTradeHomepageContent = {
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