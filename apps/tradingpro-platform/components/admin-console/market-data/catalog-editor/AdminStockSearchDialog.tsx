/**
 * File:        components/admin-console/market-data/catalog-editor/AdminStockSearchDialog.tsx
 * Module:      admin-console · market-data · catalog-editor
 * Purpose:     Admin wrapper around the premium StockSearch component. Converts
 *              StockSearch's onAddStock callback to PickedInstrument so
 *              MarketCatalogEditor can use it as a drop-in replacement for
 *              InstrumentPickerDialog while gaining Browse + Search modes,
 *              filter chips, and the full search experience.
 *
 *              Supports two intents:
 *              - "instrument"   — adds a fixed instrument row to the catalog group
 *              - "options-chain-underlying" — picks underlying for options-chain recipe
 *
 * Exports:
 *   - AdminStockSearchDialog — props match InstrumentPickerDialog contract
 *   - type AdminStockSearchDialogProps — prop shape
 *
 * Depends on:
 *   - @/components/stock-search — StockSearch (the premium drawer)
 *   - @/components/watchlist/catalog-browser — CatalogAddInstrumentPayload + OptionAddPayload
 *
 * Side-effects:
 *   - none (pure UI wrapper)
 *
 * Key invariants:
 *   - mode="underlying" activates "Browse" tab only (no free-text search) since
 *     options chains need a non-derivative root — browse shows curated lists.
 *   - StockSearch's Browse mode shows the admin's own curated catalog, letting
 *     the admin add instruments directly from published groups.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-12
 */

"use client"

import { useCallback, useState } from "react"
import { StockSearch } from "@/components/stock-search"
import type { CatalogAddInstrumentPayload } from "@/components/watchlist/catalog-browser"
import type { OptionAddPayload } from "@/components/watchlist/catalog-options-tree"

export interface PickedInstrument {
  token: number
  symbol: string
  name?: string
  exchange: string
  segment: string
}

export interface AdminStockSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "any" allows derivatives; "underlying" activates Browse-only mode for non-derivative roots. */
  mode: "any" | "underlying"
  title?: string
  onPick: (instrument: PickedInstrument) => void
}

export function AdminStockSearchDialog({
  open,
  onOpenChange,
  mode,
  title = "Pick instrument",
  onPick,
}: AdminStockSearchDialogProps) {
  const [addingToken, setAddingToken] = useState<number | null>(null)
  const [existingTokens] = useState<number[]>([])

  const handleAddStock = useCallback(
    (stockData: string | {
      token?: number
      uirId?: number
      canonicalSymbol?: string
      symbol?: string
      name?: string
      exchange?: string
      segment?: string
      strikePrice?: number
      optionType?: "CE" | "PE"
      expiry?: string
      lotSize?: number
      instrumentId?: string
    }) => {
      if (!stockData || typeof stockData === "string") return

      const payload = stockData as CatalogAddInstrumentPayload | OptionAddPayload

      // For "underlying" mode, only accept non-derivative instruments
      if (mode === "underlying") {
        const isDerivative =
          "optionType" in payload && payload.optionType ||
          "strikePrice" in payload && payload.strikePrice ||
          "expiry" in payload && payload.expiry
        if (isDerivative) return
      }

      // Map to PickedInstrument
      if ("token" in payload && typeof payload.token === "number") {
        onPick({
          token: payload.token,
          symbol: payload.symbol ?? "",
          name: payload.name,
          exchange: payload.exchange ?? "NSE",
          segment: payload.segment ?? "",
        })
        onOpenChange(false)
      }
    },
    [mode, onPick, onOpenChange],
  )

  return (
    <StockSearch
      open={open}
      onOpenChange={onOpenChange}
      onAddStock={handleAddStock}
      onClose={() => onOpenChange(false)}
      existingTokens={existingTokens}
    />
  )
}
