/**
 * @file route.ts
 * @module market-status-api
 * @description API route to get market status (force closed, session, etc.)
 * @author StockTrade
 * @created 2025-01-27
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerMarketSession, isServerMarketOpen, getMarketForceClosedFromDB } from '@/lib/server/market-timing';

export const runtime = 'nodejs';

/**
 * GET /api/market/status
 * Returns current market status including force closed setting
 * 
 * @param request - Next.js request object
 * @returns NextResponse - JSON response with market status
 */
export async function GET(request: NextRequest) {
  console.log('[MarketAPI-Status] Status request received');
  
  try {
    const [forceClosed, session, isOpen] = await Promise.all([
      getMarketForceClosedFromDB(),
      getServerMarketSession(),
      isServerMarketOpen()
    ]);
    
    console.log('[MarketAPI-Status] Returning status:', {
      forceClosed,
      session,
      isOpen
    });
    
    return NextResponse.json({
      success: true,
      data: {
        forceClosed,
        session,
        isOpen
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[MarketAPI-Status] Error getting status:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get market status',
      data: {
        forceClosed: false,
        session: 'closed',
        isOpen: false
      },
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

