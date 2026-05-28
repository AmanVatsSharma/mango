/**
 * @file watchlist-transactions.ts
 * @description Prisma transaction utilities for watchlist operations
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { withTransaction, PrismaTransactionClient } from "@/lib/database-transactions"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import { parseExpiryDateCandidate } from "@/lib/utils/expiry-date"
import { normalizeInstrumentSegment } from "@/lib/server/instrument-segment-normalize"
import { BRAND_THEME } from "@/Branding"

interface UpsertStockInput {
  token: number
  symbol: string
  exchange: string
  segment?: string
  name: string
  ltp?: number
  close?: number
  strikePrice?: number
  optionType?: string
  expiry?: Date | null
  lotSize?: number
}

async function ensureStockRecord(
  tx: PrismaTransactionClient,
  input: UpsertStockInput
) {
  const normalizedExchange = (input.exchange || "NSE").trim().toUpperCase()
  const instrumentId = `${normalizedExchange}-${input.token}`
  const segment = (input.segment || normalizedExchange || "NSE").trim().toUpperCase()
  const normalizedSymbol = (input.symbol || "UNKNOWN").toUpperCase()
  const normalizedOptionType =
    typeof input.optionType === "string" && input.optionType.trim()
      ? input.optionType.trim().toUpperCase()
      : undefined
  const isDerivativeContract =
    segment.includes("FO") ||
    normalizedExchange.includes("FO") ||
    normalizedOptionType === "CE" ||
    normalizedOptionType === "PE" ||
    input.strikePrice != null ||
    input.expiry != null
  const ticker = normalizedSymbol

  const existingStock = await tx.stock.findFirst({
    where: {
      OR: [
        { token: input.token },
        { instrumentId },
      ]
    }
  })

  if (existingStock && isDerivativeContract) {
    const existingOptionType =
      typeof existingStock.optionType === "string" && existingStock.optionType.trim()
        ? existingStock.optionType.trim().toUpperCase()
        : null
    const incomingOptionType = normalizedOptionType ?? null
    const existingStrikePrice = parseFiniteTradingNumber((existingStock as any)?.strikePrice)
    const incomingStrikePrice = parseFiniteTradingNumber(input.strikePrice)
    const existingExpiry = existingStock.expiry instanceof Date ? existingStock.expiry.toISOString().slice(0, 10) : null
    const incomingExpiry = input.expiry instanceof Date ? input.expiry.toISOString().slice(0, 10) : null
    const existingInstrumentId =
      typeof existingStock.instrumentId === "string" ? existingStock.instrumentId.trim().toUpperCase() : null

    const hasIdentityMismatch =
      (existingInstrumentId && existingInstrumentId !== instrumentId) ||
      (existingOptionType && incomingOptionType && existingOptionType !== incomingOptionType) ||
      (existingStrikePrice !== null && incomingStrikePrice !== null && existingStrikePrice !== incomingStrikePrice) ||
      (existingExpiry && incomingExpiry && existingExpiry !== incomingExpiry)

    if (hasIdentityMismatch) {
      console.warn("⚠️ [WATCHLIST-TX] Derivative identity mismatch detected, preserving existing stock contract", {
        stockId: existingStock.id,
        requestedInstrumentId: instrumentId,
        existingInstrumentId,
        token: input.token,
      })
      return existingStock
    }
  }

  const stockData = {
    instrumentId,
    symbol: normalizedSymbol,
    exchange: normalizedExchange,
    ticker,
    name: input.name,
    segment,
    token: input.token,
    strikePrice: input.strikePrice != null ? new Prisma.Decimal(input.strikePrice) : undefined,
    optionType: normalizedOptionType as any,
    expiry: input.expiry ?? undefined,
    lot_size: input.lotSize ?? undefined
  }

  if (input.ltp !== undefined) {
    Object.assign(stockData, { ltp: input.ltp, open: input.ltp, high: input.ltp, low: input.ltp })
  }

  if (input.close !== undefined) {
    Object.assign(stockData, { close: input.close })
  }

  if (existingStock) {
    console.log("🔁 [WATCHLIST-TX] Updating existing stock record", {
      stockId: existingStock.id,
      instrumentId,
      token: input.token
    })

    const updated = await tx.stock.update({
      where: { id: existingStock.id },
      data: {
        ...stockData,
        updatedAt: new Date()
      }
    })

    return updated
  }

  console.log("🆕 [WATCHLIST-TX] Creating new stock record", {
    instrumentId,
    token: input.token
  })

  const created = await tx.stock.create({
    data: {
      ...stockData,
      open: (stockData as any).ltp ?? 0,
      high: (stockData as any).ltp ?? 0,
      low: (stockData as any).ltp ?? 0,
      volume: 0,
      change: 0,
      changePercent: 0,
      isActive: true
    }
  })

  return created
}

/**
 * Transaction wrapper for creating a watchlist
 */
