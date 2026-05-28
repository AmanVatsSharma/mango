/**
 * File:        components/enhanced-header.tsx
 * Module:      Shell · Header
 * Purpose:     Premium trading header with real-time NSE/BSE index strip and user controls.
 *
 * Exports:
 *   - EnhancedHeader(props)        — main header component
 *   - EnhancedHeaderProps          — prop shape
 *   - HEADER_NIFTY_TOKEN           — NSE Nifty 50 stream token (26571)
 *   - HEADER_BANK_NIFTY_TOKEN      — NSE Nifty Bank stream token (26575)
 *   - HEADER_SENSEX_TOKEN          — BSE Sensex stream token (26572)
 *
 * Depends on:
 *   - @/lib/market-data/providers/WebSocketMarketDataProvider — subscribe/quote hooks
 *   - @/lib/hooks/market-timing — market session state (open/pre-open/closed)
 *   - @/lib/date-utils — IST formatting helpers
 *
 * Side-effects:
 *   - Subscribes three index tokens to the WebSocket feed on mount; cleans up on unmount.
 *   - Polls market session and IST clock via setInterval.
 *
 * Key invariants:
 *   - Index strip is `hidden xl:flex` — desktop-only (≥1280 px).
 *   - `quoteToIndexDisplay` falls back to static values when WS quote is absent — safe at cold start.
 *
 * Read order:
 *   1. HEADER_*_TOKEN constants — feed token IDs
 *   2. quoteToIndexDisplay()    — quote → display shape conversion
 *   3. EnhancedHeader()         — main component
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-09
 */

"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
  Bell,
  User,
  Settings,
  Menu,
  X,
  Activity,
  BarChart3,
  Zap,
  Clock,
  DollarSign,
  Loader2,
  ChevronDown,
  Search,
  Moon,
  Sun,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getMarketSession } from "@/lib/hooks/market-timing"
import { useMarketData } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { formatTimeIST, getCurrentISTDate } from "@/lib/date-utils"
import type { EnhancedQuote } from "@/lib/market-data/providers/types"
import { BRAND_IDENTITY } from "@/Branding"

/** NSE/BSE index stream tokens shown in the header strip (broker / feed ids). */
export const HEADER_NIFTY_TOKEN = 26571
export const HEADER_BANK_NIFTY_TOKEN = 26575
export const HEADER_SENSEX_TOKEN = 26572

interface IndexData {
  name: string
  value: number
  change: number
  changePercent: number
}

function quoteToIndexDisplay(name: string, quote: EnhancedQuote | undefined, fallback: IndexData): IndexData {
  if (!quote) return { ...fallback, name }
  const ltp =
    typeof quote.last_trade_price === "number" && Number.isFinite(quote.last_trade_price)
      ? quote.last_trade_price
      : typeof quote.display_price === "number" && Number.isFinite(quote.display_price)
        ? quote.display_price
        : fallback.value
  const prev =
    typeof quote.prev_close_price === "number" &&
    Number.isFinite(quote.prev_close_price) &&
    quote.prev_close_price > 0
      ? quote.prev_close_price
      : typeof quote.close === "number" && Number.isFinite(quote.close) && quote.close > 0
        ? quote.close
        : null
  const change = prev !== null ? ltp - prev : fallback.change
  const changePercent =
    prev !== null && prev > 0 ? (change / prev) * 100 : fallback.changePercent
  return { name, value: ltp, change, changePercent }
}

interface EnhancedHeaderProps {
  user?: {
    name?: string
    email?: string
    image?: string
  }
  balance?: number
  todayPnL?: number
  onMenuClick?: () => void
  onSearchClick?: () => void
  onNotificationClick?: () => void
  onProfileClick?: () => void
  onLogout?: () => void
  className?: string
}

