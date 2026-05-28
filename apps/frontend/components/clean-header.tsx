/**
 * @file clean-header.tsx
 * @description Clean, minimal trading header for mobile-first experience
 */

"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Wifi, WifiOff, TrendingUp, TrendingDown, Bell, Menu, Activity, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { BRAND_IDENTITY } from "@/Branding"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useMarketData } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { getMarketSession } from "@/lib/hooks/market-timing"

interface CleanHeaderProps {
  user?: {
    name?: string
    image?: string
  }
  todayPnL?: number
  onMenuClick?: () => void
  onSearchClick?: () => void
  onNotificationClick?: () => void
  className?: string
}

export function CleanHeader({
  user,
  todayPnL = 0,
  onMenuClick,
  onSearchClick,
  onNotificationClick,
  className,
}: CleanHeaderProps) {
  const [marketStatus, setMarketStatus] = useState<'open' | 'closed'>('open')
  // Static placeholder; bind to real quote provider for live NIFTY data.
  const niftyData = { value: 21845.25, change: 125.50, changePercent: 0.58 }

  const { isConnected: wsConnectionState } = useMarketData()
  const isOnline = wsConnectionState === 'connected'

  // Check market status using centralized IST-aware helper
  useEffect(() => {
    const update = () => {
      const session = getMarketSession()
      setMarketStatus(session === 'open' ? 'open' : 'closed')
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <header className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
      className
    )}>
      <div className="container flex h-14 items-center justify-between px-4">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          {/* Menu */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="h-9 w-9"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo */}
          <motion.div
            className="flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent hidden sm:block">
              {BRAND_IDENTITY.names.short}
            </span>
          </motion.div>

          {/* Nifty Data */}
          <div className="hidden md:flex items-center gap-2 ml-4 pl-4 border-l">
            <span className="text-xs font-medium text-muted-foreground uppercase">nifty 50</span>
            <span className="text-sm font-bold">{niftyData.value.toFixed(2)}</span>
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium",
              niftyData.change >= 0 ? "text-green-600" : "text-red-600"
            )}>
              <span className="text-[10px] opacity-70">Δ</span>
              <span>{Math.abs(niftyData.changePercent).toFixed(2)}%</span>
            </div>
            {marketStatus === 'open' && (
              <motion.div
                className="w-2 h-2 bg-green-500 rounded-full ml-1"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Today's P&L */}
          <div className="hidden sm:flex flex-col items-end mr-2">
            <span className="text-xs text-muted-foreground">Today</span>
            <span className={cn(
              "text-sm font-bold",
              todayPnL >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {todayPnL >= 0 ? '+' : ''}{formatCurrency(todayPnL)}
            </span>
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
            className="h-9 w-9"
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onNotificationClick}
            className="relative h-9 w-9"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
              3
            </span>
          </Button>

          {/* User Avatar */}
          <Avatar className="h-8 w-8 ring-2 ring-primary/20">
            <AvatarImage src={user?.image} alt={user?.name} />
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm">
              {user?.name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}