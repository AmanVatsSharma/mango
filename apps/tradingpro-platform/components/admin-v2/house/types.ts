/**
 * @file components/admin-v2/house/types.ts
 * @module admin-v2/house
 * @description Re-export of server-side house types so client components have a single
 *              import surface and never reach into lib/house directly. Keeps the
 *              client/server boundary clean.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export type {
  HouseExposureSnapshot,
  HousePnlPeriod,
  HousePnlSeries,
  HousePnlSeriesPoint,
  ScenarioLadder,
  ScenarioRung,
  SymbolExposure,
} from "@/lib/house/types"

export interface HouseExposureResponse {
  success: boolean
  snapshot: import("@/lib/house/types").HouseExposureSnapshot
}

export interface HousePnlResponse {
  success: boolean
  series: import("@/lib/house/types").HousePnlSeries
}

export interface HouseScenarioResponse {
  success: boolean
  asOf: string
  ladders: import("@/lib/house/types").ScenarioLadder[]
}
