/**
 * File:        lib/hooks/use-risk-monitoring.ts
 * Module:      Risk · Client Monitoring Hook
 * Purpose:     Calculates P&L and monitors margin thresholds from pre-fetched positions/account.
 *              Consumers must pass live data from TradingRealtimeContext — no independent fetch.
 *
 * Exports:
 *   - useRiskMonitoring(data, thresholds?) → { riskStatus, lastChecked, closePosition, isLoading, thresholds }
 *   - RiskThresholds — configurable warning / auto-close thresholds
 *   - RiskStatus — computed risk snapshot
 *
 * Depends on:
 *   - @/lib/market-data/providers/WebSocketMarketDataProvider — live quotes for LTP-based PnL
 *   - @/hooks/use-toast — warning/critical toasts
 *   - @/lib/market-data/utils/quote-lookup — resolveDisplayPriceFromQuote
 *
 * Side-effects:
 *   - HTTP POST /api/trading/positions on auto-close trigger
 *   - Toast notifications on WARNING / CRITICAL status
 *
 * Key invariants:
 *   - Does NOT fetch positions or account; callers pass data from TradingRealtimeContext
 *   - Auto-close: fires once per critical breach (hasAutoClosed guard + 5s cooldown)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Switch to useMarketDataLive (was the combined useMarketData hook).
 *   - Tick-rate gate setRiskStatus: only update state when a visible field
 *     actually changed (status, percent ~1e-4, PnL ~0.01). Was producing a
 *     fresh status object every tick and forcing every consumer to re-render.
 *   - Only toast on transitions INTO WARNING/CRITICAL — not on every tick we
 *     remain there. Was firing 5-100 toasts/sec when risk crossed threshold.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
// Live context only — we read quotes; we don't need stable config here.
import { useMarketDataLive } from '@/lib/market-data/providers/WebSocketMarketDataProvider'
import { toast } from '@/hooks/use-toast'
import { resolveDisplayPriceFromQuote, resolveQuoteFromMap } from "@/lib/market-data/utils/quote-lookup"

export interface RiskThresholds {
  warningThreshold: number
  autoCloseThreshold: number
}

export interface RiskStatus {
  totalUnrealizedPnL: number
  availableMargin: number
  totalFunds: number
  marginUtilizationPercent: number
  status: 'SAFE' | 'WARNING' | 'CRITICAL'
  shouldAutoClose: boolean
  positionsAtRisk: Array<{
    positionId: string
    symbol: string
    unrealizedPnL: number
    utilizationPercent: number
  }>
}

export interface RiskMonitoringData {
  positions: any[]
  account: any | null
  isLoading: boolean
  refreshPositions: () => Promise<any>
  refreshAll: () => Promise<void>
}

const DEFAULT_THRESHOLDS: RiskThresholds = {
  warningThreshold: 0.75,
  autoCloseThreshold: 0.8,
}

export function useRiskMonitoring(
  data: RiskMonitoringData,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS
) {
  const { positions, account, isLoading: dataLoading, refreshPositions, refreshAll } = data
  const { quotes } = useMarketDataLive()

  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [hasAutoClosed, setHasAutoClosed] = useState(false)
  // Tracks the last toasted status so we only toast on TRANSITION into
  // WARNING / CRITICAL, not on every tick we remain in that status. Without
  // this, when risk crossed the threshold we'd fire one toast per tick (5-100
  // toasts/sec depending on feed rate), saturating the toast queue and
  // re-rendering the toaster.
  const lastToastedStatusRef = useRef<RiskStatus['status'] | null>(null)

  const calculateUnrealizedPnL = useCallback(() => {
    if (!positions || positions.length === 0) {
      return { totalUnrealizedPnL: 0, positionsAtRisk: [] }
    }

    let totalUnrealizedPnL = 0
    const positionsAtRisk: RiskStatus['positionsAtRisk'] = []

    positions.forEach((pos: any) => {
      if (pos.quantity === 0) return

      let currentPrice = pos.averagePrice
      let unrealizedPnL = pos.unrealizedPnL ?? 0

      const instrumentId = pos?.stock?.instrumentId || pos?.instrumentId
      const quote = resolveQuoteFromMap(quotes, {
        token: typeof pos?.stock?.token === "number" ? pos.stock.token : undefined,
        instrumentId: instrumentId || undefined,
      })
      const resolvedQuotePrice = resolveDisplayPriceFromQuote(quote, pos.averagePrice)
      if (resolvedQuotePrice > 0) {
        currentPrice = resolvedQuotePrice
        unrealizedPnL = (currentPrice - pos.averagePrice) * pos.quantity
      }

      totalUnrealizedPnL += unrealizedPnL

      if (unrealizedPnL < 0) {
        positionsAtRisk.push({
          positionId: pos.id,
          symbol: pos.symbol,
          unrealizedPnL,
          utilizationPercent: 0,
        })
      }
    })

    return { totalUnrealizedPnL, positionsAtRisk }
  }, [positions, quotes])

  const calculateRiskStatus = useCallback((): RiskStatus | null => {
    if (!account || dataLoading) return null

    const { totalUnrealizedPnL, positionsAtRisk } = calculateUnrealizedPnL()

    const availableMargin = account.availableMargin || 0
    const balance = account.balance || 0
    const totalFunds = availableMargin + balance

    const marginUtilizationPercent =
      totalFunds > 0 ? Math.abs(Math.min(0, totalUnrealizedPnL)) / totalFunds : 0

    let status: RiskStatus['status'] = 'SAFE'
    let shouldAutoClose = false

    if (marginUtilizationPercent >= thresholds.autoCloseThreshold) {
      status = 'CRITICAL'
      shouldAutoClose = true
    } else if (marginUtilizationPercent >= thresholds.warningThreshold) {
      status = 'WARNING'
    }

    const positionsWithUtilization = positionsAtRisk.map((pos) => ({
      ...pos,
      utilizationPercent: totalFunds > 0 ? Math.abs(pos.unrealizedPnL) / totalFunds : 0,
    }))

    return {
      totalUnrealizedPnL,
      availableMargin,
      totalFunds,
      marginUtilizationPercent,
      status,
      shouldAutoClose,
      positionsAtRisk: positionsWithUtilization,
    }
  }, [account, dataLoading, calculateUnrealizedPnL, thresholds])

  // Tick-rate gating:
  //   - Only setRiskStatus when a meaningful field changed (status, marginUtilizationPercent
  //     to 4 decimals, totalUnrealizedPnL to 2 decimals). Without this, every tick
  //     produced a fresh status object and re-rendered every consumer of useRiskMonitoring
  //     even when the displayed values were identical.
  //   - Only toast on TRANSITIONS into WARNING/CRITICAL. Otherwise a busy market
  //     in WARNING state would queue dozens of toasts per second.
  //   - lastChecked still updates each evaluation so consumers wanting to show
  //     a "last checked" timestamp can — but it's a setState only, not a toast.
  useEffect(() => {
    const status = calculateRiskStatus()
    if (!status) return

    setRiskStatus((prev) => {
      if (
        prev &&
        prev.status === status.status &&
        prev.shouldAutoClose === status.shouldAutoClose &&
        Math.abs(prev.marginUtilizationPercent - status.marginUtilizationPercent) < 1e-4 &&
        Math.abs(prev.totalUnrealizedPnL - status.totalUnrealizedPnL) < 0.01 &&
        prev.positionsAtRisk.length === status.positionsAtRisk.length
      ) {
        return prev
      }
      return status
    })
    setLastChecked(new Date())

    const lastToasted = lastToastedStatusRef.current
    if (status.status === 'CRITICAL' && lastToasted !== 'CRITICAL') {
      toast({
        title: "🚨 Critical Risk Alert",
        description: `Your loss (₹${Math.abs(status.totalUnrealizedPnL).toFixed(2)}) exceeds ${(thresholds.autoCloseThreshold * 100).toFixed(0)}% of available funds. Consider closing positions.`,
        variant: "destructive",
        duration: 10000,
      })
    } else if (status.status === 'WARNING' && lastToasted !== 'WARNING' && lastToasted !== 'CRITICAL') {
      toast({
        title: "⚠️ Risk Warning",
        description: `Your loss (₹${Math.abs(status.totalUnrealizedPnL).toFixed(2)}) exceeds ${(thresholds.warningThreshold * 100).toFixed(0)}% of available funds.`,
        variant: "default",
        duration: 8000,
      })
    }
    lastToastedStatusRef.current = status.status
  }, [calculateRiskStatus, thresholds])

  const requestPositionClose = useCallback(async (positionId: string) => {
    // 12s timeout. Auto-close is the safety-net path when risk crosses
    // critical; if the backend hangs we want a clear error toast (the
    // caller toasts on rejection) so the user can manually intervene
    // instead of believing auto-close is "in progress" indefinitely.
    const response = await fetch(`/api/trading/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId }),
      signal: AbortSignal.timeout(12_000),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const message = (errorData as any)?.error || "Failed to close position"
      throw new Error(message)
    }

    return response.json()
  }, [])

  const handleAutoClosePosition = useCallback(
    async (positionId: string, symbol: string) => {
      try {
        console.log(`🔴 [RISK-MONITORING] Auto-closing position ${symbol} due to risk threshold`)
        await requestPositionClose(positionId)

        toast({
          title: "Position Auto-Closed",
          description: `${symbol} position was automatically closed. Loss exceeded ${(thresholds.autoCloseThreshold * 100).toFixed(0)}% of available funds.`,
          variant: "destructive",
          duration: 10000,
        })

        await refreshAll()
      } catch (error: any) {
        console.error('❌ [RISK-MONITORING] Failed to auto-close position:', error)
        toast({
          title: "Auto-Close Failed",
          description: `Failed to auto-close ${symbol} position: ${error.message}. Please close manually.`,
          variant: "destructive",
        })
        throw error
      }
    },
    [requestPositionClose, thresholds, refreshAll],
  )

  useEffect(() => {
    if (!riskStatus || !riskStatus.shouldAutoClose || hasAutoClosed) return

    const sortedPositions = [...riskStatus.positionsAtRisk].sort((a, b) => a.unrealizedPnL - b.unrealizedPnL)
    if (sortedPositions.length === 0) return

    const worstPosition = sortedPositions[0]
    setHasAutoClosed(true)
    handleAutoClosePosition(worstPosition.positionId, worstPosition.symbol).finally(() => {
      setTimeout(() => setHasAutoClosed(false), 5000)
    })
  }, [riskStatus, hasAutoClosed, handleAutoClosePosition])

  const closePosition = useCallback(
    async (positionId: string) => {
      try {
        const result = await requestPositionClose(positionId)
        toast({
          title: "Close Requested",
          description: "Position close triggered server-side.",
          duration: 5000,
        })
        await refreshPositions()
        return result
      } catch (error: any) {
        toast({
          title: "Close Failed",
          description: error?.message || "Failed to close position",
          variant: "destructive",
        })
        throw error
      }
    },
    [requestPositionClose, refreshPositions],
  )

  return {
    riskStatus,
    lastChecked,
    closePosition,
    isLoading: dataLoading,
    thresholds,
  }
}
