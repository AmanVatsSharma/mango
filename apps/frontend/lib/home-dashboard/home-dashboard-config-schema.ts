/**
 * File: lib/home-dashboard/home-dashboard-config-schema.ts
 * Module: home-dashboard
 * Purpose: Canonical Home dashboard config schema with robust normalization + merge helpers.
 * Author: StockTrade
 * Last-updated: 2026-02-17
 * Notes:
 * - Shared by admin settings, dashboard UI, and API routes.
 * - Maintains backward compatibility with existing `home_tab_config` payload shape.
 */

import { z } from "zod"

export const HOME_DASHBOARD_WIDGET_KEYS = [
  "tickerTape",
  "chart",
  "heatmap",
  "screener",
  "topMovers",
  "marketStats",
  "proOrderEntry",
  "timeAndSales",
  "accountMetricsBar",
] as const

export type HomeDashboardWidgetKey = (typeof HOME_DASHBOARD_WIDGET_KEYS)[number]

export type HomeDashboardWidgetToggleMap = Record<HomeDashboardWidgetKey, boolean>

export interface HomeDashboardConfig {
  tickerTapeSymbols: string[]
  chartSymbol: string
  enabledWidgets: HomeDashboardWidgetToggleMap
  defaultSectors: string[]
  orderEntryPresets: number[]
  featuredTokens: HomePageToken[]
  highlights: HomePageHighlight[]
  statsData: HomePageStat[]
  platformLinks: HomePagePlatformLink[]
}

export type HomeDashboardConfigOverride = Partial<{
  tickerTapeSymbols: string[]
  chartSymbol: string
  enabledWidgets: Partial<HomeDashboardWidgetToggleMap>
  defaultSectors: string[]
  orderEntryPresets: number[]
}>

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

/** Stat card shown on the homepage (e.g. "5M+ Traders", "₹2000 Cr Volume") */
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
}

const HOME_SYMBOL_REGEX = /^[A-Z0-9:_-]+$/
const MAX_SYMBOL_COUNT = 30
const MAX_SECTOR_COUNT = 16

export const DEFAULT_HOME_DASHBOARD_CONFIG: HomeDashboardConfig = {
  tickerTapeSymbols: [
    "NSE:NIFTY",
    "NSE:BANKNIFTY",
    "NSE:RELIANCE",
    "NSE:TCS",
    "NSE:HDFCBANK",
    "NSE:INFY",
  ],
  chartSymbol: "NSE:NIFTY",
  enabledWidgets: {
    tickerTape: true,
    chart: true,
    heatmap: true,
    screener: true,
    topMovers: true,
    marketStats: true,
    proOrderEntry: false,
    timeAndSales: true,
    accountMetricsBar: true,
  },
  defaultSectors: ["IT", "BANKING", "PHARMA", "AUTO", "FMCG", "ENERGY"],
  orderEntryPresets: [10, 50, 100],
  featuredTokens: [],
  highlights: [],
  statsData: [],
  platformLinks: [],
}

const symbolListSchema = z.array(z.unknown())
const sectorListSchema = z.array(z.unknown())
const numberListSchema = z.array(z.number())

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  if (typeof value !== "string") {
    return null
  }
  const normalizedValue = value.trim().toLowerCase()
  if (!normalizedValue) return null
  if (["true", "1", "yes", "on", "enabled"].includes(normalizedValue)) return true
  if (["false", "0", "no", "off", "disabled"].includes(normalizedValue)) return false
  return null
}

export function normalizeHomeDashboardSymbol(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalizedSymbol = value.trim().toUpperCase().replace(/\s+/g, "")
  if (!normalizedSymbol) {
    return null
  }
  if (normalizedSymbol.length > 40) {
    return null
  }
  if (!HOME_SYMBOL_REGEX.test(normalizedSymbol)) {
    return null
  }
  return normalizedSymbol
}

function normalizeHomeDashboardSymbolList(value: unknown): string[] {
  const parsedSymbols = symbolListSchema.safeParse(value)
  if (!parsedSymbols.success) {
    return []
  }
  const uniqueSymbols = new Set<string>()
  for (const rawSymbol of parsedSymbols.data) {
    const normalizedSymbol = normalizeHomeDashboardSymbol(rawSymbol)
    if (!normalizedSymbol) {
      continue
    }
    uniqueSymbols.add(normalizedSymbol)
    if (uniqueSymbols.size >= MAX_SYMBOL_COUNT) {
      break
    }
  }
  return Array.from(uniqueSymbols)
}