export function EnhancedHeader({
  user,
  balance = 0,
  todayPnL = 0,
  onMenuClick,
  onSearchClick,
  onNotificationClick,
  onProfileClick,
  onLogout,
  className,
}: EnhancedHeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [marketStatus, setMarketStatus] = useState<'open' | 'closed' | 'pre-open'>('open')
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [notifications, setNotifications] = useState(3)

  const { isConnected: wsConnectionState, quotes, subscribe, unsubscribe } = useMarketData()
  const isOnline = wsConnectionState === 'connected'

  const staticFallbacks: IndexData[] = [
    { name: "nifty 50", value: 21845.25, change: 125.5, changePercent: 0.58 },
    { name: "Nifty Bank", value: 45678.9, change: -89.3, changePercent: -0.19 },
    { name: "SENSEX", value: 72345.6, change: 234.8, changePercent: 0.33 },
  ]

  useEffect(() => {
    subscribe([HEADER_NIFTY_TOKEN, HEADER_BANK_NIFTY_TOKEN, HEADER_SENSEX_TOKEN], "ltp")
    return () => {
      unsubscribe([HEADER_NIFTY_TOKEN, HEADER_BANK_NIFTY_TOKEN, HEADER_SENSEX_TOKEN], "ltp")
    }
  }, [subscribe, unsubscribe])

  const indices: IndexData[] = [
    quoteToIndexDisplay(
      "nifty 50",
      quotes[String(HEADER_NIFTY_TOKEN)] as EnhancedQuote | undefined,
      staticFallbacks[0]!,
    ),
    quoteToIndexDisplay(
      "Nifty Bank",
      quotes[String(HEADER_BANK_NIFTY_TOKEN)] as EnhancedQuote | undefined,
      staticFallbacks[1]!,
    ),
    quoteToIndexDisplay(
      "SENSEX",
      quotes[String(HEADER_SENSEX_TOKEN)] as EnhancedQuote | undefined,
      staticFallbacks[2]!,
    ),
  ]

  // Check market status centrally (pre-open/open/closed) using IST
  useEffect(() => {
    const update = () => {
      const session = getMarketSession()
      setMarketStatus(session)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  // Update IST time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentISTDate())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => formatTimeIST(date)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatNumber = (value: number, decimals = 2) => {
    return value.toFixed(decimals)
  }

  const getMarketStatusColor = () => {
    switch (marketStatus) {
      case 'open': return 'bg-green-500'
      case 'pre-open': return 'bg-yellow-500'
      case 'closed': return 'bg-red-500'
    }
  }

  const getMarketStatusText = () => {
    switch (marketStatus) {
      case 'open': return 'Market Open'
      case 'pre-open': return 'Pre-Open'
      case 'closed': return 'Market Closed'
    }
  }

  return (
    <header className={cn(
      "sticky top-0 z-50 w-full border-b bg-gradient-to-r from-background via-background to-primary/5 backdrop-blur supports-[backdrop-filter]:bg-background/95",
      className
    )}>
      {/* Top Bar - Logo, Indices, Quick Stats */}
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Left Section - Logo & Menu */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo */}
          <motion.div
            className="flex items-center gap-2 cursor-pointer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div className="hidden md:block">
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {BRAND_IDENTITY.names.short}
              </h1>
              <p className="text-xs text-muted-foreground -mt-1">{BRAND_IDENTITY.messaging.tagline}</p>
            </div>
          </motion.div>

          {/* Real-time Indices */}
          <div className="hidden xl:flex items-center gap-4 ml-6 pl-6 border-l">
            {indices.map((index, i) => (
              <motion.div
                key={index.name}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-col"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {index.name}
                  </span>
                  {marketStatus === 'open' && (
                    <motion.div
                      className="w-2 h-2 bg-green-500 rounded-full"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {formatNumber(index.value, 2)}
                  </span>
                  <div className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    index.change >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    <span className="text-[10px] opacity-70">Δ</span>
                    <span>{formatNumber(Math.abs(index.changePercent), 2)}%</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right Section - Stats, Status, Actions */}
        <div className="flex items-center gap-4">
          {/* Portfolio Quick Stats */}
          <div className="hidden lg:flex items-center gap-4 mr-4 pr-4 border-r">
            {/* Balance */}
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground">Balance</span>
              <span className="text-sm font-bold">{formatCurrency(balance)}</span>
            </div>

            {/* Today's P&L */}
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground">Today's P&L</span>
              <span className={cn(
                "text-sm font-bold",
                todayPnL >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {todayPnL >= 0 ? '+' : ''}{formatCurrency(todayPnL)}
              </span>
            </div>
          </div>

          {/* Market Status */}
          <motion.div
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50"
            whileHover={{ scale: 1.05 }}
          >
            <div className={cn("w-2 h-2 rounded-full", getMarketStatusColor())} />
            <span className="text-xs font-medium">{getMarketStatusText()}</span>
          </motion.div>

          {/* Time */}
          <div className="hidden md:flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono">{formatTime(currentTime)}</span>
          </div>

          {/* Connection Status */}
          <motion.div
            animate={isOnline ? {} : { scale: [1, 1.1, 1] }}
            transition={{ repeat: isOnline ? 0 : Infinity, duration: 1 }}
          >
            {isOnline ? (
              <Wifi className="h-5 w-5 text-green-600" />
            ) : (
              <WifiOff className="h-5 w-5 text-red-600" />
            )}
          </motion.div>

          {/* Search */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onSearchClick}
            className="hidden md:flex"
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onNotificationClick}
            className="relative"
          >
            <Bell className="h-5 w-5" />
            {notifications > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center"
              >
                {notifications}
              </motion.span>
            )}
          </Button>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="hidden lg:flex"
          >
            {isDarkMode ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                  <AvatarImage src={user?.image} alt={user?.name} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                    {user?.name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.name || 'User'}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email || 'user@example.com'}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onProfileClick}>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <BarChart3 className="mr-2 h-4 w-4" />
                <span>Reports</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Secondary Bar - Quick Actions & Filters (Mobile Indices) */}
      <div className="border-t bg-muted/30">
        <div className="container px-4 py-2">
          {/* Mobile Indices Scroll */}
          <div className="flex xl:hidden items-center gap-4 overflow-x-auto scrollbar-hide">
            {indices.map((index) => (
              <motion.div
                key={index.name}
                className="flex items-center gap-2 min-w-fit px-3 py-1 rounded-lg bg-background"
                whileTap={{ scale: 0.95 }}
              >
                <span className="text-xs font-medium">{index.name}</span>
                <span className="text-xs font-bold">{formatNumber(index.value, 2)}</span>
                <span className={cn(
                  "text-xs flex items-center gap-1 font-medium",
                  index.change >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  <span className="text-[10px] opacity-70">Δ</span>
                  {formatNumber(Math.abs(index.changePercent), 2)}%
                </span>
              </motion.div>
            ))}
          </div>

          {/* Desktop Quick Actions */}
          <div className="hidden xl:flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8">
                <Zap className="h-4 w-4 mr-2 text-yellow-500" />
                Quick Trade
              </Button>
              <Button variant="ghost" size="sm" className="h-8">
                <BarChart3 className="h-4 w-4 mr-2" />
                Analytics
              </Button>
              <Button variant="ghost" size="sm" className="h-8">
                <Activity className="h-4 w-4 mr-2" />
                Market Depth
              </Button>
            </div>

            {/* Connection Quality Indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="flex gap-0.5">
                  <div className="w-1 h-3 bg-green-500 rounded-sm" />
                  <div className="w-1 h-4 bg-green-500 rounded-sm" />
                  <div className="w-1 h-5 bg-green-500 rounded-sm" />
                  <div className="w-1 h-6 bg-green-500 rounded-sm" />
                </div>
                <span className="ml-1">Excellent Connection</span>
              </div>
              <span className="text-muted-foreground/50">•</span>
              <span>15ms latency</span>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Lost Banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-500 text-white text-center py-2 text-sm font-medium"
          >
            <div className="flex items-center justify-center gap-2">
              <WifiOff className="h-4 w-4" />
              <span>Connection lost. Trying to reconnect...</span>
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}