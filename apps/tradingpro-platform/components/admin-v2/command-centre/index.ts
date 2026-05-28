/**
 * @file components/admin-v2/command-centre/index.ts
 * @module admin-v2/command-centre
 * @description Barrel exports for the v2 Trade Command Centre.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export { default as CommandCentreV2 } from "./command-centre-v2"
export { default as RiskFlagsStrip } from "./risk-flags-strip"
export { default as ActiveUsersPanel } from "./active-users-panel"
export { TRADE_COLUMNS } from "./trades-table"
export { useTradesList, useActiveUsers, useRiskFlags } from "./hooks"
export { loadScopes, saveScopes, addScope, removeScope } from "./saved-scopes"
export type {
  TradeRow,
  TradeStats,
  TradesFilters,
  ActiveUserRow,
  RiskFlag,
  SavedScope,
} from "./types"
