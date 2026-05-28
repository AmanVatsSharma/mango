/**
 * @file components/admin-v2/command-centre/types.ts
 * @module admin-v2/command-centre
 * @description Re-export of the canonical /api/admin/trades types so v2 doesn't fork the
 *              shape. Single source of truth lives in app/api/admin/trades/types.ts.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export type {
  TradeRow,
  TradeStats,
  TradeStatus,
  TradeSide,
  TradeOrderLite,
  TradeLedgerLite,
  TradesListResponse,
  ActiveUserRow,
  ActiveUsersResponse,
  RiskFlag,
  RiskFlagKind,
  RiskFlagsResponse,
  ClientRollupRow,
  ClosureReason,
} from "@/app/api/admin/trades/types"

export interface TradesFilters {
  page?: number
  limit?: number
  status?: "all" | "OPEN" | "CLOSED" | "PARTIAL"
  side?: "all" | "LONG" | "SHORT"
  user?: string
  userId?: string
  symbol?: string
  segment?: string
  productType?: string
  from?: string
  to?: string
  minPnl?: number
  maxPnl?: number
  sortBy?: string
  order?: "asc" | "desc"
  includeStats?: boolean
}

export interface SavedScope {
  id: string
  label: string
  filters: TradesFilters
  createdAt: number
}
