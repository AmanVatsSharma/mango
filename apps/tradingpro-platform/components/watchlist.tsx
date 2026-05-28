/**
 * @file watchlist.tsx
 * @module components
 * @description Watchlist panel rendering with optimistic add/remove and token-first live quote resolution.
 * @author StockTrade
 * @created 2026-02-16
 */
"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Eye, Plus, X, Loader2 } from "lucide-react"
import { useSession } from "next-auth/react"
import { toast } from "@/hooks/use-toast"

import { StockSearch } from "./stock-search"
import { addStockToWatchlist, removeStockFromWatchlist } from "@/lib/hooks/use-trading-data"
import { formatExpiryDateIST } from "@/lib/date-utils"
import {
  parseNonNegativeMarketNumber,
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
  resolveDisplayPriceFromQuote,
  resolveQuoteFromMap,
} from "@/lib/market-data/quote-utils"

interface WatchlistItemData {
  id: string
  instrumentId: string
  token?: number
  symbol: string
  name: string
  ltp: number
  close: number
  watchlistItemId: string
  segment?: string
  strikePrice?: number
  optionType?: string
  expiry?: string
  lotSize?: number
  optimistic?: boolean
}

interface WatchlistProps {
  watchlist: { id: string | null; name: string; items: WatchlistItemData[] }
  quotes: Record<string, { last_trade_price?: number; display_price?: number; actual_price?: number }>
  onSelectStock: (stock: any) => void
  onUpdate: () => void
}

