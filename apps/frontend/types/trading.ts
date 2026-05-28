// types/trading.ts

export interface TradingAccount {
  id: string
  balance: number
  availableMargin: number
  usedMargin: number
  clientId: string
  totalValue?: number
}

export interface Portfolio {
  account: TradingAccount
}

export interface Stock {
  id: string
  symbol: string
  name: string
  instrumentId: string
  segment?: string
  strikePrice?: number
  optionType?: string
  expiry?: string
  lotSize?: number
}

export interface Position {
  id: string
  symbol: string
  quantity: number
  averagePrice: number
  unrealizedPnL: number
  dayPnL: number
  stopLoss?: number
  target?: number
  stock?: Stock
  instrumentId?: string
  segment?: string
  strikePrice?: number
  optionType?: string
  expiry?: string
  lotSize?: number
}

export interface Order {
  id: string
  symbol: string
  orderSide: "BUY" | "SELL"
  orderType: "MARKET" | "LIMIT"
  quantity: number
  price?: number
  averagePrice?: number
  status: "PENDING" | "EXECUTED" | "CANCELLED"
  filledQuantity?: number
  stock?: Stock
}

export interface WatchlistItem {
  id: string
  symbol: string
  stock: Stock
}

export interface Quote {
  last_trade_price: number
  prev_close_price: number
  change?: number
  change_percent?: number
}

export interface PnLData {
  totalPnL: number
  dayPnL: number
}

export interface TabConfig {
  id: "home" | "watchlist" | "orders" | "positions" | "account"
  icon: React.ComponentType<{ className?: string }>
  label: string
}

export interface IndexData {
  name: string
  instrumentId: string
}

export interface TradingDashboardProps {
  userId: string
  session: any
}

export interface TradingDashboardState {
  currentTab: "home" | "watchlist" | "orders" | "positions" | "account"
  orderDialogOpen: boolean
  selectedStockForOrder: Stock | null
  error: string | null
}

export interface RealtimeData {
  orders: Order[]
  positions: Position[]
  tradingAccount: TradingAccount | null
  isConnected: boolean
  lastMessage?: any
}

export interface MarketData {
  quotes: Record<string, Quote>
  isLoading: boolean
  error?: Error
}

export interface TradingHooksReturn {
  portfolio: Portfolio | null
  isLoading: boolean
  isError: boolean
  error?: Error
  mutate: () => void
}

export interface OrdersPositionsReturn {
  orders: Order[]
  positions: Position[]
  isLoading: boolean
  isError: boolean
  error?: Error
  mutate: () => void
}

export interface WatchlistReturn {
  watchlist: WatchlistItem[]
  isLoading: boolean
  isError: boolean
  error?: Error
  mutate: () => void
}

// Event handler types
export type StockSelectHandler = (stock: Stock) => void
export type OrderUpdateHandler = () => void
export type PositionUpdateHandler = () => void
export type WatchlistUpdateHandler = () => void
export type RefreshHandler = () => void
export type RetryHandler = () => void
export type OrderDialogCloseHandler = () => void
export type OrderPlacedHandler = () => void

// Component prop types
export interface WatchlistProps {
  watchlist: WatchlistItem[]
  quotes: Record<string, Quote>
  onSelectStock: StockSelectHandler
  onUpdate: WatchlistUpdateHandler
}

export interface OrderManagementProps {
  orders: Order[]
  onOrderUpdate: OrderUpdateHandler
}

export interface PositionTrackingProps {
  positions: Position[]
  quotes: Record<string, Quote>
  onPositionUpdate: PositionUpdateHandler
  tradingAccountId: string | null
}

export interface AccountProps {
  portfolio: Portfolio | null
  user: any
  onUpdate: RefreshHandler
}

export interface OrderDialogProps {
  isOpen: boolean
  onClose: OrderDialogCloseHandler
  stock: Stock | null
  portfolio: Portfolio | null
  drawer?: boolean
  onOrderPlaced: OrderPlacedHandler
}

export interface IndexDisplayProps {
  name: string
  instrumentId: string
  quotes: Record<string, Quote>
  isLoading: boolean
  connectionState?: "connected" | "connecting" | "disconnected" | "error"
  marketSession?: "open" | "pre-open" | "closed"
  compact?: boolean
}

export interface LoadingScreenProps {
  message?: string
}

export interface ErrorScreenProps {
  error: string
  onRetry?: RetryHandler
}
