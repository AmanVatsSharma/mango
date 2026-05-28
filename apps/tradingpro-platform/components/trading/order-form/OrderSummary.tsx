/**
 * @file OrderSummary.tsx
 * @module components/trading/order-form
 * @description Summary of order value with visual margin progress bar and detailed breakdown.
 * @author StockTrade
 * @created 2026-02-02
 * @updated 2026-03-30 — Per-line statutory / GST breakdown from admin order charges config
 */

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Info, Wallet } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import type { OrderChargeLineComputed } from "@/lib/order-charges/types"

interface OrderSummaryProps {
  price: number | null
  units: number
  marginRequired: number
  brokerage: number
  additionalCharges: number
  /** STT, exchange, stamp, GST, custom — from `computeNonBrokerageCharges`. */
  chargeLineItems?: OrderChargeLineComputed[]
  totalCost: number
  availableMargin: number
  orderSide: "BUY" | "SELL"
}

export function OrderSummary({
  price,
  units,
  marginRequired,
  brokerage,
  additionalCharges,
  chargeLineItems = [],
  totalCost,
  availableMargin,
  orderSide
}: OrderSummaryProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const orderValue = (price || 0) * units
  const isInsufficient = totalCost > availableMargin
  const percentageUsed = Math.min(100, (totalCost / (availableMargin || 1)) * 100)
  
  const themeText = orderSide === "BUY" ? "text-emerald-600" : "text-rose-600"
  const themeBg = orderSide === "BUY" ? "bg-emerald-500" : "bg-rose-500"

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
      {/* Main Summary Row */}
      <div className="p-4 space-y-3">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Required Margin</span>
            <div className="text-xl font-mono font-bold text-gray-900 dark:text-gray-100">
              ₹{marginRequired.toFixed(2)}
            </div>
          </div>
          <div className="text-right space-y-1">
             <div className="flex items-center justify-end gap-1.5 text-xs text-gray-500">
               <Wallet className="w-3 h-3" />
               <span>Available</span>
             </div>
             <div className={cn("font-mono font-medium", isInsufficient ? "text-red-500" : "text-gray-700 dark:text-gray-300")}>
               ₹{availableMargin.toFixed(2)}
             </div>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-1.5">
          <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div 
              className={cn("h-full rounded-full", isInsufficient ? "bg-red-500" : themeBg)}
              initial={{ width: 0 }}
              animate={{ width: `${percentageUsed}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />
          </div>
          {isInsufficient && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[10px] text-red-500 font-medium flex justify-between"
            >
              <span>Insufficient funds</span>
              <span>Short by ₹{(totalCost - availableMargin).toFixed(2)}</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Collapsible Details */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors border-t border-gray-100 dark:border-gray-800 group">
          <span className="font-medium">Charges & Taxes</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">₹{(brokerage + additionalCharges).toFixed(2)}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4 pt-2 space-y-2 text-xs bg-gray-50 dark:bg-gray-800"
          >
            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700 border-dashed">
              <span className="text-gray-500">Order Value</span>
              <span className="font-mono">₹{orderValue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700 border-dashed">
              <span className="text-gray-500">Brokerage</span>
              <span className="font-mono">₹{brokerage.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700 border-dashed">
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Govt. Charges</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Includes STT, Transaction Charges, GST, and Stamp Duty</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className="font-mono">₹{additionalCharges.toFixed(2)}</span>
            </div>
            {chargeLineItems.length > 0 ? (
              <div className="pl-2 space-y-1 border-b border-gray-100 dark:border-gray-700 border-dashed pb-2 mb-1">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Breakdown</p>
                {chargeLineItems.map((row) => (
                  <div
                    key={`${row.id}-${row.code}`}
                    className="flex justify-between py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-400"
                  >
                    <span>{row.label ?? row.code}</span>
                    <span>₹{row.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex justify-between font-bold pt-2 text-sm">
              <span>Total Required</span>
              <span className={cn("font-mono", themeText)}>₹{totalCost.toFixed(2)}</span>
            </div>
          </motion.div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
