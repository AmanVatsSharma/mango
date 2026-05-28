/**
 * File:        lib/hooks/use-home-page-config.ts
 * Module:      Home Page · Config Hook
 * Purpose:     Fetch admin-managed homepage configuration; fall back to BRAND_MARKETING defaults.
 *
 * Exports:
 *   - useHomePageConfig() → { config, isLoading, error }
 *
 * Depends on:
 *   - swr — fetches /api/admin/home-page-config
 *   - @/lib/marketing/stocktrade-homepage-content — DEFAULT_HOME_PAGE_CONFIG, mergeWithFallback
 *
 * Side-effects:
 *   - HTTP GET /api/admin/home-page-config on mount (deduped across consumers)
 *
 * Key invariants:
 *   - Falls back to BRAND_MARKETING defaults when API returns no config or errors
 *   - Partial live config fields are merged with defaults (empty arrays use defaults)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-16
 */

"use client"

import useSWR from "swr"
import {
  DEFAULT_HOME_PAGE_CONFIG,
  mergeWithFallback,
  type HomePageConfigData,
} from "@/lib/marketing/stocktrade-homepage-content"

const CONFIG_URL = "/api/admin/home-page-config"

interface HomePageConfigResponse {
  success?: boolean
  config?: Partial<HomePageConfigData>
}

const fetcher = async (url: string): Promise<HomePageConfigData> => {
  const response = await fetch(url, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(10_000),
  })
  const payload = (await response.json().catch(() => ({}))) as HomePageConfigResponse
  if (!response.ok || !payload?.success) {
    throw new Error("Failed to load home page configuration")
  }
  // Apply fallback merging — partial config fields use defaults
  return mergeWithFallback(payload.config)
}

export function useHomePageConfig() {
  const { data, isLoading, error } = useSWR<HomePageConfigData>(CONFIG_URL, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 0, // admin-managed; no auto-polling
    dedupingInterval: 60_000,
    fallbackData: DEFAULT_HOME_PAGE_CONFIG,
    errorRetryCount: 2,
  })

  return {
    config: data ?? DEFAULT_HOME_PAGE_CONFIG,
    isLoading,
    error: error instanceof Error ? error.message : null,
  }
}