"use client"

/**
 * @file OrderDialog.tsx
 * @module components
 * @description Responsive order entry drawer/dialog used across watchlist and dashboard flows.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-28
 * @updated 2026-04-14 — Dynamic BUY/SELL header pill; compact status pills; remove shimmer; remove footer hint
 * @updated 2026-04-15 — Instrument details consolidated into sticky header; bid/ask panel via OrderHeader redesign
 * @updated 2026-04-22 — Apply terminal design system (oklch dark palette, forced dark mode) to match desktop panel aesthetic
 * @updated 2026-05-07 — Hoist NonDrawer fallback wrappers to module scope; inline-arrow versions were creating new component identities on every render and would have unmounted child state on each parent re-render whenever drawer={false}.
 */

import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { X } from "lucide-react"
import { AnimatedBuySellSwitcher } from "@/components/trading/AnimatedBuySellSwitcher"
import { useOrderForm } from "@/lib/hooks/use-order-form"
import { OrderHeader } from "@/components/trading/order-form/OrderHeader"
import { OrderInputs } from "@/components/trading/order-form/OrderInputs"
import { OrderSummary } from "@/components/trading/order-form/OrderSummary"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useEffect, useMemo, useState } from "react"
import { useMarketDataStable } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { normalizeSubscriptionKey, resolveSubscriptionIdentity } from "@/lib/market-data/utils/quote-lookup"

interface OrderDialogProps {
  isOpen: boolean
  onClose: () => void
  stock: any | null
  /** When set (e.g. watchlist quick Buy/Sell), form opens on this side; omit or null for default BUY. */
  initialOrderSide?: "BUY" | "SELL" | null
  portfolio: any | null
  onOrderPlaced: () => void
  drawer?: boolean
  session?: any
}

const ORDER_DIALOG_QUOTE_WARMUP_MS = 2_500

// Module-scope fallback wrappers used when `drawer={false}`. Defining these
// inline inside OrderDialog with `const Wrapper = drawer ? Drawer : (...) => ...`
// recreated a NEW component identity on every render, which React would treat
// as a different component type — unmounting and remounting all of OrderDialog's
// children (inputs, summary, header) and resetting any state inside them on
// every parent re-render. Hoisting to module scope makes the references stable.
function NonDrawerWrapper({ open, children }: { open?: boolean; children?: React.ReactNode }) {
  return open ? <>{children}</> : null
}
function NonDrawerContent({ children }: { children?: React.ReactNode }) {
  return <div className="p-4">{children}</div>
}

