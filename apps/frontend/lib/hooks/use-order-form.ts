/**
 * @file use-order-form.ts
 * @module lib/hooks
 * @description Custom hook for managing order form state, calculations, and submission logic.
 * @author StockTrade
 * @created 2026-02-02
 * @updated 2026-03-28
 * @updated 2026-03-30 — Default product MIS; F&O uses tab ids MIS/CNC only (NRML state broke TabSelector).
 * @updated 2026-03-30 — Order charges fetch logging/dev toast; charge lineItems for OrderSummary breakdown.
 * @updated 2026-04-08 — Risk config fetch passes orderSide for option BUY vs SELL margin preview.
 * @updated 2026-04-08 — `minMarginPerLot` floor via shared `risk-required-margin` helpers.
 * @updated 2026-04-14 — Reactive market session: refresh force-close flag from server on mount so admin toggle takes effect without page reload.
 * @updated 2026-04-20 — Risk config fetch now sends credentials: include so session cookie reaches the auth-guarded endpoint.
 * @updated 2026-04-29 — Spread lock: hasPickedSpreadRef boolean replaces `=== 0` sentinel (so a legitimate 0% config doesn't look "unpicked"). Mid-open spreadConfig refreshes no longer re-roll the locked spread. SWR enables revalidateOnFocus + revalidateOnReconnect — admin spread changes propagate when the user's tab next regains focus or reconnects.
 *
 * Notes:
 * - Non-brokerage charges mirror `MarginCalculator` via `computeNonBrokerageCharges` and `/api/risk/order-charges-config`.
 */

import { useState, useEffect, useMemo, useRef } from "react"
import useSWR from "swr"
import { computeNonBrokerageCharges } from "@/lib/order-charges/compute"
import { DEFAULT_ORDER_CHARGES_CONFIG_V1 } from "@/lib/order-charges/defaults"
import type { NonBrokerageChargesResult, OrderChargesConfigV1 } from "@/lib/order-charges/types"
import { toast } from "@/hooks/use-toast"
import { placeOrder } from "@/lib/hooks/use-trading-data"
import { useMarketData } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { useRealtimeOrders } from "@/lib/hooks/use-realtime-orders"
import { useRealtimePositions } from "@/lib/hooks/use-realtime-positions"
import { useRealtimeAccount } from "@/lib/hooks/use-realtime-account"
import { getSegmentMarketSession, refreshMarketForceClosedFromServer } from "@/lib/hooks/market-timing"
import {
  normalizeOrderFormRiskConfigPayload,
  normalizeOrderFormStockData,
  parseFiniteOrderFormNumber,
} from "@/lib/hooks/order-form-normalization"
import { resolveQuoteFromMap } from "@/lib/market-data/quote-utils"
import { resolveDisplayQuoteSnapshot } from "@/lib/market-data/utils/quote-lookup"
import {
  getDefaultLeverage,
  resolveMarginFractionFromStoredRate,
} from "@/lib/services/risk/risk-config-defaults"
import { marginRiskSideForPlacementOrder } from "@/lib/services/risk/risk-margin-side"
import {
  applyShortOptionMinMarginPerLotFloor,
  computeBaseRequiredMarginFromTurnover,
} from "@/lib/services/risk/risk-required-margin"
import {
  DEFAULT_BID_ASK_SPREAD_CONFIG_V1,
  parseBidAskSpreadConfigJson,
  pickRandomSpread,
  type BidAskSpreadConfigV1,
} from "@/lib/market-display/bid-ask-spread-config.schema"

const MARKET_LIVE_QUOTE_MAX_AGE_MS = 5_000
const MARKET_DISPLAY_QUOTE_MAX_AGE_MS = 60_000

/**
 * Client-side mirror of isFOSegment from lib/server/instrument-segment-normalize.ts.
 * Returns true for any Indian derivative segment (equity F&O, commodity F&O, currency F&O).
 * Kept inline here to avoid importing from lib/server/ into a client hook.
 */
