/**
 * @file AnimatedBuySellSwitcher.tsx
 * @module components/trading
 * @description Professional animated buy/sell switcher with smooth transitions
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-14 — Remove shimmer animation and "(Tap to place)" hint; inactive button gets subtle colored text
 */

"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface AnimatedBuySellSwitcherProps {
  orderSide: "BUY" | "SELL"
  onSideChange: (side: "BUY" | "SELL") => void
  onPlaceOrder: () => void
  loading?: boolean
  disabled?: boolean
  className?: string
}

export function AnimatedBuySellSwitcher({
  orderSide,
  onSideChange,
  onPlaceOrder,
  loading = false,
  disabled = false,
  className
}: AnimatedBuySellSwitcherProps) {
  const isBuy = orderSide === "BUY"

  const handleClick = () => {
    if (isBuy) {
      // On buy side, clicking places buy order
      onPlaceOrder()
    } else {
      // On sell side, clicking animates to buy side
      onSideChange("BUY")
    }
  }

  const handleSellClick = () => {
    if (!isBuy) {
      // On sell side, clicking places sell order
      onPlaceOrder()
    } else {
      // On buy side, clicking animates to sell side
      onSideChange("SELL")
    }
  }

  return (
    <div className={cn("relative flex items-center gap-2", className)}>
      {/* Buy Button - Beautiful Green */}
      <motion.button
        onClick={handleClick}
        disabled={disabled || loading}
        className={cn(
          "relative flex-1 h-12 sm:h-14 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base overflow-hidden z-10",
          "transition-all duration-300",
          isBuy
            ? "bg-gradient-to-br from-green-500 via-emerald-500 to-green-600 text-white shadow-xl shadow-green-500/40 ring-2 ring-green-400/30"
            : "bg-gray-100 dark:bg-gray-800 text-emerald-600 dark:text-emerald-500 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700",
          (disabled || loading) && "opacity-50 cursor-not-allowed"
        )}
        whileHover={!disabled && !loading && isBuy ? { scale: 1.03 } : {}}
        whileTap={!disabled && !loading ? { scale: 0.97 } : {}}
      >
        <AnimatePresence mode="wait">
          {loading && isBuy ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-2 relative z-10"
            >
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Placing...</span>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center justify-center gap-2 relative z-10"
            >
              <ArrowUp className={cn("h-4 w-4 sm:h-5 sm:w-5", isBuy ? "text-white" : "text-emerald-500")} />
              <span>Buy</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Sell Button - Beautiful Red */}
      <motion.button
        onClick={handleSellClick}
        disabled={disabled || loading}
        className={cn(
          "relative flex-1 h-12 sm:h-14 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base overflow-hidden z-10",
          "transition-all duration-300",
          !isBuy
            ? "bg-gradient-to-br from-red-500 via-rose-500 to-red-600 text-white shadow-xl shadow-red-500/40 ring-2 ring-red-400/30"
            : "bg-gray-100 dark:bg-gray-800 text-rose-600 dark:text-rose-500 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700",
          (disabled || loading) && "opacity-50 cursor-not-allowed"
        )}
        whileHover={!disabled && !loading && !isBuy ? { scale: 1.03 } : {}}
        whileTap={!disabled && !loading ? { scale: 0.97 } : {}}
      >
        <AnimatePresence mode="wait">
          {loading && !isBuy ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-2 relative z-10"
            >
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Placing...</span>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center justify-center gap-2 relative z-10"
            >
              <ArrowDown className={cn("h-4 w-4 sm:h-5 sm:w-5", !isBuy ? "text-white" : "text-rose-500")} />
              <span>Sell</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