function normalizeSectorList(value: unknown): string[] {
  const parsedSectors = sectorListSchema.safeParse(value)
  if (!parsedSectors.success) {
    return []
  }
  const uniqueSectors = new Set<string>()
  for (const rawSector of parsedSectors.data) {
    if (typeof rawSector !== "string") {
      continue
    }
    const normalizedSector = rawSector.trim().toUpperCase()
    if (!normalizedSector) {
      continue
    }
    uniqueSectors.add(normalizedSector)
    if (uniqueSectors.size >= MAX_SECTOR_COUNT) {
      break
    }
  }
  return Array.from(uniqueSectors)
}

function normalizeNumberList(value: unknown): number[] {
  const parsed = numberListSchema.safeParse(value)
  if (!parsed.success) {
    // Attempt fallback parsing if it's an array of mixed types
    if (Array.isArray(value)) {
      const numbers = value.map(v => Number(v)).filter(n => !Number.isNaN(n) && isFinite(n));
      return numbers.slice(0, 10);
    }
    return []
  }
  return parsed.data.slice(0, 10)
}

function normalizeWidgetToggles(value: unknown): HomeDashboardWidgetToggleMap {
  const normalizedToggles: HomeDashboardWidgetToggleMap = { ...DEFAULT_HOME_DASHBOARD_CONFIG.enabledWidgets }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalizedToggles
  }
  const rawToggles = value as Record<string, unknown>
  for (const widgetKey of HOME_DASHBOARD_WIDGET_KEYS) {
    const parsedToggle = parseBooleanLike(rawToggles[widgetKey])
    if (parsedToggle !== null) {
      normalizedToggles[widgetKey] = parsedToggle
    }
  }
  return normalizedToggles
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

export function normalizeHomeDashboardConfig(rawConfig: unknown): HomeDashboardConfig {
  const config = asObject(rawConfig)
  const normalizedTickerSymbols = normalizeHomeDashboardSymbolList(config.tickerTapeSymbols)
  const normalizedChartSymbol = normalizeHomeDashboardSymbol(config.chartSymbol)
  const normalizedSectors = normalizeSectorList(config.defaultSectors)
  const normalizedOrderEntryPresets = normalizeNumberList(config.orderEntryPresets)

  // Normalize featured tokens
  const rawFeaturedTokens = config.featuredTokens
  const featuredTokens: HomePageToken[] = Array.isArray(rawFeaturedTokens)
    ? rawFeaturedTokens.slice(0, 10).map((t: any, i: number) => ({
        token: t.token || t.symbol || "",
        symbol: t.symbol || "",
        name: t.name || "",
        exchange: t.exchange || "",
        order: t.order ?? i,
      }))
    : []

  // Normalize highlights
  const rawHighlights = config.highlights
  const highlights: HomePageHighlight[] = Array.isArray(rawHighlights)
    ? rawHighlights.map((h: any, i: number) => ({
        id: h.id || `highlight-${Date.now()}-${i}`,
        text: h.text || "",
        icon: h.icon,
        order: h.order ?? i,
      }))
    : []

  // Normalize stats
  const rawStats = config.statsData
  const statsData: HomePageStat[] = Array.isArray(rawStats)
    ? rawStats.map((s: any, i: number) => ({
        id: s.id || `stat-${Date.now()}-${i}`,
        value: s.value || "",
        label: s.label || "",
        order: s.order ?? i,
      }))
    : []

  // Normalize platform links
  const rawLinks = config.platformLinks
  const platformLinks: HomePagePlatformLink[] = Array.isArray(rawLinks)
    ? rawLinks.slice(0, 10).map((l: any) => ({
        id: l.id || `link-${Date.now()}`,
        platform: (["ios", "android", "desktop", "web"].includes(l.platform) ? l.platform : "web") as "ios" | "android" | "desktop" | "web",
        url: l.url || "",
      }))
    : []

  return {
    tickerTapeSymbols:
      normalizedTickerSymbols.length > 0
        ? normalizedTickerSymbols
        : DEFAULT_HOME_DASHBOARD_CONFIG.tickerTapeSymbols,
    chartSymbol: normalizedChartSymbol || DEFAULT_HOME_DASHBOARD_CONFIG.chartSymbol,
    enabledWidgets: normalizeWidgetToggles(config.enabledWidgets),
    defaultSectors:
      normalizedSectors.length > 0 ? normalizedSectors : DEFAULT_HOME_DASHBOARD_CONFIG.defaultSectors,
    orderEntryPresets:
      normalizedOrderEntryPresets.length > 0 ? normalizedOrderEntryPresets : DEFAULT_HOME_DASHBOARD_CONFIG.orderEntryPresets,
    featuredTokens,
    highlights,
    statsData,
    platformLinks,
  }
}