export const withCreateWatchlistTransaction = async (
  userId: string,
  data: {
    name: string
    description?: string
    color?: string
    isDefault?: boolean
  }
) => {
  return withTransaction(async (tx) => {
    const existingWatchlist = await tx.watchlist.findFirst({
      where: { userId },
      select: { id: true },
    })
    const isFirstWatchlistForUser = !existingWatchlist
    const shouldSetAsDefault = isFirstWatchlistForUser || Boolean(data.isDefault)

    console.log("📋 Creating watchlist for user:", userId, {
      requestedDefault: data.isDefault ?? null,
      isFirstWatchlistForUser,
      shouldSetAsDefault,
    })

    // First watchlist is always default; explicit default also unsets prior defaults.
    if (shouldSetAsDefault) {
      try {
        await tx.watchlist.updateMany({
          where: {
            userId,
            isDefault: true,
          },
          data: { isDefault: false },
        })
      } catch (e) {
        console.warn("⚠️ isDefault column not present yet; skipping unset of other defaults")
      }
    }

    // Create the watchlist (attempt enhanced fields; fall back to minimal if DB schema lacks columns)
    let watchlist
    try {
      watchlist = await tx.watchlist.create({
        data: {
          userId,
          name: data.name,
          description: data.description,
          color: data.color || BRAND_THEME.watchlist.defaultColor,
          isDefault: shouldSetAsDefault,
          sortOrder: 0,
        },
        select: {
          id: true,
          userId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              watchlistId: true,
              stockId: true,
              createdAt: true,
            },
          },
        },
      })
    } catch (err) {
      console.warn("⚠️ Enhanced create failed; falling back to minimal watchlist create", err)
      watchlist = await tx.watchlist.create({
        data: {
          userId,
          name: data.name,
        },
        select: {
          id: true,
          userId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              watchlistId: true,
              stockId: true,
              createdAt: true,
            },
          },
        },
      })
    }

    console.log("✅ Watchlist created:", watchlist.id)
    return watchlist
  })
}

/**
 * Transaction wrapper for updating a watchlist
 */
export const withUpdateWatchlistTransaction = async (
  watchlistId: string,
  userId: string,
  data: {
    name?: string
    description?: string
    color?: string
    isDefault?: boolean
    sortOrder?: number
  }
) => {
  return withTransaction(async (tx) => {
    console.log("📝 Updating watchlist:", watchlistId)

    // Verify ownership
    const watchlist = await tx.watchlist.findFirst({
      where: {
        id: watchlistId,
        userId,
      },
    })

    if (!watchlist) {
      throw new Error("Watchlist not found or access denied")
    }

    // If setting as default, unset other default watchlists (best-effort)
    if (data.isDefault) {
      try {
        await tx.watchlist.updateMany({
          where: {
            userId,
            isDefault: true,
            NOT: { id: watchlistId },
          },
          data: { isDefault: false },
        })
      } catch (e) {
        console.warn("⚠️ isDefault column not present yet; skipping unset of other defaults")
      }
    }

    // Update the watchlist (attempt enhanced fields; fall back to minimal)
    const updateData: any = { updatedAt: new Date() }
    if (data.name !== undefined) updateData.name = data.name
    // Opportunistically include enhanced fields
    if (data.description !== undefined) updateData.description = data.description
    if (data.color !== undefined) updateData.color = data.color
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder

    let updatedWatchlist
    try {
      updatedWatchlist = await tx.watchlist.update({
        where: { id: watchlistId },
        data: updateData,
        select: {
          id: true,
          userId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              watchlistId: true,
              stockId: true,
              createdAt: true,
            },
          },
        },
      })
    } catch (err) {
      console.warn("⚠️ Enhanced update failed; falling back to minimal update", err)
      updatedWatchlist = await tx.watchlist.update({
        where: { id: watchlistId },
        data: { name: data.name, updatedAt: new Date() },
        select: {
          id: true,
          userId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              watchlistId: true,
              stockId: true,
              createdAt: true,
            },
          },
        },
      })
    }

    console.log("✅ Watchlist updated:", updatedWatchlist.id)
    return updatedWatchlist
  })
}

