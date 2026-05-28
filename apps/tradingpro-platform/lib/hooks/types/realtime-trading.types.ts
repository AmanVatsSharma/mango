/**
 * TypeScript Type Definitions for Realtime Trading Hooks
 * 
 * Centralized type definitions for all realtime trading hooks
 * ensuring type safety across the application.
 */

// ==================== Common Types ====================

export type OrderStatus = 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED'
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_MARKET'
export type OrderSide = 'BUY' | 'SELL'
// Canonical product types: MIS (intraday), CNC (equity delivery), NRML (carry for derivatives)
// Legacy aliases kept for compatibility with older payloads.
export type ProductType = 'MIS' | 'CNC' | 'NRML' | 'INTRADAY' | 'DELIVERY' | 'MARGIN'

// ==================== Order Types ====================

export interface Stock {
  symbol: string
  name: string
  ltp: number
  instrumentId: string
  segment?: string
}

export interface Order {
  id: string
  symbol: string
  quantity: number
  orderType: OrderType
  orderSide: OrderSide
  price?: number | null
  averagePrice?: number | null
  filledQuantity?: number
  productType?: ProductType
  status: OrderStatus
  failureCode?: string | null
  failureReason?: string | null
  createdAt: string
  executedAt?: string | null
  stock?: Stock
}

export interface OrdersResponse {
  success: boolean
  orders: Order[]
  error?: string
}

export interface UseRealtimeOrdersReturn {
  orders: Order[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<any>
  optimisticUpdate: (newOrder: Partial<Order>) => void
  mutate: any
  retryCount: number
}

// ==================== Position Types ====================

export interface Position {
  id: string
  symbol: string
  quantity: number
  averagePrice: number
  unrealizedPnL: number
  dayPnL: number
  stopLoss?: number | null
  target?: number | null
  createdAt: string
  stock?: Stock
  currentPrice?: number
  currentValue?: number
  investedValue?: number
}

export interface PositionsResponse {
  success: boolean
  positions: Position[]
  error?: string
}

export interface UseRealtimePositionsReturn {
  positions: Position[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<any>
  optimisticAddPosition: (newPosition: Partial<Position>) => void
  optimisticClosePosition: (positionId: string) => void
  mutate: any
  retryCount: number
}

// ==================== Account Types ====================

export interface TradingAccount {
  id: string
  userId: string
  balance: number
  availableMargin: number
  usedMargin: number
  clientId: string
  createdAt: string
  updatedAt: string
}

export interface AccountResponse {
  success: boolean
  account: TradingAccount | null
  error?: string
}

export interface UseRealtimeAccountReturn {
  account: TradingAccount | null
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<any>
  optimisticUpdateBalance: (balanceChange: number, marginChange: number) => void
  optimisticBlockMargin: (amount: number) => void
  optimisticReleaseMargin: (amount: number) => void
  mutate: any
  retryCount: number
}

// ==================== Trading Coordinator Types ====================

export interface OrderData {
  symbol: string
  quantity: number
  orderType: OrderType
  orderSide: OrderSide
  price?: number
  productType?: ProductType
}

export interface OrderResult {
  orderId: string
  marginBlocked?: number
  chargesDeducted?: number
  success?: boolean
  error?: string
}

export interface PositionResult {
  marginReleased?: number
  realizedPnL?: number
  success?: boolean
  error?: string
}

export interface FundResult {
  success?: boolean
  error?: string
}

export type FundOperationType = 'CREDIT' | 'DEBIT' | 'BLOCK' | 'RELEASE'

export interface RetryCount {
  orders: number
  positions: number
  account: number
}

export interface UseRealtimeTradingReturn {
  // Data
  orders: Order[]
  positions: Position[]
  account: TradingAccount | null
  
  // Loading states
  isLoadingOrders: boolean
  isLoadingPositions: boolean
  isLoadingAccount: boolean
  isLoading: boolean
  
  // Errors
  ordersError: Error | null
  positionsError: Error | null
  accountError: Error | null
  hasError: boolean
  
  // Retry counts
  retryCount: RetryCount
  
  // Refresh functions
  refreshOrders: () => Promise<any>
  refreshPositions: () => Promise<any>
  refreshAccount: () => Promise<any>
  refreshAll: () => Promise<void>
  
  // Optimistic update handlers
  handleOrderPlaced: (orderData: OrderData, result: OrderResult) => Promise<OrderResult>
  handlePositionClosed: (positionId: string, result: PositionResult) => Promise<PositionResult>
  handleFundOperation: (type: FundOperationType, amount: number, result: FundResult) => Promise<FundResult>
  
  // Raw mutate functions (advanced use)
  mutateOrders: any
  mutatePositions: any
  mutateAccount: any
}

// ==================== Realtime Test Types ====================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface RealtimePayload {
  schema: string
  table: string
  commit_timestamp: string
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new?: Record<string, any>
  old?: Record<string, any>
  errors?: string[]
}

export interface UseRealtimeTestReturn {
  isConnected: boolean
  lastMessage: RealtimePayload | null
  error: Error | null
  connectionStatus: ConnectionStatus
}

// ==================== SWR Configuration Types ====================

export interface SWRConfig {
  refreshInterval?: number
  revalidateOnFocus?: boolean
  revalidateOnReconnect?: boolean
  dedupingInterval?: number
  shouldRetryOnError?: boolean
  errorRetryCount?: number
  errorRetryInterval?: number
  onError?: (err: Error) => void
  onSuccess?: (data: any) => void
}

// ==================== API Error Types ====================

export interface APIError {
  message: string
  code?: string
  status?: number
  details?: any
}

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ==================== Validation Result Types ====================

export interface ValidationResult {
  valid: boolean
  errors?: string[]
}

// ==================== Utility Types ====================

export type Nullable<T> = T | null
export type Optional<T> = T | undefined
export type NullableOptional<T> = T | null | undefined

// Export helper type guards
export function isOrder(obj: any): obj is Order {
  return obj && typeof obj === 'object' && 'id' in obj && 'symbol' in obj && 'quantity' in obj
}

export function isPosition(obj: any): obj is Position {
  return obj && typeof obj === 'object' && 'id' in obj && 'symbol' in obj && 'averagePrice' in obj
}

export function isTradingAccount(obj: any): obj is TradingAccount {
  return obj && typeof obj === 'object' && 'id' in obj && 'balance' in obj && 'availableMargin' in obj
}

export function isAPIError(obj: any): obj is APIError {
  return obj && typeof obj === 'object' && 'message' in obj
}

// Export validation helpers
export function isValidNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value)
}

export function isValidString(value: any): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isPositiveNumber(value: any): boolean {
  return isValidNumber(value) && value > 0
}

export function isNonNegativeNumber(value: any): boolean {
  return isValidNumber(value) && value >= 0
}
