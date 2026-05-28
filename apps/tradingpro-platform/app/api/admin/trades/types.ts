/**
 * @file types.ts
 * @module admin-console/trades
 * @description Shared types for the admin Trades blotter API responses and rollups.
 */

export type TradeStatus = "OPEN" | "CLOSED" | "PARTIAL"
export type TradeSide = "LONG" | "SHORT"

export type ClosureReason =
  | "USER_CLOSED"
  | "ADMIN_CLOSED"
  | "AUTO_LIQUIDATED"
  | "EXPIRY_SQUAREOFF"
  | "SYSTEM_CLOSED"
  | "MANUAL_OTHER"
  | "UNKNOWN"

export interface TradeOrderLite {
  id: string
  orderPurpose: "OPEN" | "CLOSE" | null
  orderSide: "BUY" | "SELL"
  orderType: string
  status: string
  quantity: number
  filledQuantity: number
  price: number | null
  averagePrice: number | null
  blockedMargin: number | null
  placementCharges: number | null
  createdAt: string
  executedAt: string | null
  failureReason: string | null
  closeMetadata: Record<string, unknown> | null
}

export interface TradeLedgerLite {
  id: string
  type: "CREDIT" | "DEBIT"
  amount: number
  description: string
  createdAt: string
  orderId: string | null
  balanceAfter: number | null
}

export interface TradeRow {
  positionId: string
  userId: string | null
  userName: string | null
  clientId: string | null

  symbol: string
  instrumentLabel: string
  segment: string | null
  exchange: string | null
  productType: string | null
  optionType: "CE" | "PE" | null
  strikePrice: number | null
  expiry: string | null

  side: TradeSide
  status: TradeStatus

  openQuantity: number      // current quantity (0 when fully closed, positive when long, negative when short)
  totalQuantity: number     // absolute total (entry total for closed, abs(openQuantity) for open)
  lotSize: number

  averageEntryPrice: number
  averageExitPrice: number | null
  ltp: number | null

  entryAt: string
  exitAt: string | null
  heldMs: number

  grossPnL: number
  charges: number
  realizedPnL: number
  unrealizedPnL: number

  closureReason: ClosureReason
  closureNote: string | null
  closedByUserId: string | null
  closedByName: string | null

  ordersCount: number
  openOrders: TradeOrderLite[]
  closeOrders: TradeOrderLite[]
  ledger: TradeLedgerLite[]
}

export interface TradeStats {
  todayNetPnL: number
  todayCharges: number
  closedToday: number
  winsToday: number
  lossesToday: number
  winRatePct: number
  openPositionsCount: number
  openUnrealizedPnL: number
  totalVolumeNotional: number
  filteredTotalRealizedPnL: number
  filteredWins: number
  filteredLosses: number
}

export interface TradesListResponse {
  trades: TradeRow[]
  total: number
  page: number
  pages: number
  stats: TradeStats | null
}

export interface ActiveUserRow {
  userId: string
  name: string | null
  clientId: string | null
  openPositionsCount: number
  openUnrealizedPnL: number
  todayNetPnL: number
  todayTradesCount: number
  lastActivityAt: string | null
  marginUsedPct: number | null
}

export interface ActiveUsersResponse {
  users: ActiveUserRow[]
  total: number
}

export type RiskFlagKind =
  | "MARGIN_HIGH"
  | "SL_BREACH_PENDING"
  | "TARGET_HIT_PENDING"
  | "TOP_LOSER"
  | "APPROVAL_PENDING"

export interface RiskFlag {
  kind: RiskFlagKind
  severity: "info" | "warn" | "critical"
  label: string
  detail: string | null
  target:
    | { type: "user"; userId: string }
    | { type: "symbol"; symbol: string; segment: string | null; optionType: string | null; strikePrice: number | null; expiry: string | null }
    | { type: "route"; href: string }
    | null
  count: number
}

export interface RiskFlagsResponse { flags: RiskFlag[] }

export interface ClientRollupRow {
  userId: string
  name: string | null
  clientId: string | null
  tradesCount: number
  wins: number
  losses: number
  winRatePct: number
  grossPnL: number
  charges: number
  realizedPnL: number
  volumeNotional: number
  openCount: number
  openUnrealizedPnL: number
  avgHeldMs: number
}

export interface SymbolRollupRow {
  symbol: string
  instrumentLabel: string
  segment: string | null
  optionType: "CE" | "PE" | null
  strikePrice: number | null
  expiry: string | null
  tradesCount: number
  uniqueClients: number
  wins: number
  losses: number
  winRatePct: number
  grossPnL: number
  realizedPnL: number
  volumeNotional: number
  openCount: number
  openUnrealizedPnL: number
}
