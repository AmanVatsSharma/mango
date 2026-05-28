/**
 * @file components/admin-v2/spread/hooks.ts
 * @module admin-v2/spread
 * @description SWR hooks for the spread management surfaces.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import useSWR from "swr"
import { jsonFetcher } from "@/lib/admin-v2/api-client"
import type { SpreadListEnvelope } from "./types"

export function useSpreadConfigs() {
  return useSWR<SpreadListEnvelope>("/api/admin/spread/configs", jsonFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })
}