export function OrderDialog(props: OrderDialogProps) {
  const { isOpen, onClose, drawer } = props
  
  const {
    orderSide,
    setOrderSide,
    quantity,
    setQuantity,
    lots,
    setLots,
    price,
    setPrice,
    currentOrderType,
    setCurrentOrderType,
    selectedStock,
    isMarket,
    setIsMarket,
    liveQuote,
    availableMargin,
    marginRequired,
    brokerage,
    additionalCharges,
    chargeLineItems,
    totalCost,
    quoteFreshness,
    isMarketBlocked,
    sessionStatus,
    sessionReason,
    allowDevOrders,
    isDerivatives,
    lotSize,
    units,
    bidPrice,
    askPrice,
    handleSubmit
  } = useOrderForm({ ...props, isOpen })

  const { subscribe, unsubscribe } = useMarketDataStable()
  const [quoteWarmupActive, setQuoteWarmupActive] = useState(false)
  const subscribedKeys = useMemo(() => {
    const identity = resolveSubscriptionIdentity({
      token: selectedStock?.token,
      uirId: selectedStock?.uirId,
      instrumentId: selectedStock?.instrumentId,
      exchange: selectedStock?.exchange,
      segment: selectedStock?.segment,
    })
    if (identity.subscriptionKey == null) return []
    const key =
      typeof identity.subscriptionKey === "string"
        ? normalizeSubscriptionKey(identity.subscriptionKey)
        : identity.subscriptionKey
    return [key]
  }, [selectedStock?.instrumentId, selectedStock?.token, selectedStock?.exchange, selectedStock?.segment])

  useEffect(() => {
    if (!isOpen) return
    if (subscribedKeys.length === 0) return
    subscribe(subscribedKeys, "ltp")
    return () => {
      unsubscribe(subscribedKeys, "ltp")
    }
  }, [isOpen, subscribe, subscribedKeys, unsubscribe])

  useEffect(() => {
    if (!isOpen || !isMarket || subscribedKeys.length === 0) {
      setQuoteWarmupActive(false)
      return
    }
    setQuoteWarmupActive(true)
    const timeout = setTimeout(() => {
      setQuoteWarmupActive(false)
    }, ORDER_DIALOG_QUOTE_WARMUP_MS)
    return () => clearTimeout(timeout)
  }, [isOpen, isMarket, subscribedKeys])

  useEffect(() => {
    if (quoteFreshness?.isDisplayable) {
      setQuoteWarmupActive(false)
    }
  }, [quoteFreshness?.isDisplayable])

  // Vaul sets body { pointer-events: none } when a drawer opens and must restore it on close.
  // If the component unmounts mid-animation (selectedStock goes null), Vaul's cleanup may not run.
  // This effect is a safety net that always restores body pointer-events after the drawer closes.
  useEffect(() => {
    if (isOpen) return
    const t = setTimeout(() => {
      document.body.style.removeProperty('pointer-events')
    }, 350)
    return () => clearTimeout(t)
  }, [isOpen])

  // Determine wrapper components based on drawer prop. Both branches reference
  // stable component identities (Drawer / DrawerContent are imports; the
  // NonDrawer* fallbacks live at module scope), so the chosen wrapper doesn't
  // change identity on rerender and child state survives across renders.
  const Wrapper = drawer ? Drawer : NonDrawerWrapper
  const Content = drawer ? DrawerContent : NonDrawerContent
  
  const segmentUpper = selectedStock?.segment?.toUpperCase() || "NSE"
  const isBuy = orderSide === "BUY"
  const showQuoteWarmupState = Boolean(
    isMarket && quoteWarmupActive && (!quoteFreshness || !quoteFreshness.isDisplayable),
  )
  const shouldBlockMarketOnStale = Boolean(
    isMarket && !quoteWarmupActive && (!quoteFreshness || !quoteFreshness.isDisplayable),
  )
  
  // Dynamic Theme Colors - Solid, Premium
  const themeBorder = isBuy ? "border-emerald-500" : "border-rose-500"
  const themeBg = isBuy ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-rose-50 dark:bg-rose-950/30"

  // Keep this guard after hooks to preserve stable hook call order across renders.
  if (!selectedStock) return null

  return (
    <Wrapper open={isOpen} onOpenChange={onClose} direction="bottom">
      <Content className={cn(
        "flex flex-col max-w-md sm:max-w-lg lg:max-w-xl mx-auto w-full shadow-2xl transition-colors duration-300",
        "dark bg-[oklch(0.10_0_0)]",
        "rounded-t-3xl h-[90vh]",
        "border-t-4", themeBorder
      )}>
        {/* Sticky Header — instrument identity + BUY/SELL pill */}
        <div className="shrink-0 px-5 py-4 border-b border-[oklch(0.20_0_0)] bg-[oklch(0.12_0_0)] sticky top-0 z-20 rounded-t-[20px]">
          <div className="flex items-start justify-between gap-3">
            {/* Left: side pill + symbol + badges */}
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-md shrink-0",
                  isBuy
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"
                )}>
                  {isBuy ? "BUY" : "SELL"}
                </span>
                <span className="text-base font-bold tracking-tight text-gray-900 dark:text-gray-100 truncate">
                  {selectedStock?.symbol ?? "Order"}
                </span>
                {/* Exchange + segment badges */}
                <div className="flex gap-1 flex-wrap">
                  {selectedStock?.exchange && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      {selectedStock.exchange}
                    </span>
                  )}
                  {selectedStock?.segment === "NFO" && !selectedStock?.optionType && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400">
                      FUT
                    </span>
                  )}
                  {selectedStock?.segment === "NFO" && selectedStock?.optionType && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400">
                      {selectedStock.optionType}
                    </span>
                  )}
                </div>
              </div>
              {/* Derivatives sub-line: expiry · strike · option type */}
              {selectedStock?.segment === "NFO" && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium flex gap-1.5 flex-wrap">
                  {selectedStock.expiry && (
                    <span>Exp: {new Date(selectedStock.expiry).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })}</span>
                  )}
                  {selectedStock.strikePrice != null && selectedStock.optionType && (
                    <>
                      <span className="opacity-40">·</span>
                      <span>₹{selectedStock.strikePrice} {selectedStock.optionType}</span>
                    </>
                  )}
                  {selectedStock.lotSize && (
                    <>
                      <span className="opacity-40">·</span>
                      <span>Lot {selectedStock.lotSize}</span>
                    </>
                  )}
                </p>
              )}
              {selectedStock?.name && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[260px]">
                  {selectedStock.name}
                </p>
              )}
            </div>
            {/* Right: close button (non-drawer mode) */}
            {!drawer && (
              <button
                onClick={onClose}
                className="shrink-0 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors mt-0.5"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-hide bg-[oklch(0.10_0_0)]">
          {/* Bid / LTP / Ask panel */}
          <OrderHeader
            stock={selectedStock}
            orderSide={orderSide}
            quote={liveQuote as any}
            bidPrice={bidPrice}
            askPrice={askPrice}
          />

          {/* Status Pills */}
          {(isMarketBlocked || showQuoteWarmupState || shouldBlockMarketOnStale || (!isMarketBlocked && sessionStatus !== 'open' && allowDevOrders)) && (
            <div className="space-y-2">
              <AnimatePresence>
                {isMarketBlocked && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-medium"
                  >
                    <span>⚠️</span>
                    <span>
                      {sessionStatus === 'pre-open'
                        ? 'Pre-Open (09:00–09:15 IST): orders blocked.'
                        : segmentUpper.includes('MCX')
                          ? 'Market closed — MCX: 09:00–23:55 IST'
                          : 'Market closed — NSE: 09:15–15:30 IST'}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              {showQuoteWarmupState && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-[11px] font-medium">
                  <span>⌛</span>
                  <span>Syncing live quote — market orders unlock momentarily.</span>
                </div>
              )}
              {shouldBlockMarketOnStale && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-medium">
                  <span>ℹ️</span>
                  <span>Waiting for quote — market orders blocked until received.</span>
                </div>
              )}
              {!isMarketBlocked && sessionStatus !== 'open' && allowDevOrders && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-[11px] font-medium">
                  <span>🛠</span>
                  <span>Dev override — orders enabled outside market hours.</span>
                </div>
              )}
            </div>
          )}

          {/* Inputs Section */}
          <div className={cn("p-4 rounded-2xl border border-[oklch(0.20_0_0)]", themeBg)}>
            <OrderInputs
              isDerivatives={isDerivatives}
              lots={lots}
              setLots={setLots}
              quantity={quantity}
              setQuantity={setQuantity}
              price={price}
              setPrice={setPrice}
              isMarket={isMarket}
              setIsMarket={setIsMarket}
              currentOrderType={currentOrderType}
              setCurrentOrderType={setCurrentOrderType}
              isMarketBlocked={isMarketBlocked}
              lotSize={lotSize}
              units={units}
              segment={segmentUpper}
              orderSide={orderSide}
            />
          </div>

          {/* Summary Section */}
          <OrderSummary
            price={price}
            units={units}
            marginRequired={marginRequired}
            brokerage={brokerage}
            additionalCharges={additionalCharges}
            chargeLineItems={chargeLineItems}
            totalCost={totalCost}
            availableMargin={availableMargin}
            orderSide={orderSide}
          />
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-[oklch(0.12_0_0)] border-t border-[oklch(0.20_0_0)] p-5 space-y-4 pb-8 sm:pb-5 z-20">
          <div className="flex justify-end sm:hidden absolute top-4 right-4 pointer-events-none opacity-0">
             {/* Hidden close button for layout consistency if needed */}
          </div>
          
          <AnimatedBuySellSwitcher
            orderSide={orderSide}
            onSideChange={setOrderSide}
            onPlaceOrder={handleSubmit}
            loading={false}
            disabled={totalCost > availableMargin || isMarketBlocked || shouldBlockMarketOnStale}
          />
        </div>
      </Content>
    </Wrapper>
  )
}