/**
 * Transaction wrapper for deleting a watchlist
 */
export const withDeleteWatchlistTransaction = async (
  watchlistId: string,
  userId: string
) => {
  return withTransaction(async (tx) => {
    console.log("🗑️ Deleting watchlist:", watchlistId)

    // Verify ownership
    const watchlist = await tx.watchlist.findFirst({
      where: {
        id: watchlistId,
        userId,
      },
    })

    if (!watchlist) {
      throw new Error("Watchlist not found or access denied")
    }

    // Delete the watchlist (cascade will handle items)
    await tx.watchlist.delete({
      where: { id: watchlistId },
    })

    console.log("✅ Watchlist deleted:", watchlistId)
    return { success: true }
  })
}

/**
 * Transaction wrapper for adding an item to watchlist (with token support)
 */
export const withAddWatchlistItemTransaction = async (
  watchlistId: string,
  userId: string,
  data: {
    stockId?: string // Optional, kept for backward compatibility
    token: number // Required - token is the unique identifier
    symbol: string
    exchange: string
    segment: string
    name: string
    uirId?: number // Provider-agnostic UIR id from milli-search (gateway emits this on every tick)
    canonicalSymbol?: string // UIR canonical e.g. "NSE:RELIANCE" — for WS { symbols: [...] } subscribe
    ltp?: number
    close?: number
    strikePrice?: number
    optionType?: string
    expiry?: string // ISO date string or YYYYMMDD format
    lotSize?: number
    instrumentType?: string // EQ | FUT | CE | PE | IDX | ETF | SPOT | …
    logo_url?: string
    notes?: string
    alertPrice?: number
    alertType?: string
  }
) => {
  const normalizedTokenCandidate = parseFiniteTradingNumber((data as any).token)
  const normalizedToken =
    normalizedTokenCandidate !== null &&
    Number.isInteger(normalizedTokenCandidate) &&
    normalizedTokenCandidate > 0
      ? normalizedTokenCandidate
      : null
  if (normalizedToken === null) {
    throw new Error("Invalid token value")
  }

  return withTransaction(async (tx) => {
    console.log("➕ [WATCHLIST-TX] Adding item to watchlist:", watchlistId, { 
      token: normalizedToken, 
      symbol: data.symbol,
      exchange: data.exchange 
    })

    // Normalize exchange/segment/instrumentType through the shared kind-aware helper so
    // every caller (watchlist API, internal admin scripts, future bulk-import jobs) stores
    // identical canonical values. Replaces the previous MCX-or-else-NSE coercion that
    // misrouted NCO / CDS / FX / IDX / NASDAQ / BINANCE adds to NSE.
    const normalized = normalizeInstrumentSegment({
      exchange: data.exchange,
      segment: data.segment,
      optionType: data.optionType,
      strikePrice: data.strikePrice,
      expiry: data.expiry,
      canonicalSymbol: data.canonicalSymbol,
      instrumentType: data.instrumentType,
    })
    const exchangeNormalized = normalized.exchange
    const segmentNormalized = normalized.segment
    const instrumentTypeNormalized = data.instrumentType ?? normalized.instrumentType

    // Verify watchlist ownership
    const watchlist = await tx.watchlist.findFirst({
      where: {
        id: watchlistId,
        userId,
      },
    })

    if (!watchlist) {
      throw new Error("Watchlist not found or access denied")
    }

    // Check if item with same token already exists in watchlist
    const existingItem = await tx.watchlistItem.findFirst({
      where: {
        watchlistId,
        token: normalizedToken,
      },
    })

    if (existingItem) {
      throw new Error("Instrument already exists in watchlist")
    }

    // Convert expiry string to DateTime if provided
    const parsedExpiryDate = parseExpiryDateCandidate(data.expiry ?? null)
    let expiryDate: Date | null = parsedExpiryDate ?? null
    if (data.expiry && !parsedExpiryDate) {
      console.warn("⚠️ [WATCHLIST-TX] Invalid expiry date format, ignoring:", data.expiry)
    }

    const stockRecord = await ensureStockRecord(tx, {
      token: normalizedToken,
      symbol: data.symbol,
      exchange: exchangeNormalized,
      segment: segmentNormalized,
      name: data.name,
      ltp: data.ltp,
      close: data.close,
      strikePrice: data.strikePrice,
      optionType: data.optionType,
      expiry: expiryDate,
      lotSize: data.lotSize
    })

    // Create WatchlistItem with all instrument data stored directly
    // Note: Using 'as any' because Prisma client needs to be regenerated after schema update
    const item = await tx.watchlistItem.create({
      data: {
        watchlistId,
        stockId: stockRecord.id,
        token: normalizedToken,
        uirId: data.uirId ?? null,
        symbol: data.symbol,
        exchange: exchangeNormalized,
        segment: segmentNormalized,
        name: data.name,
        canonicalSymbol: data.canonicalSymbol ?? null,
        ltp: data.ltp ?? 0,
        close: data.close ?? 0,
        strikePrice: data.strikePrice,
        optionType: data.optionType as any,
        expiry: expiryDate,
        lotSize: data.lotSize,
        instrumentType: instrumentTypeNormalized ?? null,
        logo_url: typeof data.logo_url === 'string' ? data.logo_url : null,
        notes: data.notes,
        alertPrice: data.alertPrice,
        alertType: data.alertType || "ABOVE",
        sortOrder: 0,
      } as any,
      select: {
        id: true,
        watchlistId: true,
        stockId: true,
        token: true,
        symbol: true,
        exchange: true,
        segment: true,
        name: true,
        uirId: true,
        canonicalSymbol: true,
        ltp: true,
        close: true,
        strikePrice: true,
        optionType: true,
        expiry: true,
        lotSize: true,
        instrumentType: true,
        logo_url: true,
        notes: true,
        alertPrice: true,
        alertType: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      } as any,
    })

    console.log("✅ [WATCHLIST-TX] Item added to watchlist:", item.id, { 
      token: (item as any).token,
      symbol: (item as any).symbol,
      exchange: (item as any).exchange 
    })
    return item
  })
}

