/**
 * Trading Analytics Service
 * 
 * Provides comprehensive trading analytics:
 * - P&L analysis
 * - Win/loss ratios
 * - Trading statistics
 * - Performance metrics
 * - Risk metrics
 */

import { prisma } from '@/lib/prisma'
import { parseFiniteMarketNumber } from '@/lib/market-data/utils/quote-lookup'

console.log("📊 [TRADING-ANALYTICS] Module loaded")

const normalizeTradingAnalyticsNumber = (value: unknown): number => parseFiniteMarketNumber(value) ?? 0

export interface TradingStats {
  totalOrders: number
  executedOrders: number
  cancelledOrders: number
  pendingOrders: number
  totalPositions: number
  openPositions: number
  closedPositions: number
  totalPnL: number
  realizedPnL: number
  unrealizedPnL: number
  winRate: number
  avgWin: number
  avgLoss: number
  largestWin: number
  largestLoss: number
  totalTrades: number
  profitableTrades: number
  losingTrades: number
  avgHoldingPeriod: number
  totalVolume: number
  totalCharges: number
}

export interface DailyPerformance {
  date: string
  pnl: number
  trades: number
  volume: number
  winRate: number
}

export interface SymbolPerformance {
  symbol: string
  trades: number
  pnl: number
  winRate: number
  avgWin: number
  avgLoss: number
}

export class TradingAnalytics {
  /**
   * Get comprehensive trading statistics for a user
   */
  static async getTradingStats(userId: string): Promise<TradingStats> {
    console.log("📊 [TRADING-ANALYTICS] Getting trading stats for user:", userId)
    
    try {
      // Get trading account
      const tradingAccount = await prisma.tradingAccount.findUnique({
        where: { userId }
      })

      if (!tradingAccount) {
        throw new Error("Trading account not found")
      }

      // Get orders stats
      const [
        totalOrders,
        executedOrders,
        cancelledOrders,
        pendingOrders
      ] = await Promise.all([
        prisma.order.count({ where: { tradingAccountId: tradingAccount.id } }),
        prisma.order.count({ where: { tradingAccountId: tradingAccount.id, status: 'EXECUTED' } }),
        prisma.order.count({ where: { tradingAccountId: tradingAccount.id, status: 'CANCELLED' } }),
        prisma.order.count({ where: { tradingAccountId: tradingAccount.id, status: 'PENDING' } })
      ])

      // Get positions stats
      const [
        totalPositions,
        openPositions,
        closedPositions
      ] = await Promise.all([
        prisma.position.count({ where: { tradingAccountId: tradingAccount.id } }),
        prisma.position.count({ where: { tradingAccountId: tradingAccount.id, quantity: { not: 0 } } }),
        prisma.position.count({ where: { tradingAccountId: tradingAccount.id, quantity: 0 } })
      ])

      // Get P&L metrics
      const positions = await prisma.position.findMany({
        where: { tradingAccountId: tradingAccount.id }
      })

      const realizedPnL = positions
        .filter(p => p.quantity === 0)
        .reduce((sum, p) => sum + normalizeTradingAnalyticsNumber(p.unrealizedPnL), 0)

      const unrealizedPnL = positions
        .filter(p => p.quantity !== 0)
        .reduce((sum, p) => sum + normalizeTradingAnalyticsNumber(p.unrealizedPnL), 0)

      const totalPnL = realizedPnL + unrealizedPnL

      // Calculate win/loss metrics
      const closedPositionsWithPnL = positions.filter(p => p.quantity === 0)
      const profitableTrades = closedPositionsWithPnL.filter(p => normalizeTradingAnalyticsNumber(p.unrealizedPnL) > 0).length
      const losingTrades = closedPositionsWithPnL.filter(p => normalizeTradingAnalyticsNumber(p.unrealizedPnL) < 0).length
      const totalTrades = closedPositionsWithPnL.length

      const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0

      // Calculate average win/loss
      const wins = closedPositionsWithPnL.filter(p => normalizeTradingAnalyticsNumber(p.unrealizedPnL) > 0)
      const losses = closedPositionsWithPnL.filter(p => normalizeTradingAnalyticsNumber(p.unrealizedPnL) < 0)

      const avgWin = wins.length > 0
        ? wins.reduce((sum, p) => sum + normalizeTradingAnalyticsNumber(p.unrealizedPnL), 0) / wins.length
        : 0

      const avgLoss = losses.length > 0
        ? losses.reduce((sum, p) => sum + normalizeTradingAnalyticsNumber(p.unrealizedPnL), 0) / losses.length
        : 0

      // Calculate largest win/loss
      const largestWin = wins.length > 0
        ? Math.max(...wins.map(p => normalizeTradingAnalyticsNumber(p.unrealizedPnL)))
        : 0

      const largestLoss = losses.length > 0
        ? Math.min(...losses.map(p => normalizeTradingAnalyticsNumber(p.unrealizedPnL)))
        : 0

      // Calculate total charges
      const transactions = await prisma.transaction.findMany({
        where: {
          tradingAccountId: tradingAccount.id,
          type: 'DEBIT',
          description: { contains: 'charges' }
        }
      })

      const totalCharges = transactions.reduce((sum, t) => sum + normalizeTradingAnalyticsNumber(t.amount), 0)

      // Calculate total volume
      const totalVolume = await prisma.transaction.aggregate({
        where: { tradingAccountId: tradingAccount.id },
        _sum: { amount: true }
      })

      // Calculate average holding period (simplified)
      const avgHoldingPeriod = 0 // TODO: Implement based on order/position timestamps

      const stats: TradingStats = {
        totalOrders,
        executedOrders,
        cancelledOrders,
        pendingOrders,
        totalPositions,
        openPositions,
        closedPositions,
        totalPnL,
        realizedPnL,
        unrealizedPnL,
        winRate,
        avgWin,
        avgLoss,
        largestWin,
        largestLoss,
        totalTrades,
        profitableTrades,
        losingTrades,
        avgHoldingPeriod,
        totalVolume: normalizeTradingAnalyticsNumber(totalVolume._sum.amount),
        totalCharges
      }

      console.log("✅ [TRADING-ANALYTICS] Stats calculated:", stats)
      return stats

    } catch (error) {
      console.error("❌ [TRADING-ANALYTICS] Error calculating stats:", error)
      throw error
    }
  }

