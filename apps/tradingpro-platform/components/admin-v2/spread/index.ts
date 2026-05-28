/**
 * @file components/admin-v2/spread/index.ts
 * @module admin-v2/spread
 * @description Barrel exports for the Spread module.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export { SpreadWorkbench } from "./spread-workbench"
export { SpreadForm } from "./spread-form"
export { SlippageSimulator } from "./slippage-simulator"
export { useSpreadConfigs } from "./hooks"
export type {
  SpreadConfigRow,
  SpreadConfigInput,
  SimulationResult,
  SimulationInput,
  ResolvedSpread,
  SpreadListEnvelope,
  SpreadSimulateEnvelope,
} from "./types"
