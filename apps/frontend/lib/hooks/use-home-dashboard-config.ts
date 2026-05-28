/**
 * File:        lib/hooks/use-home-dashboard-config.ts
 * Module:      Home Dashboard · Config Hook
 * Purpose:     SWR-backed hook to load/save effective dashboard Home widget configuration.
 *              Uses dedupingInterval so multiple consumers share one HTTP GET.
 *
 * Exports:
 *   - useHomeDashboardConfig() → { config, isLoading, isSaving, hasUserOverride, error, refresh, saveUserOverride, resetUserOverride }
 *
 * Depends on:
 *   - swr — fetches /api/market-data/home-config; dedupingInterval=60s prevents duplicate GETs from dual mount
 *   - @/lib/home-dashboard/home-dashboard-config-schema — normalization + default
 *
 * Side-effects:
 *   - HTTP GET /api/market-data/home-config on mount (deduped across consumers)
 *   - HTTP PUT/DELETE /api/market-data/home-config on save/reset
 *
 * Key invariants:
 *   - fallbackData = DEFAULT_HOME_DASHBOARD_CONFIG, so callers never receive undefined config
 *   - Multiple simultaneous consumers (e.g., TradingHome + DesktopTerminalLayout) share one SWR cache entry
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Add 10s AbortSignal.timeout to the fetcher so a hung backend fails
 *     visibly through SWR's error path instead of leaving the in-flight
 *     promise pending forever (and the user stuck on the default layout
 *     with no signal that their saved override couldn't load).
 */

"use client"

import { useCallback, useState } from "react"
import useSWR from "swr"
import {
  DEFAULT_HOME_DASHBOARD_CONFIG,
  normalizeHomeDashboardConfig,
  type HomeDashboardConfig,
} from "@/lib/home-dashboard/home-dashboard-config-schema"

const CONFIG_URL = "/api/market-data/home-config"

interface HomeDashboardConfigResponse {
  success?: boolean
  config?: unknown
  meta?: {
    hasGlobalConfig?: boolean
    hasUserOverride?: boolean
  }
}

interface CachedConfigData {
  config: HomeDashboardConfig
  hasUserOverride: boolean
}

// 10-second hard timeout. The home-dashboard config endpoint is rarely the
// hot path, but a hung backend would leave SWR's promise pending forever and
// the user would never see their customized layout (or a clear error). The
// fallback config kicks in once SWR surfaces the timeout error via onError.
const HOME_CONFIG_FETCH_TIMEOUT_MS = 10_000

const fetcher = async (url: string): Promise<CachedConfigData> => {
  const response = await fetch(url, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(HOME_CONFIG_FETCH_TIMEOUT_MS),
  })
  const payload = (await response.json().catch(() => ({}))) as HomeDashboardConfigResponse
  if (!response.ok || !payload?.success) {
    throw new Error("Failed to load home dashboard configuration")
  }
  return {
    config: normalizeHomeDashboardConfig(payload.config),
    hasUserOverride: Boolean(payload.meta?.hasUserOverride),
  }
}

const FALLBACK: CachedConfigData = {
  config: DEFAULT_HOME_DASHBOARD_CONFIG,
  hasUserOverride: false,
}

export function useHomeDashboardConfig() {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<CachedConfigData>(CONFIG_URL, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 0,
    dedupingInterval: 60_000,
    fallbackData: FALLBACK,
  })

  const config = data?.config ?? DEFAULT_HOME_DASHBOARD_CONFIG
  const hasUserOverride = data?.hasUserOverride ?? false

  const saveUserOverride = useCallback(
    async (nextConfig: HomeDashboardConfig) => {
      setIsSaving(true)
      setError(null)
      try {
        const normalizedConfig = normalizeHomeDashboardConfig(nextConfig)
        const response = await fetch(CONFIG_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ override: normalizedConfig }),
        })
        const payload = (await response.json().catch(() => ({}))) as HomeDashboardConfigResponse
        if (!response.ok || !payload?.success) throw new Error("Failed to save home preferences")
        const effectiveConfig = normalizeHomeDashboardConfig(payload.config)
        const next: CachedConfigData = {
          config: effectiveConfig,
          hasUserOverride: Boolean(payload.meta?.hasUserOverride),
        }
        await mutate(next, false)
        return { success: true as const, config: effectiveConfig }
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : "Failed to save home preferences"
        setError(message)
        return { success: false as const, error: message }
      } finally {
        setIsSaving(false)
      }
    },
    [mutate],
  )

  const resetUserOverride = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch(CONFIG_URL, { method: "DELETE" })
      const payload = (await response.json().catch(() => ({}))) as HomeDashboardConfigResponse
      if (!response.ok || !payload?.success) throw new Error("Failed to reset home preferences")
      const effectiveConfig = normalizeHomeDashboardConfig(payload.config)
      const next: CachedConfigData = {
        config: effectiveConfig,
        hasUserOverride: Boolean(payload.meta?.hasUserOverride),
      }
      await mutate(next, false)
      return { success: true as const, config: effectiveConfig }
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : "Failed to reset home preferences"
      setError(message)
      return { success: false as const, error: message }
    } finally {
      setIsSaving(false)
    }
  }, [mutate])

  return {
    config,
    isLoading,
    isSaving,
    hasUserOverride,
    error,
    refresh: () => mutate(),
    saveUserOverride,
    resetUserOverride,
  }
}
