/**
 * @file route.ts
 * @module api/watchlists/items/by-id
 * @description API endpoints for individual watchlist item operations using Prisma transactions.
 * @author StockTrade
 * @created 2026-02-16
 */

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUserId } from '@/lib/server/trading-access'
import { z } from 'zod'
import {
  getWatchlistItemById,
  withUpdateWatchlistItemTransaction,
  withRemoveWatchlistItemTransaction,
} from '@/lib/watchlist-transactions'

const updateItemSchema = z.object({
  notes: z.string().max(500).optional(),
  alertPrice: z.coerce.number().finite().positive().optional().nullable(),
  alertType: z.enum(['ABOVE', 'BELOW', 'BOTH']).optional().nullable(),
  sortOrder: z.coerce.number().finite().int().nonnegative().optional(),
})

// GET /api/watchlists/items/[itemId] - Get specific watchlist item
export async function GET(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const watchlistItemId = typeof params?.itemId === "string" ? params.itemId.trim() : ""
    if (!watchlistItemId) {
      return NextResponse.json({ error: "Invalid watchlist item id" }, { status: 400 })
    }
    let userId: string
    try { userId = await requireAuthenticatedUserId() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const item = await getWatchlistItemById(watchlistItemId, userId)

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('Get watchlist item API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/watchlists/items/[itemId] - Update watchlist item
export async function PUT(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const watchlistItemId = typeof params?.itemId === "string" ? params.itemId.trim() : ""
    if (!watchlistItemId) {
      return NextResponse.json({ error: "Invalid watchlist item id" }, { status: 400 })
    }
    let userId: string
    try { userId = await requireAuthenticatedUserId() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const body = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }
    const validatedData = updateItemSchema.parse(body)

    // Update item with atomic transaction
    const item = await withUpdateWatchlistItemTransaction(
      watchlistItemId,
      userId,
      validatedData
    )

    return NextResponse.json({ item })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    
    console.error('Update watchlist item API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: error instanceof Error && error.message.includes('not found') ? 404 : 500 })
  }
}

// DELETE /api/watchlists/items/[itemId] - Remove item from watchlist
export async function DELETE(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const watchlistItemId = typeof params?.itemId === "string" ? params.itemId.trim() : ""
    if (!watchlistItemId) {
      return NextResponse.json({ error: "Invalid watchlist item id" }, { status: 400 })
    }
    let userId: string
    try { userId = await requireAuthenticatedUserId() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    // Delete item with atomic transaction
    await withRemoveWatchlistItemTransaction(watchlistItemId, userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete watchlist item API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: error instanceof Error && error.message.includes('not found') ? 404 : 500 })
  }
}
