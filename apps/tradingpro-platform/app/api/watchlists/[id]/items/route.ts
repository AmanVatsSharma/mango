/**
 * @file route.ts
 * @module api/watchlists/items
 * @description API endpoints for watchlist item management using Prisma transactions.
 * @author StockTrade
 * @created 2026-02-16
 */

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUserId } from '@/lib/server/trading-access'
import { z } from 'zod'
import { withAddWatchlistItemTransaction } from '@/lib/watchlist-transactions'
import { resolveInstrumentTokenBestEffort } from '@/lib/server/instrument-token-utils'
import {
  extractCanonicalPrefix,
  normalizeInstrumentSegment,
} from '@/lib/server/instrument-segment-normalize'

const finiteNonNegativeWatchlistNumber = z.coerce.number().finite().nonnegative()
const finiteWatchlistNumber = z.coerce.number().finite()
const PERSISTED_STOCK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const normalizePersistedStockId = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const normalizedValue = value.trim()
  if (!normalizedValue || !PERSISTED_STOCK_ID_PATTERN.test(normalizedValue)) {
    return undefined
  }
  return normalizedValue
}

/**
 * Wrapper around the shared `normalizeInstrumentSegment` helper that returns the legacy
 * { exchange, segment } shape this route already uses. The shared helper additionally
 * derives `instrumentType` (FUT/CE/PE/EQ/IDX/...) which is now persisted alongside.
 *
 * Replaces the previous MCX-or-else-NSE coercion that silently misrouted NCO / CDS /
 * BCD / FX / IDX / NASDAQ / NYSE / BINANCE / CRYPTO instruments to NSE.
 */
const normalizeWatchlistExchangeAndSegment = (input: {
  exchange?: string
  segment?: string
  optionType?: 'CE' | 'PE'
  strikePrice?: number
  expiry?: string
  instrumentType?: string
  canonicalSymbol?: string
}) => {
  const result = normalizeInstrumentSegment({
    exchange: input.exchange,
    segment: input.segment,
    optionType: input.optionType,
    strikePrice: input.strikePrice,
    expiry: input.expiry,
    canonicalSymbol: input.canonicalSymbol,
    instrumentType: input.instrumentType,
  })
  return {
    exchange: result.exchange,
    segment: result.segment,
    instrumentType: result.instrumentType,
  }
}

const addItemSchema = z.object({
  stockId: z.string().optional(), // Optional, kept for backward compatibility (no UUID validation - not used in transaction)
  token: z.coerce.number().int().positive().finite().optional(), // Optional - will be extracted from instrumentId if missing
  symbol: z.string().optional(), // Optional - will be extracted or defaulted
  exchange: z.string().optional(), // Optional - will be extracted or defaulted
  segment: z.string().optional(), // Optional - will be extracted or defaulted
  name: z.string().optional(), // Optional - will be extracted or defaulted
  uirId: z.coerce.number().int().positive().finite().optional(), // Provider-agnostic UIR id from milli-search
  canonicalSymbol: z.string().optional(), // UIR canonical e.g. "NSE:RELIANCE" — used for WS { symbols: [...] } subscribe
  ltp: finiteNonNegativeWatchlistNumber.optional(),
  close: finiteNonNegativeWatchlistNumber.optional(),
  strikePrice: finiteNonNegativeWatchlistNumber.optional(),
  optionType: z.enum(['CE', 'PE']).optional(),
  expiry: z.string().optional(), // ISO date string or YYYYMMDD format
  lotSize: z.coerce.number().finite().int().positive().optional(),
  instrumentId: z.string().optional(), // Can be used to extract token if missing
  // Asset classification — preserved verbatim into WatchlistItem.instrumentType so the
  // search-result-card and watchlist-item-card render identical badges, and so the order
  // route can resolve the correct product type per segment without re-classifying.
  instrumentType: z.string().max(16).optional(),
  assetClass: z.string().max(32).optional(),
  isDerivative: z.coerce.boolean().optional(),
  // Additional fields that may be sent but not required
  ticker: z.string().optional(),
  last_price: finiteNonNegativeWatchlistNumber.optional(),
  change: finiteWatchlistNumber.optional(),
  changePercent: finiteWatchlistNumber.optional(),
  id: z.string().optional(), // May be sent but not used
  // Watchlist item specific fields
  notes: z.string().max(500).optional(),
  alertPrice: z.coerce.number().finite().positive().optional(),
  alertType: z.enum(['ABOVE', 'BELOW', 'BOTH']).optional(),
  logo_url: z.string().url().max(512).optional(),
}).refine((data) => {
  return (
    data.token !== undefined ||
    data.uirId !== undefined ||
    data.stockId !== undefined ||
    data.instrumentId !== undefined
  )
}, {
  message: "Either token, uirId, stockId, or instrumentId must be provided"
})