/**
 * Transaction wrapper for updating a watchlist item
 */
export const withUpdateWatchlistItemTransaction = async (
  itemId: string,
  userId: string,
  data: {
    notes?: string
    alertPrice?: number | null
    alertType?: string | null
    sortOrder?: number
  }
) => {
  return withTransaction(async (tx) => {
    console.log("📝 Updating watchlist item:", itemId)

    // Verify item exists and user has access
    const item = await tx.watchlistItem.findFirst({
      where: {
        id: itemId,
        watchlist: {
          userId,
        },
      },
    })

    if (!item) {
      throw new Error("Watchlist item not found or access denied")
    }

    // Prepare update data - handle null values for clearing alerts
    const updateData: any = { updatedAt: new Date() }
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder
    if (data.alertPrice !== undefined) updateData.alertPrice = data.alertPrice
    if (data.alertType !== undefined) updateData.alertType = data.alertType

    // Update WatchlistItem (no Stock dependency)
    const updatedItem = await tx.watchlistItem.update({
      where: { id: itemId },
      data: updateData,
      select: {
        id: true,
        watchlistId: true,
        stockId: true,
        token: true,
        symbol: true,
        exchange: true,
        segment: true,
        name: true,
        ltp: true,
        close: true,
        strikePrice: true,
        optionType: true,
        expiry: true,
        lotSize: true,
        notes: true,
        alertPrice: true,
        alertType: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      } as any,
    })

    console.log("✅ Watchlist item updated:", updatedItem.id)
    return updatedItem
  })
}

