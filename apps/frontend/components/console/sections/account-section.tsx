"use client"

/**
 * @file account-section.tsx
 * @module components/console/sections
 * @description Account workspace section with summary cards, charts, and quick-actions access.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-25
 */

import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { TrendingUp, PieChart, BarChart3, RefreshCw, Eye, EyeOff } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AccountSummaryGrid } from "../account/account-summary-grid"
import { BalanceTrendChart } from "../account/balance-trend-chart"
import { ExposurePieChart } from "../account/exposure-pie-chart"
import { PLTrendChart } from "../account/pl-trend-chart"
import { QuickActionsMenu } from "../account/quick-actions-menu"
import { ConsoleErrorState } from "../console-error-state"
import { ConsoleLoadingSkeleton } from "../console-loading-state"
import { useSession } from "next-auth/react"
import { usePortfolio, usePositions } from "@/lib/hooks/use-trading-data"
import { useConsoleData } from "@/lib/hooks/use-console-data"
import { normalizeConsoleNumber } from "@/components/console/console-number-utils"

export function AccountSection() {
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Session + console data hooks
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id as string | undefined
  const { consoleData, isLoading: isConsoleLoading, error: consoleError, refetch } = useConsoleData(userId)
  
  // Fallback to existing trading data hooks for positions
  const { positions, isLoading: isPositionsLoading, error: positionsError } = usePositions(userId)
  
  const unrealizedPnL = useMemo(() => {
    try {
      return (positions || []).reduce((sum: number, p: any) => sum + normalizeConsoleNumber(p.unrealizedPnL), 0)
    } catch (e) {
      console.warn("AccountSection: failed to compute unrealizedPnL", e)
      return 0
    }
  }, [positions])
  
  if (process.env.NODE_ENV === "development") {
    console.log("AccountSection: summary", {
      hasConsoleData: !!consoleData,
      txCount: consoleData?.transactions?.length,
      isConsoleLoading,
      consoleError: !!consoleError,
      positionsCount: positions?.length,
      isPositionsLoading,
      positionsError: !!positionsError,
    })
  }

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date())
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refetch()
      setLastUpdated(new Date())
    } catch (error) {
      console.error("Error refreshing data:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Loading state
  if (isConsoleLoading) {
    return <ConsoleLoadingSkeleton />
  }

  // Error state
  if (consoleError) {
    return <ConsoleErrorState error={consoleError} onRetry={handleRefresh} />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 lg:space-y-8"
    >
      {/* Header - Mobile Optimized */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">My Account</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (process.env.NODE_ENV === "development") {
                console.log("👁️ [ACCOUNT-SECTION] Toggle balance visibility")
              }
              setBalanceVisible(!balanceVisible)
            }}
            className="gap-2 bg-transparent flex-1 sm:flex-none touch-manipulation"
          >
            {balanceVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">{balanceVisible ? "Hide" : "Show"} Balance</span>
            <span className="sm:hidden">{balanceVisible ? "Hide" : "Show"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2 bg-transparent px-3 touch-manipulation"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Account Summary Grid */}
      <AccountSummaryGrid
        balanceVisible={balanceVisible}
        account={{
          totalValue: consoleData?.tradingAccount ? 
            (consoleData.tradingAccount.balance + consoleData.tradingAccount.availableMargin + consoleData.tradingAccount.usedMargin) : 0,
          availableMargin: consoleData?.tradingAccount?.availableMargin ?? 0,
          usedMargin: consoleData?.tradingAccount?.usedMargin ?? 0,
          balance: consoleData?.tradingAccount?.balance ?? 0,
        }}
        unrealizedPnL={unrealizedPnL}
      />

      {/* Charts Section - Mobile Optimized Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Balance Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
              Balance Trend
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Your account balance over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <div className="h-[200px] sm:h-[250px]">
              <BalanceTrendChart />
            </div>
          </CardContent>
        </Card>

        {/* Exposure Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <PieChart className="w-4 h-4 sm:w-5 sm:h-5" />
              Exposure Breakdown
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Current portfolio allocation</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <div className="h-[200px] sm:h-[250px]">
              <ExposurePieChart />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Trend - Mobile Optimized */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            P&L Trend Analysis
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Profit and Loss performance over time</CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <div className="h-[250px] sm:h-[300px]">
            <PLTrendChart />
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions Floating Menu */}
      <QuickActionsMenu />
    </motion.div>
  )
}
