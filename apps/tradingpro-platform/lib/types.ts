// Trading types based on Prisma schema
export interface User {
  id: string
  name?: string
  email: string
  role: "USER" | "ADMIN" | "MODERATOR" | "SUPER_ADMIN"
  createdAt: Date
  updatedAt: Date
}

export interface TradingAccount {
  id: string
  userId: string
  accountNumber: string
  balance: number
  marginUsed: number
  marginFree: number
  createdAt: Date
  updatedAt: Date
}

export interface Order {
  id: string
  tradingAccountId: string
  symbol: string
  orderType: "MARKET" | "LIMIT" | "STOP_LOSS" | "STOP_LOSS_MARKET"
  side: "BUY" | "SELL"
  quantity: number
  price?: number
  stopLoss?: number
  takeProfit?: number
  status: "PENDING" | "FILLED" | "PARTIALLY_FILLED" | "CANCELLED" | "REJECTED"
  filledQuantity: number
  averagePrice?: number
  createdAt: Date
  updatedAt: Date
}

export interface Position {
  id: string
  tradingAccountId: string
  symbol: string
  quantity: number
  averagePrice: number
  currentPrice: number
  unrealizedPnl: number
  realizedPnl: number
  createdAt: Date
  updatedAt: Date
}

export interface Transaction {
  id: string
  tradingAccountId: string
  orderId?: string
  type: "DEPOSIT" | "WITHDRAWAL" | "TRADE" | "FEE" | "DIVIDEND"
  amount: number
  description?: string
  createdAt: Date
}

export interface MarketData {
  symbol: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
  volume: number
  openInterest?: number
}
