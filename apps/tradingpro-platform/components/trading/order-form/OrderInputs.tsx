/**
 * @file OrderInputs.tsx
 * @module components/trading/order-form
 * @description Input fields for quantity, price, and product type selection using high-fi components.
 * @author StockTrade
 * @created 2026-02-02
 * @updated 2026-03-30 — MIS (intraday) enabled for NFO / NSE_FO product selector
 * @updated 2026-03-30 — Coerce product state to MIS/CNC for TabSelector (NRML is not a tab id).
 * @updated 2026-03-30 — Sync legacy product strings to MIS so submit matches selection.
 * @updated 2026-04-14 — Market/Limit Switch replaced with explicit tab buttons for discoverability.
 */

import React, { useLayoutEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Zap } from "lucide-react"
import { NumberStepper } from "@/components/ui/number-stepper"
import { TabSelector } from "@/components/ui/tab-selector"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface OrderInputsProps {
  isDerivatives: boolean
  lots: number
  setLots: (lots: number) => void
  quantity: number
  setQuantity: (qty: number) => void
  price: number | null
  setPrice: (price: number) => void
  isMarket: boolean
  setIsMarket: (isMarket: boolean) => void
  currentOrderType: string
  setCurrentOrderType: (type: string) => void
  isMarketBlocked: boolean
  lotSize: number
  units: number
  segment: string
  orderSide: "BUY" | "SELL"
}

export function OrderInputs({
  isDerivatives,
  lots,
  setLots,
  quantity,
  setQuantity,
  price,
  setPrice,
  isMarket,
  setIsMarket,
  currentOrderType,
  setCurrentOrderType,
  isMarketBlocked,
  lotSize,
  units,
  segment: _segment,
  orderSide
}: OrderInputsProps) {
  const isBuy = orderSide === "BUY"
  const themeColor = isBuy ? "bg-emerald-500" : "bg-rose-500"
  const themeText = isBuy ? "text-emerald-600" : "text-rose-600"
  const activeTab = isBuy
    ? "bg-emerald-500 text-white shadow-sm"
    : "bg-rose-500 text-white shadow-sm"
  const inactiveTab =
    "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"

  useLayoutEffect(() => {
    if (currentOrderType !== "MIS" && currentOrderType !== "CNC") {
      setCurrentOrderType("MIS")
    }
  }, [currentOrderType, setCurrentOrderType])

  const productTabValue =
    currentOrderType === "MIS" || currentOrderType === "CNC"
      ? currentOrderType
      : "MIS"

  return (
    <div className="space-y-5">
      {/* ── Product Type ─────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold px-0.5">
          Product
        </Label>
        <TabSelector
          options={[
            { id: "MIS", label: "Intraday (MIS)" },
            { id: "CNC", label: isDerivatives ? "Normal (NRML)" : "Delivery (CNC)" },
          ]}
          value={productTabValue}
          onChange={setCurrentOrderType}
          themeColor={themeColor}
        />
      </div>

      {/* ── Order Type: Market / Limit ────────────────── */}
      <div className="space-y-2">
        <Label className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold px-0.5">
          Order Type
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => !isMarketBlocked && setIsMarket(true)}
            disabled={isMarketBlocked}
            style={{ touchAction: "manipulation" }}
            className={cn(
              "py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 select-none",
              isMarket ? activeTab : inactiveTab,
              isMarketBlocked && "opacity-40 pointer-events-none",
            )}
          >
            Market
          </button>
          <button
            type="button"
            onClick={() => !isMarketBlocked && setIsMarket(false)}
            disabled={isMarketBlocked}
            style={{ touchAction: "manipulation" }}
            className={cn(
              "py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 select-none",
              !isMarket ? activeTab : inactiveTab,
              isMarketBlocked && "opacity-40 pointer-events-none",
            )}
          >
            Limit
          </button>
        </div>
      </div>

      {/* ── Qty + Price ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Quantity / Lots */}
        <div className="space-y-2">
          <div className="flex justify-between items-center px-0.5">
            <Label className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
              {isDerivatives ? "Lots" : "Quantity"}
            </Label>
            {isDerivatives && (
              <span className="text-[10px] font-mono text-gray-400">
                1 lot = {lotSize} qty
              </span>
            )}
          </div>
          <NumberStepper
            value={isDerivatives ? lots : quantity}
            onChange={(val) => isDerivatives ? setLots(val) : setQuantity(val)}
            min={1}
            max={100000}
            step={1}
            disabled={isMarketBlocked}
          />
          {isDerivatives && (
            <div className="flex justify-end">
              <span className={cn("text-xs font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md", themeText)}>
                Total: {units} qty
              </span>
            </div>
          )}
        </div>

        {/* Price */}
        <div className="space-y-2">
          <div className="flex items-center px-0.5 h-[16px]">
            <Label className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
              Price
            </Label>
          </div>
          <div className="relative">
            <AnimatePresence mode="wait">
              {isMarket ? (
                <motion.div
                  key="market"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-10"
                >
                  <div className="h-[50px] w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center gap-1.5 text-sm font-medium text-gray-400">
                    <Zap className="w-3.5 h-3.5" />
                    Best Available
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="limit"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <NumberStepper
                    value={price || 0}
                    onChange={setPrice}
                    min={0.05}
                    step={0.05}
                    disabled={isMarketBlocked}
                    formatValue={(v) => `₹${v.toFixed(2)}`}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="h-[50px] w-full invisible pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  )
}
