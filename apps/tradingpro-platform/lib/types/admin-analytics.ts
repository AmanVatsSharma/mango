/**
 * @file admin-analytics.ts
 * @module lib/types
 * @description Shared response contract for GET /api/admin/analytics (admin console).
 * @author StockTrade
 * @created 2026-04-06
 *
 * Notes:
 * - Nullable metrics mean “not applicable” or insufficient baseline; UI should show N/A.
 */

export type AdminAnalyticsRevenueGranularity = "hour" | "day" | "week"

export type AdminAnalyticsTopUser = {
  id: string
  name: string
  clientId: string
  profit: number
  trades: number
  isTradingDashboardOnline: boolean
}

export type AdminAnalyticsRevenuePoint = {
  period: string
  value: number
}

export type AdminAnalyticsVolumeRow = {
  symbol: string
  /** Executed order quantity (units), not currency. */
  volume: number
}

export type AdminAnalyticsResponse = {
  totalRevenue: number
  totalTrades: number
  activeUsers: number
  avgOrderValue: number
  totalDeposits: number
  totalWithdrawals: number
  /** KYC approved / new signups in range; null if no signups in range. */
  conversionRate: number | null
  /** Reserved; null until a canonical churn definition exists. */
  churnRate: number | null
  /** Period-over-period new user signup change (%). */
  userGrowth: number | null
  /** Period-over-period credit revenue change (%). */
  revenueGrowth: number | null
  topPerformingUsers: AdminAnalyticsTopUser[]
  revenueByPeriod: AdminAnalyticsRevenuePoint[]
  revenueBucketGranularity: AdminAnalyticsRevenueGranularity
  userActivity: []
  tradingVolume: AdminAnalyticsVolumeRow[]
}