// POST /api/watchlists/[id]/items - Add item to watchlist
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: any = null
  try {
    const watchlistId = typeof params?.id === "string" ? params.id.trim() : ""
    if (!watchlistId) {
      return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 })
    }

    let userId: string
    try { userId = await requireAuthenticatedUserId() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    body = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }
    const nullableOptionalNumericKeys = [
      "strikePrice",
      "lotSize",
      "alertPrice",
    ] as const
    const strictNumericPayloadKeys = [
      "ltp",
      "close",
      "last_price",
      "change",
      "changePercent",
    ] as const
    const bodyRecord = body as Record<string, unknown>
    for (const key of nullableOptionalNumericKeys) {
      if (bodyRecord[key] === null) {
        // Treat null as an omitted optional numeric field.
        delete bodyRecord[key]
      }
    }
    for (const key of strictNumericPayloadKeys) {
      if (bodyRecord[key] === null) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 })
      }
    }
    console.log('📥 [WATCHLIST-API] Received request body:', JSON.stringify(body, null, 2))
    
    let validatedData = addItemSchema.parse(body)

    // Map last_price to ltp if ltp is not provided
    if (validatedData.ltp === undefined && validatedData.last_price !== undefined) {
      validatedData.ltp = validatedData.last_price
      console.log(`✅ [WATCHLIST-API] Mapped last_price to ltp: ${validatedData.ltp}`)
    }

    // Ignore non-persisted stock IDs (e.g. UI placeholder ids like token-26000).
    const normalizedStockId = normalizePersistedStockId(validatedData.stockId)
    if (normalizedStockId) {
      validatedData.stockId = normalizedStockId
    } else {
      if (validatedData.stockId !== undefined) {
        console.warn(`⚠️ [WATCHLIST-API] Ignoring non-persisted stockId: ${validatedData.stockId}`)
      }
      validatedData.stockId = undefined
    }

    // Extract token from instrumentId if missing. Exchange/segment derivation is now
    // handled centrally by normalizeInstrumentSegment below — it knows the full prefix
    // table (NSE / BSE / MCX / NCO / CDS / BCD / FX / IDX / NSEIX / NASDAQ / NYSE /
    // BINANCE / CRYPTO) and uses canonicalSymbol when explicit fields are empty.
    if (validatedData.instrumentId) {
      try {
        const parsedToken = resolveInstrumentTokenBestEffort(validatedData.instrumentId)
        if (parsedToken !== null) {
          validatedData.token = parsedToken
          console.log(`✅ [WATCHLIST-API] Extracted token ${parsedToken} from instrumentId ${validatedData.instrumentId}`)
        }
        // Surface the instrumentId prefix to the normalizer when no explicit exchange was
        // supplied. The normalizer treats this as a hint via the canonicalSymbol fallback.
        if (!validatedData.exchange) {
          const prefix = (validatedData.instrumentId.split('-')[0] || "").trim()
          if (prefix) {
            validatedData.exchange = prefix
          }
        }
      } catch (e) {
        console.warn(`⚠️ [WATCHLIST-API] Failed to extract data from instrumentId:`, e)
      }
    }

    // Provide defaults for required string fields if missing.
    if (!validatedData.symbol) {
      validatedData.symbol = validatedData.name || 'UNKNOWN'
      console.log(`⚠️ [WATCHLIST-API] Missing symbol, using default: ${validatedData.symbol}`)
    }

    // Single canonical normalization pass — covers every venue the milli-search API can
    // emit. Replaces the previous MCX-or-else-NSE coercion that silently misrouted
    // non-Indian / non-MCX instruments to NSE.
    const normalizedExchangeMetadata = normalizeWatchlistExchangeAndSegment({
      exchange: validatedData.exchange,
      segment: validatedData.segment,
      optionType: validatedData.optionType,
      strikePrice: validatedData.strikePrice,
      expiry: validatedData.expiry,
      instrumentType: validatedData.instrumentType,
      canonicalSymbol: validatedData.canonicalSymbol,
    })
    validatedData.exchange = normalizedExchangeMetadata.exchange
    validatedData.segment = normalizedExchangeMetadata.segment
    if (!validatedData.instrumentType && normalizedExchangeMetadata.instrumentType) {
      validatedData.instrumentType = normalizedExchangeMetadata.instrumentType
    }
    console.log(
      `✅ [WATCHLIST-API] Normalized venue: ${validatedData.exchange}/${validatedData.segment}` +
        (validatedData.instrumentType ? ` (type=${validatedData.instrumentType})` : ''),
    )
    
    if (!validatedData.name) {
      validatedData.name = validatedData.symbol || 'Unknown Instrument'
      console.log(`⚠️ [WATCHLIST-API] Missing name, using symbol: ${validatedData.name}`)
    }

    // Token is mandatory for transaction path; fail fast with 400 instead of bubbling 500 from transaction layer.
    if (!validatedData.token) {
      console.error('❌ [WATCHLIST-API] Missing token after extraction:', validatedData)
      return NextResponse.json({ 
        error: 'Token is required. Could not extract token from instrumentId.',
        received: {
          hasToken: !!validatedData.token,
          hasStockId: !!validatedData.stockId,
          hasInstrumentId: !!validatedData.instrumentId,
          instrumentId: validatedData.instrumentId
        }
      }, { status: 400 })
    }
    
    console.log('✅ [WATCHLIST-API] Validated data:', {
      token: validatedData.token,
      stockId: validatedData.stockId,
      symbol: validatedData.symbol,
      exchange: validatedData.exchange,
      segment: validatedData.segment,
      name: validatedData.name
    })

    // Add item to watchlist with atomic transaction
    // If token is provided without stockId, we'll create/find the Stock record
    const item = await withAddWatchlistItemTransaction(
      watchlistId,
      userId,
      validatedData as any // Type will be validated by the transaction function
    )

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ [WATCHLIST-API] Validation error:', {
        errors: error.issues,
        receivedBody: body
      })
      return NextResponse.json({ 
        error: 'Invalid input', 
        details: error.issues,
        received: body
      }, { status: 400 })
    }
    
    console.error('❌ [WATCHLIST-API] Add watchlist item error:', error)
    const statusCode = error instanceof Error && error.message.includes('already exists') ? 409 :
                       error instanceof Error && error.message.includes('not found') ? 404 : 500
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error',
      details: error instanceof Error ? error.stack : undefined
    }, { status: statusCode })
  }
}
