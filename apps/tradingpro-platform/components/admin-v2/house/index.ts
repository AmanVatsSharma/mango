/**
 * @file components/admin-v2/house/index.ts
 * @module admin-v2/house
 * @description Barrel exports for the House Book module.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export { HouseDashboard } from "./house-dashboard"
export { HousePnlTile } from "./house-pnl-tile"
export { ExposureHeatmap } from "./exposure-heatmap"
export { ConcentrationMeter } from "./concentration-meter"
export { ScenarioLadderCard } from "./scenario-ladder"
export { PnlHistoryChart } from "./pnl-history-chart"
export { useHouseExposure, useHousePnl, useHouseScenario } from "./hooks"
export type {
  HouseExposureResponse,
  HousePnlResponse,
  HouseScenarioResponse,
} from "./types"
