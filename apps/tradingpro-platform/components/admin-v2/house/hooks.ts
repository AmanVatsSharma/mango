/**
 * @file components/admin-v2/house/hooks.ts
 * @module admin-v2/house
 * @description SWR hooks for the house dashboard. Each hook wraps `useSWR` with our
 *              shared `jsonFetcher` and the dashboard's polling cadence.
 *
 *              Exports:
 *                - useHouseExposure({ refreshMs })  — live counterparty snapshot, default 2s.
 *                - useHousePnl({ period })          — broker realised P&L series.
 *                - useHouseScenario({ refreshMs })  — VaR scenario ladders, default 5s.
 *
 *              Side-effects: HTTP polling via SWR.
 *
 *              Key invariants:
 *                - Default polling cadence is conservative (2s for exposure, 5s for scenario,
 *                  60s for P&L history). The exposure aggregator already de-dupes through
 *                  Redis; multiple admins polling at 2s costs ~one DB query per second total.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import useSWR from "swr"
import { jsonFetcher } from "@/lib/admin-v2/api-client"
import type {
  HouseExposureResponse,
  HousePnlPeriod,
  HousePnlResponse,
  HouseScenarioResponse,
} from "./types"

interface UseHouseExposureOpts {
  refreshMs?: number
}

export function useHouseExposure({ refreshMs = 2000 }: UseHouseExposureOpts = {}) {
  return useSWR<HouseExposureResponse>("/api/admin/house/exposure", jsonFetcher, {
    refreshInterval: refreshMs,
    revalidateOnFocus: false,
  })
}

interface UseHousePnlOpts {
  period?: HousePnlPeriod
  refreshMs?: number
}

export function useHousePnl({ period = "day", refreshMs = 60_000 }: UseHousePnlOpts = {}) {
  return useSWR<HousePnlResponse>(`/api/admin/house/pnl?period=${period}`, jsonFetcher, {
    refreshInterval: refreshMs,
    revalidateOnFocus: false,
  })
}

interface UseHouseScenarioOpts {
  refreshMs?: number
}

export function useHouseScenario({ refreshMs = 5000 }: UseHouseScenarioOpts = {}) {
  return useSWR<HouseScenarioResponse>("/api/admin/house/scenario", jsonFetcher, {
    refreshInterval: refreshMs,
    revalidateOnFocus: false,
  })
}