  /**
   * Get daily performance metrics
   */
  static async getDailyPerformance(
    userId: string,
    days: number = 30
  ): Promise<DailyPerformance[]> {
    console.log(`📊 [TRADING-ANALYTICS] Getting daily performance for last ${days} days`)
    
    try {
      const tradingAccount = await prisma.tradingAccount.findUnique({
        where: { userId }
      })

      if (!tradingAccount) {
        throw new Error("Trading account not found")
      }

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      // Get positions closed in the period
      const positions = await prisma.position.findMany({
        where: {
          tradingAccountId: tradingAccount.id,
          quantity: 0,
          createdAt: { gte: startDate }
        },
        orderBy: { createdAt: 'asc' }
      })

      // Group by date
      const dailyMap = new Map<string, {
        pnl: number
        trades: number
        wins: number
      }>()

      positions.forEach(position => {
        const date = position.createdAt.toISOString().split('T')[0]
        const pnl = normalizeTradingAnalyticsNumber(position.unrealizedPnL)
        
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { pnl: 0, trades: 0, wins: 0 })
        }

        const day = dailyMap.get(date)!
        day.pnl += pnl
        day.trades += 1
        if (pnl > 0) day.wins += 1
      })

      // Convert to array
      const dailyPerformance: DailyPerformance[] = Array.from(dailyMap.entries()).map(
        ([date, data]) => ({
          date,
          pnl: data.pnl,
          trades: data.trades,
          volume: 0, // TODO: Calculate from transactions
          winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0
        })
      )