export function normalizeHomeDashboardConfigOverride(rawOverride: unknown): HomeDashboardConfigOverride {
  const override = asObject(rawOverride)
  const normalizedOverride: HomeDashboardConfigOverride = {}

  if (Object.prototype.hasOwnProperty.call(override, "tickerTapeSymbols")) {
    normalizedOverride.tickerTapeSymbols = normalizeHomeDashboardSymbolList(override.tickerTapeSymbols)
  }
  if (Object.prototype.hasOwnProperty.call(override, "chartSymbol")) {
    const normalizedChartSymbol = normalizeHomeDashboardSymbol(override.chartSymbol)
    normalizedOverride.chartSymbol = normalizedChartSymbol || DEFAULT_HOME_DASHBOARD_CONFIG.chartSymbol
  }
  if (Object.prototype.hasOwnProperty.call(override, "enabledWidgets")) {
    normalizedOverride.enabledWidgets = normalizeWidgetToggles(override.enabledWidgets)
  }
  if (Object.prototype.hasOwnProperty.call(override, "defaultSectors")) {
    normalizedOverride.defaultSectors = normalizeSectorList(override.defaultSectors)
  }
  if (Object.prototype.hasOwnProperty.call(override, "orderEntryPresets")) {
    normalizedOverride.orderEntryPresets = normalizeNumberList(override.orderEntryPresets)
  }

  return normalizedOverride
}

export function mergeHomeDashboardConfig(
  globalConfig: HomeDashboardConfig,
  override: HomeDashboardConfigOverride | null,
): HomeDashboardConfig {
  if (!override) {
    return globalConfig
  }
  return {
    tickerTapeSymbols:
      override.tickerTapeSymbols !== undefined
        ? override.tickerTapeSymbols
        : globalConfig.tickerTapeSymbols,
    chartSymbol: override.chartSymbol ?? globalConfig.chartSymbol,
    enabledWidgets: {
      ...globalConfig.enabledWidgets,
      ...(override.enabledWidgets || {}),
    },
    defaultSectors:
      override.defaultSectors !== undefined ? override.defaultSectors : globalConfig.defaultSectors,
    orderEntryPresets:
      override.orderEntryPresets !== undefined ? override.orderEntryPresets : globalConfig.orderEntryPresets,
    featuredTokens: globalConfig.featuredTokens,
    highlights: globalConfig.highlights,
    statsData: globalConfig.statsData,
    platformLinks: globalConfig.platformLinks,
  }
}

export function parseHomeDashboardConfigString(value: unknown): HomeDashboardConfig {
  if (typeof value !== "string") {
    return { ...DEFAULT_HOME_DASHBOARD_CONFIG }
  }
  try {
    const parsedJson = JSON.parse(value)
    return normalizeHomeDashboardConfig(parsedJson)
  } catch (error) {
    console.warn("⚠️ [HOME-DASHBOARD-CONFIG] Failed to parse config string; using defaults", {
      error: error instanceof Error ? error.message : String(error),
    })
    return { ...DEFAULT_HOME_DASHBOARD_CONFIG }
  }
}

export function parseHomeDashboardOverrideString(value: unknown): HomeDashboardConfigOverride | null {
  if (typeof value !== "string") {
    return null
  }
  try {
    const parsedJson = JSON.parse(value)
    return normalizeHomeDashboardConfigOverride(parsedJson)
  } catch (error) {
    console.warn("⚠️ [HOME-DASHBOARD-CONFIG] Failed to parse user override string; ignoring override", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