export function Watchlist({ watchlist, quotes, onSelectStock, onUpdate }: WatchlistProps) {
  const { data: session } = useSession()
  const [searchOpen, setSearchOpen] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [optimisticItems, setOptimisticItems] = useState<WatchlistItemData[]>([])

  const combinedItems = useMemo(() => {
    return [...optimisticItems, ...(watchlist?.items || [])]
  }, [optimisticItems, watchlist])

  // --- Correct Logic (from 2nd file) ---
  const buildPlaceholderItem = (input: string | Record<string, any>, tempId: string): WatchlistItemData => {
    if (typeof input === "string") {
      return {
        id: tempId,
        instrumentId: tempId,
        symbol: "Syncing…",
        name: "Adding instrument",
        ltp: 0,
        close: 0,
        watchlistItemId: tempId,
        optimistic: true
      }
    }

    const symbolCandidate = typeof input.symbol === "string" ? input.symbol.trim() : ""
    const tickerCandidate = typeof input.ticker === "string" ? input.ticker.trim() : ""
    const nameCandidate = typeof input.name === "string" ? input.name.trim() : ""
    const descriptionCandidate = typeof input.description === "string" ? input.description.trim() : ""
    const symbol = symbolCandidate || tickerCandidate || nameCandidate || "Pending"
    const name = nameCandidate || descriptionCandidate || symbol
    const normalizedLtp =
      parseNonNegativeMarketNumber(input.ltp) ??
      parseNonNegativeMarketNumber(input.last_price) ??
      0
    const close =
      parseNonNegativeMarketNumber(input.close) ??
      parseNonNegativeMarketNumber(input.previousClose) ??
      normalizedLtp
    const strikePrice =
      parseNonNegativeMarketNumber(input.strikePrice) ??
      parseNonNegativeMarketNumber(input.strike_price) ??
      undefined
    const lotSize =
      parsePositiveIntegerMarketNumber(input.lotSize) ??
      parsePositiveIntegerMarketNumber(input.lot_size) ??
      undefined
    const optionTypeCandidate = typeof input.optionType === "string" ? input.optionType.trim().toUpperCase() : undefined
    const optionTypeFallback = typeof input.option_type === "string" ? input.option_type.trim().toUpperCase() : undefined
    const optionType = optionTypeCandidate || optionTypeFallback
    const instrumentIdCandidate = typeof input.instrumentId === "string" ? input.instrumentId.trim() : ""
    const exchangeCandidate = typeof input.exchange === "string" ? input.exchange.trim() : ""
    const segmentCandidate = typeof input.segment === "string" ? input.segment.trim().toUpperCase() : undefined
    const tokenCandidate =
      parsePositiveIntegerMarketNumber(input.token) ??
      parseTokenFromInstrumentId(instrumentIdCandidate)

    return {
      id: tempId,
      instrumentId: instrumentIdCandidate || exchangeCandidate || symbol,
      token: tokenCandidate ?? undefined,
      symbol,
      name,
      ltp: normalizedLtp,
      close,
      watchlistItemId: tempId,
      segment: segmentCandidate,
      strikePrice,
      optionType,
      expiry: input.expiry ?? input.expiry_date,
      lotSize,
      optimistic: true
    }
  }

  const handleAddStock = (stockInput: string | Record<string, any>) => {
    if (!session?.user?.id) {
      toast({
        title: "Not Signed In",
        description: "Please sign in to manage your watchlist.",
        variant: "destructive",
      })
      return Promise.reject(new Error("Not signed in"))
    }

    const tempId = `watchlist-temp-${Date.now()}`
    const placeholder = buildPlaceholderItem(stockInput, tempId)
    setOptimisticItems((prev) => [placeholder, ...prev])
    setSearchOpen(false)

    const stockId = typeof stockInput === "string"
      ? stockInput
      : stockInput.stockId || stockInput.id

    if (!stockId) {
      const error = new Error("Missing stock identifier")
      toast({
        title: "Failed to Add",
        description: "Instrument metadata is incomplete.",
        variant: "destructive",
      })
      setOptimisticItems((prev) => prev.filter(item => item.watchlistItemId !== tempId))
      return Promise.reject(error)
    }

    const addPromise = (async () => {
      try {
        await addStockToWatchlist(session.user!.id, stockId, watchlist.id)
        toast({ title: "Stock Added", description: "Successfully added to your watchlist." })
        await onUpdate()
      } catch (error) {
        toast({
          title: "Failed to Add",
          description: error instanceof Error ? error.message : "Could not add stock.",
          variant: "destructive",
        })
        throw error
      } finally {
        setOptimisticItems((prev) => prev.filter(item => item.watchlistItemId !== tempId))
      }
    })()

    return addPromise
  }

  const handleRemoveStock = async (itemId: string) => {
    setRemovingId(itemId)
    try {
      await removeStockFromWatchlist(itemId)
      toast({ title: "Stock Removed", description: "Successfully removed from your watchlist." })
      onUpdate()
    } catch (error) {
      toast({
        title: "Failed to Remove",
        description: error instanceof Error ? error.message : "Could not remove stock.",
        variant: "destructive",
      })
    } finally {
      setRemovingId(null)
    }
  }

  // --- UI (from 1st file) ---
  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Watchlist</h2>
        </div>
        <Button onClick={() => setSearchOpen(true)} className="rounded-full h-10 w-10 p-0 bg-blue-600 hover:bg-blue-700">
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <div className="grid gap-4">
        {combinedItems.length === 0 ? (
          <Card className="rounded-xl shadow-md border-gray-100 p-6 text-center text-gray-500">
            <p>Your watchlist is empty. Add some stocks to get started!</p>
          </Card>
        ) : (
          combinedItems.map((item) => {
            const quote = resolveQuoteFromMap(quotes, {
              token: item.token ?? parseTokenFromInstrumentId(item.instrumentId),
              instrumentId: item.instrumentId,
            })
            const ltp = resolveDisplayPriceFromQuote(quote, item.ltp)
            const closeBase = parseNonNegativeMarketNumber(item.close) ?? ltp
            const change = ltp - closeBase
            const changePercent = closeBase > 0 ? (change / closeBase) * 100 : 0
            const isFutures = item.segment === "NFO" && !item.optionType
            const isOption = item.segment === "NFO" && !!item.optionType
            return (
              <Card
                key={item.watchlistItemId}
                onClick={() => onSelectStock({ ...item, ltp, close: closeBase, change, changePercent })}
                className="group relative rounded-xl shadow-md border-gray-100 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer overflow-hidden bg-white dark:bg-gray-800"
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1 overflow-hidden pr-10">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">{item.symbol}</span>
                      {item.optimistic && (
                        <span className="text-[10px] text-amber-600">Syncing…</span>
                      )}
                      {isFutures && <span className="bg-blue-100 text-blue-700 rounded px-2 py-0.5 text-xs">FUT</span>}
                      {isOption && <span className="bg-yellow-100 text-yellow-700 rounded px-2 py-0.5 text-xs">OPT</span>}
                    </div>
                    <p className="text-xs text-gray-600 truncate">{item.name}</p>
                    {(isFutures || isOption) && (
                      <div className="flex flex-wrap gap-2 mt-1 text-xs">
                        {item.expiry && <span className="bg-gray-100 rounded px-2 py-0.5">Exp: {formatExpiryDateIST(item.expiry)}</span>}
                        {isOption && item.strikePrice !== undefined && <span className="bg-gray-100 rounded px-2 py-0.5">Strike: ₹{item.strikePrice}</span>}
                        {isOption && item.optionType && <span className="bg-gray-100 rounded px-2 py-0.5">{item.optionType}</span>}
                        {item.lotSize && <span className="bg-gray-100 rounded px-2 py-0.5">Lot: {item.lotSize}</span>}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="font-mono font-semibold">₹{ltp.toFixed(2)}</div>
                    <div className={`text-xs ${change >= 0 ? "text-green-600" : "text-red-600"}`}>{change >= 0 ? "+" : ""}₹{change.toFixed(2)} ({changePercent.toFixed(2)}%)</div>
                  </div>
                </CardContent>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 -translate-y-1/2 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveStock(item.watchlistItemId)
                  }}
                  disabled={removingId === item.watchlistItemId || item.optimistic}
                >
                  {removingId === item.watchlistItemId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4 text-gray-500 hover:text-red-600" />
                  )}
                </Button>
              </Card>
            )
          })
        )}
      </div>

      <StockSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onAddStock={handleAddStock}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  )
}
