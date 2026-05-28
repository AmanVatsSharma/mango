/**
 * File: lib/hooks/use-console-features.ts
 * Module: console
 * Purpose: Client hook to fetch console feature availability (statementsEnabled).
 * Author: StockTrade
 * Last-updated: 2026-02-03
 * Notes:
 * - Uses SWR to keep lightweight caching and revalidation behavior.
 */

"use client"

import useSWR from "swr"
import { useSession } from "next-auth/react"

type ConsoleFeaturesResponse = {
  success: boolean
  statementsEnabled: boolean
  source?: string
  error?: string
}

const fetcher = async (url: string): Promise<ConsoleFeaturesResponse> => {
  const res = await fetch(url, { cache: "no-store" })
  const data = (await res.json().catch(() => ({}))) as any
  if (!res.ok) {
    const msg = data?.error || data?.message || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data as ConsoleFeaturesResponse
}

export function useConsoleFeatures() {
  const { data: session, status } = useSession()
  const userId = (session?.user as any)?.id as string | undefined

  const { data, error, isLoading, mutate } = useSWR<ConsoleFeaturesResponse>(
    userId ? "/api/console/features" : null,
    fetcher,
    {
    revalidateOnFocus: true,
    focusThrottleInterval: 120_000,
    revalidateOnReconnect: true,
    refreshInterval: 0,
    }
  )

  const statementsEnabled = data?.success ? !!data.statementsEnabled : true

  return {
    statementsEnabled,
    source: data?.source,
    isLoading: status === "loading" ? true : isLoading,
    error: error ? String(error) : null,
    refetch: mutate,
  }
}