/**
 * Transaction wrapper for removing an item from watchlist
 */
export const withRemoveWatchlistItemTransaction = async (
  itemId: string,
  userId: string
) => {
  return withTransaction(async (tx) => {
    console.log("🗑️ Removing item from watchlist:", itemId)

    // Verify item exists and user has access
    const item = await tx.watchlistItem.findFirst({
      where: {
        id: itemId,
        watchlist: {
          userId,
        },
      },
    })

    if (!item) {
      throw new Error("Watchlist item not found or access denied")
    }

    // Delete the item
    await tx.watchlistItem.delete({
      where: { id: itemId },
    })

    console.log("✅ Watchlist item removed:", itemId)
    return { success: true }
  })
}

/**
 * Get all watchlists for a user with items
 */
export const getAllWatchlists = async (userId: string) => {
  console.log("🔎 [WATCHLIST-TX] Fetching all watchlists via Prisma", { userId })
  const results = await prisma.watchlist.findMany({
    where: { userId },
    select: {
      id: true,
      userId: true,
      name: true,
      description: true,
      color: true,
      isDefault: true,
      isPrivate: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      items: {
        select: {
          id: true,
          watchlistId: true,
          stockId: true, // Optional, kept for backward compatibility
          token: true,
          symbol: true,
          exchange: true,
          segment: true,
          name: true,
          uirId: true,
          canonicalSymbol: true,
          ltp: true,
          close: true,
          strikePrice: true,
          optionType: true,
          expiry: true,
          lotSize: true,
          instrumentType: true,
          logo_url: true,
          notes: true,
          alertPrice: true,
          alertType: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
        } as any,
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  console.log("✅ [WATCHLIST-TX] Prisma returned watchlists", { count: results.length })
  return results
}

/**
 * Get a single watchlist by ID
 */
export const getWatchlistById = async (watchlistId: string, userId: string) => {
  return prisma.watchlist.findFirst({
    where: { id: watchlistId, userId },
    select: {
      id: true,
      userId: true,
      name: true,
      description: true,
      color: true,
      isDefault: true,
      isPrivate: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      items: {
        select: {
          id: true,
          watchlistId: true,
          stockId: true, // Optional, kept for backward compatibility
          token: true,
          symbol: true,
          exchange: true,
          segment: true,
          name: true,
          uirId: true,
          canonicalSymbol: true,
          ltp: true,
          close: true,
          strikePrice: true,
          optionType: true,
          expiry: true,
          lotSize: true,
          instrumentType: true,
          logo_url: true,
          notes: true,
          alertPrice: true,
          alertType: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
        } as any,
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

/**
 * Get a single watchlist item by ID
 */
export const getWatchlistItemById = async (itemId: string, userId: string) => {
  return prisma.watchlistItem.findFirst({
    where: {
      id: itemId,
      watchlist: {
        userId,
      },
    },
    select: {
      id: true,
      watchlistId: true,
      stockId: true,
      token: true,
      uirId: true,
      symbol: true,
      exchange: true,
      segment: true,
      name: true,
      canonicalSymbol: true,
      ltp: true,
      close: true,
      strikePrice: true,
      optionType: true,
      expiry: true,
      lotSize: true,
      instrumentType: true,
      logo_url: true,
      notes: true,
      alertPrice: true,
      alertType: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      watchlist: {
        select: {
          id: true,
          name: true,
          userId: true,
        },
      },
    } as any,
  })
}