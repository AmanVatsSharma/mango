/**
 * @file components/admin-v2/spread/types.ts
 * @module admin-v2/spread
 * @description Re-export of server types so client components have a single import surface.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export type {
  ResolvedSpread,
  SimulationInput,
  SimulationResult,
  SpreadConfigInput,
  SpreadConfigRow,
  SpreadResolutionScope,
} from "@/lib/spread/types"

export interface SpreadListEnvelope {
  success: boolean
  rows: import("@/lib/spread/types").SpreadConfigRow[]
}

export interface SpreadSimulateEnvelope {
  success: boolean
  result: import("@/lib/spread/types").SimulationResult
}