function isFOSegment(segment: string | null | undefined): boolean {
  if (typeof segment !== "string") return false
  const t = segment.trim().toUpperCase()
  if (!t) return false
  // *_FO suffix covers NSE_FO, BSE_FO, MCX_FO, NCO_FO, CDS_FO, BCD_FO
  if (t.endsWith("_FO")) return true
  return t === "NFO" || t === "BFO" || t === "FNO" || t === "MCX" ||
         t === "NCO" || t === "CDS" || t === "BCD"
}

const EMPTY_NON_BROKERAGE_CHARGES: NonBrokerageChargesResult = {
  byCode: {},
  lineItems: [],
  stt: 0,
  exchangeTransaction: 0,
  stampDuty: 0,
  gst: 0,
  other: 0,
  total: 0,
}

export interface OrderFormProps {
  stock: any | null
  portfolio: any | null
  onOrderPlaced: () => void
  onClose: () => void
  session?: any
  initialOrderSide?: "BUY" | "SELL" | null
  /** Whether the order sheet is open — used to lock the spread on each open. */
  isOpen?: boolean
}

const spreadConfigFetcher = (url: string) =>
  fetch(url, { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => parseBidAskSpreadConfigJson(d?.data ?? null))

export function useOrderForm({
  stock,
  portfolio,
  onOrderPlaced,
  onClose,
  session,
  initialOrderSide,
  isOpen,
}: OrderFormProps) {
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY")
  const [quantity, setQuantity] = useState(1)
  const [lots, setLots] = useState(1)
  const [price, setPrice] = useState<number | null>(null)
  const [currentOrderType, setCurrentOrderType] = useState("MIS")
  const [selectedStock, setSelectedStock] = useState<any>(() => normalizeOrderFormStockData(stock))
  const [isMarket, setIsMarket] = useState(true)
  const [riskConfig, setRiskConfig] = useState<{
    leverage: number
    marginRate: number | null
    brokerageFlat: number | null
    brokerageRate: number | null
    brokerageCap: number | null
    minMarginPerLot: number | null
  } | null>(null)
  const [orderChargesConfig, setOrderChargesConfig] = useState<OrderChargesConfigV1 | null>(null)
  const submittingRef = useRef(false)
  /** Spread % locked at the moment the order sheet opens — stable for the entire open session. */
  const lockedSpreadRef = useRef<number>(0)
  /** Mirror of lockedSpreadRef as state so useMemo can react to the change. */
  const [lockedSpreadState, setLockedSpreadState] = useState<number>(0)
  /** True iff the spread has been picked for the current open session. Independent of
   *  the locked value so a legitimate 0% spread config does not look like "not picked". */
  const hasPickedSpreadRef = useRef<boolean>(false)
  const prevIsOpenRef = useRef<boolean>(false)

  /** Fetch per-segment spread config — SWR caches it across all hook instances.
   *  Refetches on mount, on tab focus, and on network reconnect. The open-edge gate
   *  in the spread-pick effect below ensures the locked spread doesn't re-roll
   *  mid-order even if a refetch arrives while the sheet is visible. Admin saves
   *  in MarketControlPanel fire a Redis pub/sub event that triggers SWR cache
   *  invalidation here so the user always sees the latest spread config. */
  const { data: spreadConfig, mutate: mutateSpreadConfig } = useSWR<BidAskSpreadConfigV1>(
    "/api/admin/market-controls/spread-config",
    spreadConfigFetcher,
    {
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      revalidateOnReconnect: true,
      dedupingInterval: 5_000,
    },
  )

  // Subscribe to Redis pub/sub so admin spread changes propagate to all open order sheets
  // without requiring tab focus or page reload.
  useEffect(() => {
    let unsub: (() => void) | undefined
    import("@/lib/market-control/market-control-pubsub")
      .then(({ subscribeConfigChanged }) =>
        subscribeConfigChanged(() => {
          void mutateSpreadConfig()
        })
      )
      .then((fn) => { unsub = fn })
      .catch(() => {})
    return () => { unsub?.() }
  }, [mutateSpreadConfig])

  const { quotes, warmupQuote } = useMarketData()
  const q = useMemo(() => {
    if (!selectedStock) {
      return null
    }
    return resolveQuoteFromMap(quotes as Record<string, any> | undefined, {
      token: selectedStock.token,
      instrumentId: selectedStock.instrumentId,
    })
  }, [quotes, selectedStock])
  const liveQuoteSnapshot = useMemo(() => {
    const priceSnapshot = resolveDisplayQuoteSnapshot({
      quote: (q as any) ?? null,
      fallbackPrice: selectedStock?.ltp,
      fallbackClose: selectedStock?.close,
      liveMaxAgeMs: MARKET_LIVE_QUOTE_MAX_AGE_MS,
      displayMaxAgeMs: MARKET_DISPLAY_QUOTE_MAX_AGE_MS,
    })
    return {
      liveLtp: priceSnapshot.source === "LIVE" && (priceSnapshot.tradePrice ?? 0) > 0
        ? priceSnapshot.tradePrice
        : null,
      tradeLtp: priceSnapshot.tradePrice,
      displayLtp: priceSnapshot.uiPrice,
      timestampMs: priceSnapshot.quoteTimestampMs,
      quoteAgeMs: priceSnapshot.quoteAgeMs,
      isFresh: priceSnapshot.isFresh,
      isDisplayable: priceSnapshot.isDisplayable,
      source: priceSnapshot.source,
    }
  }, [q, selectedStock?.close, selectedStock?.ltp])

  // Get realtime hooks for immediate UI updates
  const userId = session?.user?.id
  const { 
    optimisticUpdate: optimisticUpdateOrder, 
    resolveOptimisticOrder,
    rejectOptimisticOrder,
    refresh: refreshOrders
  } = useRealtimeOrders(userId)
  const { optimisticAddPosition, refresh: refreshPositions } = useRealtimePositions(userId)
  const { optimisticBlockMargin, optimisticReleaseMargin, optimisticUpdateBalance, refresh: refreshAccount } = useRealtimeAccount(userId)

  useEffect(() => {
    const normalized = normalizeOrderFormStockData(stock)
    setSelectedStock(normalized)
    if (normalized) {
      setOrderSide(initialOrderSide === "SELL" ? "SELL" : "BUY")
      setPrice(normalized.ltp ?? null)
      if (isFOSegment(normalized.segment)) {
        // F&O default: NRML (carryforward). Mirrors what most retail brokers default to and
        // what the server's normalizeOrderProductType falls back to for F&O when unset.
        setCurrentOrderType("NRML")
        const baseLot = Math.max(1, Math.trunc(parseFiniteOrderFormNumber(normalized.lot_size) ?? 1))
        setLots(1)
        setQuantity(baseLot)
      } else {
        setQuantity(1)
        setLots(1)
        setCurrentOrderType("MIS")
      }
    }
  }, [stock, initialOrderSide])

  useEffect(() => {
    if (!isMarket) {
      return
    }
    const liveMarketPrice = liveQuoteSnapshot.displayLtp
    if (liveMarketPrice != null && liveMarketPrice > 0) {
      setPrice((previousPrice) => (previousPrice === liveMarketPrice ? previousPrice : liveMarketPrice))
    }
  }, [isMarket, liveQuoteSnapshot.displayLtp])

  // Derived helpers
  const segmentUpper = (selectedStock?.segment || selectedStock?.exchange || "NSE")?.toUpperCase()
  // Canonical F&O predicate — mirrors isFOSegment() in lib/server/instrument-segment-normalize.ts.
  // Covers *_FO suffix + legacy aliases (NFO, BFO, FNO, MCX) plus the currency/commodity F&O
  // families (NCO_FO, CDS/CDS_FO, BCD/BCD_FO) that were previously treated as equity and got
  // wrong unit sizing (quantity instead of lots × lotSize).
  const isDerivatives = isFOSegment(segmentUpper)
  const lotSize = Math.max(1, Math.trunc(parseFiniteOrderFormNumber(selectedStock?.lot_size) ?? 1))
  const units = isDerivatives ? Math.max(1, lots) * lotSize : quantity

  // Fetch risk config from server to mirror backend
  useEffect(() => {
    let ignore = false
    async function load() {
      if (!selectedStock) return
      const prod = currentOrderType.toUpperCase()
      const seg = segmentUpper
      try {
        const opt = selectedStock?.optionType ? String(selectedStock.optionType) : ''
        const side = orderSide === 'SELL' ? 'SELL' : 'BUY'
        const res = await fetch(
          `/api/risk/config?segment=${encodeURIComponent(seg)}&productType=${encodeURIComponent(prod)}${
            opt ? `&optionType=${encodeURIComponent(opt)}` : ''
          }&orderSide=${encodeURIComponent(side)}`,
          {
            cache: 'no-store',
            credentials: 'include',
            // 8s timeout. The risk config feeds margin/leverage UI; a hung
            // request leaves the order form on the previous instrument's
            // numbers (or the defaults) without surfacing the failure.
            signal: AbortSignal.timeout(8_000),
          },
        )
        if (!res.ok) throw new Error(`Failed to load risk config ${res.status}`)
        const data = await res.json()
        if (!ignore && data?.success && data?.data) {
          setRiskConfig(normalizeOrderFormRiskConfigPayload(data.data))
        }
      } catch (e) {
        // Silent fail; UI will fallback to defaults
        if (!ignore) setRiskConfig(null)
      }
    }
    load()
    return () => { ignore = true }
  }, [selectedStock, currentOrderType, segmentUpper, selectedStock?.optionType, orderSide])

  useEffect(() => {
    let ignore = false
    async function loadOrderCharges() {
      if (!userId) {
        if (!ignore) setOrderChargesConfig(null)
        return
      }
      try {
        const res = await fetch("/api/risk/order-charges-config", {
          cache: "no-store",
          // 8s timeout. The order-charges config feeds the brokerage breakdown
          // shown next to "Total cost"; the default-preview fallback already
          // catches any error path. Without a timeout, a hung backend left the
          // order form unable to refresh charges for the current order side.
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[ORDER-FORM] order-charges-config HTTP", res.status)
          }
          throw new Error(`order-charges ${res.status}`)
        }
        const data = await res.json()
        if (!ignore && data?.success && data?.data) {
          setOrderChargesConfig(data.data as OrderChargesConfigV1)
        }
      } catch (e) {
        // Default charge preview already kicks in below (toast in dev only).
        // Was firing on every order-form mount + any focus-revalidate flap; now silent in prod.
        if (process.env.NODE_ENV === "development") {
          console.warn("[ORDER-FORM] order-charges-config fetch failed; using default charge preview", e)
        }
        if (
          !ignore &&
          typeof process !== "undefined" &&
          process.env.NODE_ENV === "development"
        ) {
          toast({
            title: "Order charges",
            description: "Could not load admin charges config; tax preview uses built-in defaults.",
            duration: 4000,
          })
        }
        if (!ignore) setOrderChargesConfig(null)
      }
    }
    loadOrderCharges()
    return () => {
      ignore = true
    }
  }, [userId])

  const availableMargin = portfolio?.account?.availableMargin || 0

  // Margin calculation logic - matches backend MarginCalculator
  const marginRequired = useMemo(() => {
    if (!selectedStock || !price || units <= 0) return 0
    const turnover = units * price

    const productType = currentOrderType.toUpperCase()
    const leverage =
      riskConfig?.leverage ?? getDefaultLeverage(segmentUpper, productType)
    const marginFraction = resolveMarginFractionFromStoredRate(riskConfig?.marginRate ?? null)
    const baseRequiredMargin = computeBaseRequiredMarginFromTurnover(turnover, leverage, marginFraction)
    const marginRiskSide = marginRiskSideForPlacementOrder(orderSide)
    return applyShortOptionMinMarginPerLotFloor({
      baseRequiredMargin,
      optionType: selectedStock?.optionType ?? null,
      marginRiskSide,
      quantity: units,
      lotSize,
      minMarginPerLot: riskConfig?.minMarginPerLot ?? null,
    })
  }, [selectedStock, units, price, currentOrderType, riskConfig, segmentUpper, orderSide, lotSize])

  // Brokerage calculation - matches backend logic exactly
  const brokerage = useMemo(() => {
    if (!selectedStock || !price || units <= 0) return 0
    const turnover = units * price
    const segment = segmentUpper

    // Prefer DB-configured brokerage
    if (riskConfig) {
      if (riskConfig.brokerageFlat != null) {
        return riskConfig.brokerageFlat
      }
      if (riskConfig.brokerageRate != null) {
        const rate = riskConfig.brokerageRate
        let br = turnover * rate
        if (riskConfig.brokerageCap != null) {
          br = Math.min(br, riskConfig.brokerageCap)
        }
        return br
      }
    }

    // Fallbacks mirroring MarginCalculator defaults
    if (segment === "NSE" || segment === "NSE_EQ") {
      return Math.min(20, turnover * 0.0003)
    }
    if (segment === "NFO" || segment === "FNO") {
      return 20
    }
    // MCX and others default to flat 20
    return 20
  }, [selectedStock, units, price, riskConfig, segmentUpper])

  const chargesProfile = orderChargesConfig ?? DEFAULT_ORDER_CHARGES_CONFIG_V1

  const nonBrokerageCharges = useMemo((): NonBrokerageChargesResult => {
    if (!selectedStock || !price || units <= 0) {
      return EMPTY_NON_BROKERAGE_CHARGES
    }
    const turnover = units * price
    return computeNonBrokerageCharges(
      {
        segment: segmentUpper,
        productType: currentOrderType.toUpperCase(),
        orderSide,
        turnover,
        brokerage,
      },
      chargesProfile,
    )
  }, [
    selectedStock,
    price,
    units,
    segmentUpper,
    currentOrderType,
    orderSide,
    brokerage,
    chargesProfile,
  ])

  /** Non-brokerage total (exact); display `additionalCharges` as complement to brokerage after floor below. */
  const additionalCharges = nonBrokerageCharges.total

  /** Matches `MarginCalculator`: floor(brokerage + non-brokerage). */
  const totalCharges = useMemo(
    () => Math.floor(Math.max(0, brokerage + nonBrokerageCharges.total)),
    [brokerage, nonBrokerageCharges.total],
  )
  const totalCost = marginRequired + totalCharges

  // Reactive market session — re-fetches force-close flag from server on mount/stock change so
  // that admin toggling force-close is reflected without a full page reload.
  const [marketSession, setMarketSession] = useState(() => getSegmentMarketSession(segmentUpper))
  useEffect(() => {
    // Sync immediately (covers segment change)
    setMarketSession(getSegmentMarketSession(segmentUpper))
    // Then fetch the authoritative force-close flag and re-derive
    void refreshMarketForceClosedFromServer().then(() => {
      setMarketSession(getSegmentMarketSession(segmentUpper))
    })
  }, [segmentUpper])
  const sessionStatus = marketSession.session
  const sessionReason = marketSession.reason
  const allowDevOrders = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ALLOW_DEV_ORDERS === 'true'
  const isMarketBlocked = !allowDevOrders && sessionStatus !== 'open'

  // Pick a random spread ONCE per open session so the user pays exactly what the order
  // sheet showed at the moment they opened it. The hasPickedSpreadRef boolean (NOT the
  // numeric value) marks "not yet picked this session" — a legitimate 0% spread config
  // is therefore distinguishable from the unset state. Covers both the closed→open edge
  // AND the case where selectedStock loads async after isOpen flips true. Mid-open
  // spreadConfig refreshes (admin save, SSE push, focus revalidation) must NOT re-roll
  // — that would silently change the price between display and Place click. The
  // freshly-fetched spreadConfig is honoured on the NEXT open (close resets the flag).
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current
    prevIsOpenRef.current = isOpen ?? false
    if (isOpen && selectedStock && !hasPickedSpreadRef.current) {
      const spread = pickRandomSpread(spreadConfig ?? DEFAULT_BID_ASK_SPREAD_CONFIG_V1, segmentUpper)
      lockedSpreadRef.current = spread
      setLockedSpreadState(spread)
      hasPickedSpreadRef.current = true
    } else if (wasOpen && !isOpen) {
      lockedSpreadRef.current = 0
      setLockedSpreadState(0)
      hasPickedSpreadRef.current = false
    }
  }, [isOpen, selectedStock, spreadConfig, segmentUpper])

  // Compute synthetic bid/ask from display LTP + locked spread.
  // Uses lockedSpreadState (not ref) so React re-evaluates when spread is set.
  const displayLtp = liveQuoteSnapshot.displayLtp ?? selectedStock?.ltp ?? null
  const { bidPrice, askPrice } = useMemo(() => {
    if (!displayLtp || displayLtp <= 0 || lockedSpreadState <= 0) {
      return { bidPrice: null, askPrice: null }
    }
    const halfSpread = lockedSpreadState / 2 / 100
    return {
      bidPrice: Number((displayLtp * (1 - halfSpread)).toFixed(2)),
      askPrice: Number((displayLtp * (1 + halfSpread)).toFixed(2)),
    }
  }, [displayLtp, lockedSpreadState])

  const handleSubmit = async () => {
    if (submittingRef.current) return
    submittingRef.current = true

    if (!selectedStock) {
      toast({ title: "Select a Stock", description: "Please pick a stock first.", variant: "destructive" })
      submittingRef.current = false
      return
    }

    if (!portfolio?.account?.id) {
      toast({ title: "Trading Account Missing", description: "No trading account available for this user.", variant: "destructive" })
      submittingRef.current = false
      return
    }

    if (!session?.user?.id) {
      toast({ title: "Not Signed In", description: "Please sign in to place orders.", variant: "destructive" })
      submittingRef.current = false
      return
    }

    if (!allowDevOrders && sessionStatus !== 'open') {
      // Show segment-specific error message
      const errorMessage = sessionReason || 
        (segmentUpper.includes('MCX') 
          ? "MCX orders are allowed between 09:00–23:55 IST."
          : "NSE orders are allowed between 09:15–15:30 IST.")
      
      toast({
        title: "Market Closed",
        description: errorMessage,
        variant: "destructive"
      })
      submittingRef.current = false
      return
    }

    if (units <= 0) {
      toast({ title: "Invalid Order", description: "Check quantity and price.", variant: "destructive" })
      submittingRef.current = false
      return
    }

    if (totalCost > availableMargin) {
      toast({
        title: "Insufficient Margin",
        description: `Need ₹${totalCost.toFixed(2)} (margin + charges) but only have ₹${availableMargin.toFixed(2)}`,
        variant: "destructive",
      })
      submittingRef.current = false
      return
    }

    let submitQuoteSnapshot = liveQuoteSnapshot
    if (isMarket && (!submitQuoteSnapshot.isFresh || !submitQuoteSnapshot.isDisplayable)) {
      toast({
        title: "Refreshing live price...",
        description: "Syncing latest quote before placing your market order.",
        duration: 1200,
      })
      const warmedQuote = await warmupQuote({
        token: selectedStock.token,
        uirId: selectedStock.uirId,
        instrumentId: selectedStock.instrumentId,
        exchange: selectedStock.exchange,
        segment: selectedStock.segment,
        waitFreshMs: 1_200,
        liveMaxAgeMs: MARKET_LIVE_QUOTE_MAX_AGE_MS,
        displayMaxAgeMs: MARKET_DISPLAY_QUOTE_MAX_AGE_MS,
      })
      const warmedSnapshot = resolveDisplayQuoteSnapshot({
        quote: warmedQuote.quote,
        fallbackPrice: selectedStock?.ltp,
        fallbackClose: selectedStock?.close,
        liveMaxAgeMs: MARKET_LIVE_QUOTE_MAX_AGE_MS,
        displayMaxAgeMs: MARKET_DISPLAY_QUOTE_MAX_AGE_MS,
      })
      submitQuoteSnapshot = {
        liveLtp: warmedSnapshot.source === "LIVE" && (warmedSnapshot.tradePrice ?? 0) > 0
          ? warmedSnapshot.tradePrice
          : null,
        tradeLtp: warmedSnapshot.tradePrice,
        displayLtp: warmedSnapshot.uiPrice,
        timestampMs: warmedSnapshot.quoteTimestampMs,
        quoteAgeMs: warmedSnapshot.quoteAgeMs,
        isFresh: warmedSnapshot.isFresh,
        isDisplayable: warmedSnapshot.isDisplayable,
        source: warmedSnapshot.source,
      }
    }
    if (isMarket && !submitQuoteSnapshot.isDisplayable) {
      toast({
        title: "Live Quote Required",
        description:
          "Unable to refresh a recent quote (<=60s). Please retry in a moment or place a LIMIT order.",
        variant: "destructive",
      })
      submittingRef.current = false
      return
    }

    const normalizedPrice = parseFiniteOrderFormNumber(price)
    const normalizedLtp = parseFiniteOrderFormNumber(selectedStock.ltp)
    const submitTradeLtp =
      submitQuoteSnapshot.tradeLtp != null && submitQuoteSnapshot.tradeLtp > 0
        ? submitQuoteSnapshot.tradeLtp
        : null
    // Server is sole authority for MARKET acceptance; client sends best-available price and metadata.
    const orderPrice = isMarket
      ? (submitTradeLtp != null && submitTradeLtp > 0 ? submitTradeLtp : normalizedLtp ?? 0)
      : normalizedPrice !== null && normalizedPrice > 0
        ? normalizedPrice
        : submitTradeLtp !== null && submitTradeLtp > 0
          ? submitTradeLtp
          : normalizedLtp !== null && normalizedLtp > 0
            ? normalizedLtp
            : 0
    if (!orderPrice || orderPrice <= 0) {
      toast({ 
        title: "Invalid Price", 
        description: "Cannot determine price for order. Please refresh and try again.", 
        variant: "destructive" 
      })
      submittingRef.current = false
      return
    }

    const instrumentId = selectedStock.instrumentId || (selectedStock.exchange && selectedStock.token != null
      ? `${selectedStock.exchange}-${selectedStock.token}`
      : undefined)
    const tempOrderId = `temp-${Date.now()}`
    const timestamp = new Date().toISOString()

    try {
      optimisticUpdateOrder({
        id: tempOrderId,
        symbol: selectedStock.symbol,
        quantity: orderSide === "BUY" ? units : -units,
        orderType: isMarket ? "MARKET" : "LIMIT",
        orderSide,
        price: orderPrice,
        averagePrice: orderPrice,
        filledQuantity: 0,
        productType: currentOrderType === "MIS" ? "INTRADAY" : currentOrderType === "NRML" ? "NRML" : "DELIVERY",
        status: "PENDING",
        createdAt: timestamp,
        executedAt: null,
        stock: selectedStock
      })
    } catch (e) {
      console.error("❌ [ORDER-DIALOG] Optimistic order update failed:", e)
    }

    try { 
      optimisticBlockMargin(marginRequired)
    } catch (e) {
      console.error("❌ [ORDER-DIALOG] Optimistic margin block failed:", e)
    }

    toast({ 
      title: "Order Submitted", 
      description: `${orderSide} ${Math.abs(units)} ${selectedStock.symbol} @ ₹${orderPrice.toFixed(2)} - Processing...`,
      duration: 2000
    })

    onOrderPlaced()
    onClose()

    const finalizeOrder = async () => {
      try {
        const result = await placeOrder({
          tradingAccountId: portfolio.account.id,
          userId: session?.user?.id,
          userName: session?.user?.name,
          userEmail: session?.user?.email,
          stockId: selectedStock.stockId,
          symbol: selectedStock.symbol,
          quantity: units,
          price: orderPrice,
          orderType: isMarket ? "MARKET" : "LIMIT",
          orderSide,
          segment: selectedStock.segment,
          exchange: selectedStock.exchange,
          productType: currentOrderType === "MIS" ? "INTRADAY" : currentOrderType === "NRML" ? "NRML" : "DELIVERY",
          instrumentId,
          token: selectedStock.token,
          name: selectedStock.name,
          ltp: submitTradeLtp ?? selectedStock.ltp,
          ltpTimestamp: submitQuoteSnapshot.timestampMs ?? undefined,
          ltpSource: submitQuoteSnapshot.isFresh ? "LIVE_QUOTE" : "SNAPSHOT_FALLBACK",
          ltpAgeMs: submitQuoteSnapshot.quoteAgeMs ?? undefined,
          close: selectedStock.close,
          strikePrice: selectedStock.strikePrice,
          optionType: selectedStock.optionType,
          expiry: selectedStock.expiry,
          lotSize: selectedStock.lot_size,
          watchlistItemId: selectedStock.watchlistItemId,
          spreadOverride: lockedSpreadRef.current > 0 ? lockedSpreadRef.current : undefined,
          session
        })

        if (process.env.NODE_ENV === "development") {
          console.debug("✅ [ORDER-DIALOG] Order submitted successfully:", result)
        }
        const backendOrderId = result?.orderId ?? null
        const backendStatus = typeof result?.status === "string" ? result.status.toUpperCase() : "PENDING"
        const backendFailureReason =
          typeof result?.failureReason === "string" && result.failureReason.trim().length > 0
            ? result.failureReason.trim()
            : null
        if (backendOrderId) {
          if (backendStatus === "CANCELLED") {
            resolveOptimisticOrder(tempOrderId, {
              id: backendOrderId,
              status: "CANCELLED",
              executedAt: null,
              filledQuantity: 0,
              failureReason: backendFailureReason ?? "Exchange rejected order.",
            })
            try { optimisticReleaseMargin(marginRequired) } catch {}
          } else {
            resolveOptimisticOrder(tempOrderId, {
              id: backendOrderId,
              // Backend now returns quickly with async execution; keep UI pending until realtime updates arrive.
              status: "PENDING",
              executedAt: null,
              filledQuantity: 0,
              failureReason: null,
            })
          }
        } else {
          resolveOptimisticOrder(tempOrderId)
        }

        Promise.allSettled([
          refreshOrders(),
          refreshPositions(),
          refreshAccount()
        ]).catch(() => {})

        toast({
          title: backendStatus === "CANCELLED" ? "Order Rejected" : "Order Confirmed",
          description: backendStatus === "CANCELLED"
            ? backendFailureReason ?? `Order #${backendOrderId?.slice(0, 8) || "N/A"} was rejected.`
            : backendOrderId
              ? `Order #${backendOrderId.slice(0, 8)} placed successfully.`
              : `${selectedStock.symbol} order accepted.`,
          duration: 3500,
          variant: backendStatus === "CANCELLED" ? "destructive" : "default",
        })
      } catch (error: any) {
        console.error("❌ [ORDER-DIALOG] Backend order placement failed:", error)
        rejectOptimisticOrder(tempOrderId, error?.message)
        try { optimisticReleaseMargin(marginRequired) } catch {}
        Promise.allSettled([
          refreshOrders(),
          refreshAccount()
        ]).catch(() => {})

        let errorMessage = "Please try again."
        let errorTitle = "Failed to Place Order"
        
        if (error?.message) {
          if (error.message.includes("Insufficient funds")) {
            errorTitle = "Insufficient Funds"
            errorMessage = error.message
          } else if (error.message.includes("Stock not found")) {
            errorTitle = "Stock Not Available"
            errorMessage = "Please refresh the stock data and try again."
          } else if (error.message.includes("Invalid price")) {
            errorTitle = "Invalid Price"
            errorMessage = "Cannot determine valid price. Please refresh and try again."
          } else if (error.message.includes("timeout") || error.message.includes("timed out")) {
            errorTitle = "Order Timeout"
            errorMessage = "Order took too long to process. Please check your orders tab."
          } else if (error.message.includes("network") || error.message.includes("fetch")) {
            errorTitle = "Network Error"
            errorMessage = "Please check your connection and try again."
          } else {
            errorMessage = error.message
          }
        }
        
        toast({ 
          title: errorTitle, 
          description: errorMessage, 
          variant: "destructive",
          duration: 7000
        })
      } finally {
        submittingRef.current = false
      }
    }

    finalizeOrder()
  }

  return {
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
    riskConfig,
    leverage:
      riskConfig?.leverage ?? getDefaultLeverage(segmentUpper, currentOrderType),
    liveQuote: q,
    quoteFreshness: {
      isFresh: liveQuoteSnapshot.isFresh,
      isDisplayable: liveQuoteSnapshot.isDisplayable,
      quoteAgeMs: liveQuoteSnapshot.quoteAgeMs,
      source: liveQuoteSnapshot.source,
    },
    availableMargin,
    marginRequired,
    brokerage,
    additionalCharges,
    chargeLineItems: nonBrokerageCharges.lineItems,
    totalCost,
    isMarketBlocked,
    sessionStatus,
    sessionReason,
    allowDevOrders,
    isDerivatives,
    lotSize,
    units,
    bidPrice,
    askPrice,
    spreadPercent: lockedSpreadRef.current,
    handleSubmit
  }
}