      console.log(`✅ [TRADING-ANALYTICS] Found ${dailyPerformance.length} days of performance data`)
      return dailyPerformance

    } catch (error) {
      console.error("❌ [TRADING-ANALYTICS] Error getting daily performance:", error)
      throw error
    }
  }

  /**
   * Get performance by symbol
   */
  static async getSymbolPerformance(userId: string): Promise<SymbolPerformance[]> {
    console.log("📊 [TRADING-ANALYTICS] Getting symbol performance")
    
    try {
      const tradingAccount = await prisma.tradingAccount.findUnique({
        where: { userId }
      })

      if (!tradingAccount) {
        throw new Error("Trading account not found")
      }

      // Get all positions
      const positions = await prisma.position.findMany({
        where: {
          tradingAccountId: tradingAccount.id,
          quantity: 0 // Only closed positions
        }
      })

      // Group by symbol
      const symbolMap = new Map<string, {
        pnl: number
        trades: number
        wins: number
        losses: number
        totalWinAmount: number
        totalLossAmount: number
      }>()

      positions.forEach(position => {
        const symbol = position.symbol
        const pnl = normalizeTradingAnalyticsNumber(position.unrealizedPnL)
        
        if (!symbolMap.has(symbol)) {
          symbolMap.set(symbol, {
            pnl: 0,
            trades: 0,
            wins: 0,
            losses: 0,
            totalWinAmount: 0,
            totalLossAmount: 0
          })
        }

        const data = symbolMap.get(symbol)!
        data.pnl += pnl
        data.trades += 1
        
        if (pnl > 0) {
          data.wins += 1
          data.totalWinAmount += pnl
        } else if (pnl < 0) {
          data.losses += 1
          data.totalLossAmount += pnl
        }
      })

      // Convert to array
      const symbolPerformance: SymbolPerformance[] = Array.from(symbolMap.entries())
        .map(([symbol, data]) => ({
          symbol,
          trades: data.trades,
          pnl: data.pnl,
          winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
          avgWin: data.wins > 0 ? data.totalWinAmount / data.wins : 0,
          avgLoss: data.losses > 0 ? data.totalLossAmount / data.losses : 0
        }))
        .sort((a, b) => b.pnl - a.pnl) // Sort by P&L descending

      console.log(`✅ [TRADING-ANALYTICS] Found ${symbolPerformance.length} symbols`)
      return symbolPerformance

    } catch (error) {
      console.error("❌ [TRADING-ANALYTICS] Error getting symbol performance:", error)
      throw error
    }
  }

  /**
   * Calculate risk metrics
   */
  static async getRiskMetrics(userId: string) {
    console.log("📊 [TRADING-ANALYTICS] Calculating risk metrics")
    
    try {
      const tradingAccount = await prisma.tradingAccount.findUnique({
        where: { userId }
      })

      if (!tradingAccount) {
        throw new Error("Trading account not found")
      }

      const positions = await prisma.position.findMany({
        where: {
          tradingAccountId: tradingAccount.id,
          quantity: 0
        }
      })

      if (positions.length === 0) {
        return {
          sharpeRatio: 0,
          maxDrawdown: 0,
          profitFactor: 0,
          expectancy: 0
        }
      }

      // Calculate returns
      const returns = positions.map(p => normalizeTradingAnalyticsNumber(p.unrealizedPnL))
      
      // Calculate average return
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
      
      // Calculate standard deviation
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      const stdDev = Math.sqrt(variance)
      
      // Sharpe Ratio (simplified, assuming risk-free rate = 0)
      const sharpeRatio = stdDev !== 0 ? avgReturn / stdDev : 0

      // Calculate Max Drawdown
      let maxDrawdown = 0
      let peak = 0
      let runningPnL = 0
      
      returns.forEach(ret => {
        runningPnL += ret
        if (runningPnL > peak) {
          peak = runningPnL
        }
        const drawdown = peak - runningPnL
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown
        }
      })

      // Profit Factor
      const grossProfit = returns.filter(r => r > 0).reduce((sum, r) => sum + r, 0)
      const grossLoss = Math.abs(returns.filter(r => r < 0).reduce((sum, r) => sum + r, 0))
      const profitFactor = grossLoss !== 0 ? grossProfit / grossLoss : 0

      // Expectancy
      const winRate = returns.filter(r => r > 0).length / returns.length
      const avgWin = grossProfit / (returns.filter(r => r > 0).length || 1)
      const avgLoss = grossLoss / (returns.filter(r => r < 0).length || 1)
      const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss)

      const riskMetrics = {
        sharpeRatio,
        maxDrawdown,
        profitFactor,
        expectancy
      }

      console.log("✅ [TRADING-ANALYTICS] Risk metrics calculated:", riskMetrics)
      return riskMetrics

    } catch (error) {
      console.error("❌ [TRADING-ANALYTICS] Error calculating risk metrics:", error)
      throw error
    }
  }
}

console.log("✅ [TRADING-ANALYTICS] Module initialized")
