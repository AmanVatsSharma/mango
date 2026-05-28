/**
 * @file route.ts
 * @module api/watchlists/by-id
 * @description API endpoints for individual watchlist operations using Prisma transactions.
 * @author StockTrade
 * @created 2026-02-16
 */

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUserId } from '@/lib/server/trading-access'
import { z } from 'zod'
import {
  getWatchlistById,
  withUpdateWatchlistTransaction,
  withDeleteWatchlistTransaction,
} from '@/lib/watchlist-transactions'

const updateWatchlistSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(200).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.coerce.number().finite().int().nonnegative().optional(),
})

// GET /api/watchlists/[id] - Get specific watchlist
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const watchlistId = typeof params?.id === "string" ? params.id.trim() : ""
    if (!watchlistId) {
      return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 })
    }
    let userId: string
    try { userId = await requireAuthenticatedUserId() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const watchlist = await getWatchlistById(watchlistId, userId)

    if (!watchlist) {
      return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 })
    }

    return NextResponse.json({ watchlist })
  } catch (error) {
    console.error('Get watchlist API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/watchlists/[id] - Update watchlist
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const watchlistId = typeof params?.id === "string" ? params.id.trim() : ""
    if (!watchlistId) {
      return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 })
    }
    let userId: string
    try { userId = await requireAuthenticatedUserId() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const body = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }
    const validatedData = updateWatchlistSchema.parse(body)

    // Update watchlist with atomic transaction
    const watchlist = await withUpdateWatchlistTransaction(
      watchlistId,
      userId,
      validatedData
    )

    return NextResponse.json({ watchlist })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    
    console.error('Update watchlist API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: error instanceof Error && error.message.includes('not found') ? 404 : 500 })
  }
}

// DELETE /api/watchlists/[id] - Delete watchlist
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const watchlistId = typeof params?.id === "string" ? params.id.trim() : ""
    if (!watchlistId) {
      return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 })
    }
    let userId: string
    try { userId = await requireAuthenticatedUserId() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    // Delete watchlist with atomic transaction
    await withDeleteWatchlistTransaction(watchlistId, userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete watchlist API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: error instanceof Error && error.message.includes('not found') ? 404 : 500 })
  }
}
